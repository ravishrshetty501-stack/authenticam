/**
 * merkle.js — Merkle Tree builder and proof verifier for AuthentiCam
 *
 * Splits a file buffer into CHUNK_SIZE blocks, SHA-256 hashes each block,
 * then constructs a binary Merkle tree. The Merkle root is stored in the
 * certificate; any single-byte modification changes the root.
 *
 * Security: SHA-256 is collision-resistant. The tree is zero-padded at
 * odd layers (last node is duplicated) to preserve a balanced structure.
 */

'use strict';

const crypto = require('crypto');

const CHUNK_SIZE = 4096; // 4 KB chunks

/**
 * Compute SHA-256 of a Buffer, returns hex string.
 * @param {Buffer} buf
 * @returns {string}
 */
function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Build a Merkle tree from a Buffer.
 *
 * @param {Buffer} fileBuffer — full file contents
 * @returns {{ root: string, layers: string[][], leaves: string[] }}
 */
function buildMerkleTree(fileBuffer) {
    if (!Buffer.isBuffer(fileBuffer)) {
        throw new TypeError('fileBuffer must be a Buffer');
    }

    if (fileBuffer.length === 0) {
        const emptyHash = sha256(Buffer.alloc(0));
        return { root: emptyHash, layers: [[emptyHash]], leaves: [emptyHash] };
    }

    // Step 1: slice into chunks and hash each
    const leaves = [];
    for (let offset = 0; offset < fileBuffer.length; offset += CHUNK_SIZE) {
        const chunk = fileBuffer.slice(offset, offset + CHUNK_SIZE);
        leaves.push(sha256(chunk));
    }

    // Step 2: build layers up to root
    const layers = [leaves];
    let current = leaves;

    while (current.length > 1) {
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i]; // duplicate last if odd
            next.push(sha256(Buffer.from(left + right, 'utf8')));
        }
        layers.push(next);
        current = next;
    }

    return {
        root: current[0],
        layers,
        leaves,
    };
}

/**
 * Generate a Merkle proof for a specific leaf index.
 *
 * The proof is an ordered array of { hash, position } objects where
 * position is 'left' or 'right', representing the sibling at each layer.
 *
 * @param {{ layers: string[][] }} tree
 * @param {number} leafIndex
 * @returns {Array<{ hash: string, position: 'left'|'right' }>}
 */
function getMerkleProof(tree, leafIndex) {
    const { layers } = tree;
    const proof = [];
    let idx = leafIndex;

    for (let layerIdx = 0; layerIdx < layers.length - 1; layerIdx++) {
        const layer = layers[layerIdx];
        const isRightNode = idx % 2 === 1;
        const siblingIdx = isRightNode ? idx - 1 : idx + 1;

        if (siblingIdx < layer.length) {
            proof.push({
                hash: layer[siblingIdx],
                position: isRightNode ? 'left' : 'right',
            });
        } else {
            // Duplicate last node as sibling when odd
            proof.push({
                hash: layer[idx],
                position: 'right',
            });
        }

        idx = Math.floor(idx / 2);
    }

    return proof;
}

/**
 * Verify a Merkle proof for a given leaf hash against a known root.
 *
 * @param {string} leafHash — hex hash of the leaf being proved
 * @param {Array<{ hash: string, position: 'left'|'right' }>} proof
 * @param {string} expectedRoot — hex Merkle root from the certificate
 * @returns {boolean}
 */
function verifyMerkleProof(leafHash, proof, expectedRoot) {
    let computedHash = leafHash;

    for (const { hash: siblingHash, position } of proof) {
        const combined = position === 'left'
            ? siblingHash + computedHash
            : computedHash + siblingHash;
        computedHash = sha256(Buffer.from(combined, 'utf8'));
    }

    return computedHash === expectedRoot;
}

/**
 * Re-compute the Merkle root from a buffer and compare against expected root.
 * This is the primary tamper-detection check.
 *
 * @param {Buffer} fileBuffer
 * @param {string} expectedRoot
 * @returns {{ match: boolean, computedRoot: string, expectedRoot: string, leafCount: number }}
 */
function verifyMerkleRoot(fileBuffer, expectedRoot) {
    const tree = buildMerkleTree(fileBuffer);
    return {
        match: tree.root === expectedRoot,
        computedRoot: tree.root,
        expectedRoot,
        leafCount: tree.leaves.length,
    };
}

module.exports = {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof,
    verifyMerkleRoot,
    CHUNK_SIZE,
};
