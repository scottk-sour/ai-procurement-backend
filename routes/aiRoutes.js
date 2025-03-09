// /routes/aiRoutes.js
import express from 'express';
import { getRecommendations } from '../controllers/aiController.js';

const router = express.Router();

// AI recommendation endpoint
router.post('/recommendations', getRecommendations);

// Ensure default export
export default router;
