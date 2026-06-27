import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const Vendor = (await import('../models/Vendor.js')).default;
const { runWriterAgentForVendor } = await import('../services/writerAgent.js');

const v = await Vendor.findOne({ company: /Cardiff Property Partners/i }).select('_id company tier').lean();
if (!v) { console.log('Vendor not found'); process.exit(1); }
console.log(`DRY-RUN Writer for ${v.company} (tier=${v.tier})...`);

const result = await runWriterAgentForVendor(v._id, { dryRun: true });
console.log('RESULT:', JSON.stringify(result, null, 2));

await mongoose.disconnect();
