const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, // Vendor's name
  company: { type: String, required: true, trim: true }, // Company name
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    match: [/.+@.+\..+/, 'Please provide a valid email address'], // Email validation
  },
  password: { type: String, required: true }, // Hashed password
  services: { 
    type: [String], 
    required: true, // Ensure at least one service is provided
    validate: {
      validator: function (services) {
        const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];
        return services.every(service => validServices.includes(service));
      },
      message: 'Invalid service(s) provided. Allowed services are CCTV, Photocopiers, IT, and Telecoms.',
    },
  },
  pricing: { 
    type: Map,
    of: Number, // Pricing for each service, e.g., { "CCTV": 500 }
  },
  uploads: [
    {
      fileName: { type: String }, // Name of the uploaded file
      filePath: { type: String }, // Path to the uploaded file
      uploadDate: { type: Date, default: Date.now }, // Timestamp for upload
    },
  ],
  location: { type: String, trim: true }, // Vendor's location
  contactInfo: { 
    phone: { 
      type: String, 
      match: [/^\+?\d{10,15}$/, 'Please provide a valid phone number'], // Phone number validation
    }, 
    address: { type: String, trim: true }, // Optional address
  },
  rating: { 
    type: Number, 
    default: 0, 
    min: [0, 'Rating cannot be less than 0'], 
    max: [5, 'Rating cannot exceed 5'], 
  },
  createdAt: { type: Date, default: Date.now }, // Timestamp for creation
});

// Pre-save hook to ensure data integrity
vendorSchema.pre('save', function (next) {
  if (this.services.length === 0) {
    return next(new Error('At least one service must be provided.'));
  }
  next();
});

module.exports = mongoose.model('Vendor', vendorSchema);
