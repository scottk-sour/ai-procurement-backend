import { OpenAI } from "openai";
import Vendor from "../models/Vendor.js";
import QuoteRequest from "../models/QuoteRequest.js";
import AIRecommendationEngine from "../services/AIRecommendationEngine.js";  // Import the enhanced engine

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

    // Map userRequirements to QuoteRequest format (for engine compatibility)
    const quoteRequestData = {
      serviceType: userRequirements.serviceType || "Photocopiers",
      companyName: userRequirements.companyName,
      industryType: userRequirements.industryType,
      numEmployees: Number(userRequirements.numEmployees),
      numOfficeLocations: Number(userRequirements.numLocations),
      multipleFloors: userRequirements.multiFloor === "Yes",
      colour: userRequirements.colour,
      minSpeed: Number(userRequirements.min_speed),  // Map to minSpeed if needed
      price: Number(userRequirements.max_lease_price),  // Map max_lease_price to price
      requiredFunctions: userRequirements.required_functions || [],
      monthlyVolume: {
        colour: Number(userRequirements.monthlyVolume?.colour) || 0,
        mono: Number(userRequirements.monthlyVolume?.mono) || 0,
      },
      additionalServices: userRequirements.additional_notes ? [userRequirements.additional_notes] : [],  // Map notes to services if relevant
      // Add other mappings as needed (e.g., type, leaseTermMonths)
      type: userRequirements.type || "A3",  // Example fallback
      leaseTermMonths: 60,  // Default or from userRequirements if available
    };

    // Use the enhanced AIRecommendationEngine to generate recommendations
    console.log("🧠 Calling AIRecommendationEngine...");
    const recommendations = await AIRecommendationEngine.generateRecommendations(quoteRequestData, userId, req.files?.invoices || []);  // Pass uploaded files if any (e.g., for contract analysis)

    // Create and save a new QuoteRequest
    const quoteRequest = new QuoteRequest({
      userId,
      ...quoteRequestData,
      status: recommendations.length ? "In Progress" : "Failed",
      preferredVendor: recommendations.map(rec => rec.vendorName).join(", "),
    });

    await quoteRequest.save();
    console.log("✅ Quote Request Saved to Database:", quoteRequest._id);

    if (!recommendations.length) {
      return res.status(200).json({ recommendedVendors: [], message: "No vendors found for Photocopiers." });
    }

    // Extract vendor emails or details from recommendations (engine returns full quotes)
    const recommendedVendors = recommendations.map(rec => ({
      email: rec.product.email || 'vendor@example.com',  // Adjust based on your Vendor schema
      name: rec.vendorName,
      model: rec.model,
      savings: rec.savingsInfo.monthlySavings,
      // Add more fields as needed
    }));

    // Update the QuoteRequest with the recommendations
    quoteRequest.preferredVendor = recommendedVendors.map(v => v.name).join(", ");
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