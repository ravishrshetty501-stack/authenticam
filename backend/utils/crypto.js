const forge = require('node-forge');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || './keys/private.pem';
const PUBLIC_KEY_PATH = process.env.PUBLIC_KEY_PATH || './keys/public.pem';

/**
 * Generate RSA key pair if not present
 */
function generateKeys() {
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        console.log('🔑 RSA keys already exist');
        return;
    }
    console.log('🔑 Generating RSA key pair...');
    const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
    const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKeyPem);
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKeyPem);
    console.log('✅ RSA keys generated');
}

/**
 * Compute SHA256 hash of a file
 */
function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Compute SHA256 hash of a buffer
 */
function computeBufferHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sign a hash with RSA private key
 */
function signHash(hash) {
    try {
        const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        const md = forge.md.sha256.create();
        md.update(hash, 'utf8');
        const signature = forge.util.encode64(privateKey.sign(md));
        return signature;
    } catch (err) {
        console.error('Error signing hash:', err.message);
        return null;
    }
}

/**
 * Verify RSA signature
 */
function verifySignature(hash, signature) {
    try {
        const publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
        const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
        const md = forge.md.sha256.create();
        md.update(hash, 'utf8');
        return publicKey.verify(md.digest().bytes(), forge.util.decode64(signature));
    } catch (err) {
        console.error('Error verifying signature:', err.message);
        return false;
    }
}

/**
 * Get public key PEM
 */
function getPublicKey() {
    try {
        return fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    } catch {
        return null;
    }
}

/**
 * AES encrypt data
 */
function encryptData(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv: iv.toString('hex') };
}

/**
 * AES decrypt data
 */
function decryptData(encrypted, key, iv) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

module.exports = {
    generateKeys,
    computeFileHash,
    computeBufferHash,
    signHash,
    verifySignature,
    getPublicKey,
    encryptData,
    decryptData,
};
