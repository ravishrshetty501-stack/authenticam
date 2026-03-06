const express = require('express');
const router = express.Router();
const Certificate = require('../models/Certificate');
const VerificationLog = require('../models/VerificationLog');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// GET /api/certificates/:id
router.get('/:certId', optionalAuth, async (req, res) => {
    try {
        const certificate = await Certificate.findOne({ certificateId: req.params.certId })
            .populate('recordingId', 'title mimeType duration')
            .populate('userId', 'username email');
        if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
        // Get verification history
        const logs = await VerificationLog.find({ certificateId: req.params.certId })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json({ certificate, verificationHistory: logs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificate' });
    }
});

// GET /api/certificates/:certId/download - Download as JSON
router.get('/:certId/download', optionalAuth, async (req, res) => {
    try {
        const certificate = await Certificate.findOne({ certificateId: req.params.certId })
            .populate('userId', 'username email');
        if (!certificate) return res.status(404).json({ error: 'Certificate not found' });
        const certData = {
            authenticam_certificate: {
                version: '1.0',
                certificateId: certificate.certificateId,
                issuedAt: certificate.timestamp,
                issuedBy: certificate.userId?.username || 'unknown',
                fileHash: certificate.fileHash,
                fileName: certificate.fileName,
                fileSize: certificate.fileSize,
                mimeType: certificate.mimeType,
                deviceFingerprint: certificate.deviceFingerprint,
                signature: certificate.signature,
                publicKey: certificate.publicKey,
                verificationUrl: certificate.verificationUrl,
                chainOfCustody: certificate.chainOfCustody,
                metadata: certificate.metadata,
            },
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificateId}.json"`);
        res.json(certData);
    } catch (err) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// GET /api/certificates - User's certificates
router.get('/', authMiddleware, async (req, res) => {
    try {
        const certs = await Certificate.find({ userId: req.user._id })
            .populate('recordingId', 'title mimeType duration')
            .sort({ createdAt: -1 });
        res.json({ certificates: certs });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// POST /api/certificates/:certId/custody - Add custody event
router.post('/:certId/custody', authMiddleware, async (req, res) => {
    try {
        const { event, details } = req.body;
        const cert = await Certificate.findOne({ certificateId: req.params.certId });
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });
        cert.chainOfCustody.push({
            event,
            timestamp: new Date(),
            actor: req.user.username,
            actorId: req.user._id,
            ipAddress: req.ip,
            details,
        });
        await cert.save();
        res.json({ message: 'Custody event added', chainOfCustody: cert.chainOfCustody });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add custody event' });
    }
});

module.exports = router;
