const mongoose = require('mongoose'); // Import mongoose

const QuoteRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceType: { type: String, required: true },
  quantity: { type: Number, required: true },
  preferredVendor: { type: String, required: false },
  deadline: { type: Date, required: true },
  specialRequirements: { type: String, required: false },
  budgetRange: { type: String, required: true },
  category: { type: String, required: false },
  productName: { type: String, required: false },
  status: { type: String, default: 'Pending' },
}, { timestamps: true }); // Add timestamps for createdAt and updatedAt

module.exports = mongoose.model('QuoteRequest', QuoteRequestSchema);
