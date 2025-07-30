// routes/vendorUploadRoutes.js - Complete vendor routes with auth + upload
import express from "express";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from "fs";
import path from "path";
import rateLimit from 'express-rate-limit';
import { isValidObjectId } from 'mongoose';
import vendorAuth from "../middleware/vendorAuth.js";
import upload from "../middleware/csvUpload.js";
import Vendor from "../models/Vendor.js";
import VendorProduct from "../models/VendorProduct.js";
import VendorActivity from "../models/VendorActivity.js";
import CopierQuoteRequest from "../models/CopierQuoteRequest.js";
import CopierListing from "../models/CopierListing.js"; // Keep for backward compatibility
import AIRecommendationEngine from "../services/aiRecommendationEngine.js";
import { importVendorProducts, VendorUploadValidator } from "../controllers/vendorProductImportController.js";

const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  console.error('❌ ERROR: Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many signup attempts. Please try again later.',
});

const recommendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many recommendation requests. Please try again later.',
});

// ===== VENDOR AUTHENTICATION ROUTES =====

// Vendor signup
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, password, company, services = ['Photocopiers'] } = req.body;
    if (!name || !email || !password || !company) {
      return res.status(400).json({ message: 'Name, email, password, and company are required.' });
    }
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) return res.status(400).json({ message: 'Vendor already exists.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newVendor = new Vendor({
      name,
      email,
      password: hashedPassword,
      company,
      services,
      uploads: [],
      machines: [],
      status: 'active',
    });
    await newVendor.save();

    await VendorActivity.create({
      vendorId: newVendor._id,
      type: 'signup',
      description: 'Vendor account created',
    });

    res.status(201).json({ message: 'Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Vendor login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign(
      { vendorId: vendor._id.toString(), email: vendor.email, role: 'vendor' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    await VendorActivity.create({
      vendorId: vendor._id,
      type: 'login',
      description: 'Vendor logged in',
    });

    res.json({
      token,
      vendorId: vendor._id.toString(),
      vendorName: vendor.name,
      message: 'Vendor login successful.',
    });
  } catch (error) {
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Token verification
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.vendorId) return res.status(401).json({ message: 'Invalid token payload.' });

    const vendor = await Vendor.findById(decoded.vendorId).select('-password');
    if (!vendor) return res.status(401).json({ message: 'Invalid token.' });

    res.json({
      message: 'Token is valid',
      vendor: {
        vendorId: vendor._id,
        vendorName: vendor.name,
        email: vendor.email,
      },
    });
  } catch (error) {
    console.error('❌ Vendor token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

// Vendor profile
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    res.status(200).json({
      vendor: {
        vendorId: vendor._id,
        name: vendor.name,
        email: vendor.email,
        company: vendor.company,
        services: vendor.services,
        status: vendor.status,
        uploads: vendor.uploads,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching vendor profile:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Uploaded files
router.get('/uploaded-files', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    const startIndex = (page - 1) * limit;
    const files = (vendor.uploads || []).slice(startIndex, startIndex + parseInt(limit));
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching vendor files:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Recent activity
router.get('/recent-activity', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const activities = await VendorActivity.find({ vendorId: req.vendorId })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.status(200).json({ activities });
  } catch (error) {
    console.error('❌ Error fetching vendor activity:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Vendor notifications
router.get('/notifications', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    // Get recent quote requests that might be relevant to this vendor
    const recentQuotes = await CopierQuoteRequest.find({
      status: { $in: ['pending', 'active'] }
    })
    .sort({ createdAt: -1 })
    .limit(10);

    // Get recent vendor activities
    const recentActivities = await VendorActivity.find({ vendorId: req.vendorId })
      .sort({ date: -1 })
      .limit(10);

    // Create notifications array
    const notifications = [];

    // Add quote-based notifications
    recentQuotes.forEach(quote => {
      notifications.push({
        id: `quote-${quote._id}`,
        type: 'quote_opportunity',
        title: 'New Quote Opportunity',
        message: `New quote request for ${quote.copierType || 'equipment'} - ${quote.monthlyVolume || 'N/A'} pages/month`,
        timestamp: quote.createdAt,
        isRead: false,
        priority: 'medium',
        data: {
          quoteId: quote._id,
          companyName: quote.companyName,
          location: quote.location
        }
      });
    });

    // Add activity-based notifications
    recentActivities.forEach(activity => {
      if (activity.type === 'login') return; // Skip login activities for notifications
      
      notifications.push({
        id: `activity-${activity._id}`,
        type: 'activity',
        title: 'Account Activity',
        message: activity.description,
        timestamp: activity.date,
        isRead: true, // Mark activities as read
        priority: 'low',
        data: {
          activityType: activity.type
        }
      });
    });

    // Sort by timestamp and apply pagination
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const startIndex = (page - 1) * limit;
    const paginatedNotifications = notifications.slice(startIndex, startIndex + parseInt(limit));

    res.status(200).json({
      success: true,
      notifications: paginatedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length,
        hasMore: startIndex + parseInt(limit) < notifications.length
      },
      stats: {
        unreadCount: notifications.filter(n => !n.isRead).length,
        totalCount: notifications.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching vendor notifications:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error.',
      error: error.message 
    });
  }
});

// Mark notification as read
router.patch('/notifications/:notificationId/read', vendorAuth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notificationId
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error.',
      error: error.message 
    });
  }
});

// AI recommendations
router.get('/recommend', recommendLimiter, async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ message: 'Missing userId in query.' });
    if (!isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId format.' });

    const quotes = await CopierQuoteRequest.find({ userId }).sort({ createdAt: -1 });
    if (!quotes.length) return res.status(404).json({ message: 'No quote requests found for this user.' });

    const recommendations = await AIRecommendationEngine.generateRecommendations(
      quotes[0],
      userId,
      []
    );

    res.status(200).json({ recommendations });
  } catch (error) {
    console.error('❌ Error in /recommend endpoint:', error.message);
    res.status(500).json({ message: 'Failed to get AI recommendations.', error: error.message });
  }
});

