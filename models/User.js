import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true, 
    trim: true, 
    lowercase: true, 
    match: [/.+@.+\..+/, 'Please enter a valid email address'], 
  }, // User email with validation and formatting
  password: { 
    type: String, 
    required: [true, 'Password is required'], 
    minlength: [6, 'Password must be at least 6 characters long'] 
  }, // User password with validation
  name: { 
    type: String, 
    trim: true 
  }, // Optional user name
  company: { 
    type: String, 
    trim: true 
  }, // Optional company field
  role: { 
    type: String, 
    enum: ['user', 'vendor', 'admin'], 
    default: 'user' 
  }, // User role with default to 'user' (updated to include 'vendor' for consistency)
  token: { 
    type: String, 
    default: null 
  }, // Add token field for persistence (optional, can store JWT or null)
  createdAt: { 
    type: Date, 
    default: Date.now 
  }, // Account creation timestamp
});

// Pre-save hook to ensure lowercase email
userSchema.pre('save', function (next) {
  this.email = this.email.toLowerCase();
  next();
});

// Export the model
const User = mongoose.model('User', userSchema);
export default User;