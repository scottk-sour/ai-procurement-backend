// routes/vendorUploadRoutes.js
import express from "express";
import fs from "fs";
import csv from "csv-parser";
import vendorAuth from "../middleware/vendorAuth.js";
import upload from "../middleware/csvUpload.js";
import Vendor from "../models/Vendor.js";
import CopierListing from "../models/CopierListing.js";

const router = express.Router();
router.use(vendorAuth);

/**
 * POST /api/vendors/upload
 * Upload and parse CSV, insert listings into DB
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "⚠ No file uploaded." });

    const vendorId = req.vendor?._id;
    if (!vendorId) return res.status(401).json({ message: "⚠ Unauthorized" });

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "⚠ Vendor not found." });

    const filePath = req.file.path.replace(/\\/g, "/");
    const fileName = req.file.filename;

    await Vendor.updateOne(
      { _id: vendor._id },
      {
        $push: {
          uploads: {
            fileName,
            filePath,
            fileType: "csv",
            uploadDate: new Date(),
          },
        },
      }
    );

    const listingsData = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const listing = {
          vendor: vendorId,
          model: row.Model || "Unknown Model",
          buyInPrice: parseFloat(row.BuyInPrice) || 0,
          costPerCopy: {
            mono: [
              { volumeRange: "0-5000", price: parseFloat(row.CostPerCopyMono_0_5000) || 0 },
              { volumeRange: "5001-10000", price: parseFloat(row.CostPerCopyMono_5001_10000) || 0 },
            ],
            colour: [
              { volumeRange: "0-2000", price: parseFloat(row.CostPerCopyColour_0_2000) || 0 },
              { volumeRange: "2001-5000", price: parseFloat(row.CostPerCopyColour_2001_5000) || 0 },
            ],
          },
          extraTrays: parseInt(row.ExtraTrays) || 0,
          paperCut: parseFloat(row.PaperCut) || 0,
          followMePrint: parseFloat(row.FollowMePrint) || 0,
          bookletFinisher: parseFloat(row.BookletFinisher) || 0,
          tonerCollection: parseFloat(row.TonerCollection) || 0,
          leaseOptions: [
            { termMonths: 36, leasePercentage: parseFloat(row.LeasePercentage_36) || 0 },
            { termMonths: 60, leasePercentage: parseFloat(row.LeasePercentage_60) || 0 },
          ],
          isRefurbished: (row.IsRefurbished || "").toLowerCase() === "true",
          refurbishedPricing: {
            buyInPrice: parseFloat(row.RefurbBuyInPrice) || 0,
            costPerCopyMono: parseFloat(row.RefurbMonoCostPerCopy) || 0,
            costPerCopyColour: parseFloat(row.RefurbColourCostPerCopy) || 0,
          },
          vendorMarginType: row.VendorMarginType || "percentage",
          vendorMarginValue: parseFloat(row.VendorMarginValue) || 0,
        };

        if (listing.model !== "Unknown Model") listingsData.push(listing);
      })
      .on("end", async () => {
        try {
          if (listingsData.length === 0) {
            return res.status(400).json({ message: "⚠ No valid listings found in CSV." });
          }

          await CopierListing.insertMany(listingsData);
          res.status(201).json({
            message: "✅ File processed and listings saved.",
            listings: listingsData,
          });
        } catch (dbError) {
          res.status(500).json({
            message: "❌ Error saving to database.",
            error: dbError.message,
          });
        }
      })
      .on("error", (parseError) => {
        res.status(500).json({
          message: "❌ CSV parsing error.",
          error: parseError.message,
        });
      });
  } catch (error) {
    res.status(500).json({ message: "❌ File upload error.", error: error.message });
  }
});

/**
 * GET /api/vendors/listings
 * Retrieve all listings for the authenticated vendor
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
