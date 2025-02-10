import mongoose from 'mongoose';

const quoteRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    serviceType: { type: String, required: true },
    budgetRange: { type: Number, required: true },
    specialRequirements: { type: String, required: true },
    status: { type: String, default: 'Pending' },
    preferredVendor: { type: String },
  },
  { timestamps: true }
);

export const QuoteRequest = mongoose.model('QuoteRequest', quoteRequestSchema);
