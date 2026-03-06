const express = require('express');
const router = express.Router();
const fs = require('fs');
const Certificate = require('../models/Certificate');
const VerificationLog = require('../models/VerificationLog');
const { optionalAuth } = require('../middleware/auth');
const { verifyUpload } = require('../middleware/upload');
const { computeFileHash, verifySignature } = require('../utils/crypto');

// POST /api/verify - Upload media + certificate JSON, compare hashes
router.post('/', optionalAuth, verifyUpload.single('media'), async (req, res) => {
    try {
        const { certificateJson } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Media file required' });
        }
        if (!certificateJson) {
            return res.status(400).json({ error: 'Certificate JSON required' });
        }
        let certData;
        try {
            const parsed = JSON.parse(certificateJson);
            certData = parsed.authenticam_certificate || parsed;
        } catch {
            return res.status(400).json({ error: 'Invalid certificate JSON format' });
        }
        // Compute hash of uploaded file
        const uploadedHash = await computeFileHash(req.file.path);
        // Clean up temp file
        fs.unlinkSync(req.file.path);
        const expectedHash = certData.fileHash;
        const certId = certData.certificateId;
        let result = 'error';
        let tamperDetails = '';
        let dbCertificate = null;
        // Try to find in DB
        if (certId) {
            dbCertificate = await Certificate.findOne({ certificateId: certId })
                .populate('userId', 'username email')
                .populate('recordingId', 'title');
        }
        // Compare hashes
        if (!expectedHash) {
            result = 'invalid_certificate';
            tamperDetails = 'No file hash found in certificate';
        } else if (uploadedHash === expectedHash) {
            // Also verify RSA signature if present
            if (certData.signature) {
                const sigValid = verifySignature(expectedHash, certData.signature);
                if (sigValid) {
                    result = 'authentic';
                } else {
                    result = 'tampered';
                    tamperDetails = 'RSA signature verification failed — certificate may be forged';
                }
            } else {
                result = 'authentic';
            }
        } else {
            result = 'tampered';
            tamperDetails = `Hash mismatch. Expected: ${expectedHash.substring(0, 16)}... Got: ${uploadedHash.substring(0, 16)}...`;
        }
        // Log verification
        const log = await VerificationLog.create({
            certificateId: certId || null,
            verifierId: req.user?._id || null,
            verifierEmail: req.user?.email || 'anonymous',
            uploadedHash,
            expectedHash: expectedHash || null,
            result,
            tamperDetails,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        // Add chain-of-custody event if cert found in DB
        if (dbCertificate) {
            dbCertificate.chainOfCustody.push({
                event: 'VERIFICATION_ATTEMPT',
                timestamp: new Date(),
                actor: req.user?.username || 'anonymous',
                actorId: req.user?._id || null,
                ipAddress: req.ip,
                details: { result, uploadedHash },
            });
            await dbCertificate.save();
        }
        res.json({
            result,
            authentic: result === 'authentic',
            uploadedHash,
            expectedHash: expectedHash || null,
            tamperDetails: tamperDetails || null,
            certificate: dbCertificate,
            verificationId: log._id,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error(err);
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Verification failed', details: err.message });
    }
});

// GET /api/verify/logs - Get verification logs for a cert
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
