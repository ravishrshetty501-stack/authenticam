/**
 * investigationAgent.js — AI Evidence Investigation Agent for AuthentiCam
 *
 * Takes verification results from the existing 6-check engine plus
 * historical context from Hindsight, and produces an Investigation Report
 * with risk assessment, reasoning, and recommendations.
 *
 * Uses the Vercel AI SDK with OpenAI (configurable via AI_MODEL env var).
 *
 * @module investigationAgent
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ── LLM Integration ─────────────────────────────────────────────────
// We dynamically import the AI SDK (ESM modules) to stay compatible
// with the CommonJS backend. If unavailable, fall back to rule-based.

let generateTextFn = null;
let openaiProvider = null;

async function initAI() {
    if (generateTextFn) return true;
    try {
        const aiModule = await import('ai');
        generateTextFn = aiModule.generateText;
        const openaiModule = await import('@ai-sdk/openai');
        openaiProvider = openaiModule.openai;
        console.log('[investigationAgent] AI SDK loaded successfully');
        return true;
    } catch (err) {
        console.warn('[investigationAgent] AI SDK not available, using rule-based fallback:', err.message);
        return false;
    }
}

// ── Case ID Generator ───────────────────────────────────────────────
let caseCounter = 0;

function generateCaseId() {
    caseCounter++;
    const year = new Date().getFullYear();
    return `INV-${year}-${String(caseCounter).padStart(4, '0')}`;
}

// ── Core Investigation Agent ────────────────────────────────────────

/**
 * Run the AI Investigation Agent.
 *
 * @param {object} params
 * @param {object} params.verificationResult - Output from verifyRecording()
 * @param {object} params.certificate - Certificate data
 * @param {Array}  params.similarCases - Recalled from Hindsight
 * @param {string|null} params.patternInsights - Reflected from Hindsight
 * @returns {Promise<object>} Investigation report
 */
async function investigate({ verificationResult, certificate, similarCases = [], patternInsights = null }) {
    const caseId = generateCaseId();
    const cert = certificate?.authenticam_certificate || certificate;
    const checks = verificationResult?.checks || {};

    // Extract evidence characteristics
    const evidence = extractEvidence(checks, cert);

    // Try AI-powered analysis first, fall back to rule-based
    const aiAvailable = await initAI();
    let aiAnalysis;

    if (aiAvailable && process.env.OPENAI_API_KEY) {
        aiAnalysis = await runAIAnalysis(evidence, similarCases, patternInsights, verificationResult);
    } else {
        aiAnalysis = runRuleBasedAnalysis(evidence, similarCases, patternInsights);
    }

    // Build the full investigation report
    const report = {
        caseId,
        riskLevel: aiAnalysis.riskLevel,
        confidenceScore: aiAnalysis.confidenceScore,
        recommendation: aiAnalysis.recommendation,
        reasoning: aiAnalysis.reasoning,
        similarCases: formatSimilarCases(similarCases),
        evidenceSummary: evidence,
        deviceHistory: {
            fingerprint: cert?.deviceFingerprint || 'unknown',
            fingerprintHash: cert?.fingerprintHash || null,
        },
        patternAnalysis: patternInsights || 'No historical patterns available yet. This is among the first investigations.',
        verificationOverall: verificationResult?.overall || 'UNKNOWN',
        generatedAt: new Date().toISOString(),
    };

    return report;
}

/**
 * Extract structured evidence from verification checks.
 */
function extractEvidence(checks, cert) {
    return {
        hashIntegrity: {
            status: checks.hash?.pass ? 'PASS' : 'FAIL',
            detail: checks.hash?.details || 'Not checked',
        },
        signatureValid: {
            status: checks.signature?.pass ? 'PASS' : 'FAIL',
            detail: checks.signature?.details || 'Not checked',
        },
        merkleIntegrity: {
            status: checks.merkle?.pass ? 'PASS' : 'FAIL',
            detail: checks.merkle?.details || 'Not checked',
        },
        watermarkIntact: {
            status: checks.watermark?.pass ? 'PASS' : 'FAIL',
            detail: checks.watermark?.details || 'Not checked',
        },
        timestampValid: {
            status: checks.timestamp?.pass ? 'PASS' : 'FAIL',
            detail: checks.timestamp?.details || 'Not checked',
            source: checks.timestamp?.source || cert?.timestampProof?.source || 'unknown',
        },
        deviceKnown: {
            status: checks.fingerprint?.pass ? 'PASS' : 'FAIL',
            detail: checks.fingerprint?.details || 'Not checked',
        },
        // Derived fields for recall queries
        overallVerdict: null, // filled by caller
        watermarkStatus: checks.watermark?.pass ? 'INTACT' : 'CORRUPTED',
        hashStatus: checks.hash?.pass ? 'MATCH' : 'MISMATCH',
        signatureStatus: checks.signature?.pass ? 'VALID' : 'INVALID',
        deviceFingerprint: cert?.deviceFingerprint || 'unknown',
        timestampSource: cert?.timestampProof?.source || 'system',
    };
}

