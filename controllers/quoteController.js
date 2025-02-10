import { OpenAI } from "openai";
import Vendor from "../models/Vendor.js";
import { QuoteRequest } from "../models/QuoteRequest.js";

// ✅ Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * ✅ Handles AI-based vendor recommendations for Photocopiers.
 */
export const requestQuotes = async (req, res) => {
  try {
    console.log("🔥 Full Incoming Request:", JSON.stringify(req.body, null, 2));

    let { userRequirements, userId } = req.body;

    if (!userRequirements) {
      return res.status(400).json({ message: "Missing `userRequirements` in request body." });
    }

    if (typeof userRequirements === "string") {
      try {
        userRequirements = JSON.parse(userRequirements);
      } catch (error) {
        return res.status(400).json({ message: "Invalid JSON format in `userRequirements`." });
      }
    }

    console.log("🔵 Extracted userRequirements:", JSON.stringify(userRequirements, null, 2));

    if (!userId) {
      return res.status(400).json({ message: "Missing `userId` in request." });
    }

    // ✅ Validate required fields
    const requiredFields = ["colour", "min_speed", "max_lease_price", "required_functions"];
    const missingFields = requiredFields.filter((field) => !(field in userRequirements));

    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    // ✅ Fetch vendors offering Photocopiers
    console.log("✅ Fetching Vendors that Offer Photocopiers...");
    const vendors = await Vendor.find({
      services: "Photocopiers",
      "machines.0": { $exists: true },
    })
      .lean()
      .select("name email price rating location serviceLevel responseTime yearsInBusiness support");

    if (!vendors.length) {
      return res.status(200).json({ recommendedVendors: [], message: "No vendors found for Photocopiers." });
    }

    console.log(`✅ Found ${vendors.length} vendors for Photocopiers`);

    // ✅ Store the quote request in MongoDB
    const quoteRequest = new QuoteRequest({
      userId,
      serviceType: "Photocopiers",
      budgetRange: userRequirements.max_lease_price,
      specialRequirements: JSON.stringify(userRequirements.required_functions),
      status: "Pending",
    });

    await quoteRequest.save();
    console.log("✅ Quote Request Saved to Database");

    // ✅ AI Prompt for vendor selection
    const prompt = `
You are an AI-powered procurement assistant helping a business find the best **Photocopier** suppliers.

**User Requirements:**
${JSON.stringify(userRequirements, null, 2)}

**Available Vendors:**
${JSON.stringify(vendors.slice(0, 10), null, 2)}

**Select the 3 best vendors based on:**
- Competitive Pricing
- High Ratings
- Quick Response Time
- Warranty & Maintenance Coverage
- Matching User Requirements (functions, speed, lease price)

**Output JSON ONLY**:
{
  "vendorEmails": ["vendor1@example.com", "vendor2@example.com", "vendor3@example.com"]
}
`;

    console.log("🧠 Sending Prompt to OpenAI...");

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
    } catch (error) {
      return res.status(500).json({ error: "Failed to connect to OpenAI API.", details: error.message });
    }

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

    // ✅ Update the quote request with AI recommendations
    quoteRequest.status = recommendedVendors.length ? "In Progress" : "Failed";
    quoteRequest.preferredVendor = recommendedVendors.join(", ");
    await quoteRequest.save();
    console.log("✅ Quote Request Updated with AI Recommendations");

    return res.status(200).json({
      recommendedVendors,
      message: recommendedVendors.length
        ? "AI-selected top 3 vendors for Photocopiers"
        : "AI could not determine suitable vendors.",
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * ✅ Fetch quotes for a specific user and return full vendor details.
 */
export const getUserQuotes = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    // ✅ Fetch quotes for the user
    const quotes = await QuoteRequest.find({ userId }).lean();
    if (!quotes.length) {
      return res.status(200).json({ quotes: [] });
    }

    console.log("📡 Retrieved Quotes:", JSON.stringify(quotes, null, 2));

    // ✅ Extract vendor emails from stored quote requests
    const vendorEmails = quotes.flatMap(q => q.preferredVendor.split(", "));

    // ✅ Fetch full vendor details using their emails
    const vendors = await Vendor.find({ email: { $in: vendorEmails } })
      .lean()
      .select("name price rating location serviceLevel responseTime yearsInBusiness support");

    console.log("✅ Matched Vendors from Database:", JSON.stringify(vendors, null, 2));

    return res.status(200).json({ quotes: vendors });
  } catch (error) {
    console.error("❌ Error retrieving user quotes:", error.message);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * ✅ Fetch pending quotes.
 */
export const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await QuoteRequest.find({ status: "Pending" }).lean();
    return res.status(200).json({ quotes });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
