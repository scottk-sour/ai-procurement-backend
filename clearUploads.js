import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai-procurement';

// ✅ Log the actual URI being used for clarity
console.log(`🧩 Connecting to MongoDB URI: ${MONGODB_URI}`);

const connectDB = async () => {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Connected to MongoDB');
};

// Minimal Vendor schema just for this update
const Vendor = mongoose.model('Vendor', new mongoose.Schema({ email: String, uploads: Array }), 'vendors');

const clearUploads = async () => {
  await connectDB();
  try {
    const result = await Vendor.updateOne(
      { email: 'new4@vendor.com' },
      { $set: { uploads: [] } }
    );
    console.log('✅ Cleared `uploads` for new4@vendor.com:', result);
  } catch (error) {
    console.error('❌ Error clearing uploads:', error.message);
  } finally {
    mongoose.connection.close();
  }
};

clearUploads();
