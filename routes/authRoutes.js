const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming you have a User model
require('dotenv').config();

const { JWT_SECRET } = process.env;

// GET route for testing the auth endpoint
router.get('/', (req, res) => {
    res.send('Auth route is working!');
});

// POST /api/auth/register - Register a new user
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        // Check if the user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10); // Generate salt
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create a new user
        const newUser = new User({ email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering user:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/auth/login - Login a user
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Compare the password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { id: user._id }, // Payload
            JWT_SECRET,      // Secret
            { expiresIn: '1h' } // Options
        );

        // Send the token and user data
        res.status(200).json({ message: 'Login successful', token, user: { id: user._id, email: user.email } });
    } catch (error) {
        console.error('Error logging in user:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
