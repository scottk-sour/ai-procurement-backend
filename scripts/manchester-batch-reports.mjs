import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Vendor from "../models/Vendor.js";
import AeoReport from "../models/AeoReport.js";
import { generateFullReport } from "../services/aeoReportGenerator.js";
import { generateReportPdf } from "../services/aeoReportPdf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRACTICE_AREA_TO_SLUG = {
  "Conveyancing": "conveyancing",
  "Family Law": "family-law",
  "Criminal Law": "criminal-law",
  "Commercial Law": "commercial-law",
  "Employment Law": "employment-law",
  "Wills & Probate": "wills-and-probate",
  "Immigration": "immigration",
  "Personal Injury": "personal-injury",
};

function deriveCategory(vendor) {
  const area = (vendor.practiceAreas || [])[0];
  if (area && PRACTICE_AREA_TO_SLUG[area]) return PRACTICE_AREA_TO_SLUG[area];
  return "conveyancing";
}

const IDS_FILE = process.env.IDS_FILE || path.join(__dirname, "manchester-ids.txt");
const DONE_FILE = process.env.DONE_FILE || "/tmp/manchester-done.txt";
const FAIL_FILE = process.env.FAIL_FILE || "/tmp/manchester-failed.txt";
console.log("Using IDS_FILE:", IDS_FILE);
console.log("Using DONE_FILE:", DONE_FILE);
console.log("Using FAIL_FILE:", FAIL_FILE);

const idsRaw = fs.readFileSync(IDS_FILE, "utf8").trim();
const ids = idsRaw.split(",").map(s => s.trim()).filter(Boolean);
console.log("Loaded", ids.length, "IDs");

let done = new Set();
try {
  const doneRaw = fs.readFileSync(DONE_FILE, "utf8");
  done = new Set(doneRaw.split("\n").map(l => l.split("|")[0].trim()).filter(Boolean));
  console.log("Already done:", done.size);
} catch (e) {
  console.log("No prior progress file, starting fresh");
}

const todo = ids.filter(id => done.has(id) === false);
console.log("To process:", todo.length);

if (todo.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

await mongoose.connect(process.env.MONGODB_URI);

const frontendUrl = process.env.FRONTEND_URL || "https://www.tendorai.com";
let success = 0, failed = 0;

for (let i = 0; i < todo.length; i++) {
  const id = todo[i];
  process.stdout.write(`[${i+1}/${todo.length}] ${id} ... `);
  try {
    const vendor = await Vendor.findById(id).lean();
    if (vendor === null) {
      console.log("VENDOR NOT FOUND");
      fs.appendFileSync(FAIL_FILE, `${id}|VENDOR NOT FOUND\n`);
      failed++;
      continue;
    }
    const category = deriveCategory(vendor);
    const city = vendor.location?.city || "Manchester";
    const websiteUrl = vendor.contactInfo?.website || undefined;
    const reportData = await generateFullReport({
      companyName: vendor.company,
      category,
      city,
      email: vendor.email,
      websiteUrl,
    });
    const pdfBuffer = await generateReportPdf(reportData);
    const report = await AeoReport.create({
      ...reportData,
      vendorId: vendor._id,
      pdfBuffer,
    });
    const url = `${frontendUrl}/aeo-report/results/${report._id}`;
    const score = reportData.aiVisibilityScore ?? reportData.scoreOverall ?? "?";
    const line = `${id}|${vendor.company}|${vendor.email}|${score}|${url}`;
    fs.appendFileSync(DONE_FILE, line + "\n");
    console.log(`OK | score: ${score} | ${url}`);
    success++;
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    console.log("FAIL:", err.message);
    fs.appendFileSync(FAIL_FILE, `${id}|${err.message}\n`);
    failed++;
    await new Promise(r => setTimeout(r, 3000));
  }
}

console.log("");
console.log("Done. Success:", success, "Failed:", failed);
await mongoose.disconnect();
