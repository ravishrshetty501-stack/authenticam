/**
 * Investigation.js — Investigation Record Model for AuthentiCam
 *
 * Stores AI investigation reports, investigator decisions, and
 * links to certificates and verification results.
 *
 * @module models/Investigation
 */

const mongoose = require('mongoose');

const investigationSchema = new mongoose.Schema(
    {
        caseId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        certificateId: {
            type: String,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        // ── Verification Data ────────────────────────────────────────
        verificationResult: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // ── AI Report ────────────────────────────────────────────────
        aiReport: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
        riskLevel: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            required: true,
            index: true,
        },
        recommendation: {
            type: String,
            enum: ['AUTHENTIC', 'MANUAL_REVIEW', 'LIKELY_TAMPERED', 'CONFIRMED_TAMPERED'],
            required: true,
        },
        confidenceScore: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.5,
        },

        // ── Investigator Feedback ────────────────────────────────────
        investigatorDecision: {
            type: String,
            enum: [null, 'CONFIRMED_AUTHENTIC', 'CONFIRMED_TAMPERED', 'RE_ENCODED', 'INCONCLUSIVE'],
            default: null,
        },
        investigatorNotes: {
            type: String,
            default: '',
        },
        feedbackAt: {
            type: Date,
            default: null,
        },

        // ── Context ──────────────────────────────────────────────────
        similarCaseIds: {
            type: [String],
            default: [],
        },
        deviceFingerprint: {
            type: String,
            default: 'unknown',
        },
        fileName: {
            type: String,
        },
        fileSize: {
            type: Number,
        },
        mimeType: {
            type: String,
        },

        // ── Hindsight Status ─────────────────────────────────────────
        hindsightRetained: {
            type: Boolean,
            default: false,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Investigation', investigationSchema);
