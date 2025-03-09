import { OpenAI } from "openai";
import Vendor from "../models/Vendor.js";
import { QuoteRequest } from "../models/QuoteRequest.js";

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Handles AI-based vendor recommendations for Photocopiers.
 * Expects multipart/form-data with the field "userRequirements" containing a JSON string.
 */
export const requestQuotes = async (req, res) => {
  try {
    console.log("🔥 Full Incoming Request Body:", req.body);

    // Expect userRequirements as a JSON string (Multer populates req.body for text fields)
    let { userRequirements, userId } = req.body;
    if (!userRequirements) {
      return res.status(400).json({ message: "Missing `userRequirements` in request body." });
    }
    try {
      userRequirements = JSON.parse(userRequirements);
    } catch (error) {
      return res.status(400).json({ message: "Invalid JSON format in `userRequirements`." });
    }
    console.log("🔵 Extracted userRequirements:", JSON.stringify(userRequirements, null, 2));

    if (!userId) {
      return res.status(400).json({ message: "Missing `userId` in request." });
    }

    // Validate required fields
    const requiredFields = [
      "companyName",
      "industryType",
      "numEmployees",
      "numLocations",
      "multiFloor",
      "colour",
      "min_speed",
      "max_lease_price",
      "required_functions",
    ];
    const missingFields = requiredFields.filter((field) => !(field in userRequirements));
    if (missingFields.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    // --- Build Dynamic Filter Criteria ---
    const filterCriteria = {
      services: "Photocopiers",
      status: "active",
    };
    console.log("Filter criteria for vendor matching:", JSON.stringify(filterCriteria, null, 2));

    // Fetch vendors using the dynamic criteria
    const vendors = await Vendor.find(filterCriteria)
      .lean()
      .select("name email price rating location serviceLevel responseTime yearsInBusiness support");
    console.log(`✅ Found ${vendors.length} vendors based on criteria`);
    console.log("Matched vendors:", JSON.stringify(vendors, null, 2));

    if (!vendors.length) {
      return res.status(200).json({ recommendedVendors: [], message: "No vendors found for Photocopiers." });
    }

    // Create and save a new QuoteRequest
    const quoteRequest = new QuoteRequest({
      userId,
      serviceType: "Photocopiers",
      companyName: userRequirements.companyName,
      industryType: userRequirements.industryType,
      numEmployees: Number(userRequirements.numEmployees),
      numOfficeLocations: Number(userRequirements.numLocations),
      multiple_floors: userRequirements.multiFloor === "Yes",
      colour: userRequirements.colour,
      min_speed: Number(userRequirements.min_speed),
      max_lease_price: Number(userRequirements.max_lease_price),
      required_functions: userRequirements.required_functions,
      additional_notes: userRequirements.additional_notes || "",
      status: "Pending",
    });
    await quoteRequest.save();
    console.log("✅ Quote Request Saved to Database");

    // --- Prepare AI Prompt ---
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

    // Fallback: If AI returns fewer than 3 vendor emails, use the first 3 vendors from our query
    if (recommendedVendors.length < 3) {
      recommendedVendors = vendors.slice(0, 3).map(vendor => vendor.email);
    }

    // Update the QuoteRequest with the recommendations
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
    console.error("❌ Error in requestQuotes:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * Fetch quotes for a specific user and return the FULL quotes from the database,
 * so the front end sees companyName, min_speed, colour, etc.
 */
export const getUserQuotes = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    // Fetch all quotes for this user directly from QuoteRequest
    const quotes = await QuoteRequest.find({ userId }).lean();
    if (!quotes.length) {
      return res.status(200).json({ quotes: [] });
    }
    console.log("📡 Retrieved Quotes:", JSON.stringify(quotes, null, 2));

    // Return the full array of quotes (without overwriting with vendor stubs)
    return res.status(200).json({ quotes });
  } catch (error) {
    console.error("❌ Error retrieving user quotes:", error.message);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * Fetch pending quotes.
 */
export const getPendingQuotes = async (req, res) => {
  try {
    const quotes = await QuoteRequest.find({ status: "Pending" }).lean();
    return res.status(200).json({ quotes });
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
