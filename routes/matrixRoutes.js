import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadMatrix, getMatrix } from '../controllers/matrixController.js';
import vendorAuth from '../middleware/vendorAuth.js';

const router = express.Router();

// Configure multer for file uploads (for XLSX/CSV files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/matrix/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// Protected route: Vendor must be authenticated
router.post('/upload', vendorAuth, upload.single('file'), uploadMatrix);
router.get('/', getMatrix);

export default router;
