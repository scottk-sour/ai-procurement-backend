const express = require('express');
const router = express.Router();
const QuoteRequest = require('../models/QuoteRequest'); 
const Vendor = require('../models/Vendor'); // A model representing vendors
const userAuth = require('../middleware/userAuth'); // Authentication middleware

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
      category,
      productName,
    } = req.body;

    // Validate required fields
    if (!serviceType || !quantity || !deadline || !budgetRange) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // Create a new quote request document
    const newQuoteRequest = new QuoteRequest({
      userId: req.userId, // from userAuth middleware
      serviceType,
      quantity,
      preferredVendor,
      deadline,
      specialRequirements,
      budgetRange,
      category: category || 'General',
      productName: productName || null,
      status: 'Pending',
    });

    await newQuoteRequest.save();

    // Now fetch vendors that match the serviceType (and possibly other criteria)
    let query = { servicesOffered: serviceType }; 
    // Adjust the query fields based on how you store vendor data
    if (preferredVendor) {
      query = { ...query, name: preferredVendor };
    }

    const allVendors = await Vendor.find(query);

    // If you need to pick three vendors, just take the first three or pick them randomly.
    // Here, we just take the first three for simplicity.
    const selectedVendors = allVendors.slice(0, 3);

    // Generate quotes. How you do this depends on your business logic.
    // For example, each vendor might have a basePrice or pricing formula.
    const quotes = selectedVendors.map(vendor => {
      const basePrice = vendor.basePrice || 100; // Example field
      const totalCost = basePrice * quantity; // Simple calculation example
      return {
        vendorName: vendor.name,
        price: totalCost,
        description: `Quote from ${vendor.name} for ${quantity} units of ${serviceType}`,
      };
    });

    // If no vendors are available, handle that case
    if (quotes.length === 0) {
      return res.status(404).json({ message: 'No vendors available for the requested service' });
    }

    // Return the quote request ID along with the generated quotes
    res.status(201).json({ 
      message: 'Quote request submitted successfully', 
      quoteId: newQuoteRequest._id,
      quotes: quotes
    });
  } catch (error) {
    console.error('Error submitting quote request:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
