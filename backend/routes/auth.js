const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, faceDescriptor } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        const user = new User({
            username,
            email,
            passwordHash: password, // pre-save hook hashes it
            faceDescriptor: faceDescriptor || null,
            faceEnrolled: !!(faceDescriptor && faceDescriptor.length === 128),
        });
        await user.save();
        const token = user.generateJWT();
        res.status(201).json({ message: 'Account created successfully', token, user: user.toJSON() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed', details: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        user.lastLogin = new Date();
        await user.save();
        const token = user.generateJWT();
        res.json({ message: 'Login successful', token, user: user.toJSON() });
    } catch (err) {
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});

// POST /api/auth/face-login
router.post('/face-login', async (req, res) => {
    try {
        const { faceDescriptor, email } = req.body;

        // Validate: must be a real 128-dim face descriptor from face-api.js
        if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
            return res.status(400).json({ error: 'A valid 128-dimension face descriptor is required' });
        }

        const THRESHOLD = 0.55; // Euclidean distance: 0 = identical, >0.6 = different person
        let matchedUser = null;

        if (email) {
            // Fast path: user provided their email – only compare against their registered face
            const candidate = await User.findOne({ email }).select('+faceDescriptor');
            if (!candidate) {
                return res.status(404).json({ error: 'No account found with that email' });
            }
            if (!candidate.faceEnrolled || !candidate.faceDescriptor || candidate.faceDescriptor.length !== 128) {
                console.warn(`[FaceAuth] User ${email} attempted face login but has no enrolled face.`);
                return res.status(401).json({ error: 'No Face ID enrolled for this account. Register with Face ID first.' });
            }
            const dist = euclideanDistance(candidate.faceDescriptor, faceDescriptor);
            const confidence = (1 - Math.min(dist, 1)) * 100;
            console.log(`[FaceAuth] Distance for ${email}: ${dist.toFixed(4)} (threshold ${THRESHOLD}) - Confidence: ${confidence.toFixed(1)}%`);

            if (dist > THRESHOLD) {
                return res.status(401).json({
                    error: `Face not recognized`,
                    details: `Match confidence: ${confidence.toFixed(0)}% (Requires >${((1 - THRESHOLD) * 100).toFixed(0)}%)`
                });
            }
            matchedUser = candidate;
        } else {
            // Slow path: no email – search all enrolled users for best match
            const allUsers = await User.find({ faceEnrolled: true }).select('+faceDescriptor');
            let bestDist = Infinity;
            for (const u of allUsers) {
                if (!u.faceDescriptor || u.faceDescriptor.length !== 128) continue;
                const dist = euclideanDistance(u.faceDescriptor, faceDescriptor);
                if (dist < bestDist) { bestDist = dist; matchedUser = u; }
            }
            console.log(`[FaceAuth] Best match distance (no email): ${bestDist.toFixed(4)}`);
            if (!matchedUser || bestDist > THRESHOLD) {
                return res.status(401).json({ error: 'Face not recognized. Try providing your email for faster matching.' });
            }
        }

        matchedUser.lastLogin = new Date();
        await matchedUser.save();
        const token = matchedUser.generateJWT();
        res.json({ message: 'Face login successful', token, user: matchedUser.toJSON() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Face login failed', details: err.message });
    }
});

// GET /api/auth/me (protected)
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
    res.json({ user: req.user });
});

// POST /api/auth/enroll-face (protected)
router.post('/enroll-face', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
        const { faceDescriptor } = req.body;
        if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
            return res.status(400).json({ error: 'Valid 128-dim face descriptor required' });
        }
        const user = await User.findById(req.user._id);
        user.faceDescriptor = faceDescriptor;
        user.faceEnrolled = true;
        await user.save();
        res.json({ message: 'Face enrolled successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Face enrollment failed', details: err.message });
    }
});

// POST /api/auth/google-login
router.post('/google-login', async (req, res) => {
    try {
        const { googleId, email, name } = req.body;
        if (!googleId || !email) {
            return res.status(400).json({ error: 'googleId and email are required' });
        }

        // Try to find existing user by googleId or email
        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
            // Link googleId if user signed up with password previously
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = 'google';
                await user.save();
            }
        } else {
            // Auto-create account for new Google users
            const baseUsername = (name || email.split('@')[0])
                .replace(/\s+/g, '_')
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '')
                .slice(0, 28) || 'user';
            let username = baseUsername;
            let suffix = 1;
            while (await User.findOne({ username })) {
                username = `${baseUsername}${suffix++}`;
            }
            user = new User({
                username,
                email,
                passwordHash: '', // no password for Google users
                googleId,
                authProvider: 'google',
            });
            await user.save();
        }

        user.lastLogin = new Date();
        await user.save();
        const token = user.generateJWT();
        res.json({ message: 'Google login successful', token, user: user.toJSON() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Google login failed', details: err.message });
    }
});

function euclideanDistance(a, b) {
    if (a.length !== b.length) return Infinity;
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

module.exports = router;
