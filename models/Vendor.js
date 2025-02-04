import mongoose from 'mongoose';

// Define valid services
const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];

// Define vendor schema
const vendorSchema = new mongoose.Schema({
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
  pricing: {
    type: Map,
    of: Number, // e.g. { "CCTV": 500 }
  },
  uploads: [
    {
      fileName: { type: String, required: true, trim: true },
      filePath: { type: String, required: true, trim: true },
      uploadDate: { type: Date, default: Date.now },
      fileType: {
        type: String,
        enum: ['pdf', 'csv', 'excel', 'image'],
        required: true,
      },
    },
  ],
  location: {
    type: String,
    trim: true,
  },
  contactInfo: {
    phone: {
      type: String,
      match: [/^\+?\d{10,15}$/, 'Please provide a valid phone number'],
    },
    address: { type: String, trim: true },
  },
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
});

// Pre-save hook for additional validation
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
  this.uploads = this.uploads.filter((upload) => upload._id.toString() !== fileId);
  await this.save();
};

const Vendor = mongoose.model('Vendor', vendorSchema);
export default Vendor;
