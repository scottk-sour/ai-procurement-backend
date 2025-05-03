// models/QuoteRequest.js
import mongoose from 'mongoose';

const quoteRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceType: { type: String, required: true },
  companyName: { type: String },
  industryType: { type: String },
  numEmployees: { type: Number },
  numOfficeLocations: { type: Number },
  multipleFloors: { type: Boolean, default: false },
  colour: { type: String },
  type: { type: String },
  minSpeed: { type: Number },
  price: { type: Number },
  monthlyVolume: {
    mono: { type: Number, default: 0 },
    colour: { type: Number, default: 0 },
  },
  monthlyPrintVolume: { type: Number },
  annualPrintVolume: { type: Number },
  currentColourCPC: { type: Number },
  currentMonoCPC: { type: Number },
  quarterlyLeaseCost: { type: Number },
  leasingCompany: { type: String },
  serviceProvider: { type: String },
  contractStartDate: { type: Date },
  contractEndDate: { type: Date },
  additionalServices: { type: [String], default: [] },
  paysForScanning: { type: Boolean, default: false },
  requiredFunctions: { type: [String], default: [] },
  preference: { type: String },
  status: { type: String, default: 'In Progress' },
  matchedVendors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }],
  preferredVendor: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('QuoteRequest', quoteRequestSchema);