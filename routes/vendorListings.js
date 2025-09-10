// File: routes/vendorListings.js
import express from 'express';
import Listing from '../models/Listing.js';
import vendorAuth from '../middleware/vendorAuth.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

// GET /api/vendors/recommend - Get vendor recommendations for users
router.get('/recommend', userAuth, async (req, res) => {
  try {
    const { userId } = req.query;
    
    console.log('🔍 Fetching vendor recommendations for user:', userId);
    
    // Fetch active listings from database
    const listings = await Listing.find({ 
      isActive: true 
    }).populate('vendor', 'name email phone website');
    
    if (!listings || listings.length === 0) {
      return res.json({
        success: true,
        data: [],
        recommendations: [],
        message: 'No vendor listings available at this time'
      });
    }
    
    // Transform listings into the format expected by frontend
    const vendorRecommendations = listings.map((listing, index) => ({
      id: listing._id.toString(),
      vendorName: listing.vendor?.name || listing.title || `Vendor ${index + 1}`,
      name: listing.vendor?.name || listing.title || `Vendor ${index + 1}`,
      price: parseFloat(listing.price) || 0,
      speed: listing.speed || 30, // Default speed if not specified
      score: listing.rating ? listing.rating * 20 : 80, // Convert 1-5 rating to 0-100 score
      website: listing.vendor?.website || '#',
      aiRecommendation: listing.category || 'Recommended',
      savingsInfo: listing.savingsInfo || 'Contact for pricing',
      description: listing.description || 'Professional equipment solution',
      features: listing.features || ['Professional grade', 'Service included'],
      contactInfo: {
        phone: listing.vendor?.phone || 'Contact via platform',
        email: listing.vendor?.email || 'Contact via platform'
      }
    }));
    
    console.log(`✅ Found ${vendorRecommendations.length} vendor recommendations`);
    
    // Return in the format your frontend expects
    res.json({
      success: true,
      data: vendorRecommendations,
      recommendations: vendorRecommendations
    });
    
  } catch (error) {
    console.error('❌ Error fetching vendor recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Protect all remaining routes with vendorAuth (vendors only)
router.use(vendorAuth);

// GET /api/vendors/listings - Get listings for the logged-in vendor
router.get('/', async (req, res) => {
  try {
    const listings = await Listing.find({ vendor: req.vendorId });
    res.json(listings);
  } catch (error) {
    console.error('❌ Error fetching listings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/vendors/listings - Create a new listing
router.post('/', async (req, res) => {
  try {
    const { title, description, price } = req.body;
    if (!title || !price) {
      return res.status(400).json({ message: 'Title and price are required.' });
    }
    const newListing = new Listing({
      vendor: req.vendorId,
      title,
      description,
      price,
      isActive: true,
    });
    await newListing.save();
    res.status(201).json(newListing);
  } catch (error) {
    console.error('❌ Error creating listing:', error);
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
    console.error('❌ Error updating listing:', error);
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
    res.json({ message: '✅ Listing deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting listing:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
