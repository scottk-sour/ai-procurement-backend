const express = require('express');
const router = express.Router();
const QuoteRequest = require('../models/QuoteRequest'); // Ensure the model exists
const userAuth = require('../middleware/userAuth'); // Ensure this middleware is properly implemented

// Route to handle quote submission
router.post('/submit-request', userAuth, async (req, res) => {
  try {
    const {
      serviceType,
      quantity,
      preferredVendor,
      deadline,
      specialRequirements,
      budgetRange,
      category, // Optional
      productName, // Optional
    } = req.body;

    // Validate required fields
    if (!serviceType || !quantity || !deadline || !budgetRange) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Create a new quote request document
    const newQuoteRequest = new QuoteRequest({
      userId: req.userId, // Extracted from userAuth middleware
      serviceType,
      quantity,
      preferredVendor,
      deadline,
      specialRequirements,
      budgetRange,
      category: category || 'General', // Default to 'General' if not provided
      productName: productName || null, // Default to null if not provided
      status: 'Pending', // Default status
    });

    // Save the new quote request to the database
    await newQuoteRequest.save();

    res.status(201).json({ message: 'Quote request submitted successfully', quoteId: newQuoteRequest._id });
  } catch (error) {
    console.error('Error submitting quote request:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
