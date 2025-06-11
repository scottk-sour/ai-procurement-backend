import mongoose from 'mongoose';

const AuxiliarySchema = new mongoose.Schema({
  item: { type: String, required: true },
  price: { type: Number, required: true }
}, { _id: false });

const LeaseTermsAndMarginsSchema = new mongoose.Schema({
  term: { type: Number, required: true },     // in months (12, 24, 36, 48, 60, etc.)
  margin: { type: Number, required: true }    // as decimal, e.g., 0.5 for 50%
}, { _id: false });

const vendorProductSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  description: { type: String },
  speed: { type: Number, required: true }, // ppm
  isA3: { type: Boolean, default: false },
  features: [{ type: String }], // e.g., ["scan", "fax", "booklet finisher"]
  minVolume: { type: Number, required: true },
  maxVolume: { type: Number, required: true },
  salePrice: { type: Number, required: true },
  leaseTermsAndMargins: [LeaseTermsAndMarginsSchema], // [{term: 36, margin: 0.6}]
  auxiliaries: [AuxiliarySchema], // [{item: "booklet finisher", price: 250}]
  A4MonoCPC: { type: Number, required: true },
  A4ColourCPC: { type: Number, required: true },
  A3MonoCPC: { type: Number },
  A3ColourCPC: { type: Number },
  adminFee: { type: Number },
  minMonthlyCPC: { type: Number },
  serviceLevel: { type: String },
  responseTime: { type: Number },
  support: { type: String },
  stockStatus: { type: String },
  modelYear: { type: Number },
  complianceTags: [{ type: String }],
  regionsCovered: [{ type: String }],
  industries: [{ type: String }],
}, { timestamps: true });

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);
export default VendorProduct;
