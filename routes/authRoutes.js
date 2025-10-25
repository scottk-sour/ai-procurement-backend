import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { authLimiter, createAccountLimiter } from '../middleware/rateLimiter.js';
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
    if (fields.includes('password') && req.body.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    next();
  };
};

// ======= Health Check =======
router.get('/', (req, res) => {
  res.send('Auth route is working!');
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: SecurePass123
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */

// ======= User Registration =======
router.post(
  '/register',
  createAccountLimiter, // Rate limit: 3 registrations per hour per IP
  validateRequestBody(['name', 'email', 'password']),
  async (req, res) => {
    const { name, email, password } = req.body;
    try {
      if (await User.findOne({ email })) {
        return res.status(400).json({ message: 'User already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ name, email, password: hashedPassword, role: 'user' });
      await newUser.save();
      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('User registration error:', error.message);
      res.status(500).json({ message: 'Failed to register user', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/auth/vendor-register:
 *   post:
 *     summary: Register a new vendor
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Acme Corp
 *               email:
 *                 type: string
 *                 format: email
 *                 example: contact@acmecorp.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: SecurePass123
 *     responses:
 *       201:
 *         description: Vendor registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Vendor registered successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */

// ======= Vendor Registration =======
router.post(
  '/vendor-register',
  createAccountLimiter, // Rate limit: 3 registrations per hour per IP
  validateRequestBody(['name', 'email', 'password']),
  async (req, res) => {
    const { name, email, password } = req.body;
    try {
      if (await Vendor.findOne({ email })) {
        return res.status(400).json({ message: 'Vendor already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newVendor = new Vendor({ name, email, password: hashedPassword, role: 'vendor', status: 'active' });
      await newVendor.save();
      res.status(201).json({ message: 'Vendor registered successfully' });
    } catch (error) {
      console.error('Vendor registration error:', error.message);
      res.status(500).json({ message: 'Failed to register vendor', error: error.message });
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login as a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 userId:
 *                   type: string
 *                   example: 507f1f77bcf86cd799439011
 *                 role:
 *                   type: string
 *                   example: user
 *                 name:
 *                   type: string
 *                   example: John Doe
 *                 email:
 *                   type: string
 *                   example: john.doe@example.com
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */

// ======= User Login =======
router.post(
  '/login',
  authLimiter, // Rate limit: 5 login attempts per hour per IP
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
        { expiresIn: '30d' }
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

/**
 * @swagger
 * /api/auth/vendor-login:
 *   post:
 *     summary: Login as a vendor
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: contact@acmecorp.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 vendorId:
 *                   type: string
 *                   example: 507f1f77bcf86cd799439012
 *                 role:
 *                   type: string
 *                   example: vendor
 *                 name:
 *                   type: string
 *                   example: Acme Corp
 *                 email:
 *                   type: string
 *                   example: contact@acmecorp.com
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */

// ======= Vendor Login =======
router.post(
  '/vendor-login',
  authLimiter, // Rate limit: 5 login attempts per hour per IP
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
        { expiresIn: '30d' }
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

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token is valid
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: 507f1f77bcf86cd799439011
 *                     role:
 *                       type: string
 *                       example: user
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john.doe@example.com
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

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

export default router;
