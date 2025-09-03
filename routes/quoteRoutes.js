// routes/quoteRoutes.js - Complete quote management with AI matching
import express from 'express';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import AIEngineAdapter from '../services/aiEngineAdapter.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../services/logger.js';

const router = express.Router();

// POST /api/quotes/requests - Create new quote request and trigger AI matching
router.post('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('📝 Creating new quote request for user:', userId);
    
    // Extract and validate request data
    const {
      companyName,
      contactName,
      email,
      industryType,
      numEmployees,
      numLocations,
      serviceType = 'Photocopiers',
      monthlyVolume,
      paperRequirements,
      currentSetup,
      requirements,
      budget,
      urgency,
      location,
      // Additional fields from your form
      numOfficeLocations,
      multipleFloors,
      price,
      type,
      annualRevenue,
      officeBasedEmployees,
      multiFloor,
      urgencyLevel,
      mobileRequirements,
      paysForScanning,
      colour,
      accessibilityNeeds,
      threeYearVision
    } = req.body;

    // Validate required fields
    if (!companyName || !email || !monthlyVolume) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: companyName, email, and monthlyVolume are required'
      });
    }

    // Create quote request data structure
    const quoteRequestData = {
      companyName,
      contactName: contactName || 'Not provided',
      email,
      industryType: industryType || 'Other',
      numEmployees: numEmployees || 1,
      numLocations: numLocations || 1,
      serviceType,
      
      // Enhanced monthly volume handling
      monthlyVolume: {
        mono: monthlyVolume?.mono || 0,
        colour: monthlyVolume?.colour || 0,
        total: monthlyVolume?.total || (monthlyVolume?.mono || 0) + (monthlyVolume?.colour || 0)
      },
      
      // Paper requirements
      paperRequirements: paperRequirements || {
        primarySize: type || 'A4',
        additionalSizes: [],
        specialPaper: false,
        specialPaperTypes: []
      },
      
      // Current setup information
      currentSetup: currentSetup || {
        machineAge: '2-5 years',
        currentCosts: {},
        painPoints: []
      },
      
      // Requirements and preferences
      requirements: requirements || {
        priority: 'cost',
        essentialFeatures: [],
        niceToHaveFeatures: [],
        environmentalConcerns: false
      },
      
      // Budget information
      budget: budget || {
        maxLeasePrice: price || 300,
        preferredTerm: '60 months',
        includeService: true,
        includeConsumables: true
      },
      
      // Urgency
      urgency: urgency || {
        timeframe: urgencyLevel === 'Critical' ? 'Immediately' : '3-6 months'
      },
      
      // Location
      location: location || {
        postcode: 'Not specified'
      },
      
      // AI Analysis placeholder
      aiAnalysis: {
        processed: false,
        suggestedCategories: [],
        riskFactors: [],
        recommendations: []
      },
      
      // System fields
      submittedBy: userId,
      userId: userId, // For backward compatibility
      status: 'pending',
      submissionSource: 'web_form',
      quotes: [],
      internalNotes: [],
      
      // Additional fields from your enhanced form
      numOfficeLocations,
      multipleFloors: multipleFloors || multiFloor,
      price,
      type,
      annualRevenue,
      officeBasedEmployees,
      urgencyLevel,
      mobileRequirements: mobileRequirements || false,
      paysForScanning: paysForScanning || false,
      colour,
      accessibilityNeeds: accessibilityNeeds || false,
      threeYearVision
    };

    console.log('📋 Quote request data prepared:', {
      companyName: quoteRequestData.companyName,
      monthlyVolume: quoteRequestData.monthlyVolume,
      budget: quoteRequestData.budget?.maxLeasePrice,
      industryType: quoteRequestData.industryType
    });

    // Step 1: Create and save the quote request
    const quoteRequest = new QuoteRequest(quoteRequestData);
    await quoteRequest.save();
    
    console.log('✅ Quote request created:', quoteRequest._id);

    // Step 2: Trigger AI matching immediately
    let aiMatchingResult = {
      success: false,
      quotesGenerated: 0,
      error: null
    };

    try {
      console.log('🤖 Triggering AI matching for quote request:', quoteRequest._id);
      
      // Use your advanced AI engine to generate matches
      const quotes = await AIEngineAdapter.generateQuotesFromRequest(quoteRequest, userId);
      
      if (quotes && quotes.length > 0) {
        // Update quote request with generated quotes and new status
        quoteRequest.quotes = quotes;
        quoteRequest.status = 'matched';
        quoteRequest.aiAnalysis.processed = true;
        quoteRequest.aiAnalysis.recommendations = quotes.map((quoteId, index) => 
          `Generated quote ${index + 1}: ${quoteId}`
        );
        
        await quoteRequest.save();
        
        aiMatchingResult = {
          success: true,
          quotesGenerated: quotes.length,
          error: null
        };
        
        console.log(`✅ AI matching successful - generated ${quotes.length} quotes for request ${quoteRequest._id}`);
        
      } else {
        console.log('⚠️ AI matching returned no quotes for request:', quoteRequest._id);
        aiMatchingResult = {
          success: false,
          quotesGenerated: 0,
          error: 'No suitable matches found'
        };
        
        // Keep status as 'pending' so it can be retried later
        quoteRequest.aiAnalysis.riskFactors.push('No immediate matches found - will retry');
        await quoteRequest.save();
      }
      
    } catch (aiError) {
      console.error('❌ AI matching failed for request:', quoteRequest._id, aiError);
      
      aiMatchingResult = {
        success: false,
        quotesGenerated: 0,
        error: aiError.message || 'AI matching service unavailable'
      };
      
      // Update AI analysis with error info
      quoteRequest.aiAnalysis.riskFactors.push(`AI matching failed: ${aiError.message}`);
      await quoteRequest.save();
    }

    // Step 3: Send response with quote request details and AI results
    const responseData = {
      success: true,
      message: 'Quote request submitted successfully',
      quoteRequest: {
        id: quoteRequest._id,
        companyName: quoteRequest.companyName,
        status: quoteRequest.status,
        monthlyVolume: quoteRequest.monthlyVolume,
        budget: quoteRequest.budget,
        createdAt: quoteRequest.createdAt
      },
      aiMatching: aiMatchingResult
    };

    // If AI matching was successful, include quote information
    if (aiMatchingResult.success && quoteRequest.quotes.length > 0) {
      responseData.quotes = {
        count: quoteRequest.quotes.length,
        ids: quoteRequest.quotes,
        message: `${quoteRequest.quotes.length} vendor quotes generated`
      };
      
      responseData.nextSteps = {
        message: 'Your quote request has been matched with vendors',
        action: 'Review the generated quotes in your dashboard',
        url: '/quote-details?status=matched'
      };
    } else {
      responseData.nextSteps = {
        message: 'Your quote request is being processed',
        action: 'We will notify you when vendors respond',
        url: '/quote-details?status=pending'
      };
    }

    console.log('📤 Sending response:', {
      success: responseData.success,
      status: quoteRequest.status,
      quotesGenerated: aiMatchingResult.quotesGenerated
    });

    res.status(201).json(responseData);

  } catch (error) {
    console.error('❌ Error creating quote request:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to create quote request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/quotes/requests - Get quote requests for user (with proper filtering)
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status, userId: queryUserId, submittedBy } = req.query;
    
    console.log('🔍 Fetching quote requests for user:', userId);
    
    // Build query - handle both userId and submittedBy fields
    const query = {
      $or: [
        { userId: userId },
        { submittedBy: userId }
      ]
    };
    
    // Also check for URL parameters (for backward compatibility)
    if (queryUserId && queryUserId === userId) {
      query.$or.push({ userId: queryUserId });
    }
    if (submittedBy && submittedBy === userId) {
      query.$or.push({ submittedBy: submittedBy });
    }
    
    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const quoteRequests = await QuoteRequest.find(query)
      .populate('quotes')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await QuoteRequest.countDocuments(query);
    
    console.log(`📊 Found ${quoteRequests.length} quote requests for user ${userId}`);
    
    // Return in the format your frontend expects
    res.json({
      success: true,
      requests: quoteRequests, // Use 'requests' key for compatibility
      data: quoteRequests,     // Also include 'data' for flexibility
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching quote requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/quotes/retry-matching/:requestId - Retry AI matching for a specific request
router.post('/retry-matching/:requestId', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.userId;
    
    console.log('🔄 Retrying AI matching for request:', requestId);
    
    // Find the quote request and verify ownership
    const quoteRequest = await QuoteRequest.findOne({
      _id: requestId,
      $or: [{ userId }, { submittedBy: userId }]
    });
    
    if (!quoteRequest) {
      return res.status(404).json({
        success: false,
        message: 'Quote request not found'
      });
    }
    
    if (quoteRequest.status === 'matched' && quoteRequest.quotes.length > 0) {
      return res.json({
        success: true,
        message: 'Quote request already has matches',
        quotesCount: quoteRequest.quotes.length
      });
    }
    
    // Retry AI matching
    const quotes = await AIEngineAdapter.generateQuotesFromRequest(quoteRequest, userId);
    
    if (quotes && quotes.length > 0) {
      quoteRequest.quotes = quotes;
      quoteRequest.status = 'matched';
      quoteRequest.aiAnalysis.processed = true;
      await quoteRequest.save();
      
      res.json({
        success: true,
        message: `Successfully generated ${quotes.length} quotes`,
        quotesCount: quotes.length
      });
    } else {
      res.json({
        success: false,
        message: 'No suitable matches found',
        quotesCount: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Error retrying AI matching:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry matching',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/quotes/:id - Get specific quote details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    console.log('🔍 Fetching quote details:', id);
    
    // Find quote and verify access
    const quote = await Quote.findById(id)
      .populate('quoteRequest')
      .populate('product')
      .populate('vendor')
      .lean();
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Verify user has access to this quote
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      quote
    });
    
  } catch (error) {
    console.error('❌ Error fetching quote details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/quotes/accept - Accept a quote
router.post('/accept', authenticateToken, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.user.userId;
    
    console.log('✅ Accepting quote:', { quoteId, vendorName, userId });
    
    // Find and verify quote
    const quote = await Quote.findById(quoteId).populate('quoteRequest');
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Update quote status
    quote.status = 'accepted';
    quote.acceptedAt = new Date();
    await quote.save();
    
    // Update quote request status
    if (quote.quoteRequest) {
      quote.quoteRequest.status = 'accepted';
      await quote.quoteRequest.save();
    }
    
    res.json({
      success: true,
      message: `Quote from ${vendorName} accepted successfully`
    });
    
  } catch (error) {
    console.error('❌ Error accepting quote:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept quote',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/quotes/contact - Contact vendor about a quote
router.post('/contact', authenticateToken, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.user.userId;
    
    console.log('📞 Contacting vendor:', { quoteId, vendorName, userId });
    
    // Find and verify quote
    const quote = await Quote.findById(quoteId)
      .populate('quoteRequest')
      .populate('vendor');
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Add contact attempt to quote
    if (!quote.contactAttempts) {
      quote.contactAttempts = [];
    }
    
    quote.contactAttempts.push({
      contactedAt: new Date(),
      contactedBy: userId,
      method: 'platform_request'
    });
    
    await quote.save();
    
    res.json({
      success: true,
      message: `Contact request sent to ${vendorName}`
    });
    
  } catch (error) {
    console.error('❌ Error contacting vendor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to contact vendor',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// LEGACY ROUTE SUPPORT - for backward compatibility with your existing frontend

// POST /api/quotes/request - Alternative endpoint for quote request creation
router.post('/request', async (req, res) => {
  // Redirect to the new endpoint
  req.url = '/requests';
  router.handle(req, res);
});

// GET /api/quotes - Alternative endpoint for getting quotes
router.get('/', authenticateToken, async (req, res) => {
  try {
    // If no specific ID requested, return user's quotes
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;
    
    const quotes = await Quote.find({
      $or: [
        { 'quoteRequest.userId': userId },
        { 'quoteRequest.submittedBy': userId }
      ]
    })
    .populate('quoteRequest')
    .populate('product')
    .populate('vendor')
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit))
    .lean();
    
    res.json({
      success: true,
      quotes,
      count: quotes.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching quotes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes'
    });
  }
});

export default router;
