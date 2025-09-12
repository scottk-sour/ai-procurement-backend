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

// Small helper so logger fallback to console if a method is missing
const log = {
  info: (...args) => (logger && logger.info ? logger.info(...args) : console.log(...args)),
  warn: (...args) => (logger && logger.warn ? logger.warn(...args) : console.warn(...args)),
  error: (...args) => (logger && logger.error ? logger.error(...args) : console.error(...args)),
};

/**
 * Validation helper
 * Throws Error if required missing
 */
const validateRequiredFields = (fields, data) => {
  const missing = fields.filter(field => {
    // allow numeric 0 value but treat undefined/null/'' as missing
    const v = data?.[field];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
};

/**
 * POST /api/quotes/request
 * Create a new quote request
 */
router.post('/request', userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    log.info('Create quote request for user:', userId);

    // Extract fields (keep backward-compatible names)
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

    // Basic validation
    validateRequiredFields(['companyName', 'email'], req.body);

    // Build quoteRequestData (defensive parsing)
    const quoteRequestData = {
      companyName,
      contactName: contactName || 'Not provided',
      email,
      industryType: industryType || 'Other',
      numEmployees: parseInt(numEmployees) || 1,
      numLocations: parseInt(numLocations) || 1,
      serviceType,
      monthlyVolume: {
        mono: parseInt(monthlyVolume?.mono) || 0,
        colour: parseInt(monthlyVolume?.colour) || 0,
        total: parseInt(monthlyVolume?.total) || (parseInt(monthlyVolume?.mono) || 0) + (parseInt(monthlyVolume?.colour) || 0)
      },
      paperRequirements: paperRequirements || {
        primarySize: type || 'A4',
        additionalSizes: [],
        specialPaper: false,
        specialPaperTypes: []
      },
      currentSetup: currentSetup || {
        machineAge: '2-5 years',
        currentCosts: {},
        painPoints: []
      },
      requirements: requirements || {
        priority: 'balanced',
        essentialFeatures: [],
        niceToHaveFeatures: [],
        environmentalConcerns: false
      },
      budget: budget || {
        maxLeasePrice: parseInt(price) || 300,
        preferredTerm: '60 months',
        includeService: true,
        includeConsumables: true
      },
      urgency: urgency || {
        timeframe: urgencyLevel === 'Critical' ? 'Immediately' : '3-6 months'
      },
      location: location || {
        postcode: 'Not specified'
      },
      aiAnalysis: {
        processed: false,
        suggestedCategories: [],
        riskFactors: [],
        recommendations: []
      },
      submittedBy: userId,
      userId: userId,
      status: 'pending',
      submissionSource: 'web_form',
      quotes: [],
      internalNotes: [],
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

    log.info('Quote request data prepared:', {
      companyName: quoteRequestData.companyName,
      monthlyVolume: quoteRequestData.monthlyVolume,
      budget: quoteRequestData.budget?.maxLeasePrice
    });

    // Save request
    const quoteRequest = new QuoteRequest(quoteRequestData);
    await quoteRequest.save();
    log.info('Quote request saved:', quoteRequest._id);

    // Trigger AI matching (try/catch to avoid failing request on AI issues)
    let aiMatchingResult = {
      success: false,
      quotesGenerated: 0,
      error: null
    };
    try {
      log.info('Triggering AIEngineAdapter.generateQuotesFromRequest for', quoteRequest._id);
      const quotes = await AIEngineAdapter.generateQuotesFromRequest(quoteRequest, userId);
      if (Array.isArray(quotes) && quotes.length > 0) {
        quoteRequest.quotes = quotes;
        quoteRequest.status = 'matched';
        quoteRequest.aiAnalysis.processed = true;
        quoteRequest.aiAnalysis.recommendations = quotes.map((q, i) => `Generated quote ${i + 1}: ${q}`);
        await quoteRequest.save();
        aiMatchingResult = {
          success: true,
          quotesGenerated: quotes.length,
          error: null
        };
        log.info(`AI matching succeeded: ${quotes.length} quotes for ${quoteRequest._id}`);
      } else {
        aiMatchingResult = {
          success: false,
          quotesGenerated: 0,
          error: 'No suitable matches found'
        };
        quoteRequest.aiAnalysis.riskFactors.push('No immediate matches found - will retry');
        await quoteRequest.save();
        log.warn('AI matching returned no quotes for', quoteRequest._id);
      }
    } catch (aiError) {
      aiMatchingResult = {
        success: false,
        quotesGenerated: 0,
        error: aiError?.message || 'AI matching error'
      };
      quoteRequest.aiAnalysis.riskFactors.push(`AI matching failed: ${aiError?.message || aiError}`);
      await quoteRequest.save();
      log.error('AI matching error for', quoteRequest._id, aiError);
    }

    // Response to client
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

    if (aiMatchingResult.success && (quoteRequest.quotes?.length || 0) > 0) {
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

    log.info('Returning creation response for', quoteRequest._id);
    return res.status(201).json(responseData);
  } catch (error) {
    log.error('Error in POST /request:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create quote request',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_002'
    });
  }
});

/**
 * GET /api/quotes/requests
 * List authenticated user's quote requests (paginated)
 */
router.get('/requests', userAuth, async (req, res) => {
  try {
    const { userId, submittedBy, page = 1, limit = 10 } = req.query;
    const requestingUserId = req.user.userId;
    log.info('Fetch quote requests for', requestingUserId);

    const query = { $or: [{ userId: requestingUserId }, { submittedBy: requestingUserId }] };

    if (userId && userId !== requestingUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }

    const quoteRequests = await QuoteRequest.find(query)
      .populate('quotes')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await QuoteRequest.countDocuments(query);

    return res.json({
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
    log.error('Error fetching quote requests:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quote requests',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_001'
    });
  }
});

/**
 * GET /api/quotes/:id
 * Get specific quote details
 */
router.get('/:id', userAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    log.info('Fetching quote details', id);

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

    return res.json({
      success: true,
      quote
    });
  } catch (error) {
    log.error('Error fetching quote details:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quote details',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_009'
    });
  }
});

