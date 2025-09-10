// routes/quoteRoutes.js - Complete quote management with AI matching
import express from 'express';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import AIEngineAdapter from '../services/aiEngineAdapter.js';
import userAuth from '../middleware/userAuth.js';
import logger from '../services/logger.js';

const router = express.Router();

// POST /api/quotes/requests - Create new quote request and trigger AI matching
router.post('/requests', userAuth, async (req, res) => {
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
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: companyName, email, and monthlyVolume are required',
        code: 'QUOTE_001'
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
      error: 'INTERNAL_ERROR',
      message: 'Failed to create quote request',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_002'
    });
  }
});

// POST /api/quotes/request-selected - Submit quote requests to selected vendors
router.post('/request-selected', userAuth, async (req, res) => {
  try {
    const {
      quoteId,
      userId,
      selectedVendors,
      companyName,
      serviceType,
      category,
      description,
      budget,
      timeline,
      requirements
    } = req.body;

    console.log('📤 Processing quote request for selected vendors:', {
      quoteId,
      userId,
      vendorCount: selectedVendors?.length,
      companyName,
      serviceType
    });

    // Validation
    if (!userId || !selectedVendors || !Array.isArray(selectedVendors) || selectedVendors.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User ID and selected vendors are required'
      });
    }

    if (selectedVendors.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 vendors can be selected at once'
      });
    }

    const results = [];
    const createdRequests = [];

    // Create quote request for each selected vendor
    for (const vendorId of selectedVendors) {
      try {
        // Create a new quote request for each vendor
        const quoteRequestData = {
          companyName: companyName || 'Unknown Company',
          contactName: 'Contact via Platform',
          email: req.user.email || 'noreply@tendorai.com',
          industryType: 'Various',
          serviceType: serviceType || 'Photocopiers',
          monthlyVolume: {
            mono: 1000,
            colour: 500,
            total: 1500
          },
          budget: {
            maxLeasePrice: budget || 300,
            preferredTerm: '60 months',
            includeService: true
          },
          requirements: {
            priority: 'cost',
            essentialFeatures: requirements || []
          },
          submittedBy: userId,
          userId: userId,
          status: 'vendor_requested',
          vendorRequested: vendorId,
          originalQuoteId: quoteId,
          
          // Additional metadata
          requestType: 'vendor_selection',
          selectedVendors: selectedVendors,
          
          // Timeline
          urgency: {
            timeframe: timeline || '3-6 months'
          },
          
          // AI Analysis placeholder
          aiAnalysis: {
            processed: false,
            suggestedCategories: [],
            riskFactors: [],
            recommendations: []
          },
          
          // System fields
          submissionSource: 'vendor_selection',
          quotes: [],
          internalNotes: [`Request sent to specific vendor: ${vendorId}`]
        };

        const quoteRequest = new QuoteRequest(quoteRequestData);
        const savedRequest = await quoteRequest.save();
        
        createdRequests.push(savedRequest);
        results.push({
          vendorId: vendorId,
          success: true,
          quoteRequestId: savedRequest._id
        });

        console.log(`✅ Quote request created for vendor: ${vendorId}`);

      } catch (error) {
        console.error(`❌ Failed to create quote request for vendor ${vendorId}:`, error);
        results.push({
          vendorId: vendorId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`✅ Quote request processing complete: ${successCount} successful, ${failureCount} failed`);

    res.status(201).json({
      success: true,
      message: `Quote requests sent to ${successCount} vendors${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
      data: {
        summary: {
          total: selectedVendors.length,
          successful: successCount,
          failed: failureCount
        },
        results: results,
        createdRequests: createdRequests.map(req => ({
          id: req._id,
          vendorId: req.vendorRequested,
          status: req.status,
          submittedAt: req.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error processing quote requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process quote requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/quotes/requests - Get quote requests for user (with proper filtering)
router.get('/requests', userAuth, async (req, res) => {
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
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quote requests',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_003'
    });
  }
});

// POST /api/quotes/retry-matching/:requestId - Retry AI matching for a specific request
router.post('/retry-matching/:requestId', userAuth, async (req, res) => {
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
        error: 'NOT_FOUND',
        message: 'Quote request not found',
        code: 'QUOTE_004'
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
        error: 'NO_MATCHES',
        message: 'No suitable matches found',
        quotesCount: 0,
        code: 'QUOTE_005'
      });
    }
    
  } catch (error) {
    console.error('❌ Error retrying AI matching:', error);
    res.status(500).json({
      success: false,
      error: 'RETRY_ERROR',
      message: 'Failed to retry matching',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_006'
    });
  }
});

// GET /api/quotes/:id - Get specific quote details
router.get('/:id', userAuth, async (req, res) => {
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
        error: 'NOT_FOUND',
        message: 'Quote not found',
        code: 'QUOTE_007'
      });
    }
    
    // Verify user has access to this quote
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied',
        code: 'QUOTE_008'
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
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quote details',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_009'
    });
  }
});

// POST /api/quotes/accept - Accept a quote
router.post('/accept', userAuth, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.user.userId;
    
    console.log('✅ Accepting quote:', { quoteId, vendorName, userId });
    
    // Validate required fields
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_010'
      });
    }
    
    // Find and verify quote
    const quote = await Quote.findById(quoteId).populate('quoteRequest');
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
        code: 'QUOTE_011'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied',
        code: 'QUOTE_012'
      });
    }
    
    // Check if quote is already accepted
    if (quote.status === 'accepted') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ACCEPTED',
        message: 'Quote has already been accepted',
        code: 'QUOTE_013'
      });
    }
    
    // Update quote status
    quote.status = 'accepted';
    quote.acceptedAt = new Date();
    quote.acceptedBy = userId;
    await quote.save();
    
    // Update quote request status
    if (quote.quoteRequest) {
      quote.quoteRequest.status = 'accepted';
      quote.quoteRequest.acceptedQuote = quoteId;
      await quote.quoteRequest.save();
    }
    
    res.json({
      success: true,
      message: `Quote from ${vendorName || 'vendor'} accepted successfully`,
      quote: {
        id: quote._id,
        status: quote.status,
        acceptedAt: quote.acceptedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error accepting quote:', error);
    res.status(500).json({
      success: false,
      error: 'ACCEPT_ERROR',
      message: 'Failed to accept quote',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_014'
    });
  }
});

// POST /api/quotes/contact - Contact vendor about a quote
router.post('/contact', userAuth, async (req, res) => {
  try {
    const { quoteId, vendorName, message } = req.body;
    const userId = req.user.userId;
    
    console.log('📞 Contacting vendor:', { quoteId, vendorName, userId });
    
    // Validate required fields
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_015'
      });
    }
    
    // Find and verify quote
    const quote = await Quote.findById(quoteId)
      .populate('quoteRequest')
      .populate('vendor');
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
        code: 'QUOTE_016'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId === userId || 
                     quote.quoteRequest?.submittedBy === userId;
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied',
        code: 'QUOTE_017'
      });
    }
    
    // Add contact attempt to quote
    if (!quote.contactAttempts) {
      quote.contactAttempts = [];
    }
    
    quote.contactAttempts.push({
      contactedAt: new Date(),
      contactedBy: userId,
      method: 'platform_request',
      message: message || 'Customer inquiry via platform',
      status: 'pending'
    });
    
    await quote.save();
    
    res.json({
      success: true,
      message: `Contact request sent to ${vendorName || 'vendor'}`,
      contactAttempt: {
        timestamp: new Date(),
        method: 'platform_request'
      }
    });
    
  } catch (error) {
    console.error('❌ Error contacting vendor:', error);
    res.status(500).json({
      success: false,
      error: 'CONTACT_ERROR',
      message: 'Failed to contact vendor',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_018'
    });
  }
});

// LEGACY ROUTE SUPPORT - for backward compatibility with your existing frontend

// POST /api/quotes/request - Alternative endpoint for quote request creation
router.post('/request', userAuth, async (req, res) => {
  // Redirect to the new endpoint by calling the handler directly
  const originalUrl = req.url;
  req.url = '/requests';
  
  // Call the requests handler
  const requestsHandler = router.stack.find(layer => 
    layer.route && layer.route.path === '/requests' && layer.route.methods.post
  );
  
  if (requestsHandler) {
    requestsHandler.route.stack[1].handle(req, res);
  } else {
    res.status(500).json({
      success: false,
      error: 'ROUTE_ERROR',
      message: 'Legacy route handler not found',
      code: 'QUOTE_019'
    });
  }
});

// GET /api/quotes - Alternative endpoint for getting quotes
router.get('/', userAuth, async (req, res) => {
  try {
    // If no specific ID requested, return user's quotes
    const userId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;
    
    console.log('🔍 Fetching quotes for user:', userId);
    
    // Build query to find quotes belonging to user's quote requests
    const userQuoteRequests = await QuoteRequest.find({
      $or: [
        { userId: userId },
        { submittedBy: userId }
      ]
    }).select('_id').lean();
    
    const quoteRequestIds = userQuoteRequests.map(qr => qr._id);
    
    const query = {
      quoteRequest: { $in: quoteRequestIds }
    };
    
    // Add status filter if provided
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const quotes = await Quote.find(query)
      .populate('quoteRequest')
      .populate('product')
      .populate('vendor')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    const total = await Quote.countDocuments(query);
    
    res.json({
      success: true,
      quotes,
      count: quotes.length,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching quotes:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_020'
    });
  }
});

export default router;
