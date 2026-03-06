const mongoose = require('mongoose');

const verificationLogSchema = new mongoose.Schema(
    {
        certificateId: {
            type: String,  // Certificate UUID
            index: true,
        },
        verifierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        verifierEmail: {
            type: String,
            default: 'anonymous',
        },
        uploadedHash: {
            type: String,
            required: true,
        },
        expectedHash: {
            type: String,
        },
        result: {
            type: String,
            enum: ['authentic', 'tampered', 'invalid_certificate', 'error'],
            required: true,
        },
        tamperDetails: {
            type: String,
        },
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
