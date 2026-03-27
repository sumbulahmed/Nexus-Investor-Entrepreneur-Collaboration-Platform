const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const allowedDocumentTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const fileFilter = (req, file, cb) => {
  if (allowedDocumentTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// ─── Document upload (S3) ─────────────────────────────────
const documentUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET || 'nexus-documents',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, {
        uploadedBy: req.user._id.toString(),
        originalName: file.originalname,
      });
    },
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const key = `documents/${req.user._id}/${uuidv4()}${ext}`;
      cb(null, key);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB
  fileFilter,
});

// ─── Signature upload (S3) ────────────────────────────────
const signatureUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET || 'nexus-documents',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `signatures/${req.user._id}/${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Signature must be JPEG, PNG, or WebP'), false);
    }
  },
});

// ─── Avatar upload (S3) ───────────────────────────────────
const avatarUpload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET || 'nexus-documents',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `avatars/${req.user._id}/${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Avatar must be JPEG, PNG, or WebP'), false);
    }
  },
});

module.exports = { documentUpload, signatureUpload, avatarUpload, s3 };
