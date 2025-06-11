import mongoose from 'mongoose';

const QuoteFeedbackSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  quoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CopierQuoteRequest',
    required: false,
  },
  vendorName: {
    type: String,
    required: true,
    trim: true,
  },
  accepted: {
    type: Boolean,
    required: true,
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

QuoteFeedbackSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('QuoteFeedback', QuoteFeedbackSchema);
