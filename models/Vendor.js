// models/Vendor.js

const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    company: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    services: [String], // Array of services offered
    uploads: [{ type: String }], // Array to store paths of uploaded files
    createdAt: { type: Date, default: Date.now }
});

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
