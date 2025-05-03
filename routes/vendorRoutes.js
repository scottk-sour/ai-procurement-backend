import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { parse } from 'csv-parse';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { isValidObjectId } from 'mongoose'; // Added for userId validation
import Vendor from '../models/Vendor.js';
import VendorActivity from '../models/VendorActivity.js';
import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import { getVendorRecommendations } from '../services/VendorRecommendationService.js';
import vendorAuth from '../middleware/vendorAuth.js';

dotenv.config();
const router = express.Router();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error('❌ ERROR: Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

// Rate Limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts. Please try again later.',
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many signup attempts. Please try again later.',
});

const recommendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Allow 10 requests per 15 minutes
  message: 'Too many recommendation requests. Please try again later.',
});

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed types: PDF, CSV, Excel, PNG, JPG, JPEG'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Vendor Registration (Signup)
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, password, company, services = ['Photocopiers'] } = req.body;
    if (!name || !email || !password || !company) {
      return res.status(400).json({ message: '⚠ Name, email, password, and company are required.' });
    }
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: '⚠ Vendor already exists.' });
    }
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

    // Log activity
    await VendorActivity.create({
      vendorId: newVendor._id,
      type: 'signup',
      description: 'Vendor account created',
    });

    res.status(201).json({ message: '✅ Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Vendor Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: '⚠ Email and password are required.' });
    }
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }
    const token = jwt.sign(
      { vendorId: vendor._id.toString(), email: vendor.email, role: 'vendor' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Log activity
    await VendorActivity.create({
      vendorId: vendor._id,
      type: 'login',
      description: 'Vendor logged in',
    });

    res.json({
      token,
      vendorId: vendor._id.toString(),
      vendorName: vendor.name,
      message: '✅ Vendor login successful.',
    });
  } catch (error) {
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Vendor Token Verification
router.get('/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: '⚠ No token provided.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendor = await Vendor.findById(decoded.vendorId).select('-password');
    if (!vendor) {
      return res.status(401).json({ message: '⚠ Invalid token.' });
    }
    res.json({ authenticated: true, vendorId: vendor._id, vendorName: vendor.name });
  } catch (error) {
    console.error('❌ Vendor token verification error:', error.message);
    res.status(401).json({ message: '⚠ Invalid or expired token.' });
  }
});

// Vendor Profile
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');
    if (!vendor) {
      return res.status(404).json({ message: '⚠ Vendor not found.' });
    }
    res.status(200).json({ vendor });
  } catch (error) {
    console.error('❌ Error fetching vendor profile:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Fetch Vendor’s Uploaded Files
router.get('/uploaded-files', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor || !vendor.uploads || vendor.uploads.length === 0) {
      return res.status(404).json({ message: '⚠ No uploaded files found for this vendor.' });
    }
    const startIndex = (page - 1) * limit;
    const files = vendor.uploads.slice(startIndex, startIndex + parseInt(limit));
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching vendor files:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Fetch Recent Vendor Activity
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
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// File Upload Route with CSV Parsing
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '⚠ No file uploaded.' });
    }

    const { originalname, filename, path: filePath } = req.file;
    const vendorId = req.vendorId;

    const fileData = {
      fileName: originalname,
      filePath: `/uploads/${filename}`,
      fileType: path.extname(originalname).slice(1).toLowerCase(),
      uploadDate: new Date(),
    };

    const machines = [];
    if (fileData.fileType === 'csv') {
      fs.createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', (row) => {
          let machine = {};
          if (row.model && row.lease_cost) {
            machine = {
              model: row.model,
              type: row.type,
              mono_cpc: parseFloat(row.mono_cpc) || 0,
              color_cpc: parseFloat(row.color_cpc) || 0,
              lease_cost: parseFloat(row.lease_cost) || 0,
              services: row.services || 'Photocopiers',
              provider: row.provider || 'Unknown',
            };
          } else if (row.Model && (row['Total Machine Cost'] || row.Cost)) {
            machine = {
              model: row.Model,
              type: row.Description && (row.Description.includes('A3') || row.Description.includes('SRA3')) ? 'A3' : 'A4',
              mono_cpc: 0,
              color_cpc: row.Description && row.Description.includes('Colour') ? parseFloat(row.Cost?.replace(/[^0-9.]/g, '')) / 1000 || 0 : 0,
              lease_cost: parseFloat(row['Total Machine Cost']?.replace(/[^0-9.]/g, '')) || parseFloat(row.Cost?.replace(/[^0-9.]/g, '')) || 0,
              services: 'Photocopiers',
              provider: row.Manufacturer || 'Sharp',
            };
          }
          if (Object.keys(machine).length > 0) {
            machines.push(machine);
          }
        })
        .on('end', async () => {
          try {
            const vendor = await Vendor.findByIdAndUpdate(
              vendorId,
              {
                $push: {
                  uploads: fileData,
                  machines: { $each: machines },
                },
              },
              { new: true }
            );

            if (!vendor) {
              return res.status(404).json({ message: '⚠ Vendor not found.' });
            }

            await VendorActivity.create({
              vendorId,
              type: 'upload',
              description: `Uploaded file: ${originalname}`,
            });

            res.status(200).json({
              message: '✅ File uploaded successfully.',
              file: fileData,
              machinesAdded: machines.length,
            });
          } catch (error) {
            console.error('❌ Error saving vendor data:', error.message);
            res.status(500).json({ message: '❌ Internal server error.', error: error.message });
          }
        })
        .on('error', (error) => {
          console.error('❌ CSV parsing error:', error.message);
          res.status(500).json({ message: '❌ Error parsing CSV.', error: error.message });
        });
    } else {
      const vendor = await Vendor.findByIdAndUpdate(
        vendorId,
        { $push: { uploads: fileData } },
        { new: true }
      );

      if (!vendor) {
        return res.status(404).json({ message: '⚠ Vendor not found.' });
      }

      await VendorActivity.create({
        vendorId,
        type: 'upload',
        description: `Uploaded file: ${originalname}`,
      });

      res.status(200).json({
        message: '✅ File uploaded successfully.',
        file: fileData,
      });
    }
  } catch (error) {
    console.error('❌ Error handling file upload:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ✅ NEW AI-Driven Vendor Recommendation Endpoint
router.get('/recommend', recommendLimiter, async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: '⚠ Missing userId in query.' });
    }
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: '⚠ Invalid userId format.' });
    }

    const quotes = await CopierQuoteRequest.find({ userId }).sort({ createdAt: -1 });

    if (!quotes.length) {
      return res.status(404).json({ message: '⚠ No quote requests found for this user.' });
    }

    const recommendations = await getVendorRecommendations(quotes, userId);

    console.log(`✅ Recommendations fetched for userId: ${userId}`); // Added logging

    res.status(200).json({ recommendations });
  } catch (error) {
    console.error('❌ Error in /recommend endpoint:', error.message);
    res.status(500).json({ message: '❌ Failed to get AI recommendations.', error: error.message });
  }
});

// Export router
export default router;