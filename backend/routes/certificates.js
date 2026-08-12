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

// GET /api/certificates/:certId/download - Download as JSON (v2.0 schema)
router.get('/:certId/download', optionalAuth, async (req, res) => {
    try {
        const certificate = await Certificate.findOne({ certificateId: req.params.certId })
            .populate('userId', 'username email');
        if (!certificate) return res.status(404).json({ error: 'Certificate not found' });

        const { ALGORITHM_VERSIONS } = require('../utils/certificate');

        const certData = {
            authenticam_certificate: {
                // Identity
                certificateId: certificate.certificateId,
                version: certificate.algorithmVersions?.certificateVersion || '2.0',
                issuedAt: certificate.timestampProof?.iso || certificate.timestamp?.toISOString(),
                issuedBy: certificate.userId?.username || 'unknown',
                issuerEmail: certificate.userId?.email || null,
                userId: certificate.userId?._id?.toString(),

                // Media
                fileName: certificate.fileName,
                fileSize: certificate.fileSize,
                mimeType: certificate.mimeType,
                duration: certificate.duration || 0,
                recordingId: certificate.recordingId?.toString() || null,

                // Cryptographic proofs
                fileHash: certificate.fileHash,
                merkleRoot: certificate.merkleRoot || null,
                merkleLeafCount: certificate.merkleLeafCount || 0,
                watermarkHash: certificate.watermarkHash || null,
                digitalSignature: certificate.digitalSignature || certificate.signature,
                signature: certificate.signature, // backwards compat
                publicKey: certificate.publicKey,

                // Device
                deviceFingerprint: certificate.deviceFingerprint,
                fingerprintHash: certificate.fingerprintHash || null,

                // Timestamp
                timestampProof: certificate.timestampProof || {
                    iso: certificate.timestamp?.toISOString(),
                    source: 'system',
                    reliable: false,
                },

                // Metadata
                geoLocation: certificate.geoLocation || null,
                verificationUrl: certificate.verificationUrl,
                chainOfCustody: certificate.chainOfCustody,
                algorithmVersions: certificate.algorithmVersions || ALGORITHM_VERSIONS,
            },
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificateId}.json"`);
        res.json(certData);
    } catch (err) {
        res.status(500).json({ error: 'Download failed' });
    }
});

// GET /api/certificates/:certId/media - Download the watermarked media file associated with this certificate
router.get('/:certId/media', optionalAuth, async (req, res) => {
    try {
        const certificate = await Certificate.findOne({ certificateId: req.params.certId });
        if (!certificate) return res.status(404).json({ error: 'Certificate not found' });

        const Recording = require('../models/Recording');
        const recording = await Recording.findById(certificate.recordingId);
        if (!recording) return res.status(404).json({ error: 'Recording not found' });

        const filePath = recording.filePath;
        if (!filePath) {
            return res.status(404).json({ error: 'Recording file path not found' });
        }

        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Recording file not found on disk' });
        }

        const path = require('path');
        const ext = recording.mimeType?.startsWith('image') ? '.jpg' :
                    recording.mimeType?.startsWith('video') ? '.mp4' : path.extname(filePath) || '.mp4';
        res.setHeader('Content-Type', recording.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="authentic-${certificate.certificateId}${ext}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (err) {
        res.status(500).json({ error: 'Download failed', details: err.message });
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
