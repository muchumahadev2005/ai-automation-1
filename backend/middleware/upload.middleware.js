/**
 * File Upload Middleware
 * Handles file uploads using multer
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const { generateRandomString } = require('../utils/helpers');

// Ensure upload directory exists
const uploadDir = config.upload.path;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create subdirectory based on file type
    let subDir = 'misc';
    if (file.fieldname === 'syllabus') {
      subDir = 'syllabi';
    }

    const destPath = path.join(uploadDir, subDir);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    cb(null, destPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = generateRandomString(16);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter for syllabus uploads
const syllabusFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const allowedExtensions = ['.pdf', '.txt', '.doc', '.docx'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only PDF, TXT, DOC, and DOCX files are allowed'), false);
  }
};

// Create multer instances
const uploadSyllabus = multer({
  storage,
  fileFilter: syllabusFilter,
  limits: {
    fileSize: config.upload.maxFileSize, // 10MB default
  },
}).single('syllabus');

const csvFilter = (req, file, cb) => {
  const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) && ext === '.csv') {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only CSV files are allowed'), false);
  }
};

const uploadCsv = multer({
  storage,
  fileFilter: csvFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
}).single('file');

// Generic upload for any file
const uploadFile = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
}).single('file');

// Wrapper to handle multer errors
const handleUpload = (uploadFn) => {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest(`File too large. Maximum size is ${config.upload.maxFileSize / (1024 * 1024)}MB`));
        }
        return next(ApiError.badRequest(err.message));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  };
};

/**
 * Delete uploaded file
 * @param {string} filePath - Path to file
 */
const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = {
  uploadSyllabus: handleUpload(uploadSyllabus),
  uploadCsv: handleUpload(uploadCsv),
  uploadFile: handleUpload(uploadFile),
  deleteFile,
};
