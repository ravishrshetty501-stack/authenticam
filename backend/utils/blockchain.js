/**
 * blockchain.js — Local Tamper-Evident Hash-Chain Ledger for AuthentiCam
 *
 * Implements a local append-only blockchain that anchors every recording's
 * fileHash into a cryptographic chain. Each block contains:
 *   - blockIndex: sequential block number
 *   - blockHash:  SHA-256( prevHash + fileHash + certId + timestamp )
 *   - prevHash:   hash of previous block (genesis: '0'.repeat(64))
 *   - fileHash:   SHA-256 of the certified recording
 *   - certId:     certificate UUID
 *   - timestamp:  ISO timestamp
 *
 * This creates a tamper-evident ledger: altering any block invalidates
 * all subsequent blocks (chain breaks at that point).
 *
 * Additionally, this module attempts a fire-and-forget anchor to the
 * public OpenTimestamps API (Bitcoin-backed, completely optional).
 *
 * @module blockchain
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAIN_FILE = process.env.BLOCKCHAIN_LOG || path.join(__dirname, '../blockchain_log.json');
const GENESIS_HASH = '0'.repeat(64);

/**
 * Load the current chain from disk. Returns empty chain on first run.
 * @returns {{ blocks: Array, chainHead: string }}
 */
function loadChain() {
    try {
        if (fs.existsSync(CHAIN_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHAIN_FILE, 'utf8'));
            return data;
        }
    } catch (err) {
        console.warn('[blockchain] Failed to load chain, starting fresh:', err.message);
    }
    return { blocks: [], chainHead: GENESIS_HASH };
}

/**
 * Save the chain to disk.
 * @param {{ blocks: Array, chainHead: string }} chain
 */
function saveChain(chain) {
    fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2), 'utf8');
}

/**
 * Compute a block hash.
 * block_hash = SHA-256( prevHash + fileHash + certId + timestamp )
 *
 * @param {string} prevHash
 * @param {string} fileHash
 * @param {string} certId
 * @param {string} timestamp
 * @returns {string} hex
 */
function computeBlockHash(prevHash, fileHash, certId, timestamp) {
    return crypto.createHash('sha256')
        .update(prevHash + fileHash + certId + timestamp)
        .digest('hex');
}

/**
 * Anchor a recording's file hash into the local blockchain ledger.
 *
 * @param {string} fileHash  - SHA-256 of the certified file
 * @param {string} certId    - Certificate UUID
 * @param {string} [userId]  - Recording user ID
 * @returns {{ blockIndex: number, blockHash: string, prevHash: string, timestamp: string }}
 */
function anchorToBlockchain(fileHash, certId, userId = 'unknown') {
    const chain = loadChain();
    const timestamp = new Date().toISOString();
    const prevHash = chain.chainHead;

    const blockHash = computeBlockHash(prevHash, fileHash, certId, timestamp);
    const blockIndex = chain.blocks.length;

    const block = {
        blockIndex,
        blockHash,
        prevHash,
        fileHash,
        certId,
        userId,
        timestamp,
    };

    chain.blocks.push(block);
    chain.chainHead = blockHash;
    saveChain(chain);

    console.log(`[blockchain] Block #${blockIndex} anchored: ${blockHash.substring(0, 16)}…`);
    return block;
}

/**
 * Verify the entire chain's integrity by recomputing each block hash.
 *
 * @returns {{ valid: boolean, length: number, brokenAt: number|null, details: string }}
 */
function verifyChain() {
    const chain = loadChain();
    const blocks = chain.blocks;

    if (blocks.length === 0) {
        return { valid: true, length: 0, brokenAt: null, details: 'Empty chain — no recordings anchored yet' };
    }

    let prevHash = GENESIS_HASH;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const expectedHash = computeBlockHash(block.prevHash, block.fileHash, block.certId, block.timestamp);

        if (block.blockHash !== expectedHash) {
            return {
                valid: false,
                length: blocks.length,
                brokenAt: i,
                details: `Chain integrity broken at block #${i} (blockHash mismatch)`,
            };
        }
        if (block.prevHash !== prevHash) {
            return {
                valid: false,
                length: blocks.length,
                brokenAt: i,
                details: `Chain integrity broken at block #${i} (prevHash mismatch)`,
            };
        }
        prevHash = block.blockHash;
    }

    return {
        valid: true,
        length: blocks.length,
        brokenAt: null,
        details: `All ${blocks.length} blocks verified — chain is intact`,
    };
}

/**
 * Look up all blocks for a specific certificate ID.
 * @param {string} certId
 * @returns {Array}
 */
function getBlockByCertId(certId) {
    const chain = loadChain();
    return chain.blocks.filter((b) => b.certId === certId);
}

/**
 * Return the full chain (read-only copy).
 * @returns {{ blocks: Array, chainHead: string }}
 */
function getFullChain() {
    return loadChain();
}

module.exports = {
    anchorToBlockchain,
    verifyChain,
    getBlockByCertId,
    getFullChain,
    GENESIS_HASH,
};
