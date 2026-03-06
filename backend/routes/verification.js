const express = require('express');
const router = express.Router();
const fs = require('fs');
const Certificate = require('../models/Certificate');
const VerificationLog = require('../models/VerificationLog');
const { optionalAuth } = require('../middleware/auth');
const { verifyUpload } = require('../middleware/upload');
const { verifyRecording } = require('../utils/verifier');

// POST /api/verify — Full 5-check authenticity verification
router.post('/', optionalAuth, verifyUpload.single('media'), async (req, res) => {
    try {
        const { certificateJson } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Media file required' });
        }
        if (!certificateJson) {
            return res.status(400).json({ error: 'Certificate JSON required' });
        }

        // Parse certificate
        let certData;
        try {
            const parsed = JSON.parse(certificateJson);
            certData = parsed.authenticam_certificate || parsed;
        } catch {
            return res.status(400).json({ error: 'Invalid certificate JSON format' });
        }

        // Read uploaded file into buffer
        const fileBuffer = fs.readFileSync(req.file.path);

        // Clean up temp file
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

        // ── Run full 5-check verification ──────────────────────────
        const report = await verifyRecording(fileBuffer, certData);

        // Map overall → legacy result field for backwards compat
        const legacyResult = {
            VALID: 'authentic',
            TAMPERED: 'tampered',
            UNKNOWN_DEVICE: 'tampered',
        }[report.overall] || 'error';

        // Try to find in DB for chain-of-custody update
        const certId = certData.certificateId;
        let dbCertificate = null;
        if (certId) {
            dbCertificate = await Certificate.findOne({ certificateId: certId })
                .populate('userId', 'username email')
                .populate('recordingId', 'title');
        }

        // Log verification
        try {
            await VerificationLog.create({
                certificateId: certId || null,
                verifierId: req.user?._id || null,
                verifierEmail: req.user?.email || 'anonymous',
                uploadedHash: report.checks.hash?.computedHash || '',
                expectedHash: certData.fileHash || null,
                result: legacyResult,
                tamperDetails: report.summary,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
            });
        } catch (logErr) {
            console.warn('[verify] Could not save verification log:', logErr.message);
        }

        // Add chain-of-custody event if cert exists in DB
        if (dbCertificate) {
            dbCertificate.chainOfCustody.push({
                event: 'VERIFICATION_ATTEMPT',
                timestamp: new Date(),
                actor: req.user?.username || 'anonymous',
                actorId: req.user?._id || null,
                ipAddress: req.ip,
                details: {
                    overall: report.overall, checks: Object.fromEntries(
                        Object.entries(report.checks).map(([k, v]) => [k, v.pass])
                    )
                },
            });
            await dbCertificate.save();
        }

        res.json({
            // Full structured report (new API)
            overall: report.overall,
            checks: report.checks,
            summary: report.summary,
            verifiedAt: report.verifiedAt,

            // Backwards-compatible fields
            result: legacyResult,
            authentic: report.overall === 'VALID',
            uploadedHash: report.checks.hash?.computedHash || '',
            expectedHash: certData.fileHash || null,
            tamperDetails: report.summary,
            certificate: dbCertificate,
            verificationId: null,
            timestamp: report.verifiedAt,
        });
    } catch (err) {
        console.error('[verify]', err);
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
        res.status(500).json({ error: 'Verification failed', details: err.message });
    }
});

// GET /api/verify/logs/:certId — Get verification logs for a certificate
router.get('/logs/:certId', async (req, res) => {
    try {
        const logs = await VerificationLog.find({ certificateId: req.params.certId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
