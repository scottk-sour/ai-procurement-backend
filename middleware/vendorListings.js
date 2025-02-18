import express from 'express';
import Listing from '../models/Listing.js';
import vendorAuth from '../middleware/vendorAuth.js'; // Use your existing vendorauth

const router = express.Router();

// Protect all routes in this file
router.use(vendorAuth);

// GET /api/vendors/listings - Get listings for the logged-in vendor
router.get('/', async (req, res) => {
  try {
    const listings = await Listing.find({ vendor: req.vendorId });
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Other routes (POST, PUT, DELETE) here...

export default router;
