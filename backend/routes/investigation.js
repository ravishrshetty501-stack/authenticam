/**
 * investigation.js — AI Investigation API Routes for AuthentiCam
 *
 * Endpoints:
 *   POST /api/investigate              — Run AI investigation on media + certificate
 *   GET  /api/investigate              — List all investigations (paginated)
 *   GET  /api/investigate/stats        — Dashboard statistics
 *   GET  /api/investigate/:caseId      — Get investigation by case ID
 *   POST /api/investigate/:caseId/feedback — Submit investigator decision
 *   GET  /api/investigate/device/:fingerprint — Device investigation history
 *
 * @module routes/investigation
 */

'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const { verifyRecording } = require('../utils/verifier');
const { investigate } = require('../utils/investigationAgent');
const {
    retainInvestigation,
    recallSimilarCases,
    reflectOnPatterns,
    retainFeedback,
    isAvailable: isHindsightAvailable,
} = require('../utils/hindsight');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// ── In-memory store for demo mode ────────────────────────────────────
const demoInvestigations = new Map();
let demoCaseCounter = 0;

function getDemoNextCaseId() {
    demoCaseCounter++;
    return `INV-${new Date().getFullYear()}-${String(demoCaseCounter).padStart(4, '0')}`;
}

// ── Helper: get investigation store (MongoDB or in-memory) ──────────
function isMongoMode() {
    return global.dbMode === 'mongodb';
}

// ── POST /api/investigate — Run AI investigation ─────────────────────
router.post('/', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No media file uploaded' });
        }

        // Parse certificate
        let certData;
        try {
            certData = JSON.parse(req.body.certificateJson);
        } catch {
            return res.status(400).json({ error: 'Invalid certificate JSON' });
        }

        const fileBuffer = req.file.buffer;
        const cert = certData?.authenticam_certificate || certData;

        // Step 1: Run existing 6-check verification
        console.log('[investigate] Running 6-check verification...');
        const verificationResult = await verifyRecording(fileBuffer, certData);

        // Step 2: Extract evidence characteristics for Hindsight query
        const evidenceChars = {
            overallVerdict: verificationResult.overall,
            watermarkStatus: verificationResult.checks?.watermark?.pass ? 'INTACT' : 'CORRUPTED',
            hashStatus: verificationResult.checks?.hash?.pass ? 'MATCH' : 'MISMATCH',
            signatureStatus: verificationResult.checks?.signature?.pass ? 'VALID' : 'INVALID',
            deviceFingerprint: cert?.deviceFingerprint || 'unknown',
            timestampSource: cert?.timestampProof?.source || 'system',
            verificationSummary: verificationResult.summary || '',
        };

        // Step 3: Recall similar cases from Hindsight
        console.log('[investigate] Recalling similar cases from Hindsight...');
        const similarCases = await recallSimilarCases(evidenceChars);

        // Step 4: Reflect on patterns from Hindsight
        console.log('[investigate] Reflecting on patterns...');
        const patternInsights = await reflectOnPatterns(evidenceChars);

        // Step 5: Run AI Investigation Agent
        console.log('[investigate] Running AI investigation agent...');
        const aiReport = await investigate({
            verificationResult,
            certificate: certData,
            similarCases,
            patternInsights,
        });

        // Step 6: Build investigation record
        const investigation = {
            caseId: aiReport.caseId,
            certificateId: cert?.certificateId || null,
            userId: req.body.userId || null,
            verificationResult,
            aiReport,
            riskLevel: aiReport.riskLevel,
            recommendation: aiReport.recommendation,
            confidenceScore: aiReport.confidenceScore,
            investigatorDecision: null,
            investigatorNotes: '',
            feedbackAt: null,
            similarCaseIds: aiReport.similarCases.map(c => c.caseId),
            deviceFingerprint: cert?.deviceFingerprint || 'unknown',
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            hindsightRetained: false,
            createdAt: new Date().toISOString(),
        };

        // Step 7: Store investigation
        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                const doc = new Investigation(investigation);
                await doc.save();
            } catch (dbErr) {
                console.warn('[investigate] MongoDB save failed:', dbErr.message);
                demoInvestigations.set(investigation.caseId, investigation);
            }
        } else {
            demoInvestigations.set(investigation.caseId, investigation);
        }

        // Step 8: Retain in Hindsight (fire-and-forget)
        retainInvestigation(investigation, investigation.userId).then(() => {
            investigation.hindsightRetained = true;
            if (!isMongoMode()) {
                demoInvestigations.set(investigation.caseId, investigation);
            }
        }).catch(err => {
            console.warn('[investigate] Hindsight retain failed:', err.message);
        });

        const hindsightStatus = await isHindsightAvailable();

        console.log(`[investigate] Case ${investigation.caseId} — Risk: ${investigation.riskLevel}, Recommendation: ${investigation.recommendation}`);

        res.json({
            investigation,
            hindsightAvailable: hindsightStatus,
            similarCasesFound: similarCases.length,
        });
    } catch (err) {
        console.error('[investigate] Error:', err);
        res.status(500).json({ error: 'Investigation failed', details: err.message });
    }
});

