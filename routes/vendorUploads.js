// File: routes/vendorUploads.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import csv from "csv-parser";
import vendorAuth from "../middleware/vendorAuth.js";
import Vendor from "../models/Vendor.js";
import Machine from "../models/Machine.js"; // ✅ Ensure Machine model exists

const router = express.Router();
router.use(vendorAuth); // Ensure vendor is authenticated

// ✅ Configure Multer for File Uploads
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

// ✅ **Upload Route: Parses CSV and Saves Machines to Database**
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const vendorId = req.vendor._id;
    console.log("🔍 Authenticated Vendor ID:", vendorId);

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    const filePath = req.file.path;
    const machinesData = [];

    console.log("📂 Processing CSV file:", filePath);

    // ✅ Parse CSV and Extract Machines
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        console.log("📌 Parsed row:", row);

        // ✅ Ensure all required fields are present
        if (!row.model || !row.type || !row.lease_cost) {
          console.warn("⚠ Skipping row due to missing fields:", row);
          return;
        }

        machinesData.push({
          vendorId, // ✅ Link machine to vendor
          model: row.model.trim(),
          type: row.type.trim(),
          mono_cpc: row.mono_cpc ? parseFloat(row.mono_cpc) : 0,
          color_cpc: row.color_cpc ? parseFloat(row.color_cpc) : 0,
          lease_cost: parseFloat(row.lease_cost) || 0,
          services: row.services ? row.services.trim() : "Unknown",
          provider: row.provider ? row.provider.trim() : "Unknown",
        });
      })
      .on("end", async () => {
        try {
          console.log("✅ Parsed Machines:", machinesData);

          if (machinesData.length === 0) {
            return res.status(400).json({ message: "No valid machines found in CSV." });
          }

          // ✅ Store machines in the Machines collection
          await Machine.insertMany(machinesData);

          // ✅ Store file reference inside vendor record
          vendor.uploads.push({
            fileName: req.file.filename,
            filePath,
            fileType: "csv",
            uploadDate: new Date(),
          });
          await vendor.save();

          console.log("💾 Machines successfully saved.");
          res.status(201).json({
            message: "✅ File processed successfully.",
            machines: machinesData,
          });

        } catch (dbError) {
          console.error("❌ Database error:", dbError);
          res.status(500).json({
            message: "Database error while saving machines.",
            error: dbError.message,
          });
        }
      })
      .on("error", (parseError) => {
        console.error("❌ CSV parsing error:", parseError);
        res.status(500).json({
          message: "Error processing CSV file.",
          error: parseError.message,
        });
      });

  } catch (error) {
    console.error("❌ File upload error:", error.message);
    res.status(500).json({
      message: "Error uploading file.",
      error: error.message,
    });
  }
});

// ✅ **Get Machines for a Vendor**
router.get("/machines", vendorAuth, async (req, res) => {
  try {
    const machines = await Machine.find({ vendorId: req.vendor._id }).lean();
    if (machines.length === 0) {
      return res.status(404).json({ message: "No machines found for this vendor." });
    }
    res.status(200).json(machines);
  } catch (error) {
    console.error("❌ Error fetching machines:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

export default router;
