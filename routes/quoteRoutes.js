// C:\Users\pmeth\Projects\ai-procurement-backend\routes\quoteRoutes.js
import express from "express";
import Quote from "../models/QuoteRequest.js";
import Listing from "../models/Listing.js";
import Vendor from "../models/Vendor.js";
import userAuth from "../middleware/userAuth.js";
import { OpenAI } from "openai";

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get all quotes for a user
router.get("/user", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const quotes = await Quote.find({ userId });
    console.log("📡 Retrieved Quotes:", quotes.length, "quotes found");
    res.status(200).json(quotes);
  } catch (error) {
    console.error("Error fetching quotes:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Create a new quote request and return three quotes
router.post("/request", userAuth, async (req, res) => {
  try {
    let userRequirements, userId;

    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      userRequirements = JSON.parse(req.body.userRequirements);
      userId = req.body.userId || req.userId;
    } else {
      userRequirements = req.body;
      userId = req.body.userId || req.userId;
    }

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Save the quote request
    const quote = new Quote({
      userId,
      serviceType: userRequirements.serviceType || "Photocopiers",
      companyName: userRequirements.companyName,
      industryType: userRequirements.industryType,
      numEmployees: userRequirements.numEmployees,
      numOfficeLocations: userRequirements.numLocations,
      multipleFloors: userRequirements.multiFloor,
      colour: userRequirements.colour,
      min_speed: userRequirements.min_speed,
      max_lease_price: userRequirements.max_lease_price,
      monthlyPrintVolume: userRequirements.monthlyPrintVolume,
      annualPrintVolume: userRequirements.annualPrintVolume,
      monthlyColorVolume: userRequirements.monthlyColorVolume,
      monthlyMonoVolume: userRequirements.monthlyMonoVolume,
      currentColorCPC: userRequirements.currentColorCPC,
      currentMonoCPC: userRequirements.currentMonoCPC,
      quarterlyLeaseCost: userRequirements.quarterlyLeaseCost,
      leasingCompany: userRequirements.leasingCompany,
      serviceProvider: userRequirements.serviceProvider,
      contractStartDate: userRequirements.contractStartDate,
      contractEndDate: userRequirements.contractEndDate,
      additionalServices: userRequirements.additionalServices || [],
      paysForScanning: userRequirements.paysForScanning,
      required_functions: userRequirements.required_functions || [],
      status: "In Progress",
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredVendor: "", // Will be set after vendor selection
    });

    // Filter vendors based on user requirements
    const filterCriteria = {
      services: "Photocopiers",
      status: "active",
      minSpeed: { $gte: Number(userRequirements.min_speed) || 0 },
      price: { $lte: Number(userRequirements.max_lease_price) || Infinity },
    };
    if (userRequirements.colour) filterCriteria.colour = userRequirements.colour;
    if (userRequirements.required_functions?.length) {
      filterCriteria.requiredFunctions = { $all: userRequirements.required_functions };
    }
    if (userRequirements.monthlyPrintVolume) {
      filterCriteria.dutyCycle = { $gte: Number(userRequirements.monthlyPrintVolume) * 1.2 };
    }
    console.log("Filter criteria:", filterCriteria);

    const vendors = await Vendor.find(filterCriteria).lean();
    console.log(`Found ${vendors.length} vendors`);

    if (!vendors.length) {
      quote.status = "Failed";
      await quote.save();
      return res.status(200).json({ recommendedVendors: [], message: "No vendors found." });
    }

    // Use OpenAI to select top 3 vendors with the new prompt
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
    let recommendedVendors = [];
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      const content = completion.choices[0].message.content.trim();
      console.log("AI Response:", content);
      const parsed = JSON.parse(content);
      recommendedVendors = parsed.vendorEmails || [];
    } catch (error) {
      console.error("AI error:", error.message);
    }

    // Fallback to top 3 if AI fails
    if (recommendedVendors.length < 3) {
      recommendedVendors = vendors.slice(0, 3).map(v => v.email);
    }

    // Update quote with selected vendors
    quote.preferredVendor = recommendedVendors.join(", ");
    await quote.save();
    console.log("📡 New Quote Created with Vendors:", quote);

    // Return the three quotes
    res.status(201).json({
      message: "Quote request created successfully",
      quote,
      recommendedVendors, // Array of 3 vendor emails
    });
  } catch (error) {
    console.error("Error creating quote:", error);
    res.status(500).json({ message: "Server error while creating quote" });
  }
});

// Get vendor quotes by manufacturer from MongoDB listings
router.post("/ai/recommendations", userAuth, async (req, res) => {
  try {
    const { userId, manufacturer } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const latestQuote = await Quote.findOne({ userId }).sort({ createdAt: -1 });
    if (!latestQuote) {
      return res.status(404).json({ message: "No quotes found for this user" });
    }
    const query = {
      speed: { $gte: latestQuote.min_speed || 0 },
      price: { $lte: latestQuote.max_lease_price || Infinity },
      required_functions: { $all: latestQuote.required_functions || [] },
    };
    if (manufacturer) query.brand = manufacturer;
    if (latestQuote.colour) query.colour = latestQuote.colour;
    if (latestQuote.type) query.type = latestQuote.type;
    if (latestQuote.monthlyPrintVolume) query.dutyCycle = { $gte: latestQuote.monthlyPrintVolume * 1.2 };
    if (latestQuote.currentColorCPC) query.colorCPC = { $lte: latestQuote.currentColorCPC };
    if (latestQuote.currentMonoCPC) query.monoCPC = { $lte: latestQuote.currentMonoCPC };

    const vendorQuotes = await Listing.find(query)
      .populate("vendor", "name email")
      .limit(3);
    console.log(`📡 Fetching ${manufacturer || "any"} vendor recommendations for userId:`, userId);
    console.log("🧠 Matched Vendor Quotes:", vendorQuotes);

    if (vendorQuotes.length === 0) {
      return res.status(404).json({ message: `No matching ${manufacturer || "vendor"} quotes found` });
    }
    const recommendations = vendorQuotes.map((v) => ({
      vendor: v.vendor?.name || "Unknown Vendor",
      price: v.price,
      speed: v.speed,
      website: v.website || "N/A",
      brand: v.brand,
      type: v.type,
      colour: v.colour,
      monoCPC: v.monoCPC,
      colorCPC: v.colorCPC,
    }));
    res.status(200).json(recommendations);
  } catch (error) {
    console.error("Error fetching vendor recommendations:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Handle user selecting a vendor quote
router.post("/request-selected", userAuth, async (req, res) => {
  try {
    console.log("🔍 Received request-selected API call with data:", req.body);
    if (!req.body.selectedVendors || !Array.isArray(req.body.selectedVendors)) {
      return res.status(400).json({ message: "Invalid request: 'selectedVendors' is required and must be an array." });
    }
    const { selectedVendors, quoteId } = req.body;
    if (!quoteId) {
      return res.status(400).json({ message: "Quote ID is required" });
    }
    const updatedQuote = await Quote.findByIdAndUpdate(
      quoteId,
      { preferredVendor: selectedVendors[0], status: "Vendor Selected" },
      { new: true }
    );
    if (!updatedQuote) {
      return res.status(404).json({ message: "Quote not found" });
    }
    console.log("✅ Quote updated successfully:", updatedQuote);
    return res.status(200).json({ message: "Selected vendor(s) updated successfully!", updatedQuote });
  } catch (error) {
    console.error("❌ Error processing request-selected:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;