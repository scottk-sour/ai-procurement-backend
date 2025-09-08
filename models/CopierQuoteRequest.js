import mongoose from 'mongoose';

// Reusable sub-schema for uploaded files with metadata
const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true, trim: true },
  storageName: { type: String, required: true, trim: true },
  filePath: { type: String, required: true, trim: true },
  fileType: { type: String, required: true },
  fileSize: { type: Number },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'uploadedByType' },
  uploadedByType: { type: String, enum: ['User', 'Vendor', 'Admin'] },
  uploadDate: { type: Date, default: Date.now },
  description: { type: String }
});

// Main quote request schema
const copierQuoteRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyName: { type: String, required: true },
  industryType: { type: String },
  contractStartDate: { type: Date },
  contractEndDate: { type: Date },
  financeCompany: { type: String },
  quarterlyPayment: { type: Number },
  
  // Uploaded documents (e.g. contracts, invoices)
  uploadedFiles: [fileSchema],
  
  // Costs per copy (mono and colour)
  costPerCopy: {
    mono: { type: Number },
    colour: { type: Number }
  },
  
  // Monthly print volumes
  monthlyVolume: {
    mono: { type: Number },
    colour: { type: Number }
  },
  
  // Machine details for each location or type
  machineDetails: [{
    model: { type: String },
    isA3: { type: Boolean },
    trays: { type: Number },
    paperCut: { type: Boolean },
    followMePrint: { type: Boolean },
    bookletFinisher: { type: Boolean },
    location: { type: String }
  }],
  
  totalPrinters: { type: Number },
  monoPrinters: { type: Number },
  colourPrinters: { type: Number },
  reasonForUse: { type: String },
  
  // Current setup info
  currentMachinePurchased: { type: Boolean },
  currentInkSpend: { type: Number },
  cartridgeChangeFrequency: { type: String },
  isServiced: { type: Boolean },
  addedServices: [{ type: String }],
  
  // Preferences
  preference: {
    likeForLike: { type: Boolean },
    newModel: { type: Boolean },
    refurbished: { type: Boolean }
  },
  
  priorities: [{ type: String }], // e.g., ['eco-friendly', 'low-cost']
  
  locationPreference: {
    type: {
      type: String,
      enum: ['local', 'national']
    },
    radiusMiles: { type: Number }
  },
  
  aiRecommendationType: {
    type: String,
    enum: ['like-for-like', 'optimised'],
    default: 'like-for-like'
  },
  
  // FIXED: Updated status field to allow 'matched' value for AI processing
  status: { 
    type: String, 
    enum: ['pending', 'matched', 'processing', 'completed', 'cancelled', 'active'],
    default: 'pending'
  }
}, { timestamps: true });

export default mongoose.model('CopierQuoteRequest', copierQuoteRequestSchema);
