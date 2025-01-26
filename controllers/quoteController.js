import { OpenAI } from 'openai';  // Importing the correct OpenAI class from the 'openai' package
import Vendor from '../models/Vendor.js';

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env file
});

/**
 * requestQuotes:
 * - Accepts `userRequirements` from req.body.
 * - Finds relevant vendors in the database.
 * - Uses OpenAI to recommend the top 3 vendors.
 */
export const requestQuotes = async (req, res) => {
  try {
    const { userRequirements } = req.body;

    // Validate the input
    if (!userRequirements) {
      return res.status(400).json({
        message: 'Please provide userRequirements in the request body.',
      });
    }

    // Determine the needed service based on keywords in `userRequirements`
    let neededService = 'Photocopiers';
    if (/cctv/i.test(userRequirements)) {
      neededService = 'CCTV';
    } else if (/telecom/i.test(userRequirements)) {
      neededService = 'Telecoms';
    } else if (/it|network/i.test(userRequirements)) {
      neededService = 'IT';
    }

    // Query vendors that match the needed service
    const allVendors = await Vendor.find({ services: neededService }).lean();

    // If no vendors match, return early
    if (!allVendors.length) {
      return res.status(200).json({
        recommendedVendors: [],
        message: 'No vendors match your request.',
      });
    }

    // Build the prompt for OpenAI
    const prompt = `
    You are an AI agent for vendor recommendations.
    User's request: "${userRequirements}"
    Relevant vendors (in JSON):
    ${JSON.stringify(allVendors, null, 2)}

    Please pick the best 3 vendors (by name/email) from this list and respond in JSON format, e.g.:
    {
      "vendorEmails": ["abc@vendor.com", "xyz@vendor.com", "example@vendor.com"]
    }
    Only return the JSON—no extra commentary.
    `;

    // Call OpenAI API for recommendations
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Replace with your preferred model
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, // Adjust temperature for creativity
    });

    // Extract and parse AI's response
    const content = completion.choices[0].message.content.trim();
    console.log('AI Response:', content);

    let recommendedVendors;
    try {
      const parsed = JSON.parse(content);
      recommendedVendors = parsed.vendorEmails || [];
    } catch (error) {
      console.error('Failed to parse AI response as JSON:', error.message);
      recommendedVendors = [];
    }

    // Return recommended vendors
    return res.status(200).json({
      recommendedVendors,
      message: 'AI-based top 3 vendors',
    });
  } catch (error) {
    console.error('Error in requestQuotes:', error.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: error.message,
    });
  }
};
