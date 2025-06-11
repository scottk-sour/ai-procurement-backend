// models/Vendor.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];

const fileSchema = new mongoose.Schema({
  fileName: { type: String, required: true, trim: true },
  filePath: { type: String, required: true, trim: true },
  fileType: {
    type: String,
    enum: ['pdf', 'csv', 'excel', 'image'],
    required: true,
  },
  uploadDate: { type: Date, default: Date.now },
});

const machineSchema = new mongoose.Schema({
  model: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['A3', 'A4'], trim: true },
  mono_cpc: { type: Number, required: true },
  color_cpc: { type: Number, required: true },
  lease_cost: { type: Number, required: true },
  services: { type: String, trim: true, default: '' },
  provider: { type: String, required: true, trim: true },
});

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/.+@.+\..+/, 'Please provide a valid email address'],
      index: true,
    },
    password: { type: String, required: true },
    services: {
      type: [String],
      required: true,
      validate: {
        validator: function(arr) {
          return arr.every((service) => validServices.includes(service));
        },
        message: 'Invalid service(s). Allowed: CCTV, Photocopiers, IT, Telecoms.',
      },
    },
    pricing: { type: Map, of: Number },
    uploads: { type: [fileSchema], default: [] },
    machines: { type: [machineSchema], default: [] },
    location: { type: String, trim: true, default: '' },
    contactInfo: {
      phone: {
        type: String,
        match: [/^\+?\d{10,15}$/, 'Please provide a valid phone number'],
        default: '',
      },
      address: { type: String, trim: true, default: '' },
    },
    price: { type: Number, default: 0 },
    serviceLevel: { type: String, default: '' },
    responseTime: { type: Number, default: 0 },
    yearsInBusiness: { type: Number, default: 0 },
    support: { type: String, default: '' },
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot exceed 5'],
    },
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'inactive', 'suspended'],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Password comparison method (used during login)
vendorSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ✅ Export model
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
export default Vendor;
