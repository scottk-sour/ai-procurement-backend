import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true }, // Lead's name
  email: { type: String, required: true }, // Lead's email
  phone: { type: String }, // Optional phone number
  message: { type: String }, // Message from the lead
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'],
    default: 'New',
  },
  createdAt: { type: Date, default: Date.now },
});

// Export the model as default
const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
