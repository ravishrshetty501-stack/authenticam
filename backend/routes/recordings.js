const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Recording = require('../models/Recording');
const Certificate = require('../models/Certificate');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { computeFileHash, signHash, getPublicKey } = require('../utils/crypto');
const { buildMerkleTree } = require('../utils/merkle');
const { embedWatermark } = require('../utils/watermark');
const { parseClientFingerprint } = require('../utils/fingerprint');
const { getTrustedTimestamp } = require('../utils/timestamp');
const { ALGORITHM_VERSIONS } = require('../utils/certificate');
const { anchorToBlockchain } = require('../utils/blockchain');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// POST /api/recordings/upload — Upload, hash, watermark, Merkle, sign, and certify
router.post('/upload', authMiddleware, upload.single('media'), async (req, res) => {
    let tempPath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        tempPath = req.file.path;

        const { deviceFingerprint, title, duration, geoLocation } = req.body;

        // ── 1. Read file buffer ─────────────────────────────────────
        const fileBuffer = fs.readFileSync(tempPath);

        // ── 2. Build certificate ID & initial metadata ──────────────
        const certId = uuidv4();
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificate/${certId}`;
        const qrCodeData = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'H', width: 256 });

        // ── 3. Spread-spectrum watermark embed ──────────────────────
        // Use certId as a unique, deterministic seed for this file's watermark
        const { watermarkedBuffer, watermarkHash } = embedWatermark(fileBuffer, certId);
        // Write watermarked bytes to disk immediately
        fs.writeFileSync(tempPath, watermarkedBuffer);

        // ── 4. SHA-256 hash (on watermarked buffer) ─────────────────
        const fileHash = await computeFileHash(tempPath);

        // ── 5. Merkle tree (on watermarked buffer) ──────────────────
        const merkleTree = buildMerkleTree(watermarkedBuffer);
        const merkleRoot = merkleTree.root;
        const merkleLeafCount = merkleTree.leaves.length;

        // ── 6. RSA signature (on watermarked hash) ──────────────────
        const signature = signHash(fileHash);
        const publicKey = getPublicKey();

        // ── 7. Enriched device fingerprint ──────────────────────────
        const fpEnriched = parseClientFingerprint(deviceFingerprint, req);
        const fingerprintHash = fpEnriched.enrichedHash;

        // ── 8. Trusted NTP timestamp ────────────────────────────────
        const timestampProof = await getTrustedTimestamp();
        const timestamp = new Date(timestampProof.iso);

        // ── 9. Save recording ───────────────────────────────────────
        const recording = new Recording({
            userId: req.user._id,
            title: title || req.file.originalname || 'Untitled Recording',
            filename: req.file.filename,
            filePath: tempPath,
            fileHash,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            duration: parseFloat(duration) || 0,
            deviceFingerprint: deviceFingerprint || 'unknown',
            geoLocation: geoLocation ? JSON.parse(geoLocation) : undefined,
            status: 'unverified',
        });
        await recording.save();

        // ── 10. Save certificate ────────────────────────────────────
        const certificate = new Certificate({
            recordingId: recording._id,
            userId: req.user._id,
            certificateId: certId,

            // Media info
            fileHash,
            fileName: req.file.originalname || req.file.filename,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            duration: parseFloat(duration) || 0,
            timestamp,

            // Crypto proofs
            signature,
            digitalSignature: signature,
            publicKey,
            merkleRoot,
            merkleLeafCount,
            watermarkHash,

            // Device
            deviceFingerprint: deviceFingerprint || 'unknown',
            fingerprintHash,

            // Time
            timestampProof,

            // Metadata
            algorithmVersions: ALGORITHM_VERSIONS,
            geoLocation: geoLocation ? JSON.parse(geoLocation) : null,
            qrCodeData,
            verificationUrl,

            chainOfCustody: [{
                event: 'RECORDING_CREATED',
                timestamp,
                actor: req.user.username,
                actorId: req.user._id,
                ipAddress: req.ip,
                details: {
                    fileHash,
                    merkleRoot,
                    watermarkHash,
                    merkleLeafCount,
                    timestampSource: timestampProof.source,
                },
            }],
        });
        await certificate.save();

        recording.certificateId = certificate._id;
        recording.status = 'certified';
        await recording.save();

        // Update user recording count
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, { $inc: { recordingsCount: 1 } });

        // ── 11. Blockchain anchor (fire-and-forget) ─────────────────
        try { anchorToBlockchain(fileHash, certId, String(req.user._id)); } catch { /* non-critical */ }

        res.status(201).json({
            message: 'Recording uploaded and certified',
            recording,
            certificate,
        });
    } catch (err) {
        console.error('[recordings/upload]', err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

// GET /api/recordings — List user's recordings
router.get('/', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const recordings = await Recording.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('certificateId', 'certificateId qrCodeData verificationUrl merkleRoot watermarkHash');
        const total = await Recording.countDocuments({ userId: req.user._id });
        res.json({ recordings, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

// GET /api/recordings/:id/download — Download the watermarked file
router.get('/:id/download', authMiddleware, async (req, res) => {
    try {
        const recording = await Recording.findOne({ _id: req.params.id, userId: req.user._id });
        if (!recording) return res.status(404).json({ error: 'Recording not found' });

        const filePath = recording.filePath;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Recording file not found on disk' });
        }

        const ext = recording.mimeType?.startsWith('image') ? '.jpg' :
                    recording.mimeType?.startsWith('video') ? '.mp4' : path.extname(filePath) || '.mp4';
        res.setHeader('Content-Type', recording.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="authentic-${recording.title.replace(/[^a-z0-9]/gi, '_')}${ext}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (err) {
        res.status(500).json({ error: 'Download failed', details: err.message });
    }
});

// GET /api/recordings/:id
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const recording = await Recording.findOne({ _id: req.params.id, userId: req.user._id })
            .populate('certificateId');
        if (!recording) return res.status(404).json({ error: 'Recording not found' });
        res.json({ recording });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recording' });
    }
});

// GET /api/recordings/:id/merkle-proof — Return Merkle proof for a specific chunk index
router.get('/:id/merkle-proof', authMiddleware, async (req, res) => {
    try {
        const recording = await Recording.findOne({ _id: req.params.id, userId: req.user._id })
            .populate('certificateId', 'merkleRoot merkleLeafCount');
        if (!recording) return res.status(404).json({ error: 'Recording not found' });

        const leafIndex = parseInt(req.query.leafIndex) || 0;
        const cert = recording.certificateId;
        if (!cert?.merkleRoot) {
            return res.status(404).json({ error: 'No Merkle proof available (legacy recording)' });
        }

        const filePath = recording.filePath;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Recording file not found on disk' });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const { buildMerkleTree, getMerkleProof } = require('../utils/merkle');
        const tree = buildMerkleTree(fileBuffer);
        const proof = getMerkleProof(tree, leafIndex);

        res.json({
            recordingId: req.params.id,
            leafIndex,
            leafHash: tree.leaves[leafIndex] || null,
            proof,
            root: tree.root,
            expectedRoot: cert.merkleRoot,
            valid: tree.root === cert.merkleRoot,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate Merkle proof', details: err.message });
    }
});

// DELETE /api/recordings/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const recording = await Recording.findOne({ _id: req.params.id, userId: req.user._id });
        if (!recording) return res.status(404).json({ error: 'Recording not found' });
        if (recording.filePath && fs.existsSync(recording.filePath)) {
            fs.unlinkSync(recording.filePath);
        }
        await Certificate.deleteOne({ recordingId: recording._id });
        await recording.deleteOne();
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, { $inc: { recordingsCount: -1 } });
        res.json({ message: 'Recording deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

module.exports = router;