/**
 * AI-powered analysis using OpenAI via Vercel AI SDK.
 */
async function runAIAnalysis(evidence, similarCases, patternInsights, verificationResult) {
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    const systemPrompt = `You are an expert digital forensics investigator working with the AuthentiCam Evidence Intelligence system. You analyze cryptographic verification results and historical investigation data to assess media authenticity.

Your role:
1. Analyze the 6 cryptographic check results provided
2. Consider historical similar cases from the investigation memory
3. Factor in any pattern insights from past investigations
4. Produce a clear risk assessment and recommendation

You must respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "confidenceScore": 0.0 to 1.0,
  "recommendation": "AUTHENTIC|MANUAL_REVIEW|LIKELY_TAMPERED|CONFIRMED_TAMPERED",
  "reasoning": "2-4 sentence explanation referencing specific evidence and any historical patterns"
}

Risk level guidelines:
- LOW: All checks pass, no suspicious patterns
- MEDIUM: Minor anomalies (e.g., system clock instead of NTP, partial device match)
- HIGH: One or more critical checks fail (hash, signature, or merkle)
- CRITICAL: Multiple critical checks fail, evidence of deliberate tampering

Recommendation guidelines:
- AUTHENTIC: All checks pass, high confidence
- MANUAL_REVIEW: Some checks fail but could be innocent (re-encoding, device change)
- LIKELY_TAMPERED: Critical checks fail with suspicious pattern
- CONFIRMED_TAMPERED: Hash AND signature fail, clear evidence of modification`;

    const userPrompt = `CURRENT CASE EVIDENCE:

Verification Results:
- Hash (SHA-256): ${evidence.hashIntegrity.status} — ${evidence.hashIntegrity.detail}
- RSA Signature: ${evidence.signatureValid.status} — ${evidence.signatureValid.detail}
- Merkle Tree: ${evidence.merkleIntegrity.status} — ${evidence.merkleIntegrity.detail}
- Watermark: ${evidence.watermarkIntact.status} — ${evidence.watermarkIntact.detail}
- Timestamp: ${evidence.timestampValid.status} — ${evidence.timestampValid.detail} (source: ${evidence.timestampSource})
- Device Fingerprint: ${evidence.deviceKnown.status} — ${evidence.deviceKnown.detail}

Overall Verification Verdict: ${verificationResult?.overall || 'UNKNOWN'}

${similarCases.length > 0 ? `HISTORICAL SIMILAR CASES (from investigation memory):
${similarCases.map((c, i) => `Case ${i + 1}: ${c.text || c.content || JSON.stringify(c)}`).join('\n\n')}` : 'No historical cases available yet — this is among the first investigations.'}

${patternInsights ? `PATTERN INSIGHTS (synthesized from investigation history):
${patternInsights}` : 'No pattern insights available yet.'}

Analyze this evidence and provide your assessment.`;

    try {
        const result = await generateTextFn({
            model: openaiProvider(model),
            system: systemPrompt,
            prompt: userPrompt,
            maxTokens: 500,
            temperature: 0.3,
        });

        const text = result.text.trim();
        // Try to parse JSON response
        try {
            const parsed = JSON.parse(text);
            return {
                riskLevel: parsed.riskLevel || 'MEDIUM',
                confidenceScore: Math.max(0, Math.min(1, parsed.confidenceScore || 0.5)),
                recommendation: parsed.recommendation || 'MANUAL_REVIEW',
                reasoning: parsed.reasoning || 'AI analysis completed but reasoning was unclear.',
            };
        } catch {
            // If JSON parse fails, extract what we can
            return {
                riskLevel: 'MEDIUM',
                confidenceScore: 0.5,
                recommendation: 'MANUAL_REVIEW',
                reasoning: text.substring(0, 500),
            };
        }
    } catch (err) {
        console.error('[investigationAgent] AI analysis failed:', err.message);
        return runRuleBasedAnalysis(evidence, similarCases, patternInsights);
    }
}

