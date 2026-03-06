const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        title: {
            type: String,
            default: 'Untitled Recording',
            trim: true,
        },
        filename: {
            type: String,
            required: true,
        },
        filePath: {
            type: String,
            required: true,
        },
        fileHash: {
            type: String,
            required: true,
            index: true,
        },
        fileSize: {
            type: Number,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        duration: {
            type: Number, // in seconds
            default: 0,
        },
        deviceFingerprint: {
            type: String,
            required: true,
        },
        geoLocation: {
            lat: Number,
            lng: Number,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        certificateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Certificate',
            default: null,
        },
        status: {
            type: String,
            enum: ['processing', 'certified', 'tampered', 'unverified'],
            default: 'unverified',
        },
        accessLevel: {
            type: String,
            enum: ['private', 'shared', 'public'],
            default: 'private',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Recording', recordingSchema);
