// routes/quoteRoutes.js - Complete quote management with accept/decline functionality
import express from 'express';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import Order from '../models/Order.js';
import AIEngineAdapter from '../services/aiEngineAdapter.js';
import notificationService from '../services/notificationService.js';
import userAuth from '../middleware/userAuth.js';
import logger from '../services/logger.js';

const router = express.Router();

// Validation helper
const validateRequiredFields = (fields, data) => {
  const missing = fields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
};

// POST /api/quotes/request - Frontend-compatible quote request submission endpoint
router.post('/request', userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('📝 Creating new quote request (via /request endpoint) for user:', userId);
    
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
    validateRequiredFields(['companyName', 'email'], req.body);

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
        mono: parseInt(monthlyVolume?.mono) || 0,
        colour: parseInt(monthlyVolume?.colour) || 0,
        total: parseInt(monthlyVolume?.total) || (parseInt(monthlyVolume?.mono) || 0) + (parseInt(monthlyVolume?.colour) || 0)
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
        priority: 'balanced',
        essentialFeatures: [],
        niceToHaveFeatures: [],
        environmentalConcerns: false
      },
      
      // Budget information
      budget: budget || {
        maxLeasePrice: parseInt(price) || 300,
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
      userId: userId,
      status: 'pending',
      submissionSource: 'web_form',
      quotes: [],
      internalNotes: [],
      
      // Additional fields from your enhanced form
      numOfficeLocations,
      multipleFloors: multipleFloors || multiFloor,
      price: parseInt(price) || 0,
      type,
      annualRevenue,
      officeBasedEmployees: parseInt(officeBasedEmployees) || 0,
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
      .populate('createdOrder')
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
    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() || 
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();
    
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

// GET /api/quotes - Get quotes for user
router.get('/', userAuth, async (req, res) => {
  try {
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
      .populate('createdOrder')
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
      code: 'QUOTE_019'
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
    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() || 
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();
    
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
    
    // Send notification to vendor
    try {
      await notificationService.sendVendorContactRequest({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name || vendorName,
        quoteId: quote._id,
        customerName: quote.quoteRequest?.companyName,
        customerMessage: message,
        customerEmail: quote.quoteRequest?.email
      });
    } catch (notificationError) {
      console.error('⚠️ Failed to send vendor notification:', notificationError);
    }
    
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

export default router;
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

// GET /api/quotes/requests - Get user's quote requests 
router.get('/requests', userAuth, async (req, res) => {
  try {
    const { userId, submittedBy, page = 1, limit = 10 } = req.query;
    const requestingUserId = req.user.userId;
    
    console.log('🔍 Fetching quote requests:', { userId, submittedBy, requestingUserId });
    
    // Build query for user's quote requests
    const query = {
      $or: [
        { userId: requestingUserId },
        { submittedBy: requestingUserId }
      ]
    };
    
    // If specific user ID is provided, ensure it matches the authenticated user
    if (userId && userId !== requestingUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }
    
    const quoteRequests = await QuoteRequest.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();
    
    const total = await QuoteRequest.countDocuments(query);
    
    console.log(`✅ Found ${quoteRequests.length} quote requests for user ${requestingUserId}`);
    
    res.json({
      success: true,
      quoteRequests,
      count: quoteRequests.length,
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
      code: 'QUOTE_001'
    });
  }
});

// GET /api/quotes/user/:userId/latest - Get user's most recent quote request quotes (max 3)
router.get('/user/:userId/latest', userAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🔍 Fetching latest quotes for user:', userId);
    
    // Validate user access
    if (userId !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }
    
    // Find the most recent quote request with quotes
    const latestRequest = await QuoteRequest.findOne({
      $or: [
        { userId: userId },
        { submittedBy: userId }
      ],
      status: 'matched',
      quotes: { $exists: true, $not: { $size: 0 } }
    }).sort({ createdAt: -1 }).populate('quotes').lean();
    
    if (!latestRequest) {
      console.log('📭 No quote requests with quotes found for user:', userId);
      return res.json({ 
        success: true, 
        quotes: [], 
        count: 0,
        message: 'No quotes found',
        metadata: {
          timestamp: new Date().toISOString(),
          requestedBy: userId,
          recommendationType: 'latest_quotes'
        }
      });
    }
    
    console.log(`📋 Found latest request: ${latestRequest._id} with ${latestRequest.quotes.length} quotes`);
    
    // Get the quotes from the latest request, limited to 3
    const quotes = await Quote.find({ 
      _id: { $in: latestRequest.quotes } 
    })
    .populate('vendor')
    .populate('product')
    .limit(3) // Limit to exactly 3 quotes
    .lean();
    
    // Add request context to each quote
    const quotesWithContext = quotes.map(quote => ({
      ...quote,
      quoteRequestId: latestRequest._id,
      companyName: latestRequest.companyName,
      monthlyVolume: latestRequest.monthlyVolume,
      requestBudget: latestRequest.budget
    }));
    
    console.log(`✅ Returning ${quotesWithContext.length} latest quotes for user ${userId}`);
    
    res.json({ 
      success: true, 
      quotes: quotesWithContext, 
      count: quotesWithContext.length,
      metadata: {
        timestamp: new Date().toISOString(),
        requestedBy: userId,
        latestRequestId: latestRequest._id,
        latestRequestDate: latestRequest.createdAt,
        companyName: latestRequest.companyName,
        totalQuotesInRequest: latestRequest.quotes.length,
        returnedCount: quotesWithContext.length,
        aiPowered: true,
        recommendationType: 'latest_quotes'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching latest quotes:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch latest quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_021'
    });
  }
});

// POST /api/quotes/accept - Accept a quote and create order
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
    const quote = await Quote.findById(quoteId)
      .populate('quoteRequest')
      .populate('vendor')
      .populate('product');
    
    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
        code: 'QUOTE_011'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() || 
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();
    
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
    
    // Create Order when quote is accepted
    const orderData = {
      vendor: quote.vendor._id,
      user: userId,
      items: [{
        product: quote.productSummary?.model || 'Copier/Printer',
        quantity: 1,
        price: quote.costs?.monthlyCosts?.totalMonthlyCost || quote.costs?.machineCost || 0
      }],
      totalPrice: quote.costs?.monthlyCosts?.totalMonthlyCost || quote.costs?.machineCost || 0,
      status: 'Pending',
      quoteReference: quoteId,
      orderType: 'quote_acceptance',
      orderDetails: {
        contactPerson: quote.quoteRequest?.contactName,
        specialInstructions: `Order created from accepted quote ${quoteId}`
      },
      payment: {
        method: 'lease',
        paymentFrequency: 'quarterly'
      }
    };
    
    const order = new Order(orderData);
    await order.save();
    
    // Update quote status with order reference
    quote.status = 'accepted';
    quote.decisionDetails = {
      acceptedAt: new Date(),
      acceptedBy: userId
    };
    quote.createdOrder = order._id;
    
    // Add to customer actions
    if (!quote.customerActions) {
      quote.customerActions = [];
    }
    
    quote.customerActions.push({
      action: 'accepted',
      timestamp: new Date(),
      notes: `Quote accepted - Order ${order._id} created`
    });
    
    await quote.save();
    
    // Update quote request status
    if (quote.quoteRequest) {
      quote.quoteRequest.status = 'completed';
      quote.quoteRequest.acceptedQuote = quoteId;
      await quote.quoteRequest.save();
    }
    
    // Send notification to vendor
    try {
      await notificationService.sendQuoteAcceptedNotification({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name || vendorName,
        quoteId: quote._id,
        orderId: order._id,
        customerName: quote.quoteRequest?.companyName,
        customerEmail: quote.quoteRequest?.email
      });
    } catch (notificationError) {
      console.error('⚠️ Failed to send vendor notification:', notificationError);
      // Don't fail the whole request if notification fails
    }
    
    console.log(`✅ Quote ${quoteId} accepted, Order ${order._id} created`);
    
    res.json({
      success: true,
      message: `Quote from ${vendorName || quote.vendor?.name || 'vendor'} accepted successfully`,
      quote: {
        id: quote._id,
        status: quote.status,
        acceptedAt: quote.decisionDetails.acceptedAt
      },
      order: {
        id: order._id,
        status: order.status,
        totalPrice: order.totalPrice
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

// POST /api/quotes/decline - Decline a quote
router.post('/decline', userAuth, async (req, res) => {
  try {
    const { quoteId, reason, notes } = req.body;
    const userId = req.user.userId;
    
    console.log('❌ Declining quote:', { quoteId, userId, reason });
    
    // Validate required fields
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_030'
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
        code: 'QUOTE_031'
      });
    }
    
    // Verify user owns the quote request
    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() || 
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Access denied',
        code: 'QUOTE_032'
      });
    }
    
    // Check if quote is already processed
    if (quote.status === 'accepted') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ACCEPTED',
        message: 'Quote has already been accepted',
        code: 'QUOTE_033'
      });
    }
    
    if (quote.status === 'rejected') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_REJECTED',
        message: 'Quote has already been rejected',
        code: 'QUOTE_034'
      });
    }
    
    // Update quote status
    quote.status = 'rejected';
    quote.decisionDetails = {
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: reason || 'Not specified',
      decisionNotes: notes
    };
    
    // Add to customer actions
    if (!quote.customerActions) {
      quote.customerActions = [];
    }
    
    quote.customerActions.push({
      action: 'rejected',
      timestamp: new Date(),
      notes: reason || 'Quote declined by user'
    });
    
    await quote.save();
    
    // Send notification to vendor
    try {
      await notificationService.sendQuoteDeclinedNotification({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name,
        quoteId: quote._id,
        customerName: quote.quoteRequest?.companyName,
        reason: reason || 'No reason provided',
        notes: notes
      });
    } catch (notificationError) {
      console.error('⚠️ Failed to send vendor notification:', notificationError);
      // Don't fail the whole request if notification fails
    }
    
    console.log(`✅ Quote ${quoteId} declined by user ${userId}`);
    
    res.json({
      success: true,
      message: 'Quote declined successfully',
      quote: {
        id: quote._id,
        status: quote.status,
        rejectedAt: quote.decisionDetails.rejectedAt,
        reason: quote.decisionDetails.rejectionReason
      }
    });
    
  } catch (error) {
    console.error('❌ Error declining quote:', error);
    res.status(500).json({
      success: false,
      error: 'DECLINE_ERROR',
      message: 'Failed to decline quote',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_035'
    });
  }
});

