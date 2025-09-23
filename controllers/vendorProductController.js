// controllers/vendorProductController.js - FIXED to match VendorProduct schema
import VendorProduct from "../models/VendorProduct.js";
import mongoose from 'mongoose';

/**
 * Get Vendor's Products
 */
export const getVendorProducts = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ message: "Missing vendorId" });
    }
    
    // FIXED: Use correct vendorId type conversion
    const products = await VendorProduct.find({ 
      vendorId: mongoose.Types.ObjectId(vendorId) 
    });
    
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error fetching vendor products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get All Vendor Products (Admin View) with optional filtering
 */
export const getAllVendorProducts = async (req, res) => {
  try {
    const { category, manufacturer, volumeRange, paperSize } = req.query;
    
    // Build filter object using correct schema paths
    const filter = {};
    if (category) filter.category = category;
    if (manufacturer) filter.manufacturer = manufacturer;
    if (volumeRange) filter.volumeRange = volumeRange;
    if (paperSize) filter['paperSizes.primary'] = paperSize;
    
    const products = await VendorProduct.find(filter)
      .populate('vendorId', 'name email company')
      .sort({ createdAt: -1 });
    
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error fetching all vendor products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get Single Product Details
 */
export const getVendorProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    
    const product = await VendorProduct.findById(productId)
      .populate('vendorId', 'name email company performance.rating');
    
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    res.status(200).json(product);
  } catch (error) {
    console.error("❌ Error fetching vendor product:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Create a new Vendor Product
 */
export const createVendorProduct = async (req, res) => {
  try {
    const productData = req.body;
    
    // Validate required fields
    if (!productData.manufacturer || !productData.model || !productData.category) {
      return res.status(400).json({ 
        message: "Missing required fields: manufacturer, model, category" 
      });
    }
    
    // Check for duplicate product
    const existingProduct = await VendorProduct.findOne({
      vendorId: productData.vendorId,
      manufacturer: productData.manufacturer,
      model: productData.model
    });
    
    if (existingProduct) {
      return res.status(409).json({ 
        message: "Product with this manufacturer and model already exists" 
      });
    }
    
    const newProduct = new VendorProduct(productData);
    const savedProduct = await newProduct.save();
    
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error("❌ Error creating vendor product:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Update a Vendor Product
 */
export const updateVendorProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updates = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    
    // Remove fields that shouldn't be updated
    delete updates._id;
    delete updates.createdAt;
    delete updates.__v;
    
    const updatedProduct = await VendorProduct.findByIdAndUpdate(
      productId, 
      updates, 
      { new: true, runValidators: true }
    );
    
    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("❌ Error updating vendor product:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        details: Object.values(error.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Delete a Vendor Product
 */
export const deleteVendorProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    
    const deletedProduct = await VendorProduct.findByIdAndDelete(productId);
    
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    res.status(200).json({ 
      message: "Product deleted successfully",
      deletedProduct: {
        id: deletedProduct._id,
        manufacturer: deletedProduct.manufacturer,
        model: deletedProduct.model
      }
    });
  } catch (error) {
    console.error("❌ Error deleting vendor product:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * FIXED: Get Product Statistics for Admin Dashboard
 */
export const getProductStats = async (req, res) => {
  try {
    const stats = await VendorProduct.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          averageSpeed: { $avg: '$speed' },
          averageCost: { $avg: '$costs.totalMachineCost' },
          categories: { $addToSet: '$category' },
          manufacturers: { $addToSet: '$manufacturer' },
          volumeRanges: { $addToSet: '$volumeRange' },
          inStockCount: {
            $sum: { $cond: ['$availability.inStock', 1, 0] }
          },
          a3Count: {
            $sum: { $cond: ['$isA3', 1, 0] }
          },
          a4Count: {
            $sum: { $cond: [{ $eq: ['$paperSizes.primary', 'A4'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          totalProducts: 1,
          averageSpeed: { $round: ['$averageSpeed', 0] },
          averageCost: { $round: ['$averageCost', 2] },
          categories: 1,
          manufacturers: 1,
          volumeRanges: 1,
          inStockCount: 1,
          a3Count: 1,
          a4Count: 1
        }
      }
    ]);
    
    res.status(200).json(stats[0] || { 
      totalProducts: 0, 
      averageSpeed: 0, 
      averageCost: 0,
      categories: [],
      manufacturers: [],
      volumeRanges: [],
      inStockCount: 0,
      a3Count: 0,
      a4Count: 0
    });
  } catch (error) {
    console.error("❌ Error fetching product stats:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * FIXED: Search Products (for AI matching) - using correct schema paths
 */
export const searchProducts = async (req, res) => {
  try {
    const { 
      minVolume, 
      maxVolume, 
      category, 
      paperSize, 
      maxBudget,
      features,
      manufacturer,
      urgency,
      region
    } = req.query;
    
    // Build search criteria using correct schema paths
    const searchCriteria = {};
    
    // FIXED: Volume matching using correct field names
    if (minVolume || maxVolume) {
      if (minVolume) searchCriteria.maxVolume = { $gte: parseInt(minVolume) };
      if (maxVolume) searchCriteria.minVolume = { $lte: parseInt(maxVolume) };
    }
    
    if (category) searchCriteria.category = category;
    if (manufacturer) searchCriteria.manufacturer = manufacturer;
    
    // FIXED: Paper size using correct nested path
    if (paperSize) searchCriteria['paperSizes.primary'] = paperSize;
    
    // FIXED: Budget using correct nested path
    if (maxBudget) searchCriteria['costs.totalMachineCost'] = { $lte: parseInt(maxBudget) };
    
    // Features matching
    if (features) {
      const featureList = features.split(',').map(f => f.trim());
      searchCriteria.features = { $in: featureList };
    }
    
    // Availability based on urgency
    if (urgency === 'Critical' || urgency === 'High') {
      searchCriteria['availability.inStock'] = true;
      searchCriteria['availability.leadTime'] = { $lte: 14 };
    }
    
    // Regional coverage
    if (region) {
      searchCriteria.regionsCovered = { $in: [region] };
    }
    
    const products = await VendorProduct.find(searchCriteria)
      .populate('vendorId', 'name email company performance.rating')
      .sort({ 'costs.totalMachineCost': 1 }) // Sort by cost ascending
      .limit(50); // Limit results for performance
    
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error searching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get Products by Volume Range (for AI matching)
 */
export const getProductsByVolumeRange = async (req, res) => {
  try {
    const { monthlyVolume } = req.query;
    
    if (!monthlyVolume) {
      return res.status(400).json({ message: "Monthly volume is required" });
    }
    
    const volume = parseInt(monthlyVolume);
    
    // FIXED: Use correct field names for volume matching
    const products = await VendorProduct.find({
      minVolume: { $lte: volume },
      maxVolume: { $gte: volume }
    })
    .populate('vendorId', 'name email company performance.rating')
    .sort({ 'costs.totalMachineCost': 1 })
    .limit(20);
    
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error fetching products by volume:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get Products for AI Matching with advanced criteria
 */
export const getMatchingProducts = async (req, res) => {
  try {
    const {
      monthlyVolume,
      paperSize,
      maxBudget,
      requiredFeatures,
      priority,
      urgency,
      region,
      industry
    } = req.body;
    
    if (!monthlyVolume) {
      return res.status(400).json({ message: "Monthly volume is required" });
    }
    
    const searchCriteria = {
      // FIXED: Volume matching using correct field names
      minVolume: { $lte: parseInt(monthlyVolume) },
      maxVolume: { $gte: parseInt(monthlyVolume) }
    };
    
    // FIXED: Paper size using correct nested path
    if (paperSize) {
      searchCriteria['paperSizes.supported'] = { $in: [paperSize] };
    }
    
    // FIXED: Budget using correct nested path
    if (maxBudget) {
      searchCriteria['costs.totalMachineCost'] = { $lte: parseInt(maxBudget) };
    }
    
    // Feature requirements
    if (requiredFeatures && requiredFeatures.length > 0) {
      searchCriteria.features = { $all: requiredFeatures };
    }
    
    // Availability based on urgency
    if (urgency === 'Critical' || urgency === 'High') {
      searchCriteria['availability.inStock'] = true;
      searchCriteria['availability.leadTime'] = { $lte: 14 };
    }
    
    // Geographic coverage
    if (region) {
      searchCriteria.regionsCovered = { $in: [region] };
    }
    
    // Industry specialization
    if (industry) {
      searchCriteria.industries = { $in: [industry] };
    }
    
    let sortCriteria = {};
    
    // FIXED: Sorting based on priority using correct nested paths
    switch (priority) {
      case 'cost':
        sortCriteria = { 'costs.totalMachineCost': 1 };
        break;
      case 'speed':
        sortCriteria = { speed: -1 };
        break;
      case 'quality':
        sortCriteria = { 'vendorId.performance.rating': -1, speed: -1 };
        break;
      case 'reliability':
        sortCriteria = { 'vendorId.performance.rating': -1 };
        break;
      default:
        sortCriteria = { 'costs.totalMachineCost': 1 };
    }
    
    const products = await VendorProduct.find(searchCriteria)
      .populate('vendorId', 'name email company performance.rating serviceCapabilities')
      .sort(sortCriteria)
      .limit(10);
    
    // Calculate match scores for each product
    const productsWithScores = products.map(product => {
      const matchScore = calculateMatchScore(product, {
        monthlyVolume,
        paperSize,
        maxBudget,
        requiredFeatures,
        priority
      });
      
      return {
        ...product.toObject(),
        matchScore
      };
    });
    
    // Sort by match score descending
    productsWithScores.sort((a, b) => b.matchScore.total - a.matchScore.total);
    
    res.status(200).json(productsWithScores);
  } catch (error) {
    console.error("❌ Error getting matching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Helper function to calculate match score
 */
function calculateMatchScore(product, requirements) {
  let score = 0;
  let totalCriteria = 0;
  const breakdown = {};
  
  const {
    monthlyVolume,
    paperSize,
    maxBudget,
    requiredFeatures,
    priority
  } = requirements;
  
  // Volume matching (30% weight)
  if (monthlyVolume) {
    totalCriteria += 30;
    if (monthlyVolume >= product.minVolume && monthlyVolume <= product.maxVolume) {
      const volumeRange = product.maxVolume - product.minVolume;
      const optimalVolume = product.minVolume + (volumeRange * 0.7);
      const distance = Math.abs(monthlyVolume - optimalVolume) / volumeRange;
      const volumeScore = 30 * (1 - distance);
      score += volumeScore;
      breakdown.volumeMatch = volumeScore / 30;
    }
  }
  
  // Paper size matching (20% weight)
  if (paperSize) {
    totalCriteria += 20;
    if (product.paperSizes.supported.includes(paperSize)) {
      score += 20;
      breakdown.paperSizeMatch = 1;
    } else {
      breakdown.paperSizeMatch = 0;
    }
  }
  
  // Budget efficiency (25% weight)
  if (maxBudget) {
    totalCriteria += 25;
    if (product.costs.totalMachineCost <= maxBudget) {
      const efficiency = (maxBudget - product.costs.totalMachineCost) / maxBudget;
      const budgetScore = 25 * (0.5 + efficiency * 0.5);
      score += budgetScore;
      breakdown.costEfficiency = budgetScore / 25;
    } else {
      breakdown.costEfficiency = 0;
    }
  }
  
  // Feature matching (25% weight)
  if (requiredFeatures && requiredFeatures.length > 0) {
    totalCriteria += 25;
    const matchedFeatures = requiredFeatures.filter(feature => 
      product.features.includes(feature)
    );
    const featureScore = 25 * (matchedFeatures.length / requiredFeatures.length);
    score += featureScore;
    breakdown.featureMatch = featureScore / 25;
  }
  
  return {
    total: totalCriteria > 0 ? score / totalCriteria : 0,
    breakdown,
    confidence: score > 0.8 ? 'High' : score > 0.6 ? 'Medium' : 'Low'
  };
}

/**
 * Get Vendor Product Count
 */
export const getVendorProductCount = async (req, res) => {
  try {
    const { vendorId } = req.query;
    
    if (!vendorId) {
      return res.status(400).json({ message: "Missing vendorId" });
    }
    
    const count = await VendorProduct.countDocuments({ 
      vendorId: mongoose.Types.ObjectId(vendorId) 
    });
    
    res.status(200).json({ count });
  } catch (error) {
    console.error("❌ Error getting vendor product count:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
