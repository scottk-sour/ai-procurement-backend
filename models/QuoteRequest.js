import mongoose from 'mongoose';
import OpenAI from 'openai';  // Add this import for embedding generation

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  // New: Embedding for semantic matching (from description, requiredFunctions, etc.)
  embedding: { type: [Number], default: [] }  // Vector embedding array
});

// Middleware to auto-generate embedding on save/update
quoteRequestSchema.pre('save', async function(next) {
  // Generate embedding if relevant fields changed
  if (this.isModified('requiredFunctions') || this.isModified('preference') || this.isModified('additionalServices')) {
    try {
      const text = `${this.preference || ''} ${this.requiredFunctions?.join(' ') || ''} ${this.additionalServices?.join(' ') || ''}`;
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text
      });
      this.embedding = response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding for quote request:', error);
      // Continue without embedding if fails
    }
  }
  
  next();
});

export default mongoose.model('QuoteRequest', quoteRequestSchema);