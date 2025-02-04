import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true }, // Vendor reference
  title: { type: String, required: true }, // Listing title
  description: { type: String, required: true }, // Listing description
  price: { type: Number, required: true }, // Listing price
  isActive: { type: Boolean, default: true }, // Listing status
  createdAt: { type: Date, default: Date.now }, // Timestamp
});

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
