require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync('./keys')) fs.mkdirSync('./keys', { recursive: true });

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        const allowed = [
            'http://localhost:3000',
            'https://localhost:3000',
            'http://127.0.0.1:3000',
            'https://127.0.0.1:3000',
            'http://172.18.28.186:3000',
            process.env.FRONTEND_URL,
        ].filter(Boolean);
        // Allow Vercel deployment URLs (*.vercel.app)
        if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbMode: global.dbMode, timestamp: new Date().toISOString(), service: 'AuthentiCam API' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});

const PORT = process.env.PORT || 5000;

function setupRoutes() {
    const authRoutes = require('./routes/auth');
    const recordingRoutes = require('./routes/recordings');
    const certificateRoutes = require('./routes/certificates');
    const verificationRoutes = require('./routes/verification');
    const auditRoutes = require('./routes/audit');
    const investigationRoutes = require('./routes/investigation');

    app.use('/api/auth', authRoutes);
    app.use('/api/recordings', recordingRoutes);
    app.use('/api/certificates', certificateRoutes);
    app.use('/api/verify', verificationRoutes);
    app.use('/api/audit', auditRoutes);
    app.use('/api/investigate', investigationRoutes);
}

function setupDemoRoutes() {
    console.log('🎭 Running in DEMO mode (no MongoDB)');
    const { buildMerkleTree } = require('./utils/merkle');
    const { embedWatermark } = require('./utils/watermark');
    const { getTrustedTimestamp } = require('./utils/timestamp');
    const { ALGORITHM_VERSIONS } = require('./utils/certificate');
    const { signHash, getPublicKey, generateKeys } = require('./utils/crypto');
    const { anchorToBlockchain } = require('./utils/blockchain');
    generateKeys();

    // In-memory store for demo
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');
    const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-authenticam-2024';
    const demoUsers = new Map();
    const demoRecordings = new Map();
    const demoCertificates = new Map();

    const makeToken = (user) => jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

    // AUTH
    const authRouter = express.Router();

    authRouter.post('/register', async (req, res) => {
        try {
            const { username, email, password } = req.body;
            if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
            if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
            if ([...demoUsers.values()].find(u => u.email === email)) {
                return res.status(400).json({ error: 'Email already registered' });
            }
            const hash = await bcrypt.hash(password, 10);
            const user = { id: uuidv4(), username, email, passwordHash: hash, role: 'user', createdAt: new Date() };
            demoUsers.set(user.id, user);
            const token = makeToken(user);
            res.status(201).json({ user: { id: user.id, username, email, role: 'user' }, token });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    authRouter.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = [...demoUsers.values()].find(u => u.email === email);
            if (!user) return res.status(401).json({ error: 'Invalid email or password' });
            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
            const token = makeToken(user);
            res.json({ user: { id: user.id, username: user.username, email, role: 'user' }, token });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    authRouter.post('/face-login', async (req, res) => {
        try {
            const { email } = req.body;
            const user = email ? [...demoUsers.values()].find(u => u.email === email) : [...demoUsers.values()][0];
            if (!user) return res.status(404).json({ error: 'No account found. Register first.' });
            const token = makeToken(user);
            res.json({ user: { id: user.id, username: user.username, email: user.email, role: 'user' }, token });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    authRouter.get('/me', (req, res) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = demoUsers.get(decoded.id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user: { id: user.id, username: user.username, email: user.email, role: 'user' } });
        } catch { res.status(401).json({ error: 'Invalid token' }); }
    });

    app.use('/api/auth', authRouter);

    // RECORDINGS (in-memory)
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
    const recRouter = express.Router();

    const authMiddleware = (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        try { req.user = jwt.verify(token, JWT_SECRET); next(); }
        catch { res.status(401).json({ error: 'Invalid token' }); }
    };

    recRouter.post('/upload', authMiddleware, upload.single('media'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
            const fileBuffer = req.file.buffer;
            const certId = uuidv4();
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificate/${certId}`;

            // ─── Watermark ──────────────────────────────────────────
            // Use certId as seed for consistency with recordings.js
            const { watermarkedBuffer, watermarkHash } = embedWatermark(fileBuffer, certId);

            // ─── Crypto Proofs (on watermarked buffer) ──────────────
            const fileHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex');
            const merkleTree = buildMerkleTree(watermarkedBuffer);
            const merkleRoot = merkleTree.root;
            const merkleLeafCount = merkleTree.leaves.length; // This was originally after merkleTree, keep it here.

            // RSA sign
            const signature = signHash(fileHash);
            const publicKey = getPublicKey();

            // NTP timestamp
            const timestampProof = await getTrustedTimestamp();
            const now = new Date(timestampProof.iso);

            const recId = uuidv4();

            const cert = {
                certificateId: certId,
                version: ALGORITHM_VERSIONS.certificateVersion,
                recordingId: recId,
                userId: req.user.id,
                issuedAt: timestampProof.iso,
                issuedBy: req.user.email,
                fileHash,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                duration: parseFloat(req.body.duration) || 0,
                merkleRoot,
                merkleLeafCount,
                watermarkHash,
                signature: signature || crypto.randomBytes(64).toString('hex'),
                digitalSignature: signature || crypto.randomBytes(64).toString('hex'),
                publicKey: publicKey || 'DEMO_RSA_PUBLIC_KEY',
                deviceFingerprint: req.body.deviceFingerprint || 'demo',
                fingerprintHash: crypto.createHash('sha256').update(req.body.deviceFingerprint || 'demo').digest('hex'),
                timestampProof,
                timestamp: now,
                algorithmVersions: ALGORITHM_VERSIONS,
                verificationUrl,
                qrCodeData: verificationUrl,
                chainOfCustody: [{
                    event: 'RECORDING_CREATED',
                    timestamp: now,
                    actor: req.user.email,
                    details: { fileHash, merkleRoot, watermarkHash, merkleLeafCount, timestampSource: timestampProof.source },
                }],
            };
            const rec = {
                _id: recId, title: req.body.title || 'Untitled', fileHash,
                fileSize: req.file.size, mimeType: req.file.mimetype,
                duration: parseFloat(req.body.duration) || 0, status: 'certified',
                createdAt: now, userId: req.user.id,
                certificateId: {
                    certificateId: certId, qrCodeData: cert.qrCodeData, verificationUrl: cert.verificationUrl,
                    merkleRoot, watermarkHash
                },
            };
            demoCertificates.set(certId, cert);
            demoRecordings.set(recId, { ...rec, watermarkedBuffer });

            // Anchor to local blockchain ledger
            try {
                const block = anchorToBlockchain(fileHash, certId, req.user.id);
                cert.blockchainAnchor = {
                    blockIndex: block.blockIndex,
                    blockHash: block.blockHash,
                    timestamp: block.timestamp,
                };
            } catch (blockErr) {
                console.warn('[demo/upload] Blockchain anchor failed:', blockErr.message);
            }

            res.json({ recording: rec, certificate: cert });
        } catch (e) { console.error('[demo/upload]', e); res.status(500).json({ error: e.message }); }
    });

    recRouter.get('/', authMiddleware, (req, res) => {
        const recs = [...demoRecordings.values()].filter(r => r.userId === req.user.id);
        res.json({ recordings: recs, total: recs.length });
    });

    recRouter.delete('/:id', authMiddleware, (req, res) => {
        demoRecordings.delete(req.params.id);
        res.json({ message: 'Deleted' });
    });

    recRouter.get('/:id/download', authMiddleware, (req, res) => {
        const rec = demoRecordings.get(req.params.id);
        if (!rec || !rec.watermarkedBuffer) return res.status(404).json({ error: 'File not found' });

        const ext = rec.mimeType?.startsWith('image') ? '.jpg' :
                    rec.mimeType?.startsWith('video') ? '.mp4' : '.mp4';
        res.setHeader('Content-Type', rec.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="authentic-${rec.title.replace(/[^a-z0-9]/gi, '_')}${ext}"`);
        res.send(rec.watermarkedBuffer);
    });

    app.use('/api/recordings', recRouter);

    // CERTIFICATES
    const certRouter = express.Router();
    certRouter.get('/:id', (req, res) => {
        const cert = demoCertificates.get(req.params.id);
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });
        res.json({ certificate: cert, verificationHistory: [] });
    });
    certRouter.get('/:id/download', (req, res) => {
        const cert = demoCertificates.get(req.params.id);
        if (!cert) return res.status(404).json({ error: 'Not found' });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=certificate-${req.params.id}.json`);
        res.send(JSON.stringify(cert, null, 2));
    });
    certRouter.get('/:id/media', (req, res) => {
        const cert = demoCertificates.get(req.params.id);
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });
        const rec = demoRecordings.get(cert.recordingId);
        if (!rec || !rec.watermarkedBuffer) return res.status(404).json({ error: 'Media not found' });

        const ext = rec.mimeType?.startsWith('image') ? '.jpg' :
                    rec.mimeType?.startsWith('video') ? '.mp4' : '.mp4';
        res.setHeader('Content-Type', rec.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="authentic-${cert.certificateId}${ext}"`);
        res.send(rec.watermarkedBuffer);
    });
    app.use('/api/certificates', certRouter);


    // VERIFY — Full 5-check verifier (demo mode)
    const { verifyRecording } = require('./utils/verifier');
    const verRouter = express.Router();
    verRouter.post('/', upload.single('media'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No media file' });
            let certData;
            try { certData = JSON.parse(req.body.certificateJson); } catch { return res.status(400).json({ error: 'Invalid certificate JSON' }); }
            const fileBuffer = req.file.buffer;
            const report = await verifyRecording(fileBuffer, certData);
            const legacyResult = { VALID: 'authentic', TAMPERED: 'tampered', UNKNOWN_DEVICE: 'tampered' }[report.overall] || 'error';
            res.json({
                overall: report.overall,
                checks: report.checks,
                summary: report.summary,
                verifiedAt: report.verifiedAt,
                result: legacyResult,
                authentic: report.overall === 'VALID',
                uploadedHash: report.checks.hash?.computedHash || '',
                expectedHash: (certData.authenticam_certificate || certData).fileHash || null,
                tamperDetails: report.summary,
                certificate: certData,
                verificationId: uuidv4(),
                timestamp: report.verifiedAt,
            });
        } catch (e) { console.error('[demo/verify]', e); res.status(500).json({ error: e.message }); }
    });
    app.use('/api/verify', verRouter);

    // AUDIT — chain-of-custody and blockchain ledger
    const auditRoutes = require('./routes/audit');
    app.use('/api/audit', auditRoutes);

    // INVESTIGATION — AI Evidence Investigation Agent
    const investigationRoutes = require('./routes/investigation');
    app.use('/api/investigate', investigationRoutes);
}

// Try MongoDB connection; fall back to demo mode
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/authenticam';
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
        global.dbMode = 'mongodb';
        const { generateKeys } = require('./utils/crypto');
        generateKeys();
        setupRoutes();
        app.listen(PORT, () => console.log(`🚀 AuthentiCam API running on port ${PORT} (MongoDB mode)`));
    })
    .catch((err) => {
        console.warn('⚠️  MongoDB unavailable:', err.message);
        console.log('🎭 Starting in DEMO mode (in-memory data, no persistence)');
        global.dbMode = 'demo';
        setupDemoRoutes();
        app.listen(PORT, () => console.log(`🚀 AuthentiCam API running on port ${PORT} (Demo mode)`));
    });

module.exports = app;
