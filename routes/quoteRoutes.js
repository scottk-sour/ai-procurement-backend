import express from 'express';
import { requestQuotes } from '../controllers/quoteController.js';
import validateQuoteRequest from '../middleware/validateQuoteRequest.js'; // Correct Import

const router = express.Router();

/**
 * Route: POST /api/quotes/request
 * Description: Handles AI-based vendor quote requests.
 */
router.post('/request', validateQuoteRequest, async (req, res, next) => {
  try {
    console.log("🔥 Incoming Validated Request:", JSON.stringify(req.validatedUserRequirements, null, 2));

    // ✅ Forward the validated user requirements to the controller
    await requestQuotes(req, res);
  } catch (error) {
    console.error('❌ Error in quote request route:', error.message);
    next(error);
  }
});

export default router;