/**
 * GET /api/quotes
 * Get quotes for current user (paginated)
 */
router.get('/', userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;
    log.info('Fetch quotes for user', userId, { page, limit, status });

    const userQuoteRequests = await QuoteRequest.find({
      $or: [{ userId }, { submittedBy: userId }]
    }).select('_id').lean();

    const quoteRequestIds = userQuoteRequests.map(q => q._id);

    const query = { quoteRequest: { $in: quoteRequestIds } };
    if (status && status !== 'all') query.status = status;

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

    return res.json({
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
    log.error('Error fetching quotes:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_019'
    });
  }
});

/**
 * POST /api/quotes/contact
 * Contact vendor about a quote (creates contactAttempt & notify vendor)
 */
router.post('/contact', userAuth, async (req, res) => {
  try {
    const { quoteId, vendorName, message } = req.body;
    const userId = req.user.userId;
    log.info('Contact vendor for quote', quoteId, 'by user', userId);

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_015'
      });
    }

    const quote = await Quote.findById(quoteId).populate('quoteRequest').populate('vendor');

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Quote not found',
        code: 'QUOTE_016'
      });
    }

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

    if (!Array.isArray(quote.contactAttempts)) quote.contactAttempts = [];

    quote.contactAttempts.push({
      contactedAt: new Date(),
      contactedBy: userId,
      method: 'platform_request',
      message: message || 'Customer inquiry via platform',
      status: 'pending'
    });

    await quote.save();

    try {
      await notificationService.sendVendorContactRequest?.({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name || vendorName,
        quoteId: quote._id,
        customerName: quote.quoteRequest?.companyName,
        customerMessage: message,
        customerEmail: quote.quoteRequest?.email
      });
    } catch (notificationError) {
      log.warn('Failed to send vendor contact notification:', notificationError);
    }

    return res.json({
      success: true,
      message: `Contact request sent to ${vendorName || 'vendor'}`,
      contactAttempt: {
        timestamp: new Date(),
        method: 'platform_request'
      }
    });
  } catch (error) {
    log.error('Error in /contact:', error);
    return res.status(500).json({
      success: false,
      error: 'CONTACT_ERROR',
      message: 'Failed to contact vendor',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_018'
    });
  }
});

/**
 * GET /api/quotes/user/:userId/latest
 * Return up to 3 latest vendor quotes from user's most recent matched request
 */
router.get('/user/:userId/latest', userAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.userId;

    if (userId !== requestingUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }

    const latestRequest = await QuoteRequest.findOne({
      $or: [{ userId }, { submittedBy: userId }],
      status: 'matched',
      quotes: { $exists: true, $not: { $size: 0 } }
    }).sort({ createdAt: -1 }).populate('quotes').lean();

    if (!latestRequest) {
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

    const quotes = await Quote.find({
      _id: { $in: latestRequest.quotes }
    })
    .populate('vendor')
    .populate('product')
    .limit(3)
    .lean();

    const quotesWithContext = quotes.map(q => ({
      ...q,
      quoteRequestId: latestRequest._id,
      companyName: latestRequest.companyName,
      monthlyVolume: latestRequest.monthlyVolume,
      requestBudget: latestRequest.budget
    }));

    return res.json({
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
    log.error('Error fetching latest quotes:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch latest quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_021'
    });
  }
});

/**
 * POST /api/quotes/accept
 * Accept a quote and create an order
 */
