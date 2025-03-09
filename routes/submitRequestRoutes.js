import express from 'express';
import QuoteRequest from '../models/QuoteRequest.js'; // ✅ Correct for default export
import Vendor from '../models/Vendor.js'; // A model representing vendors
import userAuth from '../middleware/userAuth.js'; // Authentication middleware

const router = express.Router();

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
      userId: req.userId, // `userId` added via userAuth middleware
      serviceType,
      quantity,
      preferredVendor,
      deadline,
      specialRequirements,
      budgetRange,
      category: category || 'General', // Default to "General" if no category is provided
      productName: productName || null,
      status: 'Pending',
    });

    await newQuoteRequest.save();

    // Query vendors that match the serviceType
    let query = { services: serviceType };

    // If a preferredVendor is specified, include it in the query
    if (preferredVendor) {
      query = { ...query, name: preferredVendor };
    }

    // Fetch vendors that match the query
    const allVendors = await Vendor.find(query);

    // Select up to three vendors (randomly or by any logic)
    const selectedVendors = allVendors.slice(0, 3);

    // Generate quotes for the selected vendors
    const quotes = selectedVendors.map((vendor) => {
      const basePrice = vendor.basePrice || 100; // Example: Default base price
      const totalCost = basePrice * quantity; // Simple calculation
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
      quotes,
    });
  } catch (error) {
    console.error('Error submitting quote request:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;
