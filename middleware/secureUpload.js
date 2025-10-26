import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { validateUploadedFile } from '../utils/fileValidator.js';
import logger from '../services/logger.js';

export function createSecureUpload(options = {}) {
  const {
    allowedTypes = ['csv', 'pdf', 'xlsx', 'xls'],
    uploadPath = 'uploads/',
    fieldName = 'file',
    maxFiles = 1
  } = options;

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const randomBytes = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      const sanitizedOriginal = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .substring(0, 50);
      const ext = path.extname(file.originalname).toLowerCase();
      const secureFilename = `${timestamp}-${randomBytes}-${sanitizedOriginal}${ext}`;
      cb(null, secureFilename);
    }
  });

  const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(1);
      if (!allowedTypes.includes(ext)) {
        return cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
      }
      cb(null, true);
    }
  });

  const validateMiddleware = async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    const filePath = req.file.path;

    try {
      const validation = await validateUploadedFile(filePath, allowedTypes);
      req.fileValidation = validation;
      next();
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: error.message || 'File validation failed'
      });
    }
  };

  return {
    upload,
    single: (req, res, next) => {
      upload.single(fieldName)(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, message: err.message });
        }
        validateMiddleware(req, res, next);
      });
    }
  };
}

export const csvUpload = createSecureUpload({
  allowedTypes: ['csv', 'xlsx', 'xls'],
  uploadPath: 'uploads/',
  fieldName: 'file',
  maxFiles: 1
});

export const documentUpload = createSecureUpload({
  allowedTypes: ['pdf'],
  uploadPath: 'uploads/documents/',
  fieldName: 'document',
  maxFiles: 5
});

export const matrixUpload = createSecureUpload({
  allowedTypes: ['xlsx', 'xls', 'csv'],
  uploadPath: 'uploads/matrix/',
  fieldName: 'file',
  maxFiles: 1
});

export default createSecureUpload;
