/**
 * Unit tests for merkle.js
 * Run with: npx jest tests/merkle.test.js
 */

'use strict';

const { buildMerkleTree, getMerkleProof, verifyMerkleProof, verifyMerkleRoot, CHUNK_SIZE } = require('../utils/merkle');
const crypto = require('crypto');

describe('Merkle Tree', () => {
    const makeBuffer = (size) => crypto.randomBytes(size);

    test('empty buffer returns a valid root', () => {
        const tree = buildMerkleTree(Buffer.alloc(0));
        expect(tree.root).toMatch(/^[0-9a-f]{64}$/);
        expect(tree.leaves).toHaveLength(1);
    });

    test('single chunk produces correct leaf = root', () => {
        const buf = makeBuffer(100);
        const tree = buildMerkleTree(buf);
        expect(tree.leaves).toHaveLength(1);
        expect(tree.root).toBe(tree.leaves[0]);
    });

    test('multiple chunks produce tree with correct leaf count', () => {
        const buf = makeBuffer(CHUNK_SIZE * 4 + 100); // 4.x chunks
        const tree = buildMerkleTree(buf);
        expect(tree.leaves).toHaveLength(5);
    });

    test('same input produces same root (deterministic)', () => {
        const buf = makeBuffer(20000);
        const t1 = buildMerkleTree(buf);
        const t2 = buildMerkleTree(buf);
        expect(t1.root).toBe(t2.root);
    });

    test('single bit change produces different root', () => {
        const buf = makeBuffer(10000);
        const bufModified = Buffer.from(buf);
        bufModified[5000] ^= 0x01;

        const t1 = buildMerkleTree(buf);
        const t2 = buildMerkleTree(bufModified);
        expect(t1.root).not.toBe(t2.root);
    });

    test('getMerkleProof and verifyMerkleProof for first leaf', () => {
        const buf = makeBuffer(CHUNK_SIZE * 8);
        const tree = buildMerkleTree(buf);
        const proof = getMerkleProof(tree, 0);
        const leafHash = tree.leaves[0];
        const valid = verifyMerkleProof(leafHash, proof, tree.root);
        expect(valid).toBe(true);
    });

    test('getMerkleProof and verifyMerkleProof for last leaf', () => {
        const buf = makeBuffer(CHUNK_SIZE * 7 + 500);
        const tree = buildMerkleTree(buf);
        const lastIdx = tree.leaves.length - 1;
        const proof = getMerkleProof(tree, lastIdx);
        const leafHash = tree.leaves[lastIdx];
        const valid = verifyMerkleProof(leafHash, proof, tree.root);
        expect(valid).toBe(true);
    });

    test('tampered leaf fails proof verification', () => {
        const buf = makeBuffer(CHUNK_SIZE * 4);
        const tree = buildMerkleTree(buf);
        const proof = getMerkleProof(tree, 0);
        const fakeLeafHash = crypto.createHash('sha256').update('tampered').digest('hex');
        const valid = verifyMerkleProof(fakeLeafHash, proof, tree.root);
        expect(valid).toBe(false);
    });

    test('verifyMerkleRoot returns match for original file', () => {
        const buf = makeBuffer(15000);
        const tree = buildMerkleTree(buf);
        const result = verifyMerkleRoot(buf, tree.root);
        expect(result.match).toBe(true);
        expect(result.computedRoot).toBe(result.expectedRoot);
    });

    test('verifyMerkleRoot detects tampered file', () => {
        const buf = makeBuffer(15000);
        const tree = buildMerkleTree(buf);
        const tampered = Buffer.from(buf);
        tampered[7500] ^= 0xFF;
        const result = verifyMerkleRoot(tampered, tree.root);
        expect(result.match).toBe(false);
    });

    test('throws on non-buffer input', () => {
        expect(() => buildMerkleTree('not a buffer')).toThrow(TypeError);
    });
});
