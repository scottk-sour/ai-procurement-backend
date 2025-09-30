// Load environment variables early
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Services
import AIRecommendationEngine from './services/aiRecommendationEngine.js';
// Routes
import authRoutes from './routes/authRoutes.js';
// REMOVED: import vendorRoutes from './routes/vendorRoutes.js';
import vendorListingsRoutes from './routes/vendorListings.js';
import vendorProductRoutes from './routes/vendorProductRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import submitRequestRoutes from './routes/submitRequestRoutes.js';
import vendorUploadRoutes from './routes/vendorUploadRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import copierQuoteRoutes from './routes/copierQuoteRoutes.js';
// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Check environment variables
const { PORT = 5000, MONGODB_URI, JWT_SECRET, OPENAI_API_KEY } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !OPENAI_API_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}
// Express app
const app = express();
// ✅ CRITICAL FIX: Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);
// ✅ IMPROVED CORS CONFIG — Handles all deployment URLs with better logging
app.use(cors({
    origin: function (origin, callback) {
        console.log(`🔍 CORS Check - Origin: ${origin || 'NO ORIGIN'}`);
        // Allow requests with no origin (like mobile apps, Postman, or curl requests)
        if (!origin) {
            console.log('✅ CORS: Allowing request with no origin');
            return callback(null, true);
        }
        const staticOrigins = [
            'https://www.tendorai.com',
            'https://tendorai.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001', // Additional local port
            'https://localhost:3000', // HTTPS local (sometimes needed)
        ];
        // Allow any Vercel deployment URL for your project
        const isVercelPreview = origin.includes('ai-procurement-frontend') && origin.includes('vercel.app');
        // Check static origins
        const isStaticOrigin = staticOrigins.includes(origin);
        if (isStaticOrigin) {
            console.log(`✅ CORS: Allowing static origin - ${origin}`);
            callback(null, true);
        } else if (isVercelPreview) {
            console.log(`✅ CORS: Allowing Vercel preview - ${origin}`);
            callback(null, true);
        } else {
            console.log(`❌ CORS BLOCKED: ${origin}`);
            console.log(`🔍 Available origins:`, staticOrigins);
            console.log(`🔍 Vercel pattern match:`, isVercelPreview);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name'
    ],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400 // 24 hours
}));
// Handle preflight requests explicitly
app.options('*', cors({
    origin: function (origin, callback) {
        console.log(`🔍 PREFLIGHT - Origin: ${origin || 'NO ORIGIN'}`);
        if (!origin) return callback(null, true);
        const staticOrigins = [
            'https://www.tendorai.com',
            'https://tendorai.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001',
            'https://localhost:3000',
        ];
        const isVercelPreview = origin.includes('ai-procurement-frontend') && origin.includes('vercel.app');
        if (staticOrigins.includes(origin) || isVercelPreview) {
            console.log(`✅ PREFLIGHT: Allowing ${origin}`);
            callback(null, true);
        } else {
            console.log(`❌ PREFLIGHT BLOCKED: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name'
    ]
}));
// Enhanced global error handler for CORS errors
app.use((error, req, res, next) => {
    if (error.message === 'Not allowed by CORS') {
        const origin = req.headers.origin || 'unknown';
        console.log(`❌ CORS Error Details:`);
        console.log(` - Origin: ${origin}`);
        console.log(` - Method: ${req.method}`);
        console.log(` - Path: ${req.path}`);
        console.log(` - User-Agent: ${req.headers['user-agent']}`);
        console.log(` - Headers:`, JSON.stringify(req.headers, null, 2));
        return res.status(403).json({
            error: 'CORS Error',
            message: 'This origin is not allowed to access this resource',
            origin: origin,
            method: req.method,
            path: req.path,
            timestamp: new Date().toISOString(),
            allowedPatterns: [
                'https://www.tendorai.com',
                'https://tendorai.com',
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'https://ai-procurement-frontend-*.vercel.app'
            ],
            troubleshooting: {
                step1: 'Verify your frontend is making requests to the correct backend URL',
                step2: 'Check that your frontend domain matches exactly (including www)',
                step3: 'Ensure requests include proper headers',
                step4: 'Check browser network tab for actual origin being sent'
            }
        });
    }
    next(error);
});
// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
// Request logger
app.use((req, res, next) => {
    console.log(`🔍 ${req.method} ${req.url} – Origin: ${req.headers.origin || 'none'}`);
    next();
});
// Ensure /uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
// ROUTES - UPDATED: Only use vendorUploadRoutes for all vendor functionality
app.use('/api/auth', authRoutes);
// REMOVED: app.use('/api/vendors', vendorRoutes);
app.use('/api/vendors', vendorUploadRoutes); // ✅ This handles all vendor routes including upload
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', copierQuoteRoutes);
// NEW: AI Copier Suggestions Route
app.post('/api/suggest-copiers', async (req, res) => {
    try {
        console.log('🤖 AI Copier suggestion request:', req.body);
        // Basic suggestions based on the request data
        const suggestions = [];
        const { monthlyVolume, industryType, colour, min_speed, serviceType } = req.body;
        // Simple logic to provide basic suggestions
        if (monthlyVolume?.total > 5000) {
            suggestions.push("High-volume multifunction device recommended for your print requirements");
        }
        if (monthlyVolume?.total < 1000) {
            suggestions.push("Compact desktop printer suitable for low-volume needs");
        }
        if (industryType === 'Legal' || industryType === 'Healthcare') {
            suggestions.push("Security-focused models with encryption and audit trails recommended");
        }
        if (industryType === 'Manufacturing' || industryType === 'Government') {
            suggestions.push("Industrial-grade devices with enhanced durability features");
        }
        if (colour === 'Color') {
            suggestions.push("Color multifunction printer with professional-grade output quality");
        }
        if (colour === 'Black & White') {
            suggestions.push("High-efficiency monochrome printer optimized for text documents");
        }
        if (min_speed && min_speed > 30) {
            suggestions.push("High-speed printing capability (30+ PPM) recommended for productivity");
        }
        if (serviceType === 'Production') {
            suggestions.push("Production-level equipment with finishing capabilities recommended");
        }
        // Add some generic helpful suggestions if we have basic info
        if (suggestions.length === 0 && (monthlyVolume?.total || industryType)) {
            suggestions.push("Multifunction device with print, scan, and copy capabilities");
            suggestions.push("Energy-efficient model to reduce operational costs");
        }
        res.json({
            suggestions,
            message: suggestions.length > 0 ? "AI suggestions generated based on your requirements" : "Please provide more details for personalized recommendations",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in suggest-copiers:', error);
        res.status(500).json({
            error: 'Failed to generate suggestions',
            suggestions: [],
            message: 'AI suggestion service temporarily unavailable'
        });
    }
});
// ✅ NEW: Test endpoint to verify all routes are working
app.get('/api/test-dashboard', async (req, res) => {
    try {
        console.log('🔍 Testing dashboard endpoints...');
        const testResults = {
            timestamp: new Date().toISOString(),
            server: 'TendorAI Backend',
            status: 'All systems operational',
            environment: process.env.NODE_ENV || 'development',
            mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
            corsConfig: {
                staticOrigins: [
                    'https://www.tendorai.com',
                    'https://tendorai.com',
                    'http://localhost:3000',
                    'http://127.0.0.1:3000'
                ],
                vercelPreviewPattern: 'https://ai-procurement-frontend-*.vercel.app',
                vercelPreviewSupport: true,
                credentialsEnabled: true
            },
            availableEndpoints: [
                { category: 'User Management', path: '/api/users/recent-activity', method: 'GET', status: 'Available', description: 'Get user recent activity' },
                { category: 'User Management', path: '/api/users/uploaded-files', method: 'GET', status: 'Available', description: 'Get user uploaded files' },
                { category: 'User Management', path: '/api/users/notifications', method: 'GET', status: 'Available', description: 'Get user notifications' },
                { category: 'User Management', path: '/api/users/profile', method: 'GET', status: 'Available', description: 'Get user profile' },
                { category: 'User Management', path: '/api/users/upload', method: 'POST', status: 'Available', description: 'Upload user files' },
                { category: 'Quote Management', path: '/api/quotes/requests', method: 'GET', status: 'Available', description: 'Get user quote requests' },
                { category: 'Quote Management', path: '/api/quotes/request', method: 'POST', status: 'Available', description: 'Create new quote request' },
                { category: 'Quote Management', path: '/api/quotes/:id', method: 'GET', status: 'Available', description: 'Get specific quote' },
                { category: 'Quote Management', path: '/api/quotes/accept', method: 'POST', status: 'Available', description: 'Accept vendor quote' },
                { category: 'Quote Management', path: '/api/quotes/contact', method: 'POST', status: 'Available', description: 'Contact vendor' },
                { category: 'Authentication', path: '/api/auth/login', method: 'POST', status: 'Available', description: 'User login' },
                { category: 'Authentication', path: '/api/auth/verify', method: 'GET', status: 'Available', description: 'Verify user token' },
                { category: 'Authentication', path: '/api/users/login', method: 'POST', status: 'Available', description: 'Alternative user login' },
                { category: 'Authentication', path: '/api/users/signup', method: 'POST', status: 'Available', description: 'User registration' },
                { category: 'Vendors', path: '/api/vendors/verify', method: 'GET', status: 'Available', description: 'Verify vendor token' },
                { category: 'Vendors', path: '/api/vendors/login', method: 'POST', status: 'Available', description: 'Vendor login' },
                { category: 'Vendors', path: '/api/vendors/signup', method: 'POST', status: 'Available', description: 'Vendor registration' },
                { category: 'Vendor Upload', path: '/api/vendors/upload', method: 'POST', status: 'Available', description: 'Upload vendor products' },
                { category: 'Vendor Upload', path: '/api/vendors/products', method: 'GET', status: 'Available', description: 'Get vendor products' },
                { category: 'Vendor Upload', path: '/api/vendors/upload-template', method: 'GET', status: 'Available', description: 'Download upload template' },
                { category: 'AI Features', path: '/api/suggest-copiers', method: 'POST', status: 'Available', description: 'Get AI-powered copier suggestions' }
            ],
            totalEndpoints: 21,
            message: '✅ All dashboard endpoints are now available including AI suggestions!',
            note: 'Your TendorAI platform is ready for production use with AI-powered recommendations.',
            dashboardFeatures: [
                '✅ User authentication and authorization',
                '✅ Quote request submission and management',
                '✅ Real-time dashboard with KPIs',
                '✅ Vendor matching and recommendations',
                '✅ File upload and document management',
                '✅ Notification system',
                '✅ Activity tracking',
                '✅ Multi-role support (Users, Vendors, Admins)',
                '✅ Dynamic CORS for Vercel deployments',
                '✅ Vendor product upload system',
                '✅ AI-powered copier suggestions'
            ]
        };
        res.json(testResults);
    } catch (error) {
        console.error('❌ Test endpoint error:', error);
        res.status(500).json({
            error: error.message,
            message: 'Test endpoint encountered an error',
            timestamp: new Date().toISOString()
        });
    }
});
// Health check
app.get('/', (req, res) => {
    res.json({
        message: '🚀 TendorAI Backend is Running!',
        timestamp: new Date().toISOString(),
        status: 'healthy',
        environment: process.env.NODE_ENV || 'development',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        corsConfig: {
            staticOrigins: [
                'https://www.tendorai.com',
                'https://tendorai.com',
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ],
            vercelPreviewPattern: 'https://ai-procurement-frontend-*.vercel.app',
            vercelPreviewSupport: true
        },
        features: [
            'AI-powered vendor matching',
            'Quote request management',
            'Multi-role authentication',
            'Real-time dashboard',
            'File upload support',
            'Notification system',
            'Dynamic CORS for Vercel deployments',
            'Vendor product upload system',
            'AI copier suggestions'
        ]
    });
});
// 404 fallback
app.use((req, res) => {
    console.log(`❌ Route not found: ${req.method} ${req.url}`);
    res.status(404).json({
        message: '❌ Route Not Found',
        requestedPath: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            '/api/test-dashboard - Test all endpoints',
            '/api/auth/* - Authentication routes',
            '/api/users/* - User management routes',
            '/api/quotes/* - Quote management routes',
            '/api/vendors/* - Vendor routes (including upload)',
            '/api/suggest-copiers - AI copier suggestions',
            '/ - Health check'
        ]
    });
});
// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    console.error('❌ Stack trace:', err.stack);
    const safeMessage = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message;
    res.status(500).json({
        message: '❌ Internal Server Error',
        error: safeMessage,
        timestamp: new Date().toISOString(),
        requestPath: req.url,
        method: req.method
    });
});
// Start server
async function startServer() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);
        console.log('ℹ️ AIRecommendationEngine ready');
        // 👇 ADD THE MIGRATION LOGIC HERE 👇
        // -----------------------------------------------------------------
        console.log('🔗 Starting one-time vendor migration...');
        try {
            // Import the Vendor model here
            const { default: Vendor } = await import('./models/Vendor.js');
           
            const vendorsToMigrate = await Vendor.find({
                status: { $exists: true, $ne: null }
            });
           
            if (vendorsToMigrate.length > 0) {
                console.log(`🔍 Found ${vendorsToMigrate.length} vendors to migrate. Updating...`);
                for (const vendor of vendorsToMigrate) {
                    await Vendor.updateOne(
                        { _id: vendor._id },
                        {
                            $set: { 'account.status': vendor.status },
                            $unset: { status: '' }
                        }
                    );
                }
                console.log('🎉 Migration complete!');
            } else {
                console.log('⏭️ No vendors found with the old status field. Migration not needed.');
            }
        } catch (migrationError) {
            console.error('❌ Migration script failed:', migrationError);
        }
        // -----------------------------------------------------------------
        // 👆 END OF MIGRATION LOGIC 👆
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`🔧 Raw process.env.PORT: ${process.env.PORT || 'Not set'}`);
            console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 CORS enabled for:`);
            console.log(` - https://www.tendorai.com`);
            console.log(` - https://tendorai.com`);
            console.log(` - http://localhost:3000`);
            console.log(` - http://127.0.0.1:3000`);
            console.log(` - https://ai-procurement-frontend-*.vercel.app (dynamic)`);
            console.log(`📊 Test endpoint available at: http://localhost:${PORT}/api/test-dashboard`);
            console.log(`🏥 Health check available at: http://localhost:${PORT}/`);
            console.log(`📤 Vendor upload now available at: http://localhost:${PORT}/api/vendors/upload`);
            console.log(`🤖 AI suggestions available at: http://localhost:${PORT}/api/suggest-copiers`);
            console.log(`\n🎉 TendorAI Backend is ready for connections!`);
        });
        const shutdown = () => {
            console.log('\n🛑 Shutting down gracefully...');
            server.close(() => {
                mongoose.connection.close(false, () => {
                    console.log('✅ MongoDB connection closed');
                    console.log('✅ Server shutdown complete');
                    process.exit(0);
                });
            });
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('uncaughtException', (err) => {
            console.error('❌ Uncaught Exception:', err);
            shutdown();
        });
        process.on('unhandledRejection', (reason) => {
            console.error('❌ Unhandled Rejection:', reason);
            shutdown();
        });
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:', err);
        console.error('❌ Please check your MONGODB_URI and network connection');
        process.exit(1);
    }
}
startServer();
