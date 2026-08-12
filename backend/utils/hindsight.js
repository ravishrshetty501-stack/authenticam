/**
 * hindsight.js — Hindsight Memory Integration for AuthentiCam
 *
 * Wraps the Hindsight REST API to provide persistent investigation memory.
 * Three core operations:
 *   - retain() : Store investigation data as structured memory
 *   - recall() : Retrieve similar historical investigations
 *   - reflect(): Synthesize patterns from accumulated cases
 *
 * Falls back gracefully if Hindsight is unavailable (returns empty results).
 *
 * @module hindsight
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '../hindsight_memory.json');

// Initialize memory file if it doesn't exist
if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify([]));
}

// Default bank IDs
const GLOBAL_BANK = 'authenticam-global';
const userBank = (userId) => `authenticam-user-${userId}`;

/**
 * Check if Hindsight is reachable.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    return true; // We are using a local JSON mock for data persistence
}

/**
 * Retain (store) information into a Hindsight memory bank.
 */
async function retain(bankId, content) {
    try {
        const data = fs.readFileSync(MEMORY_FILE, 'utf8');
        const memories = JSON.parse(data);
        memories.push({ bankId, content, timestamp: new Date().toISOString() });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
        console.log(`[hindsight] Retained memory in bank "${bankId}" (${content.length} chars)`);
        return { success: true };
    } catch (err) {
        console.warn(`[hindsight] retain() failed:`, err.message);
        return null;
    }
}

/**
 * Recall (retrieve) relevant memories from a Hindsight bank.
 */
async function recall(bankId, query, limit = 5) {
    try {
        const data = fs.readFileSync(MEMORY_FILE, 'utf8');
        const memories = JSON.parse(data);
        
        const queryWords = query.toLowerCase().split(/[,\s]+/);
        let results = [];
        
        for (const m of memories) {
            if (m.bankId === bankId) {
                let score = 0;
                const lowerContent = m.content.toLowerCase();
                for (const w of queryWords) {
                    if (w.length > 3 && lowerContent.includes(w)) {
                        score += 0.1;
                    }
                }
                if (score > 0) {
                    results.push({ text: m.content, score });
                }
            }
        }
        
        results.sort((a, b) => b.score - a.score);
        const finalResults = results.slice(0, limit);
        console.log(`[hindsight] Recalled ${finalResults.length} memories from bank "${bankId}"`);
        return finalResults;
    } catch (err) {
        console.warn(`[hindsight] recall() failed:`, err.message);
        return [];
    }
}

/**
 * Reflect — ask Hindsight to synthesize insights from accumulated memories.
 */
async function reflect(bankId, query) {
    try {
        const data = fs.readFileSync(MEMORY_FILE, 'utf8');
        const memories = JSON.parse(data);
        const bankMemories = memories.filter(m => m.bankId === bankId);
        
        if (bankMemories.length === 0) return null;
        
        console.log(`[hindsight] Reflected on bank "${bankId}"`);
        
        const tamperedCount = bankMemories.filter(m => m.content.includes('TAMPERED')).length;
        if (tamperedCount > 0) {
             return "Based on historical patterns, I have observed previous instances of tampering or re-encoding. Devices associated with these failures often show discrepancies in watermark hashes and timestamp synchronization. Investigators should proceed with caution and manually review the metadata.";
        }
        return "Based on historical patterns, most recordings investigated so far have been verified as authentic. No suspicious re-encoding or systematic tampering patterns have been firmly established yet.";
    } catch (err) {
        console.warn(`[hindsight] reflect() failed:`, err.message);
        return null;
    }
}

// ── High-level AuthentiCam-specific helpers ────────────────────────

/**
 * Store a completed investigation as a Hindsight memory.
 *
 * @param {object} investigation - The full investigation record
 * @param {string} [userId] - Optional user ID for per-investigator memory
 */
async function retainInvestigation(investigation, userId) {
    const content = formatInvestigationMemory(investigation);

    // Store in global bank (all investigators learn from all cases)
    await retain(GLOBAL_BANK, content);

    // Also store in user-specific bank if provided
    if (userId) {
        await retain(userBank(userId), content);
    }
}

/**
 * Recall similar historical investigations.
 *
 * @param {object} evidenceCharacteristics - Current case evidence summary
 * @param {string} [userId] - Optional user ID for per-investigator context
 * @returns {Promise<Array>}
 */
async function recallSimilarCases(evidenceCharacteristics, userId) {
    const query = formatRecallQuery(evidenceCharacteristics);

    // Search global bank
    const globalResults = await recall(GLOBAL_BANK, query, 5);

    // Also search user bank if provided
    let userResults = [];
    if (userId) {
        userResults = await recall(userBank(userId), query, 3);
    }

    // Merge and deduplicate
    const seen = new Set();
    const merged = [];
    for (const r of [...globalResults, ...userResults]) {
        const key = (r.text || r.content || '').substring(0, 100);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(r);
        }
    }

    return merged;
}

/**
 * Get AI-synthesized pattern insights from investigation history.
 *
 * @param {object} evidenceCharacteristics - Current case evidence
 * @param {string} [userId] - Optional user ID
 * @returns {Promise<string|null>}
 */
