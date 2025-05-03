import mongoose from 'mongoose';

const vendorProductSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  speed: { type: Number, required: true },
  description: { type: String },
  cost: { type: Number, required: true },
  installation: { type: Number, required: true },
  profitMargin: { type: Number, required: true },
  minVolume: { type: Number, required: true },
  maxVolume: { type: Number, required: true },
  totalMachineCost: { type: Number, required: true },
  costPerCopy: {
    A4Mono: { type: Number, required: true },
    A4Colour: { type: Number, required: true },
    A3Mono: { type: Number, required: true },
    A3Colour: { type: Number, required: true },
    SRA3Mono: { type: Number, required: true },
    SRA3Colour: { type: Number, required: true },
  },
  auxiliaries: [
    {
      item: { type: String, required: true },
      price: { type: Number, required: true },
    },
  ],
  leaseRates: [
    {
      month: { type: Number, required: true },
      profile: { type: String, required: true },
      ratePer000: { type: Number, required: true },
    },
  ],
}, { timestamps: true });

const VendorProduct = mongoose.model('VendorProduct', vendorProductSchema);
export default VendorProduct;
