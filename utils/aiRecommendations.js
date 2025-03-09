import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getAIRecommendations = async (quotes, userId) => {
  try {
    console.log("🧠 Sending Prompt to OpenAI...");
    const latestQuote = quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const prompt = `
      You are an AI assistant for a procurement platform. Based on this quote request:
      - Company: ${latestQuote.companyName}
      - Industry: ${latestQuote.industryType}
      - Employees: ${latestQuote.numEmployees}
      - Locations: ${latestQuote.numOfficeLocations}
      - Multiple Floors: ${latestQuote.multipleFloors}
      - Color Preference: ${latestQuote.colour}
      - Minimum Speed: ${latestQuote.min_speed} ppm
      - Max Lease Price: £${latestQuote.max_lease_price}
      Recommend 3 photocopier vendors that match these needs. For each vendor, provide:
      - Vendor name (e.g., "EcoPrint")
      - Price (in GBP, within max_lease_price)
      - Speed (in ppm, at least min_speed)
      - Website URL (real or plausible, e.g., "https://www.ecoprint.com")
      Return the response as a JSON array in this exact format:
      [{"vendor": "", "price": 0, "speed": 0, "website": ""}, ...]
      Ensure the response is valid JSON and matches the quote requirements.
    `;

    const response = await openai.completions.create({
      model: "gpt-3.5-turbo-instruct", // Updated model
      prompt,
      max_tokens: 250,
      temperature: 0.7,
    });

    const aiResponseText = response.choices[0].text.trim();
    let vendorRecommendations;
    try {
      vendorRecommendations = JSON.parse(aiResponseText);
    } catch (parseError) {
      console.error("❌ AI response not valid JSON:", aiResponseText);
      throw new Error("Invalid AI response format");
    }
    if (!Array.isArray(vendorRecommendations) || vendorRecommendations.length === 0) {
      throw new Error("AI returned no vendor recommendations");
    }
    console.log("🤖 AI Response:", JSON.stringify(vendorRecommendations, null, 2));
    return vendorRecommendations;
  } catch (error) {
    console.error("❌ Error with AI recommendation:", error.message);
    const fallback = [
      { vendor: "Advanced Copiers", price: 450, speed: 30, website: "https://www.advancedcopiers.com" },
      { vendor: "EcoPrint", price: 470, speed: 28, website: "https://www.ecoprint.com" },
      { vendor: "OfficePrint", price: 500, speed: 35, website: "https://www.officeprint.com" },
    ];
    console.log("🔙 Using fallback data:", fallback);
    return fallback;
  }
};

export { getAIRecommendations };