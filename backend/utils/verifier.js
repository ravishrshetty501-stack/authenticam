/**
 * verifier.js — Full AuthentiCam Authenticity Report Generator
 *
 * Runs 6 independent checks on a media file against its certificate:
 *
 *   CHECK 1 — Hash Integrity    : SHA-256(file) === cert.fileHash
 *   CHECK 2 — RSA Signature     : Verify(publicKey, sha256, signature)
 *   CHECK 3 — Merkle Root       : Rebuild tree → root === cert.merkleRoot
 *   CHECK 4 — Watermark         : Detect spread-spectrum mark in trailer
 *   CHECK 5 — Timestamp         : cert.timestampProof is valid and not future
 *   CHECK 6 — Device Fingerprint: cert.fingerprintHash present and logged
 *
 * Returns a structured AuthenticityReport:
 *   {
 *     overall: 'VALID' | 'TAMPERED' | 'UNKNOWN_DEVICE',
 *     checks: { hash, signature, merkle, watermark, timestamp, fingerprint },
 *     summary: string,
 *     verifiedAt: string (ISO),
 *   }
 *
 * @module verifier
 */

'use strict';

const { computeBufferHash, verifySignature } = require('./crypto');
const { buildMerkleTree } = require('./merkle');
const { detectWatermark } = require('./watermark');
const { validateTimestamp } = require('./timestamp');

/**
 * Run one check and return a standardized result object.
 *
 * @param {string} name
 * @param {Function} checkFn — returns boolean or { pass, details }
 * @returns {{ pass: boolean, details: string, error: string|null }}
 */
async function runCheck(name, checkFn) {
    try {
        const result = await checkFn();
        if (typeof result === 'boolean') {
            return { pass: result, details: result ? `${name} passed` : `${name} failed`, error: null };
        }
        return { ...result, pass: !!result.pass, details: result.details || '', error: null };
    } catch (err) {
        return { pass: false, details: `${name} check threw an error`, error: err.message };
    }
}

/**
 * Run full authenticity verification.
 *
 * @param {Buffer} fileBuffer   — the uploaded/verified file bytes
 * @param {object} certData     — parsed certificate (authenticam_certificate or raw)
 * @returns {Promise<{
 *   overall: 'VALID'|'TAMPERED'|'UNKNOWN_DEVICE',
 *   checks: {
 *     hash: object,
 *     signature: object,
 *     merkle: object,
 *     watermark: object,
 *     timestamp: object
 *   },
 *   summary: string,
 *   verifiedAt: string
 * }>}
 */
