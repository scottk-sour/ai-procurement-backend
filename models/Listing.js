import mongoose from 'mongoose';

const listingSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  uploads: [
    {
      fileName: String,
      filePath: String,
      uploadDate: { type: Date, default: Date.now },
    }
  ],
  createdAt: { type: Date, default: Date.now },
});

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
