import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  submitCopierQuoteRequest,
  getMatchedVendors,
  getUserCopierQuotes,
  getVendorQuoteRequests,
  updateQuoteStatus
} from '../controllers/copierQuoteController.js';
import userAuth from '../middleware/userAuth.js';
import vendorAuth from '../middleware/vendorAuth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Multer Storage Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Invalid file type; only PDF, Excel & CSV allowed.'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// --- Routes ---
router.post(
  '/request',
  userAuth,
  upload.fields([{ name: 'invoices', maxCount: 5 }]),
  submitCopierQuoteRequest
);

router.get('/matched-vendors/:requestId', userAuth, getMatchedVendors);
router.get('/user-quotes', userAuth, getUserCopierQuotes);

// ✅ These two serve similar functions, for clarity or future frontend refactor
router.get('/vendor-quotes', vendorAuth, getVendorQuoteRequests);
router.get('/supplier-quotes', vendorAuth, getVendorQuoteRequests); // ✅ This is what fixes the 404

router.put('/status/:requestId', adminAuth, updateQuoteStatus);

export default router;
