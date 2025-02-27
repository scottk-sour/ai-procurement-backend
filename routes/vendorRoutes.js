import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { body, validationResult } from 'express-validator';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import Machine from '../models/Machine.js'; // Ensure this file exists in models/
import dotenv from 'dotenv';
import csv from 'csv-parser';

dotenv.config();
const router = express.Router();

// -------------------------------------------------
// Helper: Get File Type from Extension
// -------------------------------------------------
const getFileType = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.csv') return 'csv';
  if (ext === '.xls' || ext === '.xlsx') return 'excel';
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  return 'unknown';
};

// -------------------------------------------------
// Configure Multer for File Uploads
// -------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/vendors/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const vendorId = req.vendorId;
    Vendor.findById(vendorId)
      .then((vendor) => {
        if (!vendor) {
          return cb(new Error('Vendor not found'));
        }
        // Create a filename based on the vendor's company name + original extension
        const companyName = vendor.company.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
        const newFileName = `${companyName}${path.extname(file.originalname)}`;
        const filePath = path.join('uploads/vendors', newFileName);
        // If the file already exists, remove it
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        cb(null, newFileName);
      })
      .catch((err) => cb(err));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'image/jpeg',
      'image/png',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, Excel, CSV, and images are allowed.'));
    }
    cb(null, true);
  },
});

// -------------------------------------------------
// Vendor Dashboard Route (GET /api/vendors/dashboard)
// -------------------------------------------------
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }
    // Fetch machines from the Machine collection instead of from vendor.machines
    const machines = await Machine.find({ vendorId: vendor._id }).lean();
    res.json({
      companyName: vendor.company,
      email: vendor.email,
      uploads: vendor.uploads,
      kpis: {
        totalRevenue: vendor.totalRevenue || 0,
        activeListings: vendor.activeListings || 0,
        totalOrders: vendor.totalOrders || 0,
      },
      quoteFunnelData: {
        created: vendor.quotesCreated || 0,
        pending: vendor.quotesPending || 0,
        won: vendor.quotesWon || 0,
        lost: vendor.quotesLost || 0,
      },
      machines, // Machines are now coming from the separate Machine collection
    });
  } catch (error) {
    console.error('Error fetching vendor dashboard:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// -------------------------------------------------
// Vendor Signup Route (POST /api/vendors/signup)
// -------------------------------------------------
router.post(
  '/signup',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, password } = req.body;
    try {
      const existingVendor = await Vendor.findOne({ email });
      if (existingVendor) {
        return res
          .status(400)
          .json({ message: 'Vendor with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newVendor = new Vendor({
        name,
        company,
        email,
        password: hashedPassword,
      });

      await newVendor.save();
      res.status(201).json({ message: 'Vendor registered successfully.' });
    } catch (error) {
      console.error('Error registering vendor:', error.message);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

// -------------------------------------------------
// Vendor Login Route (POST /api/vendors/login)
// -------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }
    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '4h' });
    res.json({ token, vendorId: vendor._id, message: 'Login successful.' });
  } catch (error) {
    console.error('Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// -------------------------------------------------
// Vendor File Upload Route (POST /api/vendors/upload)
// -------------------------------------------------
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const vendorId = req.vendorId;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    // Determine the file type
    const fileType = getFileType(req.file);
    if (fileType === 'unknown') {
      return res.status(400).json({ message: 'Unsupported file type.' });
    }

    // Always store file metadata in vendor.uploads
    vendor.uploads.push({
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      fileType,
    });

    if (fileType === 'csv') {
      const filePath = req.file.path;
      const csvRows = [];
      console.log(`Starting CSV parse for file: ${filePath}`);

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          console.log('Parsed row:', row);
          // Ensure required columns exist; if so, add vendorId and push the row
          if (row.model && row.type && row.mono_cpc && row.color_cpc && row.lease_cost) {
            csvRows.push({
              vendorId: vendor._id, // Link machine to vendor
              model: row.model.trim(),
              type: row.type.trim(),
              mono_cpc: parseFloat(row.mono_cpc) || 0,
              color_cpc: parseFloat(row.color_cpc) || 0,
              lease_cost: parseFloat(row.lease_cost) || 0,
              services: row.services ? row.services.trim() : 'Photocopiers',
              provider: row.provider ? row.provider.trim() : '',
            });
          }
        })
        .on('end', async () => {
          try {
            console.log(`CSV parse complete. Total rows: ${csvRows.length}`);
            // Save the parsed CSV data into the Machine collection
            const machines = await Machine.insertMany(csvRows);
            console.log('Machines successfully saved:', machines);
            // Do not store machines inside vendor.machines – they go to the separate collection
            await vendor.save();
            return res.status(201).json({
              message: 'File uploaded & CSV processed successfully.',
              machines,
            });
          } catch (err) {
            console.error('Error saving machines:', err);
            return res.status(500).json({
              message: 'Failed to save CSV data to machines.',
              error: err.message,
            });
          }
        })
        .on('error', (parseError) => {
          console.error('CSV parsing error:', parseError);
          return res.status(500).json({
            message: 'Error processing the CSV file.',
            error: parseError.message,
          });
        });
    } else {
      // For non-CSV files, just save vendor with new upload info
      await vendor.save();
      return res.status(200).json({
        message: 'File uploaded successfully.',
        vendor,
      });
    }
  } catch (error) {
    console.error('Error during file upload:', error.message);
    res.status(500).json({
      message: 'Internal server error during file upload.',
      error: error.message,
    });
  }
});

export default router;
