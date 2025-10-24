import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-procurement";

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1);
    }
};

const VendorSchema = new mongoose.Schema({
    name: String,
    company: String,
    email: String,
    password: String,
    services: [String],
    rating: Number,
    uploads: Array
});

const Vendor = mongoose.model('Vendor', VendorSchema);

const restoreVendor = async () => {
    await connectDB();

    const vendorData = {
        name: "new4",
        company: "new4 company",
        email: "new4@vendor.com",
        password: "$2b$10$9apXmf25Y5U6FcBtrZRZBOdRu35xfq8b1Wo6jN9yUnFfHioY33lbW",
        services: ["Photocopiers", "CCTV"],
        rating: 0,
        uploads: []
    };

    try {
        await Vendor.create(vendorData);
        console.log("✅ Vendor 'new4' restored successfully!");
    } catch (error) {
        console.error("❌ Error restoring vendor:", error);
    } finally {
        mongoose.connection.close();
    }
};

restoreVendor();