// ── GET /api/investigate — List investigations ───────────────────────
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let investigations, total;

        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                total = await Investigation.countDocuments();
                investigations = await Investigation.find()
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();
            } catch {
                // Fall back to demo store
                const all = [...demoInvestigations.values()].reverse();
                total = all.length;
                investigations = all.slice(skip, skip + limit);
            }
        } else {
            const all = [...demoInvestigations.values()].reverse();
            total = all.length;
            investigations = all.slice(skip, skip + limit);
        }

        res.json({ investigations, total, page, limit });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list investigations', details: err.message });
    }
});

// ── GET /api/investigate/stats — Dashboard statistics ────────────────
router.get('/stats', async (req, res) => {
    try {
        let investigations;

        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                investigations = await Investigation.find().lean();
            } catch {
                investigations = [...demoInvestigations.values()];
            }
        } else {
            investigations = [...demoInvestigations.values()];
        }

        const stats = {
            totalInvestigations: investigations.length,
            riskDistribution: {
                LOW: investigations.filter(i => i.riskLevel === 'LOW').length,
                MEDIUM: investigations.filter(i => i.riskLevel === 'MEDIUM').length,
                HIGH: investigations.filter(i => i.riskLevel === 'HIGH').length,
                CRITICAL: investigations.filter(i => i.riskLevel === 'CRITICAL').length,
            },
            recommendationDistribution: {
                AUTHENTIC: investigations.filter(i => i.recommendation === 'AUTHENTIC').length,
                MANUAL_REVIEW: investigations.filter(i => i.recommendation === 'MANUAL_REVIEW').length,
                LIKELY_TAMPERED: investigations.filter(i => i.recommendation === 'LIKELY_TAMPERED').length,
                CONFIRMED_TAMPERED: investigations.filter(i => i.recommendation === 'CONFIRMED_TAMPERED').length,
            },
            feedbackProvided: investigations.filter(i => i.investigatorDecision).length,
            pendingReview: investigations.filter(i => !i.investigatorDecision).length,
            averageConfidence: investigations.length > 0
                ? Math.round((investigations.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / investigations.length) * 100) / 100
                : 0,
            hindsightRetained: investigations.filter(i => i.hindsightRetained).length,
            uniqueDevices: new Set(investigations.map(i => i.deviceFingerprint)).size,
        };

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get stats', details: err.message });
    }
});

// ── GET /api/investigate/:caseId — Get single investigation ──────────
router.get('/:caseId', async (req, res) => {
    try {
        const { caseId } = req.params;
        let investigation;

        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                investigation = await Investigation.findOne({ caseId }).lean();
            } catch {
                investigation = demoInvestigations.get(caseId);
            }
        } else {
            investigation = demoInvestigations.get(caseId);
        }

        if (!investigation) {
            return res.status(404).json({ error: 'Investigation not found' });
        }

        res.json({ investigation });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get investigation', details: err.message });
    }
});

// ── POST /api/investigate/:caseId/feedback — Investigator decision ───
router.post('/:caseId/feedback', async (req, res) => {
    try {
        const { caseId } = req.params;
        const { decision, notes } = req.body;

        if (!decision) {
            return res.status(400).json({ error: 'Decision is required' });
        }

        const validDecisions = ['CONFIRMED_AUTHENTIC', 'CONFIRMED_TAMPERED', 'RE_ENCODED', 'INCONCLUSIVE'];
        if (!validDecisions.includes(decision)) {
            return res.status(400).json({ error: `Invalid decision. Must be one of: ${validDecisions.join(', ')}` });
        }

        let investigation;

        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                investigation = await Investigation.findOneAndUpdate(
                    { caseId },
                    {
                        investigatorDecision: decision,
                        investigatorNotes: notes || '',
                        feedbackAt: new Date(),
                    },
                    { new: true }
                ).lean();
            } catch (err) {
                // Ignore Mongo errors and fallback below
            }
        }

        if (!investigation) {
            investigation = demoInvestigations.get(caseId);
            if (investigation) {
                investigation.investigatorDecision = decision;
                investigation.investigatorNotes = notes || '';
                investigation.feedbackAt = new Date().toISOString();
                demoInvestigations.set(caseId, investigation);
            }
        }

        if (!investigation) {
            return res.status(404).json({ error: 'Investigation not found' });
        }

        // Store feedback in Hindsight (fire-and-forget)
        retainFeedback(investigation, decision, notes, investigation.userId).catch(err => {
            console.warn('[investigate/feedback] Hindsight retain failed:', err.message);
        });

        console.log(`[investigate/feedback] Case ${caseId}: ${decision}`);

        res.json({
            investigation,
            message: `Feedback recorded. Decision: ${decision}`,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save feedback', details: err.message });
    }
});

// ── GET /api/investigate/device/:fingerprint — Device history ────────
router.get('/device/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        let investigations;

        if (isMongoMode()) {
            try {
                const Investigation = require('../models/Investigation');
                investigations = await Investigation.find({ deviceFingerprint: fingerprint })
                    .sort({ createdAt: -1 })
                    .lean();
            } catch {
                investigations = [...demoInvestigations.values()]
                    .filter(i => i.deviceFingerprint === fingerprint)
                    .reverse();
            }
        } else {
            investigations = [...demoInvestigations.values()]
                .filter(i => i.deviceFingerprint === fingerprint)
                .reverse();
        }

        res.json({
            fingerprint,
            totalRecordings: investigations.length,
            investigations,
            flaggedCount: investigations.filter(i => ['HIGH', 'CRITICAL'].includes(i.riskLevel)).length,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get device history', details: err.message });
    }
});

module.exports = router;
