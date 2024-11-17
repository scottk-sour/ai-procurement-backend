const mongoose = require('mongoose');

const quoteRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productName: { type: String, required: true },
  category: { type: String, required: true },
  budget: { type: Number, required: true },
  features: [String],
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } // 'pending', 'completed'
});

const QuoteRequest = mongoose.model('QuoteRequest', quoteRequestSchema);

module.exports = QuoteRequest;