// ===== VENDOR UPLOAD & PRODUCT MANAGEMENT ROUTES =====

// Apply auth middleware to all upload/product routes
router.use(vendorAuth);

/**
 * POST /api/vendors/upload
 * Enhanced upload with validation for VendorProduct model
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No file uploaded.",
        errors: ["Please select a CSV or Excel file to upload"]
      });
    }

    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized",
        errors: ["Vendor authentication required"]
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ 
        success: false,
        message: "Vendor not found.",
        errors: ["Invalid vendor ID"]
      });
    }

    const filePath = req.file.path.replace(/\\/g, "/");
    const fileName = req.file.filename;
    const fileExtension = path.extname(fileName).toLowerCase();

    // Validate file type
    if (!['.csv', '.xlsx', '.xls'].includes(fileExtension)) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "Invalid file type.",
        errors: ["Please upload a CSV or Excel (.xlsx, .xls) file"]
      });
    }

    // Record the upload attempt
    await Vendor.updateOne(
      { _id: vendor._id },
      {
        $push: {
          uploads: {
            fileName,
            filePath,
            fileType: fileExtension.substring(1), // Remove the dot
            uploadDate: new Date(),
            status: 'processing'
          },
        },
      }
    );

    try {
      // Use enhanced import function with validation
      const result = await importVendorProducts(filePath, vendorId);

      // Update upload status
      await Vendor.updateOne(
        { _id: vendor._id, 'uploads.fileName': fileName },
        {
          $set: {
            'uploads.$.status': result.success ? 'completed' : 'failed',
            'uploads.$.processedAt': new Date(),
            'uploads.$.results': {
              total: result.stats?.total || 0,
              saved: result.stats?.saved || 0,
              errors: result.errors?.length || 0,
              warnings: result.warnings?.length || 0
            }
          }
        }
      );

      // Clean up uploaded file after processing
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (result.success) {
        res.status(201).json({
          success: true,
          message: `Successfully processed ${result.savedProducts} products`,
          data: {
            savedProducts: result.savedProducts,
            warnings: result.warnings,
            stats: result.stats
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: "File processing failed",
          errors: result.errors,
          warnings: result.warnings,
          stats: result.stats
        });
      }

    } catch (processingError) {
      // Update upload status to failed
      await Vendor.updateOne(
        { _id: vendor._id, 'uploads.fileName': fileName },
        {
          $set: {
            'uploads.$.status': 'failed',
            'uploads.$.processedAt': new Date(),
            'uploads.$.error': processingError.message
          }
        }
      );

      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      throw processingError;
    }

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      success: false,
      message: "File upload error", 
      errors: [error.message] 
    });
  }
});

/**
 * GET /api/vendors/products
 * Retrieve all VendorProducts for the authenticated vendor
 */
