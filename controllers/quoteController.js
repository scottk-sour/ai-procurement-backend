import { OpenAI } from "openai";
import Vendor from "../models/Vendor.js";

// ✅ Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env file
});

/**
 * requestQuotes:
 * - Accepts `userRequirements` from req.body.
 * - Finds **only Photocopier vendors** in the database.
 * - Uses OpenAI to recommend the top 3 vendors.
 */
export const requestQuotes = async (req, res) => {
  try {
    console.log("🔥 Full Incoming Request:", JSON.stringify(req.body, null, 2)); // Debugging Log

    // ✅ Step 1: Validate Request
    if (!req.body || typeof req.body !== "object") {
      console.error("❌ ERROR: No request body received.");
      return res.status(400).json({
        message: "Invalid request. Ensure `userRequirements` is included in the request body.",
      });
    }

    if (!req.body.userRequirements || typeof req.body.userRequirements !== "object") {
      console.error("❌ ERROR: Missing or invalid `userRequirements` in request body.");
      return res.status(400).json({
        message: "Invalid or missing `userRequirements`. Ensure it's a valid JSON object.",
      });
    }

    const { userRequirements } = req.body;
    console.log("🔵 Extracted userRequirements:", JSON.stringify(userRequirements, null, 2));

    // ✅ Step 2: Ensure Required Fields Exist
    const requiredFields = ["colour", "min_speed", "max_lease_price", "required_functions"];
    const missingFields = requiredFields.filter((field) => !(field in userRequirements));

    if (missingFields.length > 0) {
      console.error(`❌ ERROR: Missing required fields: ${missingFields.join(", ")}`);
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // ✅ Step 3: **Force Matching Only Photocopiers**
    console.log(`✅ Filtering Only Vendors that Offer Photocopiers`);
    const vendors = await Vendor.find({ services: "Photocopiers" }).lean();

    if (!vendors.length) {
      console.warn("⚠ No vendors found for Photocopiers");
      return res.status(200).json({
        recommendedVendors: [],
        message: "No vendors found for Photocopiers.",
      });
    }

    console.log(`✅ Found ${vendors.length} vendors for Photocopiers`);

    // ✅ Step 4: Build OpenAI Prompt
    const prompt = `
      You are an AI-powered procurement assistant helping a business find the best **Photocopier** suppliers.

      **User Requirements:** 
      ${JSON.stringify(userRequirements, null, 2)}

      **Available Vendors:** 
      ${JSON.stringify(vendors, null, 2)}

      **Select the 3 best vendors based on:**
      - **Competitive Pricing**
      - **High Ratings**
      - **Quick Response Time**
      - **Warranty & Maintenance Coverage**
      - **Matching User Requirements (functions, speed, lease price)**

      **Output JSON ONLY**:
      {
        "vendorEmails": ["vendor1@example.com", "vendor2@example.com", "vendor3@example.com"]
      }
    `;

    console.log("🧠 Sending Prompt to OpenAI...");

    // ✅ Step 5: Call OpenAI API
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
    } catch (error) {
      console.error("❌ OpenAI API Error:", error.message);
      return res.status(500).json({
        error: "Failed to connect to OpenAI API.",
        details: error.message,
      });
    }

    // ✅ Step 6: Extract AI Response
    let content = completion.choices?.[0]?.message?.content?.trim();
    console.log("🤖 AI Response:", content);

    let recommendedVendors = [];

    if (content) {
      try {
        const parsedResponse = JSON.parse(content);
        recommendedVendors = parsedResponse.vendorEmails || [];
      } catch (error) {
        console.error("❌ Failed to parse OpenAI response:", error.message);
      }
    }

    // ✅ Step 7: Return the Response
    return res.status(200).json({
      recommendedVendors,
      message: recommendedVendors.length
        ? "AI-selected top 3 vendors for Photocopiers"
        : "AI could not determine suitable vendors.",
    });
  } catch (error) {
    console.error("❌ Error in requestQuotes:", error.message);
    return res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
    });
  }
};
