import express from 'express';
import QuoteRequest from '../models/QuoteRequest.js';
import Listing from '../models/Listing.js';
import Vendor from '../models/Vendor.js';
import userAuth from '../middleware/userAuth.js';
import jwt from 'jsonwebtoken'; // Add this import
import { OpenAI } from 'openai';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware to verify JWT token (for dashboard endpoints)
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId || decoded.id;
    req.userRole = decoded.role;
    
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Get all quotes for a user
router.get('/user', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    const quotes = await QuoteRequest.find({ userId }).lean();
    console.log('📡 Retrieved Quotes:', quotes.length, 'quotes found');
    res.status(200).json(quotes);
  } catch (error) {
    console.error('Error fetching quotes:', error.message);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
});

// ✅ NEW: GET /api/quotes/requests - For dashboard
router.get('/requests', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.userId;

    console.log(`🔍 Fetching quote requests for user: ${userId}`);

    // Get quote requests from database
    const quoteRequests = await QuoteRequest.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    console.log(`📊 Found ${quoteRequests.length} quote requests`);

    // Transform the data to match frontend expectations
    const transformedRequests = quoteRequests.map(request => ({
      _id: request._id,
      title: `${request.serviceType} Request for ${request.companyName}`,
      companyName: request.companyName,
      industryType: request.industryType,
      serviceType: request.serviceType,
      status: request.status || 'pending',
      createdAt: request.createdAt,
      matches: [], // You can populate this with actual vendor matches later
      monthlyVolume: request.monthlyVolume,
      preference: request.preference,
      // Mock some vendor matches for demo
      ...(request.matchedVendors && request.matchedVendors.length > 0 && {
        matches: [
          {
            _id: 'vendor1',
            vendorName: 'Sharp Business Solutions',
            price: request.price || 150,
            savings: 25
          },
          {
            _id: 'vendor2',
            vendorName: 'Canon Office Equipment', 
            price: (request.price || 150) + 20,
            savings: 10
          }
        ]
      })
    }));

    res.json({
      requests: transformedRequests,
      page: parseInt(page),
      totalPages: Math.ceil(quoteRequests.length / limit),
      total: quoteRequests.length
    });
  } catch (error) {
    console.error('❌ Error fetching quote requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: GET /api/quotes/:id - Get specific quote request
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const quoteRequest = await QuoteRequest.findOne({ 
      _id: id, 
      userId: userId 
    });

    if (!quoteRequest) {
      return res.status(404).json({ message: 'Quote request not found' });
    }

    // Transform data for frontend
    const transformedRequest = {
      _id: quoteRequest._id,
      title: `${quoteRequest.serviceType} Request for ${quoteRequest.companyName}`,
      companyName: quoteRequest.companyName,
      industryType: quoteRequest.industryType,
      serviceType: quoteRequest.serviceType,
      status: quoteRequest.status || 'pending',
      createdAt: quoteRequest.createdAt,
      formData: quoteRequest, // Full form data
      matches: [] // You can populate this with actual vendor matches
    };

    res.json({ quote: transformedRequest });
  } catch (error) {
    console.error('❌ Error fetching quote request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: POST /api/quotes/accept - Accept a quote from vendor
router.post('/accept', verifyToken, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.userId;

    console.log(`✅ User ${userId} accepting quote ${quoteId} from ${vendorName}`);

    // Update the quote status in your database
    await QuoteRequest.findByIdAndUpdate(quoteId, {
      status: 'Vendor Selected',
      preferredVendor: vendorName,
      updatedAt: new Date()
    });

    res.json({
      message: 'Quote accepted successfully',
      quoteId,
      vendorName
    });
  } catch (error) {
    console.error('❌ Error accepting quote:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: POST /api/quotes/contact - Contact a vendor
router.post('/contact', verifyToken, async (req, res) => {
  try {
    const { quoteId, vendorName } = req.body;
    const userId = req.userId;

    console.log(`📞 User ${userId} contacting vendor ${vendorName} for quote ${quoteId}`);

    // In production, you'd send an email or create a contact request
    // For now, just log the interaction

    res.json({
      message: 'Contact request sent successfully',
      quoteId,
      vendorName
    });
  } catch (error) {
    console.error('❌ Error contacting vendor:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create a new quote request and return three quotes
router.post('/request', userAuth, async (req, res) => {
  try {
    let userRequirements, userId;

    // Handle multipart/form-data or JSON body
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      userRequirements = JSON.parse(req.body.userRequirements || '{}');
      userId = req.body.userId || req.user.id;
    } else {
      userRequirements = req.body;
      userId = req.body.userId || req.user.id;
    }

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Validate required fields
    if (!userRequirements.serviceType) {
      return res.status(400).json({ message: 'Service type is required' });
    }

    // Map user requirements to schema fields
    const quoteData = {
      userId,
      serviceType: userRequirements.serviceType || 'Photocopiers',
      companyName: userRequirements.companyName || undefined,
      industryType: userRequirements.industryType || undefined,
      numEmployees: parseInt(userRequirements.numEmployees) || undefined,
      numOfficeLocations: parseInt(userRequirements.numLocations) || undefined,
      multipleFloors: userRequirements.multiFloor === true || userRequirements.multiFloor === 'Yes' || false,
      colour: userRequirements.colour || undefined,
      type: userRequirements.type || undefined,
      minSpeed: parseInt(userRequirements.min_speed) || undefined,
      price: parseInt(userRequirements.max_lease_price) || undefined,
      monthlyVolume: {
        mono: parseInt(userRequirements.monthlyVolume?.mono || userRequirements.monthlyMonoVolume) || 0,
        colour: parseInt(userRequirements.monthlyVolume?.colour || userRequirements.monthlyColorVolume) || 0,
      },
      monthlyPrintVolume: parseInt(userRequirements.monthlyPrintVolume) || undefined,
      annualPrintVolume: parseInt(userRequirements.annualPrintVolume) || undefined,
      currentColourCPC: parseFloat(userRequirements.currentColorCPC) || undefined,
      currentMonoCPC: parseFloat(userRequirements.currentMonoCPC) || undefined,
      quarterlyLeaseCost: parseFloat(userRequirements.quarterlyLeaseCost) || undefined,
      leasingCompany: userRequirements.leasingCompany || undefined,
      serviceProvider: userRequirements.serviceProvider || undefined,
      contractStartDate: userRequirements.contractStartDate
        ? new Date(userRequirements.contractStartDate)
        : undefined,
      contractEndDate: userRequirements.contractEndDate
        ? new Date(userRequirements.contractEndDate)
        : undefined,
      additionalServices: Array.isArray(userRequirements.additionalServices)
        ? userRequirements.additionalServices
        : [],
      paysForScanning: userRequirements.paysForScanning === true || userRequirements.paysForScanning === 'Yes' || false,
      requiredFunctions: Array.isArray(userRequirements.required_functions)
        ? userRequirements.required_functions
        : [],
      preference: userRequirements.preference || undefined,
      status: 'In Progress',
      createdAt: new Date(),
      updatedAt: new Date(),
      matchedVendors: [],
      preferredVendor: '',
    };

    // Filter vendors based on user requirements
    const filterCriteria = {
      services: quoteData.serviceType,
      status: 'active',
    };
    if (quoteData.minSpeed) filterCriteria.minSpeed = { $gte: quoteData.minSpeed };
    if (quoteData.price) filterCriteria.price = { $lte: quoteData.price * 1.1 }; // 10% buffer
    if (quoteData.colour) filterCriteria.colour = quoteData.colour;
    if (quoteData.requiredFunctions?.length) {
      filterCriteria.requiredFunctions = { $all: quoteData.requiredFunctions };
    }
    if (quoteData.monthlyVolume.mono || quoteData.monthlyVolume.colour) {
      const totalVolume = (quoteData.monthlyVolume.mono || 0) + (quoteData.monthlyVolume.colour || 0);
      filterCriteria.dutyCycle = { $gte: totalVolume * 1.2 };
    }
    if (quoteData.industryType) filterCriteria.industries = quoteData.industryType;

    console.log('Filter criteria:', filterCriteria);
    const allVendors = await Vendor.find().lean();
    console.log('All vendors:', allVendors.map((v) => v.name));
    const vendors = await Vendor.find(filterCriteria).lean();
    console.log(`Found ${vendors.length} vendors`, vendors.map((v) => v.name));

    // Create quote request
    const quote = new QuoteRequest(quoteData);

    await quote.save();

    // Use OpenAI to select top 3 vendors
    let recommendedVendors = [];
    if (vendors.length > 0) {
      const prompt = `
        You are an AI procurement expert selecting the best Photocopier vendors.
        User Requirements: ${JSON.stringify(quoteData, null, 2)}
        Available Vendors: ${JSON.stringify(
          vendors.slice(0, 10).map((v) => ({
            id: v._id,
            name: v.name,
            email: v.email,
            minSpeed: v.minSpeed,
            price: v.price,
            colour: v.colour,
            requiredFunctions: v.requiredFunctions,
            dutyCycle: v.dutyCycle,
            industries: v.industries,
          })),
          null,
          2
        )}
        Select 3 vendors based on:
        - Competitive pricing (max £${quoteData.price || 'N/A'})
        - Adequate speed (min ${quoteData.minSpeed || 'N/A'} ppm)
        - Required functions (${quoteData.requiredFunctions?.join(', ') || 'none'})
        - Vendor reputation and service quality
        - Long-term value for the user's industry (${quoteData.industryType || 'N/A'})
        - User preference for ${quoteData.preference || 'cost'}
        Output JSON: {"vendorIds": ["id1", "id2", "id3"]}
      `;
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        });
        const content = completion.choices[0].message.content.trim();
        console.log('AI Response:', content);
        const parsed = JSON.parse(content);
        recommendedVendors = parsed.vendorIds || [];
      } catch (error) {
        console.error('AI error:', error.message);
      }
    }

    // Fallback to top 3 vendors if AI fails or no vendors selected
    if (recommendedVendors.length < 3 && vendors.length > 0) {
      recommendedVendors = vendors.slice(0, 3).map((v) => v._id.toString());
    }

    // Update quote with selected vendors
    quote.preferredVendor = recommendedVendors.join(', ');
    quote.matchedVendors = recommendedVendors;
    await quote.save();
    console.log('📡 New Quote Created with Vendors:', quote);

    // Prepare response with vendor details
    const vendorDetails = vendors
      .filter((v) => recommendedVendors.includes(v._id.toString()))
      .map((v) => ({
        vendorId: v._id,
        name: v.name,
        email: v.email,
      }));

    res.status(201).json({
      message: 'Quote request created successfully',
      quote,
      recommendedVendors: vendorDetails,
    });
  } catch (error) {
    console.error('Error creating quote:', JSON.stringify(error, null, 2));
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      console.error('Validation errors:', messages);
      return res.status(400).json({ message: 'Validation failed', details: messages });
    }
    res.status(500).json({ message: 'Server error while creating quote', details: error.message });
  }
});

// Get vendor quotes by manufacturer from MongoDB listings
router.post('/ai/recommendations', userAuth, async (req, res) => {
  try {
    const { userId, manufacturer } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    const latestQuote = await QuoteRequest.findOne({ userId }).sort({ createdAt: -1 });
    if (!latestQuote) {
      return res.status(404).json({ message: 'No quotes found for this user' });
    }
    const query = {
      speed: { $gte: latestQuote.minSpeed || 0 },
      price: { $lte: latestQuote.price || Infinity },
      requiredFunctions: { $all: latestQuote.requiredFunctions || [] },
    };
    if (manufacturer) query.brand = manufacturer;
    if (latestQuote.colour) query.colour = latestQuote.colour;
    if (latestQuote.type) query.type = latestQuote.type;
    if (latestQuote.monthlyVolume.mono || latestQuote.monthlyVolume.colour) {
      const totalVolume = (latestQuote.monthlyVolume.mono || 0) + (latestQuote.monthlyVolume.colour || 0);
      query.dutyCycle = { $gte: totalVolume * 1.2 };
    }
    if (latestQuote.currentColourCPC) query.colourCPC = { $lte: latestQuote.currentColourCPC };
    if (latestQuote.currentMonoCPC) query.monoCPC = { $lte: latestQuote.currentMonoCPC };

    const vendorQuotes = await Listing.find(query)
      .populate('vendor', 'name email')
      .limit(3);
    console.log(`📡 Fetching ${manufacturer || 'any'} vendor recommendations for userId:`, userId);
    console.log('🧠 Matched Vendor Quotes:', vendorQuotes);

    if (vendorQuotes.length === 0) {
      return res.status(404).json({ message: `No matching ${manufacturer || 'vendor'} quotes found` });
    }
    const recommendations = vendorQuotes.map((v) => ({
      vendor: v.vendor?.name || 'Unknown Vendor',
      price: v.price,
      speed: v.speed,
      website: v.website || 'N/A',
      brand: v.brand,
      type: v.type,
      colour: v.colour,
      monoCPC: v.monoCPC,
      colourCPC: v.colourCPC,
    }));
    res.status(200).json(recommendations);
  } catch (error) {
    console.error('Error fetching vendor recommendations:', error.message);
    res.status(500).json({ message: 'Server error', details: error.message });
  }
});

// Handle user selecting a vendor quote
router.post('/request-selected', userAuth, async (req, res) => {
  try {
    console.log('🔍 Received request-selected API call with data:', req.body);
    if (!req.body.selectedVendors || !Array.isArray(req.body.selectedVendors)) {
      return res.status(400).json({ message: "Invalid request: 'selectedVendors' is required and must be an array." });
    }
    const { selectedVendors, quoteId } = req.body;
    if (!quoteId) {
      return res.status(400).json({ message: 'Quote ID is required' });
    }
    const updatedQuote = await QuoteRequest.findByIdAndUpdate(
      quoteId,
      { preferredVendor: selectedVendors[0], status: 'Vendor Selected' },
      { new: true }
    );
    if (!updatedQuote) {
      return res.status(404).json({ message: 'Quote not found' });
    }
    console.log('✅ Quote updated successfully:', updatedQuote);
    return res.status(200).json({ message: 'Selected vendor(s) updated successfully!', updatedQuote });
  } catch (error) {
    console.error('❌ Error processing request-selected:', error.message);
    res.status(500).json({ message: 'Internal Server Error', details: error.message });
  }
});

export default router;