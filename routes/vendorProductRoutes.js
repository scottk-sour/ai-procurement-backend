// routes/vendorProductRoutes.js
import express from 'express';
import { getVendorProducts } from '../controllers/vendorProductController.js';

const router = express.Router();

// Keep listing retrieval
router.get('/list', getVendorProducts);

export default router;