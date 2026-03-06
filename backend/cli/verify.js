#!/usr/bin/env node
/**
 * AuthentiCam CLI Verifier
 *
 * Offline, standalone verification of a media file against its certificate.
 * No network required (except for public key if not bundled).
 *
 * Usage:
 *   node cli/verify.js <path/to/media> <path/to/certificate.json> [--verbose]
 *
 * Exit codes:
 *   0 — VALID
 *   1 — TAMPERED
 *   2 — UNKNOWN_DEVICE
 *   3 — Error (missing file, bad JSON, etc.)
 *
 * @module cli/verify
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { verifyRecording } = require('../utils/verifier');

// ── ANSI colours ──────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    grey: '\x1b[90m',
    white: '\x1b[97m',
};

function colored(color, text) { return `${color}${text}${C.reset}`; }

function printBanner() {
    console.log('');
    console.log(colored(C.bold + C.cyan, '╔══════════════════════════════════════════════╗'));
    console.log(colored(C.bold + C.cyan, '║       AuthentiCam — CLI Verifier v2.0        ║'));
    console.log(colored(C.bold + C.cyan, '║   Proof-of-Reality Certificate Validator     ║'));
    console.log(colored(C.bold + C.cyan, '╚══════════════════════════════════════════════╝'));
    console.log('');
}

function checkIcon(pass) {
    return pass ? colored(C.green, '✓ PASS') : colored(C.red, '✗ FAIL');
}

function printCheck(label, check, verbose) {
    const icon = checkIcon(check.pass);
    const padded = label.padEnd(20);
    console.log(`  ${icon}  ${colored(C.bold, padded)} ${colored(C.grey, check.details || '')}`);
    if (verbose && check.error) {
        console.log(`         ${colored(C.red, '  Error: ' + check.error)}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose') || args.includes('-v');
    const filteredArgs = args.filter((a) => !a.startsWith('-'));

    if (filteredArgs.length < 2) {
        console.error(colored(C.red, 'Usage: node cli/verify.js <media_file> <certificate.json> [--verbose]'));
        process.exit(3);
    }

    const mediaPath = path.resolve(filteredArgs[0]);
    const certPath = path.resolve(filteredArgs[1]);

    printBanner();

    // ── Validate inputs ──────────────────────────────────────────
    if (!fs.existsSync(mediaPath)) {
        console.error(colored(C.red, `✗ Media file not found: ${mediaPath}`));
        process.exit(3);
    }
    if (!fs.existsSync(certPath)) {
        console.error(colored(C.red, `✗ Certificate file not found: ${certPath}`));
        process.exit(3);
    }

    // ── Load files ────────────────────────────────────────────────
    console.log(colored(C.grey, `  Media:       ${mediaPath}`));
    console.log(colored(C.grey, `  Certificate: ${certPath}`));
    console.log('');

    const fileBuffer = fs.readFileSync(mediaPath);
    let certData;
    try {
        certData = JSON.parse(fs.readFileSync(certPath, 'utf8'));
    } catch (e) {
        console.error(colored(C.red, `✗ Invalid certificate JSON: ${e.message}`));
        process.exit(3);
    }

    const cert = certData.authenticam_certificate || certData;

    // ── Show certificate info ─────────────────────────────────────
    console.log(colored(C.bold, '  📜 Certificate'));
    console.log(colored(C.grey, `     ID:        ${cert.certificateId || '—'}`));
    console.log(colored(C.grey, `     File:      ${cert.fileName || '—'} (${((cert.fileSize || 0) / 1024).toFixed(1)} KB)`));
    console.log(colored(C.grey, `     Issued:    ${cert.issuedAt || cert.timestampProof?.iso || '—'}`));
    console.log(colored(C.grey, `     Source:    ${cert.timestampProof?.source || 'system'}`));
    console.log(colored(C.grey, `     Algorithm: ${cert.algorithmVersions?.hashAlgorithm || 'SHA-256'}`));
    console.log('');

    // ── Run verification ─────────────────────────────────────────
    console.log(colored(C.bold, '  🔍 Running Checks...'));
    console.log('');

    let report;
    try {
        report = await verifyRecording(fileBuffer, certData);
    } catch (err) {
        console.error(colored(C.red, `✗ Verification error: ${err.message}`));
        process.exit(3);
    }

    const { checks, overall, summary } = report;

    printCheck('Hash (SHA-256)', checks.hash, verbose);
    printCheck('RSA Signature', checks.signature, verbose);
    printCheck('Merkle Tree Root', checks.merkle, verbose);
    printCheck('Watermark Marker', checks.watermark, verbose);
    printCheck('Timestamp', checks.timestamp, verbose);

    console.log('');
    console.log(colored(C.grey, '  ─'.repeat(26)));
    console.log('');

    // ── Final verdict ─────────────────────────────────────────────
    if (overall === 'VALID') {
        console.log(colored(C.bold + C.green, '  ✅  VERDICT: VALID'));
        console.log(colored(C.green, `      ${summary}`));
        console.log('');
        process.exit(0);
    } else if (overall === 'UNKNOWN_DEVICE') {
        console.log(colored(C.bold + C.yellow, '  ⚠️   VERDICT: UNKNOWN DEVICE'));
        console.log(colored(C.yellow, `      ${summary}`));
        console.log('');
        process.exit(2);
    } else {
        console.log(colored(C.bold + C.red, '  🚨  VERDICT: TAMPERED'));
        console.log(colored(C.red, `      ${summary}`));
        console.log('');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(colored(C.red, '✗ Fatal error: ' + err.message));
    process.exit(3);
});