router.post('/accept', userAuth, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.user.userId;
    log.info('Accepting quote', quoteId, 'by user', userId);

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_010'
      });
    }

    const quote = await Quote.findById(quoteId).populate('quoteRequest').populate('vendor').populate('product');

    if (!quote) return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Quote not found',
      code: 'QUOTE_011'
    });

    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() ||
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();

    if (!hasAccess) return res.status(403).json({
      success: false,
      error: 'ACCESS_DENIED',
      message: 'Access denied',
      code: 'QUOTE_012'
    });

    if (quote.status === 'accepted') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ACCEPTED',
        message: 'Quote already accepted',
        code: 'QUOTE_013'
      });
    }

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

    quote.status = 'accepted';
    quote.decisionDetails = {
      acceptedAt: new Date(),
      acceptedBy: userId
    };
    quote.createdOrder = order._id;

    if (!Array.isArray(quote.customerActions)) quote.customerActions = [];

    quote.customerActions.push({
      action: 'accepted',
      timestamp: new Date(),
      notes: `Quote accepted - Order ${order._id} created`
    });

    await quote.save();

    if (quote.quoteRequest) {
      quote.quoteRequest.status = 'completed';
      quote.quoteRequest.acceptedQuote = quoteId;
      await quote.quoteRequest.save();
    }

    try {
      await notificationService.sendQuoteAcceptedNotification?.({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name || vendorName,
        quoteId: quote._id,
        orderId: order._id,
        customerName: quote.quoteRequest?.companyName,
        customerEmail: quote.quoteRequest?.email
      });
    } catch (notificationError) {
      log.warn('Failed to notify vendor after accept:', notificationError);
    }

    log.info('Quote accepted and order created', order._id);

    return res.json({
      success: true,
      message: 'Quote accepted successfully',
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
    log.error('Error accepting quote:', error);
    return res.status(500).json({
      success: false,
      error: 'ACCEPT_ERROR',
      message: 'Failed to accept quote',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_014'
    });
  }
});

/**
 * POST /api/quotes/decline
 * Decline a quote
 */
router.post('/decline', userAuth, async (req, res) => {
  try {
    const { quoteId, reason, notes } = req.body;
    const userId = req.user.userId;
    log.info('Declining quote', quoteId, 'by user', userId);

    if (!quoteId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Quote ID is required',
        code: 'QUOTE_030'
      });
    }

    const quote = await Quote.findById(quoteId).populate('quoteRequest').populate('vendor');

    if (!quote) return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Quote not found',
      code: 'QUOTE_031'
    });

    const hasAccess = quote.quoteRequest?.userId?.toString() === userId.toString() ||
                     quote.quoteRequest?.submittedBy?.toString() === userId.toString();

    if (!hasAccess) return res.status(403).json({
      success: false,
      error: 'ACCESS_DENIED',
      message: 'Access denied',
      code: 'QUOTE_032'
    });

    if (quote.status === 'accepted') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_ACCEPTED',
        message: 'Quote already accepted',
        code: 'QUOTE_033'
      });
    }

    if (quote.status === 'rejected') {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_REJECTED',
        message: 'Quote already rejected',
        code: 'QUOTE_034'
      });
    }

    quote.status = 'rejected';
    quote.decisionDetails = {
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: reason || 'Not specified',
      decisionNotes: notes
    };

    if (!Array.isArray(quote.customerActions)) quote.customerActions = [];

    quote.customerActions.push({
      action: 'rejected',
      timestamp: new Date(),
      notes: reason || 'Quote declined by user'
    });

    await quote.save();

    try {
      await notificationService.sendQuoteDeclinedNotification?.({
        vendorId: quote.vendor._id,
        vendorName: quote.vendor.name,
        quoteId: quote._id,
        customerName: quote.quoteRequest?.companyName,
        reason: reason || 'No reason provided',
        notes
      });
    } catch (notificationError) {
      log.warn('Failed to notify vendor on decline:', notificationError);
    }

    log.info('Quote declined', quoteId);

    return res.json({
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
    log.error('Error declining quote:', error);
    return res.status(500).json({
      success: false,
      error: 'DECLINE_ERROR',
      message: 'Failed to decline quote',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_035'
    });
  }
});

/**
 * GET /api/quotes/user/:userId
 * Get user's generated quotes for comparison (all)
 */
router.get('/user/:userId', userAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - user ID mismatch'
      });
    }

    const quoteRequests = await QuoteRequest.find({
      $or: [{ userId }, { submittedBy: userId }],
      status: 'matched'
    }).populate('quotes').lean();

    const allQuotes = [];
    for (const request of quoteRequests) {
      if (request.quotes && request.quotes.length > 0) {
        const quotes = await Quote.find({
          _id: { $in: request.quotes }
        })
        .populate('vendor')
        .populate('product')
        .lean();

        const withContext = quotes.map(q => ({
          ...q,
          quoteRequestId: request._id,
          companyName: request.companyName,
          monthlyVolume: request.monthlyVolume,
          requestBudget: request.budget
        }));
        allQuotes.push(...withContext);
      }
    }

    return res.json({
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
    log.error('Error fetching user quotes:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: 'Failed to fetch quotes',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'QUOTE_020'
    });
  }
});

export default router;
