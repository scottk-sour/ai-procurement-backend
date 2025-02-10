import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai-procurement";

const connectDB = async () => {
    await mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log("✅ Connected to MongoDB");
};

const Vendor = mongoose.model('Vendor', new mongoose.Schema({ uploads: Array }), 'vendors');

const clearUploads = async () => {
    await connectDB();
    try {
        await Vendor.updateOne(
            { email: "new4@vendor.com" },
            { $set: { uploads: [] } }
        );
        console.log("✅ Cleared `uploads` for new4 vendor.");
    } catch (error) {
        console.error("❌ Error clearing uploads:", error);
    } finally {
        mongoose.connection.close();
    }
};

clearUploads();
