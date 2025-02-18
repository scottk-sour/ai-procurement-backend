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

// POST /api/vendors/listings - Create a new listing
router.post('/', async (req, res) => {
  try {
    const { title, description, price } = req.body;
    const newListing = new Listing({
      vendor: req.vendorId, // Associate listing with logged-in vendor
      title,
      description,
      price,
      isActive: true,
    });
    await newListing.save();
    res.status(201).json(newListing);
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/vendors/listings/:id - Update an existing listing
router.put('/:id', async (req, res) => {
  try {
    const updatedListing = await Listing.findOneAndUpdate(
      { _id: req.params.id, vendor: req.vendorId },
      req.body,
      { new: true }
    );
    if (!updatedListing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    res.json(updatedListing);
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/vendors/listings/:id - Delete a listing
router.delete('/:id', async (req, res) => {
  try {
    const deletedListing = await Listing.findOneAndDelete({
      _id: req.params.id,
      vendor: req.vendorId,
    });
    if (!deletedListing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
