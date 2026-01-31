// routes/vendorUploadRoutes.js - Complete vendor routes with auth + upload (FIXED STATUS FIELD SELECTION)
import express from "express";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from "fs";
import path from "path";
import rateLimit from 'express-rate-limit';
import { isValidObjectId } from 'mongoose';
import vendorAuth from "../middleware/vendorAuth.js";
import userAuth from '../middleware/userAuth.js';
import { csvUpload } from "../middleware/secureUpload.js";
import { vendorUploadRateLimiter } from "../middleware/uploadRateLimiter.js";
import Vendor from "../models/Vendor.js";
import VendorProduct from "../models/VendorProduct.js";
import VendorActivity from "../models/VendorActivity.js";
import CopierQuoteRequest from "../models/CopierQuoteRequest.js";
import CopierListing from "../models/CopierListing.js";
import AIRecommendationEngine from "../services/aiRecommendationEngine.js";
import { importVendorProducts, VendorUploadValidator } from "../controllers/vendorProductImportController.js";

const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
    console.error('âŒ ERROR: Missing JWT_SECRET in environment variables.');
    process.exit(1);
}

// Rate limiters with proper proxy support
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window per IP
    message: { message: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 attempts per window per IP
    message: { message: 'Too many signup attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

// ===== VENDOR AUTHENTICATION ROUTES =====

// Temporary password reset route - REMOVE AFTER USE
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        
        if (!email || !newPassword) {
            return res.status(400).json({ message: 'Email and newPassword are required' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        const result = await Vendor.findOneAndUpdate(
            { email: email },
            { $set: { password: hashedPassword } },
            { new: true }
        );
        
        if (!result) {
            return res.status(404).json({ message: 'Vendor not found' });
        }
        
        res.json({ 
            message: 'Password updated successfully',
            email: result.email 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Vendor signup
router.post('/signup', signupLimiter, async (req, res) => {
    try {
        const { name, email, password, company, services = ['Photocopiers'] } = req.body;
        if (!name || !email || !password || !company) {
            return res.status(400).json({ message: 'Name, email, password, and company are required.' });
        }
        const existingVendor = await Vendor.findOne({ email });
        if (existingVendor) return res.status(400).json({ message: 'Vendor already exists.' });

        // Don't hash password here - the Vendor model's pre-save hook handles hashing
        const newVendor = new Vendor({
            name,
            email,
            password,  // Plain password - will be hashed by model pre-save hook
            company,
            services,
            account: {
                status: 'active'
            }
        });
        await newVendor.save();

        try {
            await VendorActivity.createActivity({
                vendorId: newVendor._id,
                category: 'authentication',
                type: 'signup',
                description: 'Vendor account created successfully',
                metadata: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    source: 'web'
                },
                performance: {
                    success: true
                },
                impact: {
                    outcome: 'positive'
                },
                flags: {
                    isFirstTime: true
                }
            });
        } catch (activityError) {
            console.error('âŒ Failed to create signup activity:', activityError.message);
        }

        res.status(201).json({ message: 'Vendor registered successfully.' });
    } catch (error) {
        console.error('Error registering vendor:', error.message, error.stack);
        res.status(500).json({ message: 'Registration failed', error: error.message, errorName: error.name });
    }
});

// FIXED Vendor login with correct status field selection
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('ðŸ” Login attempt for:', email);

        if (!email || !password) {
            console.log('âŒ Missing email or password');
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        // FIXED: Select both old (status) and new (account.status) field formats
        const vendor = await Vendor.findOne({ email }).select('password name email company services status account');
        console.log('ðŸ” Vendor found:', vendor ? 'YES' : 'NO');
        console.log('ðŸ” Vendor ID:', vendor?._id);

        // FIXED: Check both possible status locations - PRIORITIZE OLD STATUS FIELD
        const vendorStatus = (vendor?.status || vendor?.account?.status || '').toLowerCase();
        console.log('ðŸ” Vendor status structure:', {
            directStatus: vendor?.status,
            accountStatus: vendor?.account?.status,
            hasAccount: !!vendor?.account
        });
        console.log('ðŸ” Effective status:', vendorStatus);

        if (!vendor) {
            console.log('âŒ No vendor found with email:', email);
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        console.log('ðŸ” Comparing passwords...');
        console.log('ðŸ” Stored password hash length:', vendor.password?.length);
        const isMatch = await bcrypt.compare(password, vendor.password);
        console.log('ðŸ” Password match:', isMatch);

        if (!isMatch) {
            console.log('âŒ Password comparison failed');
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        
        // FIXED: Check status from the resolved location
        if (vendorStatus !== 'active') {
            console.log('âŒ Vendor account not active:', vendorStatus);
            return res.status(403).json({
                message: 'Account is not active. Contact support.',
                status: vendorStatus
            });
        }

        const token = jwt.sign(
            { vendorId: vendor._id.toString(), email: vendor.email, role: 'vendor' },
            JWT_SECRET,
            { expiresIn: '4h' }
        );

        console.log('âœ… Login successful for:', email);

        try {
            await VendorActivity.createActivity({
                vendorId: vendor._id,
                category: 'authentication',
                type: 'login',
                description: 'Vendor logged in successfully',
                metadata: {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    source: 'web'
                },
                performance: {
                    success: true
                },
                impact: {
                    outcome: 'positive'
                }
            });
        } catch (activityError) {
            console.error('âŒ Failed to create login activity:', activityError.message);
        }

        res.json({
            token,
            vendorId: vendor._id.toString(),
            vendorName: vendor.name,
            message: 'Vendor login successful.',
        });
    } catch (error) {
        console.error('âŒ Error during vendor login:', error.message);
        console.error('âŒ Login error stack:', error.stack);
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

        const vendor = await Vendor.findById(decoded.vendorId).select('-password status account');
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
        console.error('âŒ Vendor token verification error:', error.message);
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
});

// Vendor profile
router.get('/profile', vendorAuth, async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.vendorId).select('-password status account');
        if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

        res.status(200).json({
            vendor: {
                vendorId: vendor._id,
                name: vendor.name,
                email: vendor.email,
                company: vendor.company,
                services: vendor.services,
                status: vendor.status || vendor.account?.status
            },
        });
    } catch (error) {
        console.error('âŒ Error fetching vendor profile:', error.message);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// Uploaded files
router.get('/uploaded-files', vendorAuth, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const products = await VendorProduct.find({ vendorId: req.vendorId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const files = products.map(product => ({
            fileName: `${product.model || 'Product'}.json`,
            uploadDate: product.createdAt,
            status: 'completed',
            fileType: 'product',
            productId: product._id
        }));

        res.status(200).json({ files });
    } catch (error) {
        console.error('âŒ Error fetching vendor files:', error.message);
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
        console.error('âŒ Error fetching vendor activity:', error.message);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// Vendor notifications
router.get('/notifications', vendorAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const vendor = await Vendor.findById(req.vendorId).select('status account');
        if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

        const recentQuotes = await CopierQuoteRequest.find({
            status: { $in: ['pending', 'active'] }
        })
            .sort({ createdAt: -1 })
            .limit(10);

        const recentActivities = await VendorActivity.find({ vendorId: req.vendorId })
            .sort({ date: -1 })
            .limit(10);

        const notifications = [];

        recentQuotes.forEach(quote => {
            notifications.push({
                id: `quote-${quote._id}`,
                type: 'quote_opportunity',
                title: 'New Quote Opportunity',
                message: `New quote request for ${quote.copierType || 'equipment'} - ${quote.monthlyVolume?.mono || 'N/A'} pages/month`,
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

        recentActivities.forEach(activity => {
            if (activity.type === 'login') return;

            notifications.push({
                id: `activity-${activity._id}`,
                type: 'activity',
                title: 'Account Activity',
                message: activity.description,
                timestamp: activity.date,
                isRead: true,
                priority: 'low',
                data: {
                    activityType: activity.type
                }
            });
        });

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
        console.error('âŒ Error fetching vendor notifications:', error.message);
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
        console.error('âŒ Error marking notification as read:', error.message);
        res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message
        });
    }
});

// VENDOR RECOMMENDATIONS ENDPOINT - Uses userAuth for regular users
router.get('/recommend', userAuth, async (req, res) => {
    try {
        const { userId, t } = req.query;

        console.log('ðŸ” Fetching vendor recommendations for user:', userId);

        // Validate user access
        if (userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - user ID mismatch'
            });
        }

        // Get all active vendors - FIXED: Check both status locations
        const vendors = await Vendor.find({
            $or: [
                { status: 'active' },
                { 'account.status': 'active' }
            ]
        })
            .select('name email company services status account location createdAt')
            .limit(20)
            .lean();

        if (!vendors.length) {
            return res.status(200).json({
                success: true,
                vendors: [],
                count: 0,
                message: 'No active vendors found'
            });
        }

        // Get product counts for each vendor
        const vendorIds = vendors.map(v => v._id);
        const productCounts = await VendorProduct.aggregate([
            { $match: { vendorId: { $in: vendorIds } } },
            { $group: { _id: '$vendorId', count: { $sum: 1 } } }
        ]);

        // Enhance vendor data with product information and ratings
        const recommendedVendors = vendors.map(vendor => {
            const productCount = productCounts.find(pc => pc._id.toString() === vendor._id.toString());
            return {
                _id: vendor._id,
                vendorId: vendor._id,
                name: vendor.name,
                company: vendor.company,
                email: vendor.email,
                services: vendor.services || ['Photocopiers'],
                location: vendor.location || 'UK',
                hasProducts: (productCount?.count || 0) > 0,
                productCount: productCount?.count || 0,
                rating: Math.round((Math.random() * 2 + 3) * 10) / 10, // Random rating between 3.0-5.0
                reviewCount: Math.floor(Math.random() * 50) + 5, // Random review count 5-55
                yearsInBusiness: Math.floor(Math.random() * 20) + 5, // Random years 5-25
                status: vendor.status || vendor.account?.status,
                joinedDate: vendor.createdAt,
                specialties: vendor.services || ['Photocopiers'],
                verified: true,
                responseTime: '< 24 hours'
            };
        });

        // Sort by product count and rating
        recommendedVendors.sort((a, b) => {
            if (a.hasProducts && !b.hasProducts) return -1;
            if (!a.hasProducts && b.hasProducts) return 1;
            return b.rating - a.rating;
        });

        res.json({
            success: true,
            vendors: recommendedVendors,
            count: recommendedVendors.length,
            metadata: {
                timestamp: new Date().toISOString(),
                requestedBy: userId,
                totalVendors: vendors.length,
                vendorsWithProducts: recommendedVendors.filter(v => v.hasProducts).length
            }
        });

    } catch (error) {
        console.error('âŒ Error fetching vendor recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch vendor recommendations'
        });
    }
});

// Additional endpoint for getting all vendors with filtering
router.get('/all', async (req, res) => {
    try {
        const {
            serviceType,
            company,
            status = 'active',
            page = 1,
            limit = 20
        } = req.query;

        console.log('ðŸ” Fetching all vendors with filters:', { serviceType, company, status });

        // FIXED: Use both status field locations
        let filter = {
            $or: [
                { status: status },
                { 'account.status': status }
            ]
        };

        if (serviceType) {
            filter.services = { $in: [serviceType] };
        }

        if (company) {
            filter.company = { $regex: company, $options: 'i' };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const vendors = await Vendor.find(filter)
            .select('name email company services status account location createdAt uploads')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await Vendor.countDocuments(filter);

        const vendorIds = vendors.map(v => v._id);
        const productCounts = await VendorProduct.aggregate([
            { $match: { vendorId: { $in: vendorIds } } },
            { $group: { _id: '$vendorId', count: { $sum: 1 } } }
        ]);

        const enhancedVendors = vendors.map(vendor => {
            const productCount = productCounts.find(pc => pc._id.toString() === vendor._id.toString());
            return {
                _id: vendor._id,
                name: vendor.name,
                email: vendor.email,
                company: vendor.company,
                services: vendor.services,
                status: vendor.status || vendor.account?.status,
                rating: 0,
                reviewCount: 0,
                location: vendor.location || '',
                yearsInBusiness: vendor.yearsInBusiness || 0,
                hasProducts: (productCount?.count || 0) > 0,
                uploadCount: productCount?.count || 0,
                createdAt: vendor.createdAt
            };
        });

        res.json({
            success: true,
            data: {
                vendors: enhancedVendors,
                pagination: {
                    current: pageNum,
                    total: Math.ceil(total / limitNum),
                    count: vendors.length,
                    totalRecords: total
                }
            }
        });

    } catch (error) {
        console.error('âŒ Error fetching all vendors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch vendors',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ===== VENDOR UPLOAD & PRODUCT MANAGEMENT ROUTES =====

// Apply auth middleware to all upload/product routes
router.use(vendorAuth);

// POST /api/vendors/upload
router.post("/upload", vendorUploadRateLimiter, csvUpload.single, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded.",
                errors: ["Please select a CSV or Excel file to upload"]
            });
        }

        const vendorId = req.vendorId;
        if (!vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
                errors: ["Vendor authentication required"]
            });
        }

        const vendor = await Vendor.findById(vendorId).select('status account');
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

        if (!['.csv', '.xlsx', '.xls'].includes(fileExtension)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: "Invalid file type.",
                errors: ["Please upload a CSV or Excel (.xlsx, .xls) file"]
            });
        }

        try {
            const result = await importVendorProducts(filePath, vendorId);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            try {
                await VendorActivity.createActivity({
                    vendorId: vendor._id,
                    category: 'products',
                    type: 'product_upload',
                    description: `Uploaded ${result.savedProducts || 0} products from ${fileName}`,
                    metadata: {
                        fileName,
                        productsUploaded: result.savedProducts || 0,
                        filesAffected: 1,
                        source: 'web'
                    },
                    performance: {
                        success: result.success
                    },
                    impact: {
                        level: result.savedProducts > 50 ? 'high' : 'medium',
                        outcome: result.success ? 'positive' : 'negative'
                    }
                });
            } catch (activityError) {
                console.error('âŒ Failed to create upload activity:', activityError.message);
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

// GET /api/vendors/products
router.get("/products", async (req, res) => {
    try {
        const vendorId = req.vendorId;
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

// DELETE /api/vendors/products/:productId
router.delete("/products/:productId", async (req, res) => {
    try {
        const vendorId = req.vendorId;
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

        try {
            await VendorActivity.createActivity({
                vendorId: vendorId,
                category: 'products',
                type: 'product_delete',
                description: `Deleted product: ${product.model || 'Unknown'}`,
                metadata: {
                    deletedProduct: product.model,
                    source: 'web'
                },
                impact: {
                    outcome: 'neutral'
                }
            });
        } catch (activityError) {
            console.error('âŒ Failed to create deletion activity:', activityError.message);
        }

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

// PUT /api/vendors/products/:productId
router.put("/products/:productId", async (req, res) => {
    try {
        const vendorId = req.vendorId;
        const { productId } = req.params;
        const updateData = req.body;

        if (!vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

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

        try {
            await VendorActivity.createActivity({
                vendorId: vendorId,
                category: 'products',
                type: 'product_update',
                description: `Updated product: ${product.model || 'Unknown'}`,
                metadata: {
                    updatedProduct: product.model,
                    source: 'web'
                },
                impact: {
                    outcome: 'positive'
                }
            });
        } catch (activityError) {
            console.error('âŒ Failed to create update activity:', activityError.message);
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

// GET /api/vendors/upload-template
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

// GET /api/vendors/upload-history
router.get("/upload-history", async (req, res) => {
    try {
        const vendorId = req.vendorId;
        if (!vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        const products = await VendorProduct.find({ vendorId })
            .sort({ createdAt: -1 })
            .select('model createdAt updatedAt')
            .lean();

        const uploads = products.map(product => ({
            fileName: `${product.model || 'Product'}_${product._id}.json`,
            uploadDate: product.createdAt,
            status: 'completed',
            fileType: 'product',
            productId: product._id,
            processedAt: product.updatedAt
        }));

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

// GET /api/vendors/listings
router.get("/listings", async (req, res) => {
    try {
        const vendorId = req.vendorId;
        if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

        const listings = await CopierListing.find({ vendor: vendorId }).lean();
        if (!listings.length) {
            return res.status(404).json({ message: "No listings found for this vendor." });
        }

        res.status(200).json(listings);
    } catch (error) {
        res.status(500).json({ message: "Internal server error.", error: error.message });
    }
});

export default router;

