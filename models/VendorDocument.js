// models/vendorDocument.js
import mongoose from 'mongoose';

const vendorDocumentSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  documentType: {
    type: String,
    default: 'others',
  },
  uploadDate: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('VendorDocument', vendorDocumentSchema);
