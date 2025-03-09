import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Ensure this is a default export
import 'dotenv/config';

const router = express.Router();
const { JWT_SECRET } = process.env;

// Middleware to validate request body
const validateRequestBody = (fields) => {
  return (req, res, next) => {
    const missingFields = fields.filter((field) => !req.body[field]);
    if (missingFields.length) {
      return res
        .status(400)
        .json({ message: `Missing required fields: ${missingFields.join(', ')}` });
    }
    
    // Basic email format validation
    if (fields.includes('email') && !/\S+@\S+\.\S+/.test(req.body.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Basic password length check
    if (fields.includes('password') && req.body.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    next();
  };
};

// GET / - Test the auth endpoint
router.get('/', (req, res) => {
  res.send('Auth route is working!');
});

// POST /register - Register a new user
router.post(
  '/register',
  validateRequestBody(['email', 'password']),
  async (req, res) => {
    const { email, password } = req.body;

    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ email, password: hashedPassword });
      await newUser.save();

      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('Registration error:', error.message);
      res.status(500).json({ 
        message: 'Failed to register user', 
        error: error.message 
      });
    }
  }
);

// POST /login - Login a user
router.post(
  '/login',
  validateRequestBody(['email', 'password']),
  async (req, res) => {
    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user._id },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(200).json({
        message: 'Login successful',
        token,
        user: { id: user._id, email: user.email },
      });
    } catch (error) {
      console.error('Login error:', error.message);
      res.status(500).json({ 
        message: 'Failed to login', 
        error: error.message 
      });
    }
  }
);

// GET /verify - Verify the token
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ message: 'Token is valid', user: decoded });
  } catch (error) {
    res.status(401).json({ 
      message: 'Invalid or expired token', 
      error: error.message 
    });
  }
});

export default router;