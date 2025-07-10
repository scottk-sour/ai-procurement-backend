// routes/vendorUploadRoutes.js
import express from "express";
import fs from "fs";
import path from "path";
import vendorAuth from "../middleware/vendorAuth.js";
import upload from "../middleware/csvUpload.js";
import Vendor from "../models/Vendor.js";
import VendorProduct from "../models/VendorProduct.js"; // Updated to use VendorProduct
import CopierListing from "../models/CopierListing.js"; // Keep for backward compatibility
import { importVendorProducts, VendorUploadValidator } from "../controllers/vendorProductImportController.js";

const router = express.Router();
router.use(vendorAuth);

/**
 * POST /api/vendors/upload
 * Enhanced upload with validation for VendorProduct model
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: "No file uploaded.",
        errors: ["Please select a CSV or Excel file to upload"]
      });
    }

    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized",
        errors: ["Vendor authentication required"]
      });
    }

    const vendor = await Vendor.findById(vendorId);
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

    // Validate file type
    if (!['.csv', '.xlsx', '.xls'].includes(fileExtension)) {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "Invalid file type.",
        errors: ["Please upload a CSV or Excel (.xlsx, .xls) file"]
      });
    }

    // Record the upload attempt
    await Vendor.updateOne(
      { _id: vendor._id },
      {
        $push: {
          uploads: {
            fileName,
            filePath,
            fileType: fileExtension.substring(1), // Remove the dot
            uploadDate: new Date(),
            status: 'processing'
          },
        },
      }
    );

    try {
      // Use enhanced import function with validation
      const result = await importVendorProducts(filePath, vendorId);

      // Update upload status
      await Vendor.updateOne(
        { _id: vendor._id, 'uploads.fileName': fileName },
        {
          $set: {
            'uploads.$.status': result.success ? 'completed' : 'failed',
            'uploads.$.processedAt': new Date(),
            'uploads.$.results': {
              total: result.stats?.total || 0,
              saved: result.stats?.saved || 0,
              errors: result.errors?.length || 0,
              warnings: result.warnings?.length || 0
            }
          }
        }
      );

      // Clean up uploaded file after processing
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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
      // Update upload status to failed
      await Vendor.updateOne(
        { _id: vendor._id, 'uploads.fileName': fileName },
        {
          $set: {
            'uploads.$.status': 'failed',
            'uploads.$.processedAt': new Date(),
            'uploads.$.error': processingError.message
          }
        }
      );

      // Clean up uploaded file
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

/**
 * POST /api/vendors/upload-legacy
 * Legacy upload endpoint for backward compatibility with CopierListing
 */
router.post("/upload-legacy", upload.single("file"), async (req, res) => {
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
 * GET /api/vendors/products
 * Retrieve all VendorProducts for the authenticated vendor
 */
router.get("/products", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
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

/**
 * GET /api/vendors/listings
 * Legacy endpoint - retrieve CopierListings for backward compatibility
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

/**
 * DELETE /api/vendors/products/:productId
 * Delete a specific product
 */
router.delete("/products/:productId", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
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

/**
 * PUT /api/vendors/products/:productId
 * Update a specific product
 */
router.put("/products/:productId", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    const { productId } = req.params;
    const updateData = req.body;

    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    // Validate the update data
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

/**
 * GET /api/vendors/upload-template
 * Download CSV template for vendors
 */
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

/**
 * GET /api/vendors/upload-history
 * Get upload history for the vendor
 */
router.get("/upload-history", async (req, res) => {
  try {
    const vendorId = req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const vendor = await Vendor.findById(vendorId).select('uploads').lean();
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    // Sort uploads by date (newest first)
    const uploads = (vendor.uploads || []).sort((a, b) => 
      new Date(b.uploadDate) - new Date(a.uploadDate)
    );

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

export default router;