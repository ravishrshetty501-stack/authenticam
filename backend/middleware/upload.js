const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, process.env.UPLOAD_DIR || 'uploads');
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg',
        'image/jpeg', 'image/png', 'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 524288000, // 500MB
    },
});

// Multer for verification uploads (media file)
const verifyUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 524288000 },
});

module.exports = { upload, verifyUpload };
