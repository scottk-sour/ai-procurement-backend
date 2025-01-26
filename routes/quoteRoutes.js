import express from 'express';
import { requestQuotes } from '../controllers/quoteController.js';

const router = express.Router();

// Route to handle quote requests
router.post('/request', requestQuotes);

// Export the router
export default router;
