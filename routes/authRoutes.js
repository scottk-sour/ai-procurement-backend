import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { sendPasswordResetEmail, sendVendorWelcomeEmail } from '../services/emailService.js';
import { validatePassword } from '../utils/passwordValidator.js';
import 'dotenv/config';

const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables!');
}

// ======= Middleware =======
const validateRequestBody = (fields) => {
  return (req, res, next) => {
    const missingFields = fields.filter((field) => !req.body[field]);
    if (missingFields.length) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });
    }
    if (fields.includes('email') && !/\S+@\S+\.\S+/.test(req.body.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (fields.includes('password')) {
      const pwError = validatePassword(req.body.password);
      if (pwError) return res.status(400).json({ message: pwError });
    }
    next();
  };
};

// ======= Health Check =======
router.get('/', (req, res) => {
  res.send('Auth route is working!');
});

// ======= User Registration =======
router.post(
  '/register',
  validateRequestBody(['name', 'email', 'password']),
  async (req, res) => {
    const { name, email, password } = req.body;
    try {
      if (await User.findOne({ email })) {
        return res.status(400).json({ message: 'User already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = new User({ name, email, password: hashedPassword, role: 'user' });
      await newUser.save();
      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('User registration error:', error.message);
      res.status(500).json({ message: 'Failed to register user', error: error.message });
    }
  }
);

// ======= Vendor Registration =======
router.post(
  '/vendor-register',
  validateRequestBody(['name', 'email', 'password']),
  async (req, res) => {
    const { name, email, password, company, services } = req.body;
    try {
      if (await Vendor.findOne({ email })) {
        return res.status(400).json({ message: 'Vendor already exists' });
      }

      const newVendor = new Vendor({
        name,
        email,
        password, // Will be hashed by pre-save hook
        company: company || name,
        services: services || ['Photocopiers'],
        role: 'vendor',
        'account.status': 'active',
        tier: 'free'
      });
      await newVendor.save();

      // Send welcome email (non-blocking)
      sendVendorWelcomeEmail(email, { vendorName: name }).catch(err => {
        console.error('Failed to send welcome email:', err.message);
      });

      res.status(201).json({ message: 'Vendor registered successfully' });
    } catch (error) {
      console.error('Vendor registration error:', error.message);
      res.status(500).json({ message: 'Failed to register vendor', error: error.message });
    }
  }
);

// ======= User Login =======
router.post(
  '/login',
  validateRequestBody(['email', 'password']),
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user', name: user.name },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      res.status(200).json({
        message: 'Login successful',
        token,
        userId: user._id,
        role: user.role || 'user',
        name: user.name,
        email: user.email,
      });
    } catch (error) {
      console.error('User login error:', error.message);
      res.status(500).json({ message: 'Failed to login', error: error.message });
    }
  }
);

// ======= Vendor Login =======
router.post(
  '/vendor-login',
  validateRequestBody(['email', 'password']),
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const vendor = await Vendor.findOne({ email });
      if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { vendorId: vendor._id, role: vendor.role || 'vendor', name: vendor.name },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      res.status(200).json({
        message: 'Login successful',
        token,
        vendorId: vendor._id,
        role: vendor.role || 'vendor',
        name: vendor.name,
        email: vendor.email,
      });
    } catch (error) {
      console.error('Vendor login error:', error.message);
      res.status(500).json({ message: 'Failed to login', error: error.message });
    }
  }
);

// ======= Verify Token (Fixed to avoid 304 caching) =======
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.userId) {
      const user = await User.findById(decoded.userId);
      if (!user) return res.status(401).json({ message: 'Invalid token' });

      res.set('Cache-Control', 'no-store'); // ✅ Fix for 304
      return res.status(200).json({
        message: 'Token is valid',
        user: {
          userId: user._id,
          role: user.role || 'user',
          name: user.name,
          email: user.email,
        },
      });
    }

    if (decoded.vendorId) {
      const vendor = await Vendor.findById(decoded.vendorId);
      if (!vendor) return res.status(401).json({ message: 'Invalid token' });

      res.set('Cache-Control', 'no-store'); // ✅ Fix for 304
      return res.status(200).json({
        message: 'Token is valid',
        user: {
          vendorId: vendor._id,
          role: vendor.role || 'vendor',
          name: vendor.name,
          email: vendor.email,
        },
      });
    }

    res.status(401).json({ message: 'Invalid token (no userId or vendorId)' });
  } catch (error) {
    res.status(401).json({
      message: 'Invalid or expired token',
      error: error.message,
    });
  }
});

// ======= Vendor Forgot Password =======
router.post('/vendor-forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const vendor = await Vendor.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration attacks
    if (!vendor) {
      return res.status(200).json({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    }

    // Generate reset token
    const resetToken = vendor.createPasswordResetToken();
    await vendor.save({ validateBeforeSave: false });

    // Send reset email
    try {
      await sendPasswordResetEmail(vendor.email, {
        vendorName: vendor.name || vendor.company,
        resetToken
      });
    } catch (emailError) {
      // If email fails, clear the reset token
      vendor.passwordResetToken = undefined;
      vendor.passwordResetExpires = undefined;
      await vendor.save({ validateBeforeSave: false });

      console.error('Password reset email failed:', emailError);
      return res.status(500).json({
        message: 'There was an error sending the email. Please try again later.'
      });
    }

    res.status(200).json({
      message: 'If an account exists with this email, you will receive password reset instructions.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
});

// ======= Vendor Reset Password =======
router.post('/vendor-reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  const pwError = validatePassword(password);
  if (pwError) {
    return res.status(400).json({ message: pwError });
  }

  try {
    // Find vendor by hashed token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const vendor = await Vendor.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+passwordResetToken +passwordResetExpires');

    if (!vendor) {
      return res.status(400).json({
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Update password (will be hashed by pre-save hook)
    vendor.password = password;
    vendor.passwordResetToken = undefined;
    vendor.passwordResetExpires = undefined;
    await vendor.save();

    // Generate new JWT for immediate login
    const jwtToken = jwt.sign(
      { vendorId: vendor._id, role: 'vendor', name: vendor.name },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(200).json({
      message: 'Password reset successful',
      token: jwtToken,
      vendorId: vendor._id,
      name: vendor.name,
      email: vendor.email
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'An error occurred. Please try again later.' });
  }
});

// ======= Verify Reset Token (check if valid before showing form) =======
router.get('/verify-reset-token/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const vendor = await Vendor.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('email');

    if (!vendor) {
      return res.status(400).json({
        valid: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    res.json({
      valid: true,
      email: vendor.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, message: 'An error occurred' });
  }
});

export default router;
