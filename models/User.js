// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true, 
    trim: true, 
    lowercase: true, 
    match: [/.+@.+\..+/, 'Please enter a valid email address'], 
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'], 
    minlength: [6, 'Password must be at least 6 characters long'] 
  },
  name: { 
    type: String, 
    trim: true,
    required: [true, 'Name is required'] 
  },
  company: { 
    type: String, 
    trim: true 
  },
  role: { 
    type: String, 
    enum: ['user', 'vendor', 'admin'], 
    default: 'user' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
