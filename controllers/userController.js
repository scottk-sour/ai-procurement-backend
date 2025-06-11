import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';

dotenv.config();

const { JWT_SECRET } = process.env;
const BCRYPT_SALT_ROUNDS = 10;

if (!JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

// ----- User Signup -----
export const signup = async (req, res) => {
  const { name, email, password, company } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ message: 'User already exists.' });

    console.log('🧪 Plain password before hashing:', password);
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    console.log('🔐 Hashed password to save:', hashedPassword);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      company,
      role: 'user',
    });

    await newUser.save();
    console.log('✅ User saved:', newUser.email);
    console.log('📦 Full user object after save:', newUser); // ✅ This helps us debug

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering user:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// ----- User Login -----
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`❌ No user found for email: ${email.toLowerCase()}`);
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    console.log('🔍 Found user:', user.email);
    console.log('🔐 Hashed in DB:', user.password);
    console.log('🔑 Plain password entered:', password);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('✅ Password match:', isMatch);

    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role || 'user'
    });
  } catch (error) {
    console.error('❌ Error during user login:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

// --- Remaining controllers unchanged ---
export const verifyToken = async (req, res) => {
  try {
    const { user, decodedToken } = req;
    res.status(200).json({
      message: 'Token is valid',
      user: {
        userId: user._id,
        email: user.email,
        role: user.role || 'user',
        iat: decodedToken.iat,
        exp: decodedToken.exp,
      },
    });
  } catch (error) {
    console.error('❌ Error verifying token:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.status(200).json({
      user: {
        userId: user._id,
        email: user.email,
        role: user.role || 'user',
        name: user.name,
        company: user.company
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type.' });
  }

  const documentType = req.body.documentType || 'others';
  if (!['contract', 'invoice', 'others'].includes(documentType)) {
    return res.status(400).json({ message: 'Invalid document type.' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const newDocument = new UserDocument({
      userId: req.userId,
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      documentType,
    });

    await newDocument.save();

    res.status(200).json({
      message: 'File uploaded successfully.',
      filePath: req.file.path,
      documentType,
    });
  } catch (error) {
    console.error('❌ Error during file upload:', error.message);
    res.status(500).json({ message: 'Internal server error during file upload.' });
  }
};

export const getUploadedFiles = async (req, res) => {
  try {
    const files = await UserDocument.find({ userId: req.userId });
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching uploaded files:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getRecentActivity = async (req, res) => {
  try {
    const recentActivity = [
      { description: 'Uploaded a document', date: new Date().toISOString() },
      { description: 'Requested a quote', date: new Date().toISOString() },
    ];
    res.status(200).json({ activities: recentActivity });
  } catch (error) {
    console.error('❌ Error fetching recent activity:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getUserSavings = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'User ID is required.' });

    if (userId !== req.userId.toString()) {
      return res.status(403).json({ message: 'Unauthorized access to savings data.' });
    }

    const savings = {
      estimatedMonthlySavings: 42.5,
      estimatedAnnualSavings: 510.0,
    };

    res.status(200).json(savings);
  } catch (error) {
    console.error('❌ Error fetching user savings:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
