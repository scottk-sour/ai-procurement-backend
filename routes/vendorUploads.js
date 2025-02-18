import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import csv from "csv-parser"; // Ensure you have installed csv-parser
import vendorAuth from "../middleware/vendorAuth.js";
import Listing from "../models/Listing.js";

const router = express.Router();

// Protect all routes in this file with vendor authentication
router.use(vendorAuth);

// Configure Multer storage for vendor file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/vendors/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// POST /api/vendors/upload
// This endpoint accepts a CSV file and processes it to create new listings.
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const listingsData = [];
    const filePath = req.file.path;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        // Check that the necessary fields are present in each row
        if (row.title && row.description && row.price) {
          listingsData.push({
            title: row.title,
            description: row.description,
            price: parseFloat(row.price),
            vendor: req.vendorId, // Attach vendor ID from authentication middleware
          });
        }
      })
      .on("end", async () => {
        try {
          // Insert the parsed listings into the database
          const createdListings = await Listing.insertMany(listingsData);
          res.status(201).json({
            message: "File processed and listings created.",
            listings: createdListings,
          });
        } catch (dbError) {
          console.error("Database error:", dbError);
          res.status(500).json({
            message: "Database error while creating listings.",
            error: dbError.message,
          });
        }
      })
      .on("error", (parseError) => {
        console.error("CSV parsing error:", parseError);
        res.status(500).json({
          message: "Error processing the CSV file.",
          error: parseError.message,
        });
      });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({
      message: "Error uploading file.",
      error: error.message,
    });
  }
});

export default router;
