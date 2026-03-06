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
            'http://172.20.199.120:3000',
            'https://172.20.199.120:3000',
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

    app.use('/api/auth', authRoutes);
    app.use('/api/recordings', recordingRoutes);
    app.use('/api/certificates', certificateRoutes);
    app.use('/api/verify', verificationRoutes);
}

function setupDemoRoutes() {
    console.log('🎭 Running in DEMO mode (no MongoDB)');

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
            const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
            const certId = uuidv4();
            const recId = uuidv4();
            const now = new Date();
            const cert = {
                certificateId: certId,
                recordingId: recId,
                userId: req.user.id,
                fileHash,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype,
                timestamp: now,
                deviceFingerprint: req.body.deviceFingerprint || 'demo',
                signature: crypto.randomBytes(64).toString('hex'),
                publicKey: 'DEMO_RSA_PUBLIC_KEY',
                verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificate/${certId}`,
                qrCodeData: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/certificate/${certId}`,
                chainOfCustody: [{ event: 'recording_created', timestamp: now, actor: req.user.id }],
            };
            const rec = {
                _id: recId, title: req.body.title || 'Untitled', fileHash,
                fileSize: req.file.size, mimeType: req.file.mimetype,
                duration: parseFloat(req.body.duration) || 0, status: 'certified',
                createdAt: now, userId: req.user.id,
                certificateId: { certificateId: certId, qrCodeData: cert.qrCodeData, verificationUrl: cert.verificationUrl },
            };
            demoCertificates.set(certId, cert);
            demoRecordings.set(recId, rec);
            res.json({ recording: rec, certificate: cert });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    recRouter.get('/', authMiddleware, (req, res) => {
        const recs = [...demoRecordings.values()].filter(r => r.userId === req.user.id);
        res.json({ recordings: recs, total: recs.length });
    });

    recRouter.delete('/:id', authMiddleware, (req, res) => {
        demoRecordings.delete(req.params.id);
        res.json({ message: 'Deleted' });
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
    app.use('/api/certificates', certRouter);

    // VERIFY
    const verRouter = express.Router();
    verRouter.post('/', upload.single('media'), (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No media file' });
            const uploadedHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
            let certData;
            try { certData = JSON.parse(req.body.certificateJson); } catch { return res.status(400).json({ error: 'Invalid certificate JSON' }); }
            const expectedHash = certData.fileHash || certData.authenticam_certificate?.fileHash;
            const authentic = uploadedHash === expectedHash;
            res.json({
                result: authentic ? 'authentic' : 'tampered',
                authentic,
                uploadedHash,
                expectedHash: expectedHash || 'Not found',
                tamperDetails: authentic ? null : 'File hash does not match the certificate',
                certificate: certData,
                verificationId: uuidv4(),
                timestamp: new Date(),
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.use('/api/verify', verRouter);
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
