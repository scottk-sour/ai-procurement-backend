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
import { sendEmail } from "../services/emailService.js";
import AeoReport from "../models/AeoReport.js";
import { generateFullReport } from "../services/aeoReportGenerator.js";

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

// Vendor signup with rate limiting
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

        const vendor = await Vendor.findOne({ email }).select('password name email company services status account');

        if (!vendor) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // Derive effective status from both possible locations
        const vendorStatus = (vendor.status || vendor.account?.status || '').toLowerCase();

        // Check unclaimed status before password (unclaimed vendors have no password)
        if (vendorStatus === 'unclaimed') {
            return res.status(403).json({
                message: "This listing hasn't been claimed yet. Is this your business?",
                status: 'unclaimed',
                vendorId: vendor._id.toString()
            });
        }

        if (!vendor.password) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, vendor.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // Status-specific messages for non-active accounts
        if (vendorStatus === 'pending') {
            return res.status(403).json({
                message: "Your account is being reviewed. We'll activate it within 24 hours.",
                status: 'pending'
            });
        }
        if (vendorStatus !== 'active') {
            return res.status(403).json({
                message: 'Your account has been deactivated. Contact support.',
                status: vendorStatus || 'inactive'
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
        console.error('âŒ Vendor token verification error:', error.message);
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
});

// Vendor profile
router.get('/profile', vendorAuth, async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.vendorId).select('-password');
        if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

        // Auto-complete onboarding for existing vendors with profile data
        if (!vendor.account?.onboardingCompleted && vendor.company && vendor.services?.length > 0 && vendor.contactInfo?.phone) {
            vendor.account.onboardingCompleted = true;
            await vendor.save();
        }

        res.status(200).json({
            success: true,
            vendor: {
                vendorId: vendor._id,
                name: vendor.name,
                email: vendor.email,
                company: vendor.company,
                services: vendor.services,
                status: vendor.status || vendor.account?.status,
                tier: vendor.tier || vendor.account?.tier || 'free',
                rating: vendor.performance?.rating || 0,
                // Contact info
                phone: vendor.contactInfo?.phone || '',
                website: vendor.contactInfo?.website || '',
                // Location
                city: vendor.location?.city || '',
                postcode: vendor.location?.postcode || '',
                coverage: vendor.location?.coverage || [],
                // Business profile
                description: vendor.businessProfile?.description || '',
                yearsInBusiness: vendor.businessProfile?.yearsInBusiness || 0,
                certifications: vendor.businessProfile?.certifications || [],
                accreditations: vendor.businessProfile?.accreditations || [],
                specializations: vendor.businessProfile?.specializations || [],
                // Brands
                brands: vendor.brands || [],
                // Onboarding
                onboardingCompleted: vendor.account?.onboardingCompleted || false,
            },
        });
    } catch (error) {
        console.error('âŒ Error fetching vendor profile:', error.message);
        res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// Vendor profile - PUT update profile (all tiers can update all fields)
router.put('/profile', vendorAuth, async (req, res) => {
    try {
        const vendorId = req.vendorId;
        const {
            company,
            name,
            phone,
            website,
            city,
            postcode,
            coverage,
            description,
            yearsInBusiness,
            services,
            brands,
            certifications,
            accreditations,
            specializations
        } = req.body;

        // Build update object - only include fields that were provided
        const updateFields = {};

        // Basic info
        if (company !== undefined) updateFields.company = company;
        if (name !== undefined) updateFields.name = name;

        // Contact info (nested)
        if (phone !== undefined) updateFields['contactInfo.phone'] = phone;
        if (website !== undefined) {
            // Normalize website URL - add https:// if missing
            let normalizedWebsite = website.trim();
            if (normalizedWebsite && !normalizedWebsite.match(/^https?:\/\//i)) {
                normalizedWebsite = 'https://' + normalizedWebsite;
            }
            updateFields['contactInfo.website'] = normalizedWebsite;
        }

        // Location (nested)
        if (city !== undefined) updateFields['location.city'] = city;
        if (postcode !== undefined) updateFields['location.postcode'] = postcode;
        if (coverage !== undefined) updateFields['location.coverage'] = coverage;

        // Business profile (nested)
        if (description !== undefined) updateFields['businessProfile.description'] = description;
        if (yearsInBusiness !== undefined) updateFields['businessProfile.yearsInBusiness'] = parseInt(yearsInBusiness) || 0;
        if (certifications !== undefined) updateFields['businessProfile.certifications'] = certifications;
        if (accreditations !== undefined) updateFields['businessProfile.accreditations'] = accreditations;
        if (specializations !== undefined) updateFields['businessProfile.specializations'] = specializations;

        // Top-level arrays
        if (services !== undefined) updateFields.services = services;
        if (brands !== undefined) updateFields.brands = brands;

        // Update the vendor
        const updatedVendor = await Vendor.findByIdAndUpdate(
            vendorId,
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedVendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            vendor: {
                vendorId: updatedVendor._id,
                name: updatedVendor.name,
                email: updatedVendor.email,
                company: updatedVendor.company,
                services: updatedVendor.services || [],
                tier: updatedVendor.tier || updatedVendor.account?.tier || 'free',
                phone: updatedVendor.contactInfo?.phone || '',
                website: updatedVendor.contactInfo?.website || '',
                city: updatedVendor.location?.city || '',
                postcode: updatedVendor.location?.postcode || '',
                coverage: updatedVendor.location?.coverage || [],
                description: updatedVendor.businessProfile?.description || '',
                yearsInBusiness: updatedVendor.businessProfile?.yearsInBusiness || 0,
                certifications: updatedVendor.businessProfile?.certifications || [],
                accreditations: updatedVendor.businessProfile?.accreditations || [],
                specializations: updatedVendor.businessProfile?.specializations || [],
                brands: updatedVendor.brands || [],
            }
        });
    } catch (error) {
        console.error('Error updating vendor profile:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile.',
            error: error.message
        });
    }
});

