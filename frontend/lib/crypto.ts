/**
 * crypto.ts — Client-side cryptographic utilities for AuthentiCam
 *
 * Provides browser-native implementations of:
 *   - SHA-256 via SubtleCrypto (hardware-accelerated)
 *   - Merkle tree builder matching the server's implementation
 *     (4096-byte chunks, SHA-256, same concatenation scheme)
 *
 * These functions allow the frontend to independently verify hashes
 * before uploading, and to display Merkle roots to the user.
 *
 * @module lib/crypto
 */

const CHUNK_SIZE = 4096; // must match backend/utils/merkle.js

/**
 * Compute SHA-256 of a Uint8Array using SubtleCrypto.
 * Falls back to js-sha256 if SubtleCrypto is unavailable (HTTP context).
 *
 * @param data — raw bytes
 * @returns hex digest string
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
    // Fallback: dynamic import of js-sha256
    const { sha256 } = await import('js-sha256');
    return sha256(data);
}

/**
 * Hash two hex strings concatenated (for Merkle parent node).
 * Matches server: sha256(Buffer.from(left + right, 'utf8'))
 */
async function hashPair(left: string, right: string): Promise<string> {
    const combined = left + right;
    const encoder = new TextEncoder();
    return sha256Hex(encoder.encode(combined));
}

export interface MerkleTree {
    root: string;
    leaves: string[];
    layers: string[][];
}

/**
 * Build a Merkle tree from a file buffer.
 * This mirrors the server implementation exactly:
 *   - 4096-byte chunk size
 *   - SHA-256 leaf hashes
 *   - Odd nodes are duplicated (last sibling = itself)
 *
 * @param fileBuffer — full file ArrayBuffer
 * @returns MerkleTree with root, leaves, and all layers
 */
export async function buildClientMerkleTree(fileBuffer: ArrayBuffer): Promise<MerkleTree> {
    const bytes = new Uint8Array(fileBuffer);

    if (bytes.length === 0) {
        const emptyHash = await sha256Hex(new Uint8Array(0));
        return { root: emptyHash, leaves: [emptyHash], layers: [[emptyHash]] };
    }

    // Build leaves
    const leaves: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
        leaves.push(await sha256Hex(chunk));
    }

    const layers: string[][] = [leaves];
    let current = leaves;

    while (current.length > 1) {
        const next: string[] = [];
        for (let i = 0; i < current.length; i += 2) {
            const left = current[i];
            const right = i + 1 < current.length ? current[i + 1] : current[i];
            next.push(await hashPair(left, right));
        }
        layers.push(next);
        current = next;
    }

    return { root: current[0], leaves, layers };
}

/**
 * Quickly compute just the Merkle root (without storing all layers).
 * Useful for display in the recording UI.
 *
 * @param fileBuffer — full file ArrayBuffer
 * @returns hex Merkle root string
 */
export async function computeMerkleRoot(fileBuffer: ArrayBuffer): Promise<string> {
    const tree = await buildClientMerkleTree(fileBuffer);
    return tree.root;
}

/**
 * Verify that a file matches a certificate's fileHash and merkleRoot.
 *
 * @returns { hashMatch, merkleMatch, fileHash, merkleRoot }
 */
export async function verifyFileLocally(
    fileBuffer: ArrayBuffer,
    expectedFileHash: string | null,
    expectedMerkleRoot: string | null
): Promise<{
    hashMatch: boolean | null;
    merkleMatch: boolean | null;
    fileHash: string;
    merkleRoot: string;
}> {
    const bytes = new Uint8Array(fileBuffer);
    const fileHash = await sha256Hex(bytes);
    const tree = await buildClientMerkleTree(fileBuffer);
    const merkleRoot = tree.root;

    return {
        hashMatch: expectedFileHash ? fileHash === expectedFileHash : null,
        merkleMatch: expectedMerkleRoot ? merkleRoot === expectedMerkleRoot : null,
        fileHash,
        merkleRoot,
    };
}
