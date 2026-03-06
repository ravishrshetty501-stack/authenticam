const mongoose = require('mongoose');

const custodyEventSchema = new mongoose.Schema({
    event: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actor: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ipAddress: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
});

const timestampProofSchema = new mongoose.Schema({
    iso: { type: String },
    unix: { type: Number },
    source: { type: String, enum: ['ntp', 'system'], default: 'system' },
    ntpServer: { type: String },
    ntpOffset: { type: Number, default: 0 },
    roundtripMs: { type: Number, default: 0 },
    reliable: { type: Boolean, default: false },
}, { _id: false });

const certificateSchema = new mongoose.Schema(
    {
        recordingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Recording',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        certificateId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // ── Media Identification ──────────────────────────────────
        fileHash: { type: String, required: true },
        fileName: { type: String },
        fileSize: { type: Number },
        mimeType: { type: String },
        duration: { type: Number, default: 0 },
        timestamp: { type: Date, required: true },

        // ── Cryptographic Proofs ──────────────────────────────────
        /** RSA-2048 digital signature of fileHash */
        signature: { type: String, required: true },
        digitalSignature: { type: String }, // alias used in newer schema
        /** RSA public key PEM for independent verification */
        publicKey: { type: String },
        /** Merkle root over 4KB chunks of the file */
        merkleRoot: { type: String, default: null },
        merkleLeafCount: { type: Number, default: 0 },
        /** SHA-256 of spread-spectrum watermark trailer region */
        watermarkHash: { type: String, default: null },

        // ── Device Identity ───────────────────────────────────────
        deviceFingerprint: { type: String, required: true },
        /** SHA-256 of enriched device fingerprint (UA + IP + canvas) */
        fingerprintHash: { type: String, default: null },

        // ── Timestamp ────────────────────────────────────────────
        timestampProof: { type: timestampProofSchema, default: null },

        // ── Certificate Metadata ──────────────────────────────────
        algorithmVersions: { type: mongoose.Schema.Types.Mixed, default: {} },
        geoLocation: { type: mongoose.Schema.Types.Mixed, default: null },
        qrCodeData: { type: String },
        verificationUrl: { type: String },

        chainOfCustody: {
            type: [custodyEventSchema],
            default: [],
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        isRevoked: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Certificate', certificateSchema);

