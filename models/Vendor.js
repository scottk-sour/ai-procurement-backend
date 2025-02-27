import mongoose from 'mongoose';

// Define valid services
const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];

// Define file schema for uploaded files
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

// Define machine schema for vendor product listings
const machineSchema = new mongoose.Schema({
  model: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['A3', 'A4'], trim: true },
  mono_cpc: { type: Number, required: true },
  color_cpc: { type: Number, required: true },
  lease_cost: { type: Number, required: true },
  services: { type: String, trim: true, default: '' },
  provider: { type: String, required: true, trim: true },
});

// Define vendor schema
const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      match: [/.+@.+\..+/, 'Please provide a valid email address'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    services: {
      type: [String],
      required: [true, 'At least one service must be provided'],
      validate: {
        validator: function (services) {
          return services.every((service) => validServices.includes(service));
        },
        message:
          'Invalid service(s) provided. Allowed services are CCTV, Photocopiers, IT, and Telecoms.',
      },
    },
    // A Map to store pricing per service (if needed)
    pricing: {
      type: Map,
      of: Number, // e.g., { "CCTV": 500, "Photocopiers": 1000 }
    },
    uploads: [fileSchema], // Array of uploaded file metadata
    machines: [machineSchema], // Array of machine/product listings
    // Additional fields for quote comparison
    location: { type: String, trim: true, default: '' },
    contactInfo: {
      phone: {
        type: String,
        match: [/^\+?\d{10,15}$/, 'Please provide a valid phone number'],
        default: '',
      },
      address: { type: String, trim: true, default: '' },
    },
    // Extra fields that the UI will display (if not provided, defaults will show "Not Available")
    price: { type: Number, default: 0 },
    serviceLevel: { type: String, default: '' },
    responseTime: { type: Number, default: 0 }, // in hours
    yearsInBusiness: { type: Number, default: 0 },
    support: { type: String, default: '' },
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot exceed 5'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Pre-save Hook for basic validations
vendorSchema.pre('save', function (next) {
  if (!this.services || this.services.length === 0) {
    return next(new Error('At least one service must be provided.'));
  }
  if (this.rating < 0 || this.rating > 5) {
    return next(new Error('Rating must be between 0 and 5.'));
  }
  next();
});

// Instance method to get active services
vendorSchema.methods.getActiveServices = function () {
  return this.services.filter((service) => validServices.includes(service));
};

// Instance method to add an uploaded file
vendorSchema.methods.addUpload = async function (fileName, filePath, fileType) {
  if (!['pdf', 'csv', 'excel', 'image'].includes(fileType)) {
    throw new Error('Invalid file type.');
  }
  this.uploads.push({
    fileName,
    filePath,
    fileType,
    uploadDate: new Date(),
  });
  await this.save();
};

// Instance method to remove an uploaded file by its ID
vendorSchema.methods.removeUpload = async function (fileId) {
  this.uploads = this.uploads.filter(
    (upload) => upload._id.toString() !== fileId
  );
  await this.save();
};

// Instance method to add a machine listing
vendorSchema.methods.addMachine = async function (machineData) {
  this.machines.push(machineData);
  await this.save();
};

// Instance method to remove a machine by its ID
vendorSchema.methods.removeMachine = async function (machineId) {
  this.machines = this.machines.filter(
    (machine) => machine._id.toString() !== machineId
  );
  await this.save();
};

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
