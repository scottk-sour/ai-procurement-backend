// /routes/analyticsRoutes.js
import express from 'express';

const router = express.Router();

// Example analytics POST endpoint
router.post('/', (req, res) => {
  console.log('Analytics Event Logged:', req.body);
  res.status(200).json({ message: 'Analytics logged successfully.' });
});

// Ensure default export
export default router;
