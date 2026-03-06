const mongoose = require('mongoose');

const custodyEventSchema = new mongoose.Schema({
    event: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actor: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ipAddress: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
});

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
        fileHash: {
            type: String,
            required: true,
        },
        fileName: {
            type: String,
        },
        fileSize: {
            type: Number,
        },
        mimeType: {
            type: String,
        },
        timestamp: {
            type: Date,
            required: true,
        },
        deviceFingerprint: {
            type: String,
            required: true,
        },
        signature: {
            type: String,  // RSA digital signature of the hash
            required: true,
        },
        publicKey: {
            type: String,  // Public key for verification
        },
        qrCodeData: {
            type: String,  // QR code data URL
        },
        verificationUrl: {
            type: String,
        },
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
