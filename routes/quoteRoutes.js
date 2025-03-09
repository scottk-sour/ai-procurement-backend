import express from "express";
import Quote from "../models/QuoteRequest.js";
import userAuth from "../middleware/userAuth.js";
import { getAIRecommendations } from "../utils/aiRecommendations.js"; // Add .js

const router = express.Router();

// Get all quotes for a user
router.get("/user", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      console.error("❌ No userId provided in query");
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log(`🔍 Fetching quotes for userId: ${userId}`);
    const quotes = await Quote.find({ userId });
    console.log("📡 Retrieved Quotes:", quotes.length, "quotes found");
    res.status(200).json(quotes);
  } catch (error) {
    console.error("❌ Error fetching quotes:", error.stack);
    res.status(500).json({ message: "Server error" });
  }
});

// Create a new quote request
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
      console.error("❌ No userId provided in request");
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("🔍 Received userRequirements:", JSON.stringify(userRequirements, null, 2));
    console.log("🔍 Using userId:", userId);

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
      leaseOrOwn: userRequirements.leaseOrOwn,
      paperTrays: userRequirements.paperTrays,
      required_functions: userRequirements.required_functions || [],
      preferredVendor: userRequirements.preferredVendor || "default@vendor.com",
      status: "In Progress",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await quote.save();
    console.log("📡 New Quote Created:", JSON.stringify(quote, null, 2));
    res.status(201).json({ message: "Quote request created successfully", quote });
  } catch (error) {
    console.error("❌ Error creating quote:", error.stack);
    res.status(500).json({ message: "Server error while creating quote" });
  }
});

// Request quotes from selected vendors
router.post("/request-selected", userAuth, async (req, res) => {
  try {
    const { userId, selectedVendors, quoteCompanyName } = req.body;

    if (!userId || !selectedVendors || selectedVendors.length === 0) {
      console.error("❌ Missing required fields:", { userId, selectedVendors });
      return res.status(400).json({ message: "User ID and selected vendors are required" });
    }

    console.log("📡 Received quote request:", {
      userId,
      selectedVendors,
      quoteCompanyName,
    });

    const requestData = {
      userId,
      selectedVendors,
      quoteCompanyName,
      status: "Requested",
      requestedAt: new Date(),
    };

    console.log("✅ Quote request processed:", requestData);
    res.status(200).json({ message: "Quotes requested successfully", requestData });
  } catch (error) {
    console.error("❌ Error requesting quotes:", error.stack);
    res.status(500).json({ message: "Server error while requesting quotes" });
  }
});

// Get AI recommendations
router.post("/ai/recommendations", userAuth, async (req, res) => {
  try {
    const { quotes, userId } = req.body;
    if (!quotes || !userId) {
      console.error("❌ Missing quotes or userId in request");
      return res.status(400).json({ message: "Quotes and userId are required" });
    }

    console.log("📡 Fetching AI recommendations for userId:", userId);
    const recommendations = await getAIRecommendations(quotes, userId);
    res.status(200).json(recommendations);
  } catch (error) {
    console.error("❌ Error generating AI recommendations:", error.stack);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;