import mongoose from 'mongoose';
import fs from 'fs';
import csvParser from 'csv-parser';
import dotenv from 'dotenv';
import Vendor from './models/Vendor.js'; // Ensure correct path

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-procurement";

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        mongoose.set('strictQuery', false);
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1);
    }
};

// **🔹 CSV File Path (Ensure the file exists)**
const csvFilePath = "./uploads/vendors/EcoPrintSystems.csv";

const importCSV = async () => {
    await connectDB();

    if (!fs.existsSync(csvFilePath)) {
        console.error("❌ CSV file not found at", csvFilePath);
        process.exit(1);
    }

    const records = [];

    fs.createReadStream(csvFilePath)
        .pipe(csvParser())
        .on("data", (row) => {
            if (row.model && row.type && row.mono_cpc && row.color_cpc && row.lease_cost) {
                records.push({
                    model: row.model.trim(),
                    type: row.type.trim(),
                    mono_cpc: parseFloat(row.mono_cpc),
                    color_cpc: parseFloat(row.color_cpc),
                    lease_cost: parseFloat(row.lease_cost),
                    services: row.services ? row.services.trim() : "Photocopiers",
                    provider: row.provider ? row.provider.trim() : "Unknown"
                });
            } else {
                console.error("⚠️ Skipping invalid row:", row);
            }
        })
        .on("end", async () => {
            try {
                if (records.length > 0) {
                    // **🔹 Insert Machines into Vendor's "machines" Array**
                    await Vendor.updateOne(
                        { email: "ecoprint@vendor.com" },
                        { $push: { machines: { $each: records } } },
                        { upsert: true }
                    );
                    console.log(`✅ Imported ${records.length} machines for EcoPrint Systems.`);
                } else {
                    console.log("⚠️ No valid machines found in the CSV file.");
                }
            } catch (error) {
                console.error("❌ Error updating vendor:", error);
            } finally {
                mongoose.connection.close();
            }
        });
};

// Run the Import Function
importCSV();
