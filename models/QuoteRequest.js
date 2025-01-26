import mongoose from 'mongoose';

const quoteRequestSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }, // Reference to the user making the request
  serviceType: { 
    type: String, 
    required: true 
  }, // Type of service requested
  quantity: { 
    type: Number, 
    required: true 
  }, // Quantity of items or services requested
  preferredVendor: { 
    type: String 
  }, // Optional preferred vendor name
  deadline: { 
    type: Date, 
    required: true 
  }, // Deadline for the quote request
  specialRequirements: { 
    type: String 
  }, // Optional special requirements
  budgetRange: { 
    type: String, 
    required: true 
  }, // Budget range for the request
  category: { 
    type: String, 
    default: 'General' 
  }, // Category of the request (default to "General")
  productName: { 
    type: String 
  }, // Optional product name
  status: { 
    type: String, 
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], 
    default: 'Pending' 
  }, // Status of the quote request
  createdAt: { 
    type: Date, 
    default: Date.now 
  }, // Timestamp of the request
});

// Create and export the model
const QuoteRequest = mongoose.model('QuoteRequest', quoteRequestSchema);
export default QuoteRequest;
