import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  productName: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  features: [String], // Array of features
  createdAt: { type: Date, default: Date.now },
});

// Create and export the model
const Product = mongoose.model('Product', productSchema);

export default Product;
