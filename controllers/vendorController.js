import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';

// Vendor Signup
export const signup = async (req, res) => {
  const { name, company, email, password, services } = req.body;

  // Validate input
  if (!name || !company || !email || !password || !services) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // Check for existing vendor
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res
        .status(400)
        .json({ message: 'Vendor with this email already exists.' });
    }

    // Validate services
    const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];
    const isValidService = services.every((service) =>
      validServices.includes(service)
    );

    if (!isValidService) {
      return res.status(400).json({
        message: 'Invalid services provided. Allowed services are CCTV, Photocopiers, IT, and Telecoms.',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create and save new vendor
    const newVendor = new Vendor({
      name,
      company,
      email,
      password: hashedPassword,
      services,
    });

    const savedVendor = await newVendor.save();

    return res.status(201).json({
      message: 'Vendor registered successfully.',
      vendor: { id: savedVendor._id, name: savedVendor.name, email: savedVendor.email },
    });
  } catch (error) {
    console.error('Error in signup:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// Vendor Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Find vendor by email
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, {
      expiresIn: '1d', // Token expires in 1 day
    });

    return res.status(200).json({
      token,
      vendor: { id: vendor._id, name: vendor.name, email: vendor.email },
      message: 'Login successful.',
    });
  } catch (error) {
    console.error('Error in login:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
