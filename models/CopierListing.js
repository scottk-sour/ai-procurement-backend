// models/CopierListing.js
import mongoose from 'mongoose';

const copierListingSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  model: { type: String, required: true },
  buyInPrice: { type: Number, default: 0 },
  costPerCopy: {
    mono: [
      {
        volumeRange: { type: String },
        price: { type: Number, default: 0 }
      }
    ],
    colour: [
      {
        volumeRange: { type: String },
        price: { type: Number, default: 0 }
      }
    ]
  },
  extraTrays: { type: Number, default: 0 },
  paperCut: { type: Number, default: 0 },
  followMePrint: { type: Number, default: 0 },
  bookletFinisher: { type: Number, default: 0 },
  tonerCollection: { type: Number, default: 0 },
  leaseOptions: [
    {
      termMonths: { type: Number },
      leasePercentage: { type: Number, default: 0 }
    }
  ],
  isRefurbished: { type: Boolean, default: false },
  refurbishedPricing: {
    buyInPrice: { type: Number, default: 0 },
    costPerCopyMono: { type: Number, default: 0 },
    costPerCopyColour: { type: Number, default: 0 }
  },
  vendorMarginType: { type: String, default: 'percentage' },
  vendorMarginValue: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('CopierListing', copierListingSchema);
