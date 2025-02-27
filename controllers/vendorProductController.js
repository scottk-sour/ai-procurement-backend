import VendorProduct from "../models/VendorProduct.js";

/**
 * Upload Vendor Products (CSV/Excel Parsing)
 */
export const uploadVendorProducts = async (req, res) => {
  try {
    const { vendorId, products } = req.body;

    if (!vendorId || !products || !Array.isArray(products)) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Format data and save to database
    const formattedProducts = products.map(product => ({
      vendorId,
      manufacturer: product.manufacturer,
      model: product.model,
      speed: product.speed,
      description: product.description,
      cost: product.cost,
      installation: product.installation,
      profitMargin: product.profitMargin,
      minVolume: product.minVolume,
      maxVolume: product.maxVolume,
      totalMachineCost: product.totalMachineCost,
      costPerCopy: product.costPerCopy, // Object: { A4 Mono, A4 Color, etc. }
      auxiliaries: product.auxiliaries, // Object: { "500 sheet tray": 357 }
      leaseRates: product.leaseRates, // Object: { "24_month": 156 }
    }));

    await VendorProduct.insertMany(formattedProducts);
    return res.status(201).json({ message: "Vendor products uploaded successfully" });

  } catch (error) {
    console.error("❌ Error uploading vendor products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

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
 * Get All Vendor Products (Admin View)
 */
export const getAllVendorProducts = async (req, res) => {
  try {
    const products = await VendorProduct.find();
    res.status(200).json(products);
  } catch (error) {
    console.error("❌ Error fetching all vendor products:", error);
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
