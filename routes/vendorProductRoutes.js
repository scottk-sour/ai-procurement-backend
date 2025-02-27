import express from 'express';
import { uploadVendorProducts, getVendorProducts } from '../controllers/vendorProductController.js';

const router = express.Router();

// ✅ Route to upload vendor products (via CSV/Excel)
router.post('/upload', uploadVendorProducts);

// ✅ Route to get vendor products for a specific vendor
router.get('/list', getVendorProducts);

export default router;
