/**
 * Unit tests for watermark.js
 * Run with: npx jest tests/watermark.test.js
 */

'use strict';

const { embedWatermark, detectWatermark, MARK_SIZE } = require('../utils/watermark');
const crypto = require('crypto');

describe('Fragile Watermark', () => {
    const makeHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    test('embedWatermark returns buffer of same length', () => {
        const buf = crypto.randomBytes(1000);
        const fileHash = makeHash(buf);
        const { watermarkedBuffer, watermarkHash } = embedWatermark(buf, fileHash);
        expect(watermarkedBuffer.length).toBe(buf.length);
        expect(watermarkHash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('detectWatermark passes on original watermarked file', () => {
        const buf = crypto.randomBytes(5000);
        const fileHash = makeHash(buf);
        const { watermarkedBuffer, watermarkHash } = embedWatermark(buf, fileHash);
        const result = detectWatermark(watermarkedBuffer, watermarkHash, fileHash);
        expect(result.intact).toBe(true);
        expect(result.confidence).toBe('HIGH');
    });

    test('detectWatermark fails when file is modified after watermarking', () => {
        const buf = crypto.randomBytes(5000);
        const fileHash = makeHash(buf);
        const { watermarkedBuffer, watermarkHash } = embedWatermark(buf, fileHash);

        // Tamper with a byte in the watermark region
        const tampered = Buffer.from(watermarkedBuffer);
        tampered[tampered.length - 10] ^= 0xFF;

        const result = detectWatermark(tampered, watermarkHash, fileHash);
        expect(result.intact).toBe(false);
    });

    test('detectWatermark fails when file is re-encoded (different bytes)', () => {
        const buf = crypto.randomBytes(5000);
        const fileHash = makeHash(buf);
        const { watermarkHash } = embedWatermark(buf, fileHash);

        // Simulate re-encoding: completely new buffer
        const reEncoded = crypto.randomBytes(5000);
        const result = detectWatermark(reEncoded, watermarkHash, fileHash);
        expect(result.intact).toBe(false);
    });

    test('small file returns sentinel hash', () => {
        const buf = crypto.randomBytes(10); // smaller than MARK_SIZE
        const fileHash = makeHash(buf);
        const { watermarkedBuffer, watermarkHash, markerOffset } = embedWatermark(buf, fileHash);
        expect(markerOffset).toBe(-1);
        expect(watermarkHash).toMatch(/^[0-9a-f]{64}$/);
        // Detect should pass
        const result = detectWatermark(watermarkedBuffer, watermarkHash, fileHash);
        expect(result.intact).toBe(true);
    });

    test('returns NONE confidence when no watermarkHash provided', () => {
        const buf = crypto.randomBytes(1000);
        const fileHash = makeHash(buf);
        const result = detectWatermark(buf, null, fileHash);
        expect(result.intact).toBe(false);
        expect(result.confidence).toBe('NONE');
    });

    test('different files produce different watermark hashes', () => {
        const buf1 = crypto.randomBytes(5000);
        const buf2 = crypto.randomBytes(5000);
        const hash1 = makeHash(buf1);
        const hash2 = makeHash(buf2);
        const { watermarkHash: wm1 } = embedWatermark(buf1, hash1);
        const { watermarkHash: wm2 } = embedWatermark(buf2, hash2);
        expect(wm1).not.toBe(wm2);
    });

    test('throws on non-buffer input', () => {
        expect(() => embedWatermark('not a buffer', 'hash')).toThrow(TypeError);
        expect(() => detectWatermark('not a buffer', 'hash', 'hash')).toThrow(TypeError);
    });
});
