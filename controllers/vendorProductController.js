import VendorProduct from "../models/VendorProduct.js";

/**
 * Get Vendor's Products
 */
export const getVendorProducts = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ message: "Missing vendorId" });
    }
    const products = await VendorProduct.find({ vendorId });
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
    const { category, manufacturer, volumeRange } = req.query;
    
    // Build filter object
    const filter = {};
    if (category) filter.category = category;
    if (manufacturer) filter.manufacturer = manufacturer;
    if (volumeRange) filter.volumeRange = volumeRange;
    
    const products = await VendorProduct.find(filter).populate('vendorId', 'name email');
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
    const product = await VendorProduct.findById(productId).populate('vendorId', 'name email');
    
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
 * Update a Vendor Product
 */
export const updateVendorProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updates = req.body;
    
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
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Delete a Vendor Product
 */
export const deleteVendorProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const deletedProduct = await VendorProduct.findByIdAndDelete(productId);
    
    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting vendor product:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get Product Statistics for Admin Dashboard
 */
export const getProductStats = async (req, res) => {
  try {
    const stats = await VendorProduct.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          categoryCounts: {
            $push: "$category"
          },
          manufacturerCounts: {
            $push: "$manufacturer"
          },
          averageSpeed: { $avg: "$speed" },
          volumeRanges: {
            $push: "$volumeRange"
          }
        }
      },
      {
        $project: {
          totalProducts: 1,
          averageSpeed: { $round: ["$averageSpeed", 0] },
          categories: {
            $reduce: {
              input: "$categoryCounts",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  { $arrayToObject: [{ k: "$$this", v: 1 }] }
                ]
              }
            }
          },
          manufacturers: {
            $reduce: {
              input: "$manufacturerCounts", 
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  { $arrayToObject: [{ k: "$$this", v: 1 }] }
                ]
              }
            }
          }
        }
      }
    ]);
    
    res.status(200).json(stats[0] || { totalProducts: 0 });
  } catch (error) {
    console.error("❌ Error fetching product stats:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Search Products (for AI matching)
 */
export const searchProducts = async (req, res) => {
  try {
    const { 
      minVolume, 
      maxVolume, 
      category, 
      paperSize, 
      maxBudget,
      features 
    } = req.query;
    
    // Build search criteria
    const searchCriteria = {};
    
    if (minVolume || maxVolume) {
      searchCriteria.$and = [];
      if (minVolume) searchCriteria.$and.push({ maxVolume: { $gte: parseInt(minVolume) } });
      if (maxVolume) searchCriteria.$and.push({ minVolume: { $lte: parseInt(maxVolume) } });
    }
    
    if (category) searchCriteria.category = category;
    if (paperSize) searchCriteria['paperSizes.primary'] = paperSize;
    if (maxBudget) searchCriteria['costs.totalMachineCost'] = { $lte: parseInt(maxBudget) };
    if (features) {
      const featureList = features.split(',');
      searchCriteria.features = { $in: featureList };
    }
    
    const products = await VendorProduct.find(searchCriteria)
      .populate('vendorId', 'name email')
      .sort({ 'costs.totalMachineCost': 1 }); // Sort by cost ascending
    
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error searching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