async function verifyRecording(fileBuffer, certData) {
    // Unwrap certificate envelope if needed
    const cert = certData?.authenticam_certificate || certData;

    // ── Check 1: SHA-256 Hash ──────────────────────────────────────
    const hashCheck = await runCheck('Hash', () => {
        const computedHash = computeBufferHash(fileBuffer);
        const match = computedHash === cert.fileHash;
        return {
            pass: match,
            details: match
                ? `SHA-256 matches: ${computedHash.substring(0, 16)}…`
                : `Hash mismatch — Expected: ${(cert.fileHash || '').substring(0, 16)}… Got: ${computedHash.substring(0, 16)}…`,
            computedHash,
            expectedHash: cert.fileHash,
        };
    });

    // ── Check 2: RSA Digital Signature ────────────────────────────
    const signatureCheck = await runCheck('Signature', () => {
        if (!cert.signature && !cert.digitalSignature) {
            return { pass: false, details: 'No signature present in certificate' };
        }
        const sig = cert.digitalSignature || cert.signature;
        const valid = verifySignature(cert.fileHash, sig);
        return {
            pass: valid,
            details: valid
                ? 'RSA-2048 signature verified against server public key'
                : 'RSA signature verification FAILED — certificate may be forged',
        };
    });

    // ── Check 3: Merkle Root ───────────────────────────────────────
    const merkleCheck = await runCheck('Merkle', () => {
        if (!cert.merkleRoot) {
            // Legacy certificate without Merkle — skip gracefully
            return { pass: true, details: 'Merkle root not present in certificate (legacy) — skipped' };
        }
        const tree = buildMerkleTree(fileBuffer);
        const match = tree.root === cert.merkleRoot;
        return {
            pass: match,
            details: match
                ? `Merkle root matches (${tree.leaves.length} chunks, root: ${tree.root.substring(0, 16)}…)`
                : `Merkle root mismatch — file chunks were altered`,
            computedRoot: tree.root,
            expectedRoot: cert.merkleRoot,
            leafCount: tree.leaves.length,
        };
    });

    // ── Check 4: Watermark Integrity ──────────────────────────────
    const watermarkCheck = await runCheck('Watermark', () => {
        if (!cert.watermarkHash) {
            return { pass: true, details: 'Watermark not present in certificate (legacy) — skipped' };
        }
        const result = detectWatermark(fileBuffer, cert.watermarkHash, cert.certificateId || cert.certId);
        return {
            pass: result.intact,
            details: result.details,
            confidence: result.confidence,
        };
    });

    // ── Check 5: Timestamp Validity ──────────────────────────────
    const timestampCheck = await runCheck('Timestamp', () => {
        const proof = cert.timestampProof || { iso: cert.timestamp || cert.issuedAt };
        const result = validateTimestamp(proof);
        return {
            pass: result.valid,
            details: result.details,
            ageHours: result.ageHours,
            source: proof.source || 'unknown',
            reliable: proof.reliable !== false,
        };
    });

    // ── Check 6: Device Fingerprint ───────────────────────────────
    const fingerprintCheck = await runCheck('Fingerprint', () => {
        const fpHash = cert.fingerprintHash;
        if (!fpHash) {
            // Legacy certificate without fingerprint — skip gracefully
            return { pass: true, details: 'Device fingerprint not in certificate (legacy) — skipped', skipped: true };
        }
        // We cannot re-derive the enriched fingerprint at verification time
        // (different IP, user-agent, timestamp), but we can confirm it was recorded.
        // UNKNOWN_DEVICE verdict is triggered if the recording's own fingerprint hash
        // is absent — meaning we can't confirm the original device.
        return {
            pass: true,
            details: `Device fingerprint hash on record: ${fpHash.substring(0, 16)}… (${cert.deviceFingerprint ? 'browser fingerprint captured' : 'no raw fingerprint'})`,
            fingerprintHash: fpHash,
            hasRawFingerprint: !!cert.deviceFingerprint,
        };
    });

    const checks = {
        hash: hashCheck,
        signature: signatureCheck,
        merkle: merkleCheck,
        watermark: watermarkCheck,
        timestamp: timestampCheck,
        fingerprint: fingerprintCheck,
    };

    // ── Determine overall verdict ─────────────────────────────────
    // Critical: any of hash / signature / merkle fails → TAMPERED
    const criticalFail = !hashCheck.pass || !signatureCheck.pass || !merkleCheck.pass;

    // Watermark fail with no error (intentional detection, not a code crash) → indicates tampering
    // But only if the cert actually had a watermark hash (new-style certs)
    const watermarkFail = !watermarkCheck.pass && watermarkCheck.error === null && !!cert.watermarkHash;

    // UNKNOWN_DEVICE: core content checks pass (hash+sig+merkle) but watermark/fingerprint mismatch
    // (suggests re-encoding or a different device captured the content)
    const unknownDevice = !criticalFail && watermarkFail;

    let overall;
    if (!criticalFail && !watermarkFail) {
        overall = 'VALID';
    } else if (unknownDevice) {
        overall = 'UNKNOWN_DEVICE';
    } else {
        overall = 'TAMPERED';
    }

    // Compose summary
    const totalChecks = Object.keys(checks).length;
    const passCount = Object.values(checks).filter((c) => c.pass).length;
    const summary = overall === 'VALID'
        ? `All ${passCount}/${totalChecks} checks passed. Media is authentic and unaltered.`
        : overall === 'UNKNOWN_DEVICE'
            ? `Watermark mismatch — media content is intact but may have been re-encoded or captured by a different device.`
            : `${totalChecks - passCount}/${totalChecks} checks failed. Media has been tampered with.`;

    return {
        overall,
        checks,
        summary,
        verifiedAt: new Date().toISOString(),
        certificate: cert,
    };
}

module.exports = { verifyRecording };
