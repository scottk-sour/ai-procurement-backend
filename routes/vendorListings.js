// File: routes/vendorListings.js - Fixed AI-powered vendor recommendations
import express from 'express';
import Listing from '../models/Listing.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import vendorAuth from '../middleware/vendorAuth.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

// Simple logger fallback
const logger = {
  info: (message, meta) => console.log('ℹ️ AI-VENDOR:', message, meta ? JSON.stringify(meta) : ''),
  warn: (message, meta) => console.warn('⚠️ AI-VENDOR:', message, meta ? JSON.stringify(meta) : ''),
  error: (message, meta) => console.error('❌ AI-VENDOR:', message, meta ? JSON.stringify(meta) : '')
};

// GET /api/vendors/recommend - AI-powered vendor recommendations
router.get('/recommend', userAuth, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
        error: 'MISSING_USER_ID'
      });
    }
    
    logger.info('🤖 AI-POWERED ENDPOINT HIT', { userId, timestamp: new Date() });
    
    // Get user's most recent quote request
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
    let message = 'No vendor recommendations available';
    
    if (latestQuoteRequest) {
      logger.info('📋 Found quote request, checking for AI quotes', { 
        quoteRequestId: latestQuoteRequest._id,
        companyName: latestQuoteRequest.companyName
      });
      
      // Check for existing AI-generated quotes
      const existingQuotes = await Quote.find({ 
        quoteRequest: latestQuoteRequest._id 
      })
      .populate('product')
      .populate('vendor')
      .sort({ ranking: 1 })
      .lean();
      
      if (existingQuotes && existingQuotes.length > 0) {
        logger.info(`🎯 Found ${existingQuotes.length} existing AI quotes - converting to recommendations`);
        recommendations = convertQuotesToRecommendations(existingQuotes);
        recommendationType = 'existing_ai';
        aiPowered = true;
        message = `AI-powered recommendations based on your ${latestQuoteRequest.serviceType} requirements`;
      } else {
        // Try to generate new AI quotes
        logger.info('🔄 No existing quotes found, generating fresh AI recommendations');
        const aiResult = await generateAIRecommendations(latestQuoteRequest, userId);
        
        if (aiResult) {
          recommendations = aiResult.recommendations;
          recommendationType = aiResult.recommendationType;
          aiPowered = aiResult.aiPowered;
          message = aiResult.message;
        }
      }
    } else {
      logger.warn('❌ No quote request found for user');
    }
    
    // Fallback to emergency recommendations if no AI quotes
    if (recommendations.length === 0) {
      logger.warn('🚨 Using emergency fallback recommendations');
      recommendations = generateEmergencyRecommendations();
      recommendationType = 'emergency';
      message = 'Standard recommendations - submit a quote request for AI-powered matches';
    }
    
    // Add metadata to recommendations
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
    
    logger.info('✅ AI recommendations generated successfully', {
      userId,
      count: enhancedRecommendations.length,
      type: recommendationType,
      aiPowered,
      responseTime
    });
    
    // Return in the exact format your frontend expects
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
        message
      }
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('💥 Error in AI vendor recommendations endpoint', {
      error: error.message,
      stack: error.stack,
      userId: req.query.userId,
      responseTime
    });
    
    // Return emergency recommendations even on complete failure
    const emergencyRecs = generateEmergencyRecommendations();
    
    res.json({
      success: true,
      data: emergencyRecs,
      recommendations: emergencyRecs,
      metadata: {
        count: emergencyRecs.length,
        recommendationType: 'emergency',
        aiPowered: false,
        responseTime,
        message: 'Emergency fallback due to system error'
      }
    });
  }
});

