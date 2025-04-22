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