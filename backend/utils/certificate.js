/**
 * certificate.js — Proof-of-Reality Certificate Generator for AuthentiCam
 *
 * Generates a fully-structured authenticity certificate that includes:
 *   - Device ID and fingerprint hash
 *   - File hash (SHA-256)
 *   - Merkle root over 4KB chunks
 *   - Watermark hash
 *   - RSA digital signature
 *   - NTP-backed timestamp proof
 *   - Algorithm version manifest
 *   - QR code data URL
 *
 * This certificate can be independently verified offline using the
 * public key and the verifier module.
 *
 * @module certificate
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { getPublicKey } = require('./crypto');

/** Semantic version of algorithm set used in this certificate */
const ALGORITHM_VERSIONS = {
    hashAlgorithm: 'SHA-256',
    signatureAlgorithm: 'RSA-2048-PKCS1v15-SHA256',
    merkleHashAlgorithm: 'SHA-256',
    merkleChunkSize: '4096 bytes',
    watermarkAlgorithm: 'Spread-Spectrum-HMAC-SHA256-XOR',
    watermarkSize: '32 bytes',
    fingerprintAlgorithm: 'SHA-256 (browser canvas + WebGL + AudioContext)',
    timestampSource: 'NTP-pool.ntp.org',
    certificateVersion: '2.0',
};

/**
 * Generate a Proof-of-Reality certificate.
 *
 * @param {object} opts
 * @param {string} opts.userId        — user ID
 * @param {string} opts.username      — username
 * @param {string} opts.deviceFingerprint — raw client fingerprint
 * @param {string} opts.fingerprintHash   — enriched fingerprint SHA-256
 * @param {string} opts.fileHash      — SHA-256 of the complete file
 * @param {string} opts.fileName      — original file name
 * @param {number} opts.fileSize      — file size in bytes
 * @param {string} opts.mimeType      — MIME type
 * @param {string} opts.merkleRoot    — Merkle root hex
 * @param {number} opts.merkleLeafCount — number of Merkle leaves (chunks)
 * @param {string} opts.watermarkHash — watermark region hash stored in cert
 * @param {string} opts.signature     — RSA signature of fileHash
 * @param {object} opts.timestampProof — from getTrustedTimestamp()
 * @param {string} opts.verificationUrl — URL for QR code
 * @param {object} [opts.geoLocation] — optional { lat, lon, accuracy }
 * @param {string} [opts.recordingId] — linked recording ID
 * @param {number} [opts.duration]    — recording duration (seconds)
 * @returns {Promise<{ certificateId: string, certData: object, qrCodeData: string }>}
 */
async function generateCertificate(opts) {
    const {
        userId,
        username,
        deviceFingerprint,
        fingerprintHash,
        fileHash,
        fileName,
        fileSize,
        mimeType,
        merkleRoot,
        merkleLeafCount,
        watermarkHash,
        signature,
        timestampProof,
        verificationUrl,
        geoLocation,
        recordingId,
        duration,
    } = opts;

    const certificateId = uuidv4();
    const publicKey = getPublicKey();

    const certData = {
        // ── Identity ──────────────────────────────────────────────
        certificateId,
        version: ALGORITHM_VERSIONS.certificateVersion,
        issuedAt: timestampProof?.iso || new Date().toISOString(),
        issuedBy: username || 'unknown',
        userId,

        // ── Media Identification ──────────────────────────────────
        fileName,
        fileSize,
        mimeType,
        duration: duration || 0,
        recordingId: recordingId || null,

        // ── Cryptographic Proofs ──────────────────────────────────
        fileHash,
        merkleRoot,
        merkleLeafCount: merkleLeafCount || 0,
        watermarkHash,
        digitalSignature: signature,
        publicKey,

        // ── Device Identity ───────────────────────────────────────
        deviceFingerprint,
        fingerprintHash,

        // ── Trusted Timestamp ─────────────────────────────────────
        timestampProof: timestampProof || { iso: new Date().toISOString(), source: 'system', reliable: false },

        // ── Location (optional) ───────────────────────────────────
        geoLocation: geoLocation || null,

        // ── Verification ──────────────────────────────────────────
        verificationUrl,
        algorithmVersions: ALGORITHM_VERSIONS,
    };

    // Generate QR code pointing to verification URL
    const qrCodeData = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: 'H',
        width: 256,
    });

    return { certificateId, certData, qrCodeData };
}

/**
 * Format a certificate for JSON download.
 * Wraps the raw cert in the standard AuthentiCam envelope.
 *
 * @param {object} certData — from generateCertificate()
 * @param {object} [userInfo] — { username, email }
 * @returns {object}
 */
function formatCertificateForDownload(certData, userInfo) {
    return {
        authenticam_certificate: {
            ...certData,
            issuedBy: userInfo?.username || certData.issuedBy,
            issuerEmail: userInfo?.email || null,
        },
    };
}

module.exports = { generateCertificate, formatCertificateForDownload, ALGORITHM_VERSIONS };
