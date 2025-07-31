// models/VendorDocument.js - Enhanced version
import mongoose from 'mongoose';
import path from 'path';

const vendorDocumentSchema = new mongoose.Schema({
  // Core References
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },

  // File Information
  fileName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },

  originalFileName: {
    type: String,
    required: true,
    trim: true
  },

  filePath: {
    type: String,
    required: true,
    trim: true
  },

  fileUrl: {
    type: String, // Full URL for direct access
    trim: true
  },

  // Document Classification
  documentType: {
    type: String,
    enum: [
      // Product-related
      'product_catalog',      // CSV/Excel with product listings
      'price_list',          // Pricing information
      'product_images',      // Equipment photos
      'specifications',      // Technical spec sheets
      'user_manual',         // Product manuals
      
      // Business documents
      'business_license',    // Legal registration
      'insurance_cert',      // Insurance certificates
      'tax_documents',       // VAT registration, etc.
      'certifications',      // ISO, quality certs
      'accreditations',      // Manufacturer partnerships
      
      // Commercial
      'terms_conditions',    // Service terms
      'warranty_info',       // Warranty documentation
      'service_agreement',   // Support contracts
      'lease_terms',         // Leasing agreements
      
      // Marketing
      'brochures',          // Marketing materials
      'case_studies',       // Customer success stories
      'testimonials',       // Customer reviews
      
      // Technical
      'installation_guide', // Setup instructions
      'network_diagrams',   // IT infrastructure
      'software_packages',  // Drivers, software
      
      // Other
      'others'
    ],
    required: true,
    default: 'others',
    index: true
  },

  // File Metadata
  fileMetadata: {
    size: { type: Number, required: true }, // bytes
    mimeType: { type: String, required: true },
    extension: { type: String, required: true },
    checksum: { type: String }, // MD5 or SHA256 hash
    encoding: { type: String, default: 'utf-8' },
    
    // For images
    dimensions: {
      width: { type: Number },
      height: { type: Number }
    },
    
    // For CSV/Excel files
    rowCount: { type: Number },
    columnCount: { type: Number },
    headers: [{ type: String }], // CSV column headers
    
    // For any structured data
    recordCount: { type: Number }, // Number of products/records
    dataFormat: { type: String, enum: ['csv', 'excel', 'json', 'xml', 'pdf', 'image', 'text'] }
  },

  // Processing Status
  processingStatus: {
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'processed', 'imported', 'failed', 'rejected'],
      default: 'uploaded',
      index: true
    },
    
    processedAt: { type: Date },
    
    // For product catalogs
    importStatus: {
      totalRecords: { type: Number },
      successfulImports: { type: Number },
      failedImports: { type: Number },
      duplicatesSkipped: { type: Number },
      validationErrors: [{ type: String }],
      importedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VendorProduct' }]
    },
    
    // Processing errors
    errors: [{
      error: { type: String },
      line: { type: Number }, // For CSV errors
      field: { type: String },
      timestamp: { type: Date, default: Date.now }
    }],
    
    // Processing notes
    notes: { type: String, maxlength: 1000 }
  },

  // Security & Access
  security: {
    isPublic: { type: Boolean, default: false },
    accessLevel: {
      type: String,
      enum: ['vendor_only', 'admin_only', 'public', 'internal'],
      default: 'vendor_only'
    },
    
    encryptionStatus: {
      type: String,
      enum: ['none', 'at_rest', 'in_transit', 'both'],
      default: 'none'
    },
    
    // Virus scanning
    virusScanned: { type: Boolean, default: false },
    virusScanResult: {
      type: String,
      enum: ['clean', 'infected', 'suspicious', 'not_scanned'],
      default: 'not_scanned'
    },
    
    scanDate: { type: Date }
  },

  // Version Control
  version: {
    versionNumber: { type: Number, default: 1 },
    isLatest: { type: Boolean, default: true },
    previousVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorDocument' },
    changeLog: { type: String, maxlength: 500 }
  },

  // Usage Tracking
  usage: {
    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    lastAccessed: { type: Date },
    lastAccessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Integration usage
    apiAccessCount: { type: Number, default: 0 },
    lastApiAccess: { type: Date }
  },

  // Business Impact
  businessImpact: {
    relatedQuotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quote' }],
    revenue: { type: Number, default: 0 }, // Revenue attributed to this document
    productCount: { type: Number, default: 0 }, // Products created from this document
    conversionRate: { type: Number, default: 0 } // Success rate for quotes using this data
  },

  // Compliance & Retention
  compliance: {
    retentionPeriod: { type: Number }, // days
    expiryDate: { type: Date },
    complianceFlags: [{ type: String }], // GDPR, regulatory requirements
    
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    }
  },

  // Timestamps
  uploadDate: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastModified: { type: Date },
  
  // Soft delete
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletionReason: { type: String }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
vendorDocumentSchema.virtual('fileSize').get(function() {
  if (!this.fileMetadata?.size) return 'Unknown';
  
  const bytes = this.fileMetadata.size;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
});

