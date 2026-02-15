import mongoose from 'mongoose';

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  source: {
    type: String,
    default: 'website',
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
  unsubscribed: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model('Subscriber', subscriberSchema);
