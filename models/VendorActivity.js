// models/VendorActivity.js
import mongoose from 'mongoose';

const VendorActivitySchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    type: {
      type: String,
      enum: ['signup', 'login', 'upload', 'listing', 'update'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const VendorActivity = mongoose.model('VendorActivity', VendorActivitySchema);

export default VendorActivity;