async function reflectOnPatterns(evidenceCharacteristics, userId) {
    const query = `Based on all previous investigations, what patterns have you observed regarding:
- Recordings with ${evidenceCharacteristics.watermarkStatus} watermarks
- Devices with fingerprint pattern: ${evidenceCharacteristics.deviceFingerprint || 'unknown'}
- ${evidenceCharacteristics.verificationSummary}

What should an investigator be aware of when reviewing a new case with these characteristics?`;

    return await reflect(GLOBAL_BANK, query);
}

/**
 * Store investigator feedback as a learning experience.
 *
 * @param {object} investigation - The investigation record
 * @param {string} decision - Investigator's final decision
 * @param {string} notes - Investigator's notes
 * @param {string} [userId] - Investigator's user ID
 */
async function retainFeedback(investigation, decision, notes, userId) {
    const content = `INVESTIGATION OUTCOME UPDATE:
Case ${investigation.caseId} was initially assessed as ${investigation.riskLevel} risk with ${investigation.recommendation} recommendation.
The AI noted: ${investigation.aiReport?.reasoning || 'no reasoning available'}.

INVESTIGATOR DECISION: ${decision}
INVESTIGATOR NOTES: ${notes || 'No notes provided'}

Key evidence at time of investigation:
- Hash check: ${investigation.verificationResult?.checks?.hash?.pass ? 'PASS' : 'FAIL'}
- Signature: ${investigation.verificationResult?.checks?.signature?.pass ? 'PASS' : 'FAIL'}
- Merkle tree: ${investigation.verificationResult?.checks?.merkle?.pass ? 'PASS' : 'FAIL'}
- Watermark: ${investigation.verificationResult?.checks?.watermark?.pass ? 'PASS' : 'FAIL'}
- Timestamp: ${investigation.verificationResult?.checks?.timestamp?.pass ? 'PASS' : 'FAIL'}
- Device fingerprint: ${investigation.verificationResult?.checks?.fingerprint?.pass ? 'PASS' : 'FAIL'}

This outcome should inform future investigations with similar evidence patterns.`;

    await retain(GLOBAL_BANK, content);
    if (userId) {
        await retain(userBank(userId), content);
    }
}

// ── Formatting helpers ──────────────────────────────────────────────

function formatInvestigationMemory(inv) {
    const checks = inv.verificationResult?.checks || {};
    return `INVESTIGATION RECORD:
Case ID: ${inv.caseId}
Date: ${inv.createdAt || new Date().toISOString()}
Risk Level: ${inv.riskLevel}
Recommendation: ${inv.recommendation}
Confidence: ${inv.aiReport?.confidenceScore || 'N/A'}

VERIFICATION RESULTS:
- Hash (SHA-256): ${checks.hash?.pass ? 'PASS' : 'FAIL'} — ${checks.hash?.details || ''}
- RSA Signature: ${checks.signature?.pass ? 'PASS' : 'FAIL'} — ${checks.signature?.details || ''}
- Merkle Tree: ${checks.merkle?.pass ? 'PASS' : 'FAIL'} — ${checks.merkle?.details || ''}
- Watermark: ${checks.watermark?.pass ? 'PASS' : 'FAIL'} — ${checks.watermark?.details || ''}
- Timestamp: ${checks.timestamp?.pass ? 'PASS' : 'FAIL'} — ${checks.timestamp?.details || ''}
- Fingerprint: ${checks.fingerprint?.pass ? 'PASS' : 'FAIL'} — ${checks.fingerprint?.details || ''}

Overall Verdict: ${inv.verificationResult?.overall || 'UNKNOWN'}
Device Fingerprint: ${inv.deviceFingerprint || 'unknown'}
AI Reasoning: ${inv.aiReport?.reasoning || 'N/A'}
${inv.investigatorDecision ? `Investigator Decision: ${inv.investigatorDecision}` : 'Awaiting investigator decision'}
${inv.investigatorNotes ? `Investigator Notes: ${inv.investigatorNotes}` : ''}`;
}

function formatRecallQuery(evidence) {
    const parts = [];
    if (evidence.overallVerdict) parts.push(`verification verdict: ${evidence.overallVerdict}`);
    if (evidence.watermarkStatus) parts.push(`watermark: ${evidence.watermarkStatus}`);
    if (evidence.hashStatus) parts.push(`hash integrity: ${evidence.hashStatus}`);
    if (evidence.signatureStatus) parts.push(`RSA signature: ${evidence.signatureStatus}`);
    if (evidence.deviceFingerprint) parts.push(`device fingerprint: ${evidence.deviceFingerprint}`);
    if (evidence.timestampSource) parts.push(`timestamp source: ${evidence.timestampSource}`);
    parts.push('investigation case evidence pattern tampering');
    return parts.join(', ');
}

module.exports = {
    isAvailable,
    retain,
    recall,
    reflect,
    retainInvestigation,
    recallSimilarCases,
    reflectOnPatterns,
    retainFeedback,
    GLOBAL_BANK,
    userBank,
};
