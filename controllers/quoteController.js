// C:\Users\pmeth\Projects\ai-procurement-backend\controllers\quoteController.js
import { OpenAI } from "openai";
import Vendor from "../models/Vendor.js";
import QuoteRequest from "../models/QuoteRequest.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Handles AI-based vendor recommendations for Photocopiers.
 * Expects multipart/form-data or JSON with "userRequirements" and "userId".
 */
export const requestQuotes = async (req, res) => {
  try {
    console.log("🔥 Full Incoming Request Body:", req.body);

    // Parse userRequirements and userId
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

    // Build dynamic filter criteria based on Vendor schema
    const filterCriteria = {
      services: { $in: ["Photocopiers"] }, // Array match
      machines: {
        $elemMatch: {
          lease_cost: { $lte: Number(userRequirements.max_lease_price) || Infinity },
          type: userRequirements.type || { $in: ["A3", "A4"] }, // From frontend "A3"
          color_cpc: { $gt: 0 }, // Assume color capability if color_cpc exists
          // Add speed if exists in machines (e.g., "speed" instead of "minSpeed")
          // speed: { $gte: Number(userRequirements.min_speed) || 0 },
        },
      },
    };
    console.log("Filter criteria for vendor matching:", JSON.stringify(filterCriteria, null, 2));

    // Fetch vendors
    const vendors = await Vendor.find(filterCriteria)
      .lean()
      .select("name email price rating location serviceLevel responseTime yearsInBusiness support machines");
    console.log(`✅ Found ${vendors.length} vendors based on criteria`);
    if (vendors.length === 0) {
      console.log("⚠️ No vendors found. Sample vendor data:", await Vendor.findOne());
    } else {
      console.log("Sample vendor:", JSON.stringify(vendors[0], null, 2));
    }

    // Create and save a new QuoteRequest
    const quoteRequest = new QuoteRequest({
      userId,
      serviceType: userRequirements.serviceType || "Photocopiers",
      companyName: userRequirements.companyName,
      industryType: userRequirements.industryType,
      numEmployees: Number(userRequirements.numEmployees),
      numOfficeLocations: Number(userRequirements.numLocations),
      multipleFloors: userRequirements.multiFloor === "Yes",
      colour: userRequirements.colour,
      min_speed: Number(userRequirements.min_speed),
      max_lease_price: Number(userRequirements.max_lease_price),
      required_functions: userRequirements.required_functions || [],
      monthlyVolume: {
        colour: Number(userRequirements.monthlyVolume.colour) || 0,
        mono: Number(userRequirements.monthlyVolume.mono) || 0,
      },
      additional_notes: userRequirements.additional_notes || "",
      status: vendors.length ? "In Progress" : "Failed",
      preferredVendor: "",
    });

    if (!vendors.length) {
      await quoteRequest.save();
      return res.status(200).json({ recommendedVendors: [], message: "No vendors found for Photocopiers." });
    }

    await quoteRequest.save();
    console.log("✅ Quote Request Saved to Database:", quoteRequest._id);

    // Prepare enhanced AI prompt
    const prompt = `
      You are an AI procurement expert selecting the best Photocopier vendors.
      User Requirements: ${JSON.stringify(userRequirements, null, 2)}
      Available Vendors: ${JSON.stringify(vendors.slice(0, 10), null, 2)}
      Select 3 vendors based on:
      - Competitive pricing (max $${userRequirements.max_lease_price})
      - Adequate speed (min ${userRequirements.min_speed})
      - Required functions (${userRequirements.required_functions?.join(", ") || "none"})
      - Vendor reputation and service quality
      - Long-term value for the user's industry (${userRequirements.industryType})
      Output JSON: {"vendorEmails": ["email1", "email2", "email3"]}
    `;
    console.log("🧠 Sending Prompt to OpenAI...");
    let recommendedVendors = [];
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      const content = completion.choices?.[0]?.message?.content?.trim();
      console.log("🤖 AI Response:", content);
      const parsedResponse = JSON.parse(content);
      recommendedVendors = parsedResponse.vendorEmails || [];
    } catch (error) {
      console.error("❌ OpenAI Error:", error.message);
    }

    // Fallback: If AI returns fewer than 3, use the first 3 filtered vendors
    if (recommendedVendors.length < 3) {
      recommendedVendors = vendors.slice(0, 3).map(vendor => vendor.email);
    }

    // Update the QuoteRequest with the recommendations
    quoteRequest.preferredVendor = recommendedVendors.join(", ");
    await quoteRequest.save();
    console.log("✅ Quote Request Updated with AI Recommendations:", quoteRequest._id);

    return res.status(201).json({
      message: "Quote request created successfully",
      quote: quoteRequest,
      recommendedVendors,
    });
  } catch (error) {
    console.error("❌ Error in requestQuotes:", error);
    return res.status(500).json({ error: "Server error while creating quote", details: error.message });
  }
};

/**
 * Fetch quotes for a specific user and return the FULL quotes from the database.
 */
export const getUserQuotes = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }
    const quotes = await QuoteRequest.find({ userId }).lean();
    if (!quotes.length) {
      return res.status(200).json({ quotes: [] });
    }
    console.log("📡 Retrieved Quotes:", JSON.stringify(quotes, null, 2));
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
    console.error("❌ Error retrieving pending quotes:", error.message);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};