// File: routes/vendorUploads.js
import express from "express";
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import vendorAuth from "../middleware/vendorAuth.js";
import Vendor from "../models/Vendor.js";
import Machine from "../models/Machine.js";

const router = express.Router();
router.use(vendorAuth); // Ensure vendor is authenticated

// ✅ Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/vendors/others/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, uniqueFilename);
  },
});

const upload = multer({ storage });

// ✅ **Upload Route: Save File to Vendor and Process CSV**
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.log("⚠ No file uploaded.");
      return res.status(400).json({ message: "⚠ No file uploaded." });
    }

    const vendorId = req.vendor?._id;
    if (!vendorId) {
      console.log("⚠ Unauthorized: Vendor ID missing.");
      return res.status(401).json({ message: "⚠ Unauthorized: Vendor ID missing." });
    }

    console.log("🔍 Authenticated Vendor ID:", vendorId);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      console.log("⚠ Vendor not found.");
      return res.status(404).json({ message: "⚠ Vendor not found." });
    }

    const filePath = req.file.path.replace(/\\/g, "/"); // Normalize file path
    const fileName = req.file.filename;
    console.log("📂 File uploaded successfully:", fileName);

    // ✅ **Step 1: Immediately Save File to Vendor’s `uploads` in MongoDB**
    await Vendor.updateOne(
      { _id: vendor._id },
      { $push: { uploads: {
          fileName: fileName,
          filePath: filePath,
          fileType: "csv",
          uploadDate: new Date()
      }}}
    );    

    console.log(`✅ File uploaded and stored in MongoDB for Vendor: ${vendor.email}`);

    // ✅ **Step 2: Parse CSV and Extract Machines**
    const machinesData = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        console.log("📌 Parsed row:", row);

        // ✅ Ensure required fields exist
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
            console.log("⚠ No valid machines found in CSV.");
            return res.status(400).json({ message: "⚠ No valid machines found in CSV." });
          }

          // ✅ Store machines in the Machines collection
          await Machine.insertMany(machinesData);

          console.log("💾 Machines successfully saved.");
          res.status(201).json({
            message: "✅ File processed successfully and saved to vendor uploads.",
            machines: machinesData,
          });

        } catch (dbError) {
          console.error("❌ Database error:", dbError);
          res.status(500).json({
            message: "❌ Database error while saving machines.",
            error: dbError.message,
          });
        }
      })
      .on("error", (parseError) => {
        console.error("❌ CSV parsing error:", parseError);
        res.status(500).json({
          message: "❌ Error processing CSV file.",
          error: parseError.message,
        });
      });

  } catch (error) {
    console.error("❌ File upload error:", error.message);
    res.status(500).json({
      message: "❌ Error uploading file.",
      error: error.message,
    });
  }
});

// ✅ **Get Machines for a Vendor**
router.get("/machines", vendorAuth, async (req, res) => {
  try {
    const machines = await Machine.find({ vendorId: req.vendor?._id }).lean();
    if (machines.length === 0) {
      return res.status(404).json({ message: "⚠ No machines found for this vendor." });
    }
    res.status(200).json(machines);
  } catch (error) {
    console.error("❌ Error fetching machines:", error);
    res.status(500).json({ message: "❌ Internal server error." });
  }
});

export default router;
