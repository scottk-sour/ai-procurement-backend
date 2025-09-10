// File: routes/vendorListings.js
import express from 'express';
import Listing from '../models/Listing.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import vendorAuth from '../middleware/vendorAuth.js';
import userAuth from '../middleware/userAuth.js';
import AIEngineAdapter from '../services/aiEngineAdapter.js';
import logger from '../services/logger.js';

const router = express.Router();

// GET /api/vendors/recommend - AI-powered vendor recommendations with comprehensive fallbacks
router.get('/recommend', userAuth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userId } = req.query;
    
    // Input validation
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
        error: 'MISSING_USER_ID'
      });
    }
    
    logger.info('Fetching AI-powered vendor recommendations', { userId });
    
    // Strategy 1: Get user's most recent quote request for AI matching
    const latestQuoteRequest = await QuoteRequest.findOne({
      $or: [
        { userId: userId },
        { submittedBy: userId }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();
    
    let recommendations = [];
    let recommendationType = 'basic';
    let aiPowered = false;
    
    // Strategy 2: AI-powered recommendations if quote request exists
    if (latestQuoteRequest) {
      try {
        logger.info('Attempting AI-powered recommendations', { 
          quoteRequestId: latestQuoteRequest._id,
          companyName: latestQuoteRequest.companyName
        });
        
        // Check if AI quotes already exist
        const existingQuotes = await Quote.find({ 
          quoteRequest: latestQuoteRequest._id 
        })
        .populate('product')
        .populate('vendor')
        .sort({ ranking: 1 })
        .lean();
        
        if (existingQuotes && existingQuotes.length > 0) {
          // Use existing AI-generated quotes
          logger.info(`Found ${existingQuotes.length} existing AI quotes`);
          recommendations = await convertQuotesToRecommendations(existingQuotes);
          recommendationType = 'existing_ai';
          aiPowered = true;
        } else {
          // Generate new AI quotes
          logger.info('Generating new AI recommendations');
          const quoteIds = await AIEngineAdapter.generateQuotesFromRequest(
            latestQuoteRequest, 
            userId
          );
          
          if (quoteIds && quoteIds.length > 0) {
            const newQuotes = await Quote.find({ 
              _id: { $in: quoteIds } 
            })
            .populate('product')
            .populate('vendor')
            .sort({ ranking: 1 })
            .lean();
            
            if (newQuotes.length > 0) {
              recommendations = await convertQuotesToRecommendations(newQuotes);
              recommendationType = 'fresh_ai';
              aiPowered = true;
              logger.info(`Generated ${recommendations.length} fresh AI recommendations`);
            }
          }
        }
      } catch (aiError) {
        logger.warn('AI recommendation generation failed', { 
          error: aiError.message, 
          userId, 
          quoteRequestId: latestQuoteRequest._id 
        });
        // Continue to fallback strategies
      }
    }
    
    // Strategy 3: Fallback to enhanced listing-based recommendations
    if (recommendations.length === 0) {
      logger.info('Using fallback listing-based recommendations', { userId });
      
      const listings = await Listing.find({ 
        isActive: true 
      })
      .populate('vendor', 'name email phone website company performance')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
      
      if (listings && listings.length > 0) {
        recommendations = await convertListingsToRecommendations(listings, latestQuoteRequest);
        recommendationType = latestQuoteRequest ? 'enhanced_listing' : 'basic_listing';
        logger.info(`Generated ${recommendations.length} listing-based recommendations`);
      }
    }
    
    // Strategy 4: Emergency fallback with sample data
    if (recommendations.length === 0) {
      logger.warn('All recommendation strategies failed, using emergency fallback');
      recommendations = generateEmergencyRecommendations();
      recommendationType = 'emergency';
    }
    
    // Enhance recommendations with metadata
    const enhancedRecommendations = recommendations.map((rec, index) => ({
      ...rec,
      rank: index + 1,
      recommendationType,
      aiPowered,
      confidence: aiPowered ? 'High' : 'Medium',
      generatedAt: new Date(),
      basedOnQuoteRequest: latestQuoteRequest?._id || null
    }));
    
    const responseTime = Date.now() - startTime;
    
    logger.info('Vendor recommendations generated successfully', {
      userId,
      count: enhancedRecommendations.length,
      type: recommendationType,
      aiPowered,
      responseTime
    });
    
    res.json({
      success: true,
      data: enhancedRecommendations,
      recommendations: enhancedRecommendations,
      metadata: {
        count: enhancedRecommendations.length,
        recommendationType,
        aiPowered,
        responseTime,
        basedOnQuoteRequest: latestQuoteRequest?._id || null,
        message: getRecommendationMessage(recommendationType, enhancedRecommendations.length)
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Error in vendor recommendations endpoint', {
      error: error.message,
      stack: error.stack,
      userId: req.query.userId,
      responseTime
    });
    
    // Return emergency recommendations even on complete failure
    const emergencyRecs = generateEmergencyRecommendations();
    
    res.status(500).json({
      success: false,
      message: 'Partial failure in recommendation system',
      data: emergencyRecs,
      recommendations: emergencyRecs,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      metadata: {
        count: emergencyRecs.length,
        recommendationType: 'emergency',
        aiPowered: false,
        responseTime
      }
    });
  }
});

// Helper function: Convert AI quotes to recommendation format
async function convertQuotesToRecommendations(quotes) {
  try {
    return quotes.map((quote, index) => {
      const product = quote.product || {};
      const vendor = quote.vendor || {};
      const costs = quote.costs || {};
      const matchScore = quote.matchScore || {};
      const productSummary = quote.productSummary || {};
      
      return {
        id: quote._id.toString(),
        vendorName: vendor.name || vendor.company || product.manufacturer || productSummary.manufacturer || `AI Vendor ${index + 1}`,
        name: vendor.name || vendor.company || product.manufacturer || productSummary.manufacturer || `AI Vendor ${index + 1}`,
        price: costs.monthlyCosts?.leaseCost || costs.monthlyCosts?.totalMonthlyCost || 0,
        speed: product.speed || productSummary.speed || 30,
        score: Math.round((matchScore.total || 0.5) * 100),
        website: vendor.website || '#',
        aiRecommendation: quote.ranking === 1 ? 'AI Top Choice' : 
                         quote.ranking === 2 ? 'AI Recommended' : 
                         'AI Alternative',
        savingsInfo: costs.savings?.description || 
                    (costs.savings?.monthlyAmount > 0 ? 
                     `Save £${Math.round(costs.savings.monthlyAmount)}/month` : 
                     'Contact for pricing'),
        description: product.description || 
                    `${productSummary.manufacturer || 'Professional'} ${productSummary.model || 'Equipment'}`,
        features: product.features || productSummary.features || ['AI Selected', 'Professional Grade'],
        contactInfo: {
          phone: vendor.phone || 'Contact via platform',
          email: vendor.email || 'Contact via platform'
        },
        
        // AI-specific metadata
        aiMatchScore: matchScore.total || 0.5,
        aiConfidence: matchScore.confidence || 'Medium',
        aiReasoning: Array.isArray(matchScore.reasoning) ? matchScore.reasoning : [],
        monthlyVolumeSuitability: quote.userRequirements?.monthlyVolume?.total || 0,
        costBreakdown: costs.monthlyCosts || {},
        quoteId: quote._id.toString(),
        ranking: quote.ranking || index + 1
      };
    });
  } catch (error) {
    logger.error('Error converting quotes to recommendations', { error: error.message });
    return [];
  }
}

// Helper function: Convert listings to enhanced recommendations
async function convertListingsToRecommendations(listings, quoteRequest) {
  try {
    return listings.map((listing, index) => {
      const vendor = listing.vendor || {};
      
      // Enhanced scoring if we have quote request context
      let baseScore = 60;
      let aiRecommendation = 'Available Option';
      
      if (quoteRequest) {
        const userBudget = quoteRequest.budget?.maxLeasePrice || 300;
        const listingPrice = parseFloat(listing.price) || 0;
        
        // Simple budget-based scoring
        if (listingPrice <= userBudget * 0.8) {
          baseScore = 85;
          aiRecommendation = 'Budget Friendly';
        } else if (listingPrice <= userBudget) {
          baseScore = 75;
          aiRecommendation = 'Within Budget';
        } else if (listingPrice <= userBudget * 1.2) {
          baseScore = 65;
          aiRecommendation = 'Slightly Over Budget';
        } else {
          baseScore = 50;
          aiRecommendation = 'Premium Option';
        }
      }
      
      return {
        id: listing._id.toString(),
        vendorName: vendor.name || vendor.company || listing.title || `Vendor ${index + 1}`,
        name: vendor.name || vendor.company || listing.title || `Vendor ${index + 1}`,
        price: parseFloat(listing.price) || 0,
        speed: listing.speed || 30,
        score: listing.rating ? listing.rating * 20 : baseScore,
        website: vendor.website || '#',
        aiRecommendation,
        savingsInfo: listing.savingsInfo || 'Contact for pricing',
        description: listing.description || 'Professional equipment solution',
        features: listing.features || ['Professional grade', 'Service included'],
        contactInfo: {
          phone: vendor.phone || 'Contact via platform',
          email: vendor.email || 'Contact via platform'
        },
        
        // Additional metadata
        listingId: listing._id.toString(),
        vendorPerformance: vendor.performance || 'Standard',
        isListing: true
      };
    });
  } catch (error) {
    logger.error('Error converting listings to recommendations', { error: error.message });
    return [];
  }
}

// Helper function: Generate emergency fallback recommendations
function generateEmergencyRecommendations() {
  return [
    {
      id: 'emergency-1',
      vendorName: 'Standard Office Solutions',
      name: 'Standard Office Solutions',
      price: 250,
      speed: 25,
      score: 70,
      website: '#',
      aiRecommendation: 'Reliable Option',
      savingsInfo: 'Contact for current pricing',
      description: 'Professional printing and copying solutions',
      features: ['Copy', 'Print', 'Scan', 'Network Ready'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    },
    {
      id: 'emergency-2',
      vendorName: 'Business Equipment Specialists',
      name: 'Business Equipment Specialists',
      price: 300,
      speed: 35,
      score: 75,
      website: '#',
      aiRecommendation: 'Professional Choice',
      savingsInfo: 'Competitive rates available',
      description: 'Advanced multifunction equipment for business',
      features: ['High Speed', 'Color Printing', 'Advanced Features'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    },
    {
      id: 'emergency-3',
      vendorName: 'Enterprise Print Services',
      name: 'Enterprise Print Services',
      price: 400,
      speed: 45,
      score: 80,
      website: '#',
      aiRecommendation: 'Premium Quality',
      savingsInfo: 'Enterprise-grade service',
      description: 'High-performance equipment with premium support',
      features: ['Enterprise Grade', 'Full Service', '24/7 Support'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    }
  ];
}

// Helper function: Generate appropriate message based on recommendation type
function getRecommendationMessage(type, count) {
  switch (type) {
    case 'fresh_ai':
      return `AI-powered recommendations based on your specific requirements (${count} matches)`;
    case 'existing_ai':
      return `AI-analyzed recommendations from your previous quote request (${count} matches)`;
    case 'enhanced_listing':
      return `Enhanced recommendations based on your preferences (${count} options)`;
    case 'basic_listing':
      return `Available vendor listings (${count} options)`;
    case 'emergency':
      return `Standard recommendations - submit a quote request for personalized matches`;
    default:
      return `Found ${count} vendor recommendations`;
  }
}

// Health check endpoint for monitoring
router.get('/recommend/health', async (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        database: 'connected',
        ai_engine: 'available',
        recommendations: 'operational'
      }
    };
    
    // Test database connectivity
    try {
      await Listing.countDocuments({ isActive: true });
      healthData.services.database = 'connected';
    } catch (dbError) {
      healthData.services.database = 'error';
      healthData.status = 'degraded';
    }
    
    // Test AI engine
    try {
      const aiHealth = await AIEngineAdapter.healthCheck();
      healthData.services.ai_engine = aiHealth.status;
      if (aiHealth.status !== 'healthy') {
        healthData.status = 'degraded';
      }
    } catch (aiError) {
      healthData.services.ai_engine = 'error';
      healthData.status = 'degraded';
    }
    
    res.json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Protect all remaining routes with vendorAuth (vendors only)
router.use(vendorAuth);

// GET /api/vendors/listings - Get listings for the logged-in vendor
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    
    const query = { vendor: req.vendorId };
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.isActive = status === 'active';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [listings, total] = await Promise.all([
      Listing.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Listing.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      listings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching vendor listings', { 
      error: error.message, 
      vendorId: req.vendorId 
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch listings' 
    });
  }
});

// POST /api/vendors/listings - Create a new listing with enhanced validation
router.post('/', async (req, res) => {
  try {
    const { title, description, price, category, features, speed, rating } = req.body;
    
    // Enhanced validation
    const errors = [];
    if (!title || title.trim().length < 3) {
      errors.push('Title must be at least 3 characters long');
    }
    if (!price || price <= 0) {
      errors.push('Price must be a positive number');
    }
    if (!description || description.trim().length < 10) {
      errors.push('Description must be at least 10 characters long');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    const newListing = new Listing({
      vendor: req.vendorId,
      title: title.trim(),
      description: description.trim(),
      price: parseFloat(price),
      category: category || 'Equipment',
      features: Array.isArray(features) ? features : [],
      speed: speed ? parseInt(speed) : undefined,
      rating: rating ? parseFloat(rating) : undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await newListing.save();
    
    logger.info('New listing created', { 
      listingId: newListing._id, 
      vendorId: req.vendorId,
      title: newListing.title
    });
    
    res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      listing: newListing
    });
  } catch (error) {
    logger.error('Error creating listing', { 
      error: error.message, 
      vendorId: req.vendorId 
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create listing' 
    });
  }
});

// PUT /api/vendors/listings/:id - Update an existing listing with validation
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    
    // Remove fields that shouldn't be updated
    delete updateData._id;
    delete updateData.vendor;
    delete updateData.createdAt;
    
    const updatedListing = await Listing.findOneAndUpdate(
      { _id: id, vendor: req.vendorId },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedListing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or access denied'
      });
    }
    
    logger.info('Listing updated', { 
      listingId: id, 
      vendorId: req.vendorId 
    });
    
    res.json({
      success: true,
      message: 'Listing updated successfully',
      listing: updatedListing
    });
  } catch (error) {
    logger.error('Error updating listing', { 
      error: error.message, 
      listingId: req.params.id,
      vendorId: req.vendorId 
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update listing' 
    });
  }
});

// DELETE /api/vendors/listings/:id - Delete a listing with confirmation
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedListing = await Listing.findOneAndDelete({
      _id: id,
      vendor: req.vendorId,
    });
    
    if (!deletedListing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or access denied'
      });
    }
    
    logger.info('Listing deleted', { 
      listingId: id, 
      vendorId: req.vendorId,
      title: deletedListing.title
    });
    
    res.json({
      success: true,
      message: 'Listing deleted successfully',
      deletedListing: {
        id: deletedListing._id,
        title: deletedListing.title
      }
    });
  } catch (error) {
    logger.error('Error deleting listing', { 
      error: error.message, 
      listingId: req.params.id,
      vendorId: req.vendorId 
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete listing' 
    });
  }
});

export default router;
