import mongoose from 'mongoose';

const vendorPostSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  title: { type: String, required: true, maxlength: 200, trim: true },
  body: { type: String, required: true, maxlength: 5000, trim: true },
  category: {
    type: String,
    enum: ['news', 'product', 'offer', 'guide', 'update'],
    default: 'news',
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  status: {
    type: String,
    enum: ['published', 'hidden'],
    default: 'published',
  },
  slug: { type: String, unique: true, index: true },
  isDemoVendor: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-generate slug from title before validation
vendorPostSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('title')) {
    const base = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 80);
    // Append vendor ID fragment + timestamp to ensure uniqueness
    this.slug = `${base}-${this.vendor.toString().slice(-6)}`;
  }
  next();
});

// Indexes
vendorPostSchema.index({ status: 1, createdAt: -1 });
vendorPostSchema.index({ vendor: 1, status: 1 });
vendorPostSchema.index({ tags: 1 });

export default mongoose.model('VendorPost', vendorPostSchema);