/**
 * Rule-based fallback analysis (no LLM required).
 */
function runRuleBasedAnalysis(evidence, similarCases, patternInsights) {
    const checks = {
        hash: evidence.hashIntegrity.status === 'PASS',
        signature: evidence.signatureValid.status === 'PASS',
        merkle: evidence.merkleIntegrity.status === 'PASS',
        watermark: evidence.watermarkIntact.status === 'PASS',
        timestamp: evidence.timestampValid.status === 'PASS',
        fingerprint: evidence.deviceKnown.status === 'PASS',
    };

    const criticalPass = checks.hash && checks.signature && checks.merkle;
    const allPass = Object.values(checks).every(Boolean);
    const failCount = Object.values(checks).filter(v => !v).length;

    let riskLevel, recommendation, confidenceScore, reasoning;

    if (allPass) {
        riskLevel = 'LOW';
        recommendation = 'AUTHENTIC';
        confidenceScore = 0.95;
        reasoning = 'All 6 cryptographic checks passed. The recording shows no signs of modification. Hash integrity, RSA signature, Merkle tree, watermark, timestamp, and device fingerprint are all verified.';
    } else if (criticalPass && !checks.watermark) {
        riskLevel = 'MEDIUM';
        recommendation = 'MANUAL_REVIEW';
        confidenceScore = 0.65;
        reasoning = 'Core integrity checks (hash, signature, Merkle) all passed, but the watermark check failed. This commonly occurs when a recording has been re-encoded or format-converted. The content may be authentic but the container was modified.';
    } else if (criticalPass) {
        riskLevel = 'MEDIUM';
        recommendation = 'MANUAL_REVIEW';
        confidenceScore = 0.7;
        reasoning = `Core integrity checks passed but ${failCount} auxiliary check(s) failed. ${!checks.timestamp ? 'Timestamp could not be verified. ' : ''}${!checks.fingerprint ? 'Device fingerprint does not match. ' : ''}Manual review recommended.`;
    } else if (!checks.hash && !checks.signature) {
        riskLevel = 'CRITICAL';
        recommendation = 'CONFIRMED_TAMPERED';
        confidenceScore = 0.95;
        reasoning = 'Both SHA-256 hash and RSA digital signature verification failed. This is strong evidence that the file has been modified after certification. The recording cannot be considered authentic.';
    } else {
        riskLevel = 'HIGH';
        recommendation = 'LIKELY_TAMPERED';
        confidenceScore = 0.8;
        reasoning = `${failCount} out of 6 checks failed, including critical integrity checks. ${!checks.hash ? 'Hash mismatch detected — file bytes were altered. ' : ''}${!checks.signature ? 'Signature verification failed. ' : ''}${!checks.merkle ? 'Merkle tree root mismatch — chunk-level modification detected. ' : ''}`;
    }

    // Enhance with historical context if available
    if (similarCases.length > 0) {
        reasoning += ` Hindsight memory found ${similarCases.length} similar historical case(s) that may provide additional context.`;
    }

    if (patternInsights) {
        reasoning += ` Pattern analysis from previous investigations: ${patternInsights.substring(0, 200)}`;
    }

    return { riskLevel, recommendation, confidenceScore, reasoning };
}

/**
 * Format similar cases for the report.
 */
function formatSimilarCases(cases) {
    return cases.slice(0, 5).map((c, i) => {
        const text = c.text || c.content || '';
        // Try to extract case ID and outcome from the memory text
        const caseIdMatch = text.match(/Case ID: (INV-\d{4}-\d{4})/);
        const outcomeMatch = text.match(/Investigator Decision: (\w+)/);
        const riskMatch = text.match(/Risk Level: (\w+)/);

        return {
            caseId: caseIdMatch?.[1] || `HIST-${i + 1}`,
            similarity: c.score || c.relevance || 0.75,
            outcome: outcomeMatch?.[1] || 'PENDING',
            riskLevel: riskMatch?.[1] || 'UNKNOWN',
            summary: text.substring(0, 200) + (text.length > 200 ? '…' : ''),
        };
    });
}

module.exports = {
    investigate,
    generateCaseId,
    extractEvidence,
};
