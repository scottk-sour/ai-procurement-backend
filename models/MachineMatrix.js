import mongoose from 'mongoose';

// Schema for Cost Per Copy details
const costPerCopySchema = new mongoose.Schema({
  A4Mono: { type: Number, required: true },
  A4Color: { type: Number, required: true },
  A3Mono: { type: Number, required: true },
  A3Color: { type: Number, required: true },
  SRA3Mono: { type: Number, required: true },
  SRA3Color: { type: Number, required: true },
}, { _id: false });

// Schema for Lease Rates (e.g., duration, profile, and rate)
const leaseRateSchema = new mongoose.Schema({
  durationMonths: { type: Number, required: true },
  profile: { type: String, required: true },
  ratePerThousand: { type: Number, required: true },
}, { _id: false });

// Schema for Auxiliary Items (optional add-ons)
const auxiliarySchema = new mongoose.Schema({
  item: { type: String, required: true },
  price: { type: Number, required: true },
}, { _id: false });

// Main MachineMatrix Schema
const machineMatrixSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  manufacturer: { type: String, required: true }, // e.g., "Develop"
  model: { type: String, required: true },          // e.g., "INEO+ 3301i"
  type: { type: String, required: true },           // e.g., "A4 Printer", "A4 MFP", "A3 MFP", "SRA3 MFP"
  speed: { type: Number },                           // Machine speed (ppm), optional
  description: { type: String },
  cost: { type: Number, required: true },           // Base cost of the machine
  installation: { type: Number, required: true },   // Installation fee
  profitMargin: { type: Number, required: true },     // Profit margin
  minVolume: { type: Number, required: true },        // Minimum recommended volume
  maxVolume: { type: Number, required: true },        // Maximum recommended volume
  totalMachineCost: { type: Number, required: true }, // Total machine cost (e.g., cost + installation + profit margin)
  costPerCopy: { type: costPerCopySchema, required: true },
  auxiliaries: [auxiliarySchema],
  leaseRates: [leaseRateSchema],
}, { timestamps: true });

const MachineMatrix = mongoose.model('MachineMatrix', machineMatrixSchema);
export default MachineMatrix;
