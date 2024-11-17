// /models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  productName: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  features: [String], // Array of features
  createdAt: { type: Date, default: Date.now }
});

// Create a model from the schema
const Product = mongoose.model('Product', productSchema);

module.exports = Product;
