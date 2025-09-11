// models/Order.js - Complete updated version with quote reference
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      product: { type: String, required: true },
      quantity: { type: Number, default: 1 },
      price: { type: Number, required: true },
    },
  ],
  totalPrice: { type: Number, required: true },
  
  // NEW: Quote reference for tracking
  quoteReference: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
  
  // NEW: Order type for categorization
  orderType: { 
    type: String, 
    enum: ['quote_acceptance', 'direct_order', 'renewal'], 
    default: 'quote_acceptance' 
  },
  
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  
  // Additional order details
  orderDetails: {
    deliveryAddress: { type: String },
    installationRequired: { type: Boolean, default: true },
    preferredDeliveryDate: { type: Date },
    specialInstructions: { type: String },
    contactPerson: { type: String },
    contactPhone: { type: String }
  },
  
  // Tracking information
  tracking: {
    orderConfirmedAt: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    installedAt: { type: Date },
    trackingNumber: { type: String },
    courierService: { type: String }
  },
  
  // Payment information
  payment: {
    method: { type: String, enum: ['lease', 'purchase', 'rental'], default: 'lease' },
    terms: { type: String },
    firstPaymentDate: { type: Date },
    paymentFrequency: { type: String, enum: ['monthly', 'quarterly', 'annually'], default: 'quarterly' }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for order status display
orderSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'Pending': 'Pending Confirmation',
    'Processing': 'Being Processed',
    'Completed': 'Completed',
    'Cancelled': 'Cancelled'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for estimated delivery
orderSchema.virtual('estimatedDelivery').get(function() {
  if (this.orderDetails?.preferredDeliveryDate) {
    return this.orderDetails.preferredDeliveryDate;
  }
  // Default to 2-3 weeks from order creation
  const estimatedDate = new Date(this.createdAt);
  estimatedDate.setDate(estimatedDate.getDate() + 21); // 3 weeks
  return estimatedDate;
});

// Pre-save middleware
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set order confirmation timestamp when status changes to Processing
  if (this.status === 'Processing' && !this.tracking.orderConfirmedAt) {
    this.tracking.orderConfirmedAt = new Date();
  }
  
  next();
});

// Indexes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, status: 1 });
orderSchema.index({ quoteReference: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
