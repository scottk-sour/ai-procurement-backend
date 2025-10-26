import express from 'express';
import { uploadMatrix, getMatrix } from '../controllers/matrixController.js';
import vendorAuth from '../middleware/vendorAuth.js';
import { matrixUpload } from '../middleware/secureUpload.js';
import { uploadRateLimiter } from '../middleware/uploadRateLimiter.js';

const router = express.Router();

// Protected route: Vendor must be authenticated
// Now uses secure upload middleware with magic number validation and rate limiting
router.post('/upload', vendorAuth, uploadRateLimiter, matrixUpload.single, uploadMatrix);
router.get('/', getMatrix);

export default router;