router.get("/products", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const products = await VendorProduct.find({ vendorId }).lean();
    
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error("Error fetching vendor products:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error", 
      errors: [error.message] 
    });
  }
});

/**
 * DELETE /api/vendors/products/:productId
 * Delete a specific product
 */
router.delete("/products/:productId", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    const { productId } = req.params;

    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const product = await VendorProduct.findOne({ 
      _id: productId, 
      vendorId 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized"
      });
    }

    await VendorProduct.findByIdAndDelete(productId);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errors: [error.message]
    });
  }
});

/**
 * PUT /api/vendors/products/:productId
 * Update a specific product
 */
router.put("/products/:productId", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    const { productId } = req.params;
    const updateData = req.body;

    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    // Validate the update data
    const validation = VendorUploadValidator.validateProduct(updateData, 'update');
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const product = await VendorProduct.findOneAndUpdate(
      { _id: productId, vendorId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unauthorized"
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errors: [error.message]
    });
  }
});

/**
 * GET /api/vendors/upload-template
 * Download CSV template for vendors
 */
router.get("/upload-template", (req, res) => {
  try {
    const csvHeaders = [
      'manufacturer',
      'model',
      'category',
      'speed',
      'paper_size_primary',
      'paper_sizes_supported',
      'volume_min_monthly',
      'volume_max_monthly',
      'machine_cost',
      'installation_cost',
      'profit_margin',
      'cpc_mono_pence',
      'cpc_colour_pence',
      'cpc_a3_mono_pence',
      'cpc_a3_colour_pence',
      'lease_terms',
      'features',
      'service_level',
      'response_time',
      'quarterly_service',
      'regions_covered',
      'industries',
      'description'
    ];

    const sampleRow = [
      'Develop',
      'INEO+ 301i',
      'SRA3 MFP',
      '30',
      'SRA3',
      'SRA3,A3,A4,A5',
      '13001',
      '20000',
      '2795',
      '250',
      '250',
      '0.35',
      '3.5',
      '0.4',
      '3.8',
      '36:0.6,48:0.55,60:0.5',
      'Print,Copy,Scan,Fax',
      'Standard',
      '8hr',
      '150',
      'London,Essex,Kent,Surrey',
      'Healthcare,Legal,Education',
      'High-speed SRA3 multifunction device with advanced features'
    ];

    const csvContent = [
      csvHeaders.join(','),
      sampleRow.join(',')
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vendor-products-template.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error("Error generating template:", error);
    res.status(500).json({
      success: false,
      message: "Error generating template",
      errors: [error.message]
    });
  }
});

/**
 * GET /api/vendors/upload-history
 * Get upload history for the vendor
 */
router.get("/upload-history", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const vendor = await Vendor.findById(vendorId).select('uploads').lean();
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    // Sort uploads by date (newest first)
    const uploads = (vendor.uploads || []).sort((a, b) => 
      new Date(b.uploadDate) - new Date(a.uploadDate)
    );

    res.status(200).json({
      success: true,
      count: uploads.length,
      data: uploads
    });
  } catch (error) {
    console.error("Error fetching upload history:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errors: [error.message]
    });
  }
});

/**
 * GET /api/vendors/listings
 * Legacy endpoint - retrieve CopierListings for backward compatibility
 */
router.get("/listings", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    if (!vendorId) return res.status(401).json({ message: "⚠ Unauthorized" });

    const listings = await CopierListing.find({ vendor: vendorId }).lean();
    if (!listings.length) {
      return res.status(404).json({ message: "⚠ No listings found for this vendor." });
    }

    res.status(200).json(listings);
  } catch (error) {
    res.status(500).json({ message: "❌ Internal server error.", error: error.message });
  }
});

export default router;
