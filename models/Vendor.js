// models/Vendor.js
const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Vendor's name
  company: { type: String, required: true }, // Company name
  email: { type: String, required: true, unique: true }, // Vendor's email
  password: { type: String, required: true }, // Hashed password
  services: { // Services offered by the vendor
    type: [String],
    validate: {
      validator: function (services) {
        // Allow only predefined services
        const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];
        return services.every(service => validServices.includes(service));
      },
      message: 'Invalid service provided',
    },
  },
  pricing: { // Optional pricing information
    type: Map,
    of: Number, // Example: { CCTV: 500, Photocopiers: 300 }
  },
  uploads: [{ type: String }], // Paths to uploaded files (e.g., product catalogs)
  location: { type: String }, // Vendor's location (optional)
  contactInfo: { type: String }, // Vendor's contact details (e.g., phone number)
  rating: { type: Number, default: 0 }, // Vendor's rating (optional)
  createdAt: { type: Date, default: Date.now }, // Timestamp for creation
});

// Export the model
module.exports = mongoose.model('Vendor', vendorSchema);