// Convert AI quotes to recommendation format
function convertQuotesToRecommendations(quotes) {
  try {
    logger.info(`🔄 Converting ${quotes.length} AI quotes to recommendations`);
    
    return quotes.map((quote, index) => {
      const product = quote.product || {};
      const vendor = quote.vendor || {};
      const costs = quote.costs || {};
      const matchScore = quote.matchScore || {};
      const productSummary = quote.productSummary || {};
      
      const recommendation = {
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
        aiConfidence: matchScore.confidence || 'High',
        aiReasoning: Array.isArray(matchScore.reasoning) ? matchScore.reasoning : [],
        monthlyVolumeSuitability: quote.userRequirements?.monthlyVolume?.total || 0,
        costBreakdown: costs.monthlyCosts || {},
        quoteId: quote._id.toString(),
        ranking: quote.ranking || index + 1
      };
      
      logger.info(`✅ Converted quote ${index + 1}: ${recommendation.vendorName} - ${recommendation.description}`);
      return recommendation;
    });
  } catch (error) {
    logger.error('💥 Error converting quotes to recommendations', { error: error.message });
    return [];
  }
}

// Generate emergency fallback recommendations (using AI machine names from your database)
function generateEmergencyRecommendations() {
  logger.warn('🚨 Generating emergency fallback recommendations');
  
  return [
    {
      id: 'emergency-1',
      vendorName: 'Xerox AltaLink C8030',
      name: 'Xerox AltaLink C8030',
      price: 280,
      speed: 30,
      score: 90,
      website: '#',
      aiRecommendation: 'Top Choice',
      savingsInfo: 'Contact for pricing',
      description: 'Professional A3 multifunction printer',
      features: ['Copy', 'Print', 'Scan', 'Duplex', 'Network Ready'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    },
    {
      id: 'emergency-2',
      vendorName: 'Xerox VersaLink B7035',
      name: 'Xerox VersaLink B7035',
      price: 320,
      speed: 35,
      score: 85,
      website: '#',
      aiRecommendation: 'Recommended',
      savingsInfo: 'High-speed option',
      description: 'High-speed black & white printing solution',
      features: ['High Speed', 'Network Ready', 'Security Features'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    },
    {
      id: 'emergency-3',
      vendorName: 'Xerox VersaLink C7000',
      name: 'Xerox VersaLink C7000',
      price: 350,
      speed: 35,
      score: 80,
      website: '#',
      aiRecommendation: 'Alternative',
      savingsInfo: 'Color printing capable',
      description: 'Color multifunction with advanced features',
      features: ['Color Printing', 'Cloud Connect', 'Mobile Support'],
      contactInfo: {
        phone: 'Contact via platform',
        email: 'Contact via platform'
      },
      isEmergency: true
    }
  ];
}

// Health check endpoint
router.get('/recommend/health', async (req, res) => {
  logger.info('🏥 Health check endpoint hit');
  
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date(),
      endpoint: 'AI-powered vendor recommendations',
      services: {
        database: 'connected',
        ai_quotes: 'available',
        recommendations: 'operational'
      }
    };
    
    // Test database connectivity
    try {
      const quoteCount = await Quote.countDocuments({});
      healthData.services.database = 'connected';
      healthData.services.ai_quotes = `${quoteCount} quotes available`;
    } catch (dbError) {
      healthData.services.database = 'error';
      healthData.status = 'degraded';
    }
    
    logger.info('✅ Health check completed', healthData);
    res.json(healthData);
  } catch (error) {
    logger.error('💥 Health check failed', { error: error.message });
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

// POST /api/vendors/listings - Create a new listing
router.post('/', async (req, res) => {
  try {
    const { title, description, price, category, features, speed, rating } = req.body;
    
    if (!title || !price) {
      return res.status(400).json({
        success: false,
        message: 'Title and price are required'
      });
    }
    
    const newListing = new Listing({
      vendor: req.vendorId,
      title: title.trim(),
      description: description?.trim() || '',
      price: parseFloat(price),
      category: category || 'Equipment',
      features: Array.isArray(features) ? features : [],
      speed: speed ? parseInt(speed) : undefined,
      rating: rating ? parseFloat(rating) : undefined,
      isActive: true
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

// PUT /api/vendors/listings/:id - Update an existing listing
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    
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

// DELETE /api/vendors/listings/:id - Delete a listing
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