vendorDocumentSchema.virtual('isProcessed').get(function() {
  return ['processed', 'imported'].includes(this.processingStatus.status);
});

vendorDocumentSchema.virtual('canBeImported').get(function() {
  return ['product_catalog', 'price_list', 'specifications'].includes(this.documentType) &&
         ['csv', 'excel'].includes(this.fileMetadata.dataFormat);
});

// Instance methods
vendorDocumentSchema.methods.markAsProcessed = function(importResults = {}) {
  this.processingStatus.status = 'processed';
  this.processingStatus.processedAt = new Date();
  this.processingStatus.importStatus = { ...this.processingStatus.importStatus, ...importResults };
  return this.save();
};

vendorDocumentSchema.methods.incrementUsage = function(type = 'view') {
  if (type === 'download') {
    this.usage.downloadCount += 1;
  } else if (type === 'view') {
    this.usage.viewCount += 1;
  } else if (type === 'api') {
    this.usage.apiAccessCount += 1;
    this.usage.lastApiAccess = new Date();
  }
  
  this.usage.lastAccessed = new Date();
  return this.save();
};

vendorDocumentSchema.methods.softDelete = function(reason, deletedBy) {
  this.deletedAt = new Date();
  this.deletionReason = reason;
  this.deletedBy = deletedBy;
  return this.save();
};

// Static methods
vendorDocumentSchema.statics.findByType = function(vendorId, documentType) {
  return this.find({ 
    vendorId, 
    documentType,
    deletedAt: { $exists: false }
  }).sort({ uploadDate: -1 });
};

vendorDocumentSchema.statics.findProcessed = function(vendorId) {
  return this.find({
    vendorId,
    'processingStatus.status': { $in: ['processed', 'imported'] },
    deletedAt: { $exists: false }
  });
};

vendorDocumentSchema.statics.getImportableDocuments = function(vendorId) {
  return this.find({
    vendorId,
    documentType: { $in: ['product_catalog', 'price_list', 'specifications'] },
    'fileMetadata.dataFormat': { $in: ['csv', 'excel'] },
    'processingStatus.status': { $in: ['uploaded', 'processed'] },
    deletedAt: { $exists: false }
  });
};

// Pre-save middleware
vendorDocumentSchema.pre('save', function(next) {
  // Auto-set file extension and data format
  if (this.isNew || this.isModified('fileName')) {
    this.fileMetadata.extension = path.extname(this.fileName).toLowerCase();
    
    // Determine data format from extension
    const ext = this.fileMetadata.extension;
    if (['.csv'].includes(ext)) {
      this.fileMetadata.dataFormat = 'csv';
    } else if (['.xlsx', '.xls'].includes(ext)) {
      this.fileMetadata.dataFormat = 'excel';
    } else if (['.json'].includes(ext)) {
      this.fileMetadata.dataFormat = 'json';
    } else if (['.pdf'].includes(ext)) {
      this.fileMetadata.dataFormat = 'pdf';
    } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      this.fileMetadata.dataFormat = 'image';
    }
  }
  
  // Update lastModified
  if (!this.isNew) {
    this.lastModified = new Date();
  }
  
  next();
});

// Indexes for efficient querying
vendorDocumentSchema.index({ vendorId: 1, documentType: 1 });
vendorDocumentSchema.index({ 'processingStatus.status': 1 });
vendorDocumentSchema.index({ uploadDate: -1 });
vendorDocumentSchema.index({ deletedAt: 1 }, { sparse: true });
vendorDocumentSchema.index({ 'fileMetadata.dataFormat': 1 });
vendorDocumentSchema.index({ 'security.accessLevel': 1 });

const VendorDocument = mongoose.model('VendorDocument', vendorDocumentSchema);
export default VendorDocument;
