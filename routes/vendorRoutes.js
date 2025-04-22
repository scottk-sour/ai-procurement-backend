// File: routes/vendorRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { parse } from 'csv-parse';
import fs from 'fs';
import Vendor from '../models/Vendor.js';
import vendorAuth from '../middleware/vendorAuth.js';

dotenv.config();
const router = express.Router();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error('❌ ERROR: Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

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
const upload = multer({ storage });

// Vendor Registration (Signup)
router.post('/signup', async (req, res) => {
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
    });
    await newVendor.save();
    res.status(201).json({ message: '✅ Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Vendor Login
router.post('/login', async (req, res) => {
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
      { vendorId: vendor._id, email: vendor.email },
      JWT_SECRET,
      { expiresIn: '4h' }
    );
    res.json({
      token,
      vendorId: vendor._id,
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
      return res.status(401).json({ message: 'No token provided' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendor = await Vendor.findById(decoded.vendorId);
    if (!vendor) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.json({ authenticated: true, vendorId: vendor._id });
  } catch (error) {
    console.error('Vendor token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
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
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor || !vendor.uploads || vendor.uploads.length === 0) {
      return res.status(404).json({ message: '⚠ No uploaded files found for this vendor.' });
    }
    res.status(200).json({ files: vendor.uploads });
  } catch (error) {
    console.error('❌ Error fetching vendor files:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Fetch Recent Vendor Activity
router.get('/recent-activity', vendorAuth, async (req, res) => {
  try {
    const recentActivity = [
      { description: 'Uploaded a file', date: new Date().toISOString() },
      { description: 'Edited a machine listing', date: new Date().toISOString() },
    ];
    res.status(200).json({ activities: recentActivity });
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
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        let machine = {};
        // New4/Ricoh/Ascari/SIT format
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
        }
        // Sharp format
        else if (row.Model && (row['Total Machine Cost'] || row.Cost)) {
          machine = {
            model: row.Model,
            type: row.Description && (row.Description.includes('A3') || row.Description.includes('SRA3')) ? 'A3' : 'A4',
            mono_cpc: 0, // Sharp CSV lacks this; assume 0 or adjust
            color_cpc: row.Description && row.Description.includes('Colour') ? parseFloat(row.Cost?.replace(/[^0-9.]/g, '')) / 1000 || 0 : 0, // Rough estimate
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

          res.status(200).json({
            message: '✅ File uploaded successfully.',
            file: fileData,
            machinesAdded: machines.length,
          });

          fs.unlink(filePath, (err) => {
            if (err) console.error('❌ Error deleting file:', err);
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
  } catch (error) {
    console.error('❌ Error uploading file:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Search Quotes Route - One Machine Per Vendor
router.get('/search-quotes', async (req, res) => {
  try {
    const { type, maxLeaseCost, minMonoCpc, minColorCpc } = req.query;
    const quotes = await Vendor.aggregate([
      { $unwind: "$machines" }, // Flatten machines array
      {
        $match: {
          "machines.type": type || { $exists: true },
          "machines.lease_cost": { $lte: parseFloat(maxLeaseCost) || Infinity },
          "machines.mono_cpc": { $gte: parseFloat(minMonoCpc) || 0 },
          "machines.color_cpc": { $gte: parseFloat(minColorCpc) || 0 },
        },
      },
      { $sort: { "machines.lease_cost": 1 } }, // Sort within each vendor
      {
        $group: {
          _id: "$_id", // Group by vendor
          company: { $first: "$company" },
          machine: { $first: "$$ROOT.machines" }, // Take cheapest machine per vendor
          vendorId: { $first: "$_id" },
        },
      },
      {
        $project: {
          vendorId: "$vendorId",
          company: "$company",
          model: "$machine.model",
          type: "$machine.type",
          leaseCost: "$machine.lease_cost",
          monoCpc: "$machine.mono_cpc",
          colorCpc: "$machine.color_cpc",
          provider: "$machine.provider",
        },
      },
      { $limit: 3 }, // Limit to 3 different vendors
    ]);

    if (!quotes.length) {
      return res.status(404).json({ message: '⚠ No matching quotes found.' });
    }

    res.status(200).json({ quotes });
  } catch (error) {
    console.error('❌ Error searching quotes:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

export default router;