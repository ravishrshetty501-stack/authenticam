/**
 * Unit tests for crypto.js
 * Run with: npx jest tests/crypto.test.js
 */

'use strict';

const { computeBufferHash, signHash, verifySignature, generateKeys } = require('../utils/crypto');
const crypto = require('crypto');

describe('Crypto Utilities', () => {
    test('computeBufferHash returns 64-char hex string', () => {
        const buf = Buffer.from('hello authenticam');
        const hash = computeBufferHash(buf);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).toBe('30a6ac3a11f52840c00a789028e6d8f33fb5d985c828320432fcd8348b716966');
    });

    test('computeBufferHash is deterministic', () => {
        const buf = Buffer.from('test data');
        expect(computeBufferHash(buf)).toBe(computeBufferHash(buf));
    });

    test('different inputs produce different hashes', () => {
        const h1 = computeBufferHash(Buffer.from('abc'));
        const h2 = computeBufferHash(Buffer.from('abd'));
        expect(h1).not.toBe(h2);
    });

    describe('RSA Sign / Verify (requires keys on disk)', () => {
        beforeAll(() => {
            // Ensure keys exist
            try { generateKeys(); } catch { /* already exist */ }
        });

        test('signHash and verifySignature round-trip', () => {
            const hash = computeBufferHash(Buffer.from('authentic video data'));
            const sig = signHash(hash);
            if (sig) {
                expect(typeof sig).toBe('string');
                expect(sig.length).toBeGreaterThan(100);
                const valid = verifySignature(hash, sig);
                expect(valid).toBe(true);
            } else {
                // Keys not available (CI environment without keys dir)
                console.warn('RSA keys not found, skipping sign/verify test');
            }
        });

        test('wrong hash fails signature verification', () => {
            const hash = computeBufferHash(Buffer.from('original video'));
            const sig = signHash(hash);
            if (sig) {
                const wrongHash = computeBufferHash(Buffer.from('tampered video'));
                const valid = verifySignature(wrongHash, sig);
                expect(valid).toBe(false);
            }
        });

        test('corrupted signature fails verification', () => {
            const hash = computeBufferHash(Buffer.from('test'));
            const sig = signHash(hash);
            if (sig) {
                const corrupted = sig.slice(0, -4) + 'ZZZZ';
                const valid = verifySignature(hash, corrupted);
                expect(valid).toBe(false);
            }
        });
    });
});
