import mongoose from 'mongoose';

// Define the schema for user documents
const userDocumentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  }, // References the User model
  fileName: {
    type: String,
    required: [true, 'File name is required'],
    trim: true,
  }, // Name of the uploaded file
  filePath: {
    type: String,
    required: [true, 'File path is required'],
    trim: true,
  }, // Path where the file is stored
  uploadDate: {
    type: Date,
    default: Date.now,
  }, // Date when the file was uploaded
  documentType: {
    type: String,
    enum: ['contract', 'bill', 'others'], // Restricts document types
    default: 'others',
  }, // Type of the document
});

// Pre-save hook for additional logic if needed
userDocumentSchema.pre('save', function (next) {
  // Ensure the file path and file name are clean and consistent
  this.filePath = this.filePath.trim();
  this.fileName = this.fileName.trim();
  next();
});

// Export the model
const UserDocument = mongoose.model('UserDocument', userDocumentSchema);
export default UserDocument;
