// models/UserDocument.js
const mongoose = require('mongoose');

const userDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  documentType: { type: String, enum: ['contract', 'bill'], required: true }
});

const UserDocument = mongoose.model('UserDocument', userDocumentSchema);

module.exports = UserDocument;
