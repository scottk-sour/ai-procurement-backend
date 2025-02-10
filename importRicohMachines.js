import mongoose from "mongoose";
import fs from "fs";
import csvParser from "csv-parser";
import dotenv from "dotenv";

// ✅ Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-procurement";

// ✅ Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        mongoose.set("strictQuery", false);
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1);
    }
};

// ✅ Define Vendor Schema
const vendorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    company: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: String,
    services: [String],
    rating: Number,
    machines: [
        {
            model: { type: String, required: true },
            type: { type: String, required: true },
            mono_cpc: { type: Number, required: true },
            color_cpc: { type: Number, required: true },
            lease_cost: { type: Number, required: true },
        },
    ],
    uploads: [
        {
            fileName: String,
            filePath: String,
            uploadDate: { type: Date, default: Date.now },
            fileType: { type: String, enum: ["pdf", "csv", "excel", "image"] },
        },
    ],
});

const Vendor = mongoose.model("Vendor", vendorSchema);

// ✅ CSV File Path
const csvFilePath = "./new4_vendor_ricoh_machines.csv";

// ✅ Import CSV Data Function
const importCSV = async () => {
    await connectDB();

    if (!fs.existsSync(csvFilePath)) {
        console.error("❌ CSV file not found. Ensure it's in the correct directory.");
        process.exit(1);
    }

    const records = [];

    // ✅ Read CSV Data & Parse
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
                });
            } else {
                console.error("⚠️ Skipping invalid row:", row);
            }
        })
        .on("end", async () => {
            try {
                if (records.length > 0) {
                    // ✅ Remove Duplicates Before Importing
                    const existingVendor = await Vendor.findOne({ email: "new4@vendor.com" });

                    if (existingVendor) {
                        const uniqueMachines = records.filter(
                            (newMachine) =>
                                !existingVendor.machines.some(
                                    (existing) => existing.model === newMachine.model
                                )
                        );

                        if (uniqueMachines.length > 0) {
                            await Vendor.updateOne(
                                { email: "new4@vendor.com" },
                                { $push: { machines: { $each: uniqueMachines } } },
                                { upsert: true }
                            );
                            console.log(`✅ Imported ${uniqueMachines.length} new machines.`);
                        } else {
                            console.log("⚠️ No new machines added (duplicates detected).");
                        }
                    } else {
                        // ✅ First-time import (if vendor does not exist)
                        await Vendor.updateOne(
                            { email: "new4@vendor.com" },
                            {
                                $set: {
                                    name: "new4",
                                    company: "new4 company",
                                    password: "$2b$10$9apXmf25Y5U6FcBtrZRZBOdRu35xfq8b1Wo6jN9yUnFfHioY33lbW",
                                    services: ["Photocopiers", "CCTV"],
                                    rating: 0,
                                    machines: records,
                                },
                            },
                            { upsert: true }
                        );
                        console.log(`✅ Imported ${records.length} machines.`);
                    }
                } else {
                    console.warn("⚠️ No valid data to insert.");
                }

                // ✅ Insert Sample Uploads (if not already added)
                const sampleUploads = [
                    {
                        fileName: "vendor_machine_list.pdf",
                        filePath: "/uploads/vendor_machine_list.pdf",
                        uploadDate: new Date(),
                        fileType: "pdf",
                    },
                    {
                        fileName: "price_list.csv",
                        filePath: "/uploads/price_list.csv",
                        uploadDate: new Date(),
                        fileType: "csv",
                    },
                ];

                const existingUploads = await Vendor.findOne(
                    { email: "new4@vendor.com" },
                    { uploads: 1 }
                );

                if (existingUploads && existingUploads.uploads.length === 0) {
                    await Vendor.updateOne(
                        { email: "new4@vendor.com" },
                        { $push: { uploads: { $each: sampleUploads } } }
                    );
                    console.log(`✅ Uploaded sample files for vendor.`);
                } else {
                    console.log("⚠️ Sample files already exist, skipping upload.");
                }
            } catch (error) {
                console.error("❌ Error updating vendor:", error);
            } finally {
                mongoose.connection.close();
            }
        });
};

// ✅ Run Import Function
importCSV();
