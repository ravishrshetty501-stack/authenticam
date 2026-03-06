const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Recording = require('../models/Recording');
const Certificate = require('../models/Certificate');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { computeFileHash, signHash, getPublicKey } = require('../utils/crypto');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// POST /api/recordings/upload - Upload and hash a recorded file
router.post('/upload', authMiddleware, upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const { deviceFingerprint, title, duration, geoLocation } = req.body;
        // Compute SHA256 hash
        const fileHash = await computeFileHash(req.file.path);
        // Create recording
        const recording = new Recording({
            userId: req.user._id,
            title: title || req.file.originalname || 'Untitled Recording',
            filename: req.file.filename,
            filePath: req.file.path,
            fileHash,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            duration: parseFloat(duration) || 0,
            deviceFingerprint: deviceFingerprint || 'unknown',
            geoLocation: geoLocation ? JSON.parse(geoLocation) : undefined,
            status: 'unverified',
        });
        await recording.save();
        // Auto-generate certificate
        const certId = uuidv4();
        const timestamp = new Date();
        const signature = signHash(fileHash);
        const publicKey = getPublicKey();
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify?cert=${certId}`;
        const qrCodeData = await QRCode.toDataURL(verificationUrl);
        const certificate = new Certificate({
            recordingId: recording._id,
            userId: req.user._id,
            certificateId: certId,
            fileHash,
            fileName: req.file.originalname || req.file.filename,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            timestamp,
            deviceFingerprint: deviceFingerprint || 'unknown',
            signature,
            publicKey,
            qrCodeData,
            verificationUrl,
            chainOfCustody: [{
                event: 'RECORDING_CREATED',
                timestamp,
                actor: req.user.username,
                actorId: req.user._id,
                details: { fileHash, fileSize: req.file.size },
            }],
        });
        await certificate.save();
        recording.certificateId = certificate._id;
        recording.status = 'certified';
        await recording.save();
        // Update user count
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user._id, { $inc: { recordingsCount: 1 } });
        res.status(201).json({
            message: 'Recording uploaded and certified',
            recording,
            certificate,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

// GET /api/recordings - List user's recordings
router.get('/', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const recordings = await Recording.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('certificateId', 'certificateId qrCodeData verificationUrl');
        const total = await Recording.countDocuments({ userId: req.user._id });
        res.json({ recordings, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recordings' });
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

// DELETE /api/recordings/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const recording = await Recording.findOne({ _id: req.params.id, userId: req.user._id });
        if (!recording) return res.status(404).json({ error: 'Recording not found' });
        // Delete file
        if (fs.existsSync(recording.filePath)) {
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