// Mark onboarding as complete
router.post('/onboarding-complete', vendorAuth, async (req, res) => {
    try {
        await Vendor.findByIdAndUpdate(req.vendorId, {
            $set: { 'account.onboardingCompleted': true }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update onboarding status.' });
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

// ===== VENDOR CLAIM ROUTE (public) =====

router.post('/claim', async (req, res) => {
    try {
        const { vendorId, name, email, password, role } = req.body;

        if (!vendorId || !name || !email || !password || !role) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters.' });
        }

        if (!isValidObjectId(vendorId)) {
            return res.status(400).json({ message: 'Invalid vendor ID.' });
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found.' });
        }

        if (vendor.listingStatus !== 'unclaimed') {
            return res.status(400).json({ message: 'This listing has already been claimed.' });
        }

        // Check email isn't already taken by another vendor
        const existingVendor = await Vendor.findOne({ email: email.toLowerCase() });
        if (existingVendor && existingVendor._id.toString() !== vendorId) {
            return res.status(400).json({ message: 'This email is already associated with another account.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Update vendor
        vendor.email = email.toLowerCase();
        vendor.password = hashedPassword;
        vendor.name = name;
        vendor.listingStatus = 'claimed';
        vendor.status = 'pending';
        if (vendor.account) {
            vendor.account.status = 'pending';
        }
        vendor.claimedBy = { name, email: email.toLowerCase(), role, date: new Date() };
        vendor.claimedAt = new Date();

        await vendor.save();

        // Send notification email to admin
        try {
            await sendEmail({
                to: 'scott.davies@tendorai.com',
                subject: `New Listing Claim: ${vendor.company}`,
                html: `
                    <h2>New Vendor Claim</h2>
                    <p><strong>${vendor.company}</strong> has been claimed.</p>
                    <table style="border-collapse:collapse;margin:16px 0">
                        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Name:</td><td>${name}</td></tr>
                        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Email:</td><td>${email}</td></tr>
                        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Role:</td><td>${role}</td></tr>
                    </table>
                    <p>Review and activate in the <a href="https://www.tendorai.com/admin/vendors">admin dashboard</a>.</p>
                `,
                text: `New claim: ${vendor.company} by ${name} (${email}, ${role}). Review in admin dashboard.`
            });
        } catch (emailErr) {
            console.error('Failed to send admin claim notification:', emailErr.message);
        }

        // Send confirmation email to claimer
        try {
            await sendEmail({
                to: email,
                subject: `Claim Received — ${vendor.company} on TendorAI`,
                html: `
                    <h2>Thanks for claiming ${vendor.company}!</h2>
                    <p>Hi ${name},</p>
                    <p>We've received your claim for <strong>${vendor.company}</strong> on TendorAI.</p>
                    <p>Our team will review and activate your account within 24 hours. Once activated, you'll be able to log in and manage your listing.</p>
                    <p>— The TendorAI Team</p>
                `,
                text: `Hi ${name}, we've received your claim for ${vendor.company}. We'll review and activate within 24 hours.`
            });
        } catch (emailErr) {
            console.error('Failed to send claim confirmation email:', emailErr.message);
        }

        res.status(200).json({
            success: true,
            message: "Claim submitted successfully. We'll review and activate your account within 24 hours."
        });
    } catch (error) {
        console.error('Error processing vendor claim:', error.message);
        res.status(500).json({ message: 'Failed to process claim. Please try again.' });
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
            // Check tier product limit before import
            const tier = vendor.tier || vendor.account?.tier || 'free';
            const limit = getProductLimit(tier);
            const currentCount = await VendorProduct.countDocuments({ vendorId });

            const result = await importVendorProducts(filePath, vendorId);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Check if import exceeded tier limit
            const postImportCount = await VendorProduct.countDocuments({ vendorId });
            let tierWarning = null;
            if (limit !== Infinity && postImportCount > limit) {
                tierWarning = {
                    message: `Your ${tier} plan allows ${limit} products. You now have ${postImportCount}. Products beyond the limit may not appear in AI recommendations.`,
                    currentCount: postImportCount,
                    limit,
                    upgradeUrl: '/vendor-dashboard/settings?tab=subscription'
                };
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
                        stats: result.stats,
                        ...(tierWarning && { tierWarning })
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

        // Query with $or to match both ObjectId and string vendorId (handles legacy data)
        const query = {
            $or: [
                { vendorId: vendorId },
                { vendorId: vendorId.toString() }
            ]
        };

        // Optional serviceCategory filter
        if (req.query.serviceCategory) {
            query.serviceCategory = req.query.serviceCategory;
        }

        const products = await VendorProduct.find(query).lean();

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

// Tier product limits
const TIER_PRODUCT_LIMITS = {
  free: 3,
  listed: 3,
  visible: 10,
  basic: 10,
  verified: Infinity,
  managed: Infinity,
};

function getProductLimit(tier) {
  const t = (tier || 'free').toLowerCase();
  return TIER_PRODUCT_LIMITS[t] ?? 3;
}

// POST /api/vendors/products
router.post("/products", async (req, res) => {
    try {
        const vendorId = req.vendorId;
        if (!vendorId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }

        const vendor = await Vendor.findById(vendorId).select('tier account');
        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
        }

        // Check tier product limit
        const tier = vendor.tier || vendor.account?.tier || 'free';
        const limit = getProductLimit(tier);
        const currentCount = await VendorProduct.countDocuments({ vendorId });

        if (currentCount >= limit) {
            return res.status(403).json({
                success: false,
                message: `You've reached the ${limit}-product limit for your plan. Upgrade to add more products.`,
                currentCount,
                limit,
                upgradeUrl: '/vendor-dashboard/settings?tab=subscription'
            });
        }

        // Validate required fields
        const { manufacturer, model, category, serviceCategory = 'Photocopiers' } = req.body;

        if (!manufacturer || !model || !category) {
            return res.status(400).json({
                success: false,
                message: "Manufacturer, model, and category are required",
                errors: ["Missing required fields: manufacturer, model, category"]
            });
        }

        // Category-specific validation
        if (serviceCategory === 'Photocopiers') {
            if (!req.body.costs || req.body.costs.cpcRates?.A4Mono === undefined || req.body.costs.machineCost === undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Cost data required for copier products",
                    errors: ["Missing required cost fields for copier products"]
                });
            }
        } else if (serviceCategory === 'Telecoms') {
            if (!req.body.telecomsPricing?.perUserMonthly) {
                return res.status(400).json({
                    success: false,
                    message: "Per-user monthly cost required for telecoms products",
                    errors: ["Missing telecomsPricing.perUserMonthly"]
                });
            }
        } else if (serviceCategory === 'CCTV') {
            if (!req.body.cctvPricing?.perCameraCost) {
                return res.status(400).json({
                    success: false,
                    message: "Per-camera cost required for CCTV products",
                    errors: ["Missing cctvPricing.perCameraCost"]
                });
            }
        } else if (serviceCategory === 'IT') {
            if (!req.body.itPricing?.perUserMonthly && !req.body.itPricing?.projectDayRate) {
                return res.status(400).json({
                    success: false,
                    message: "Per-user monthly cost or day rate required for IT products",
                    errors: ["Missing itPricing.perUserMonthly or itPricing.projectDayRate"]
                });
            }
        }

        // Create the product
        const productData = {
            vendorId,
            ...req.body,
        };

        const product = new VendorProduct(productData);
        await product.save();

        // Log activity
        try {
            await VendorActivity.createActivity({
                vendorId,
                category: 'products',
                type: 'product_create',
                description: `Added product: ${manufacturer} ${model}`,
                metadata: {
                    productId: product._id,
                    manufacturer,
                    model,
                    source: 'web'
                },
                impact: {
                    outcome: 'positive'
                }
            });
        } catch (activityError) {
            console.error('Failed to create product activity:', activityError.message);
        }

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product,
            remainingSlots: limit === Infinity ? null : limit - currentCount - 1
        });
    } catch (error) {
        console.error("Error creating product:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: Object.values(error.errors).map(e => e.message)
            });
        }
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

// ─── AEO Visibility Score (real) ────────────────────────────────────

// Map vendor services to AEO report categories
const SERVICE_TO_AEO_CATEGORY = {
  'Photocopiers': 'copiers',
  'Managed Print': 'copiers',
  'Telecoms': 'telecoms',
  'VoIP': 'telecoms',
  'CCTV': 'cctv',
  'Security': 'cctv',
  'IT Support': 'it',
  'IT': 'it',
  'Managed IT': 'it',
};

function getAeoCategory(services) {
  if (!services?.length) return 'it';
  for (const svc of services) {
    const cat = SERVICE_TO_AEO_CATEGORY[svc];
    if (cat) return cat;
  }
  return 'it';
}

// GET /api/vendors/aeo-score — Return latest AEO report for authenticated vendor
router.get('/aeo-score', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('company').lean();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const report = await AeoReport.findOne({
      companyName: { $regex: new RegExp(`^${vendor.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      score: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .select('-pdfBuffer -ipAddress')
      .lean();

    if (!report) {
      return res.json({
        success: true,
        hasReport: false,
        data: null,
      });
    }

    return res.json({
      success: true,
      hasReport: true,
      data: {
        reportId: report._id,
        score: report.score,
        scoreBreakdown: report.scoreBreakdown,
        searchedCompany: report.searchedCompany,
        competitors: report.competitors,
        gaps: report.gaps,
        aiMentioned: report.aiMentioned,
        aiPosition: report.aiPosition,
        reportType: report.reportType,
        createdAt: report.createdAt,
      },
    });
  } catch (err) {
    console.error('AEO score lookup error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch AEO score' });
  }
});

// POST /api/vendors/aeo-rescan — Trigger a new AEO report for authenticated vendor
const rescanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2,
  message: { success: false, error: 'Too many scans. Please try again later.' },
  keyGenerator: (req) => req.vendorId,
});

router.post('/aeo-rescan', vendorAuth, rescanLimiter, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId)
      .select('company services location email')
      .lean();
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const category = getAeoCategory(vendor.services);
    const city = vendor.location?.city || 'London';

    const report = await generateFullReport({
      companyName: vendor.company,
      category,
      city,
      email: vendor.email,
    });

    // Save the report
    const saved = await AeoReport.create({
      ...report,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: {
        reportId: saved._id,
        score: saved.score,
        scoreBreakdown: saved.scoreBreakdown,
        searchedCompany: saved.searchedCompany,
        competitors: saved.competitors,
        gaps: saved.gaps,
        aiMentioned: saved.aiMentioned,
        aiPosition: saved.aiPosition,
        reportType: saved.reportType,
        createdAt: saved.createdAt,
      },
    });
  } catch (err) {
    console.error('AEO rescan error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate new scan' });
  }
});

export default router;

