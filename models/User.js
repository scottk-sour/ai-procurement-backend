// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Add any additional fields if necessary
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