// GET /api/quotes/user/:userId - Get user's generated quotes for comparison
router.get('/user/:userId', userAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🔍 Fetching user quotes for:', userId);
    
    // Validate user access
    if (userId !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }
    
    // Find quote requests for this user
    const quoteRequests = await QuoteRequest.find({
      $or: [
        { userId: userId },
        { submittedBy: userId }
      ],
      status: 'matched' // Only get requests that have quotes
    }).populate('quotes').lean();
    
    console.log(`📋 Found ${quoteRequests.length} quote requests with quotes`);
    
    // Extract all quotes from all requests
    const allQuotes = [];
    for (const request of quoteRequests) {
      if (request.quotes && request.quotes.length > 0) {
        // Get the actual quote documents
        const quotes = await Quote.find({ 
          _id: { $in: request.quotes } 
        })
        .populate('vendor')
        .populate('product')
        .lean();
        
        // Add request context to each quote
        const quotesWithContext = quotes.map(quote => ({
          ...quote,
          quoteRequestId: request._id,
          companyName: request.companyName,
          monthlyVolume: request.monthlyVolume,
          requestBudget: request.budget
        }));
        
        allQuotes.push(...quotesWithContext);
      }
    }
    
    console.log(`✅ Returning ${allQuotes.length} quotes for comparison`);
    
    res.json({ 
      success: true,
      quotes: allQuotes,
      count: allQuotes.length,
      metadata: {
        timestamp: new Date().toISOString(),
        requestedBy: userId,
        quoteRequestsFound: quoteRequests.length,
        aiPowered: true,
        recommendationType: 'user_generated_quotes'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching user quotes:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_020'
    });
  }
});

// POST /api/quotes/requests - Create new quote request and trigger AI matching (alternative endpoint)
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
    validateRequiredFields(['companyName', 'email', 'monthlyVolume'], req.body);

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
