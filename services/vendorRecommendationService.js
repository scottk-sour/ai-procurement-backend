import OpenAI from 'openai';
import VendorProduct from '../models/VendorProduct.js';
import Vendor from '../models/Vendor.js';
import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import FileParser from '../utils/fileParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Vendor Recommendation Service for finding the best vendor products for a quote request
 */
class VendorRecommendationService {
  /**
   * Calculate potential savings compared to current contract
   * @param {Object} currentContract - Current contract details
   * @param {Object} vendorProduct - Vendor product to compare with
   * @param {Object} quoteRequest - User's quote request
   * @returns {Object} - Savings information
   */
  static calculateSavings(currentContract, vendorProduct, quoteRequest) {
    const currentLeaseCost = currentContract.leaseCost || 0;
    const currentMonoCPC = currentContract.monoCPC || 0.01;
    const currentColourCPC = currentContract.colourCPC || 0.08;

    const monthlyMonoVolume = quoteRequest.monthlyVolume?.mono || 0;
    const monthlyColourVolume = quoteRequest.monthlyVolume?.colour || 0;

    const currentMonthlyCPCCost =
      monthlyMonoVolume * currentMonoCPC + monthlyColourVolume * currentColourCPC;

    const currentMonthlyLeaseCost = quoteRequest.quarterlyPayment
      ? quoteRequest.quarterlyPayment / 3
      : currentLeaseCost;

    const currentTotalMonthlyCost = currentMonthlyLeaseCost + currentMonthlyCPCCost;

    const totalMonthlyVolume = monthlyMonoVolume + monthlyColourVolume;
    const appropriateLeaseRate =
      vendorProduct.leaseRates?.find((rate) => totalMonthlyVolume >= rate.month) || {
        ratePer000: 0.05,
      };

    const newMonthlyLeaseCost =
      (vendorProduct.totalMachineCost * appropriateLeaseRate.ratePer000) / 1000;

    const newMonoCPC = vendorProduct.costPerCopy?.A4Mono || 0.008;
    const newColourCPC = vendorProduct.costPerCopy?.A4Colour || 0.06;

    const newMonthlyCPCCost = monthlyMonoVolume * newMonoCPC + monthlyColourVolume * newColourCPC;

    const newTotalMonthlyCost = newMonthlyLeaseCost + newMonthlyCPCCost;

    const monthlySavings = currentTotalMonthlyCost - newTotalMonthlyCost;
    const annualSavings = monthlySavings * 12;
    const savingsPercentage = currentTotalMonthlyCost > 0 ? (monthlySavings / currentTotalMonthlyCost) * 100 : 0;

    return {
      currentTotalMonthlyCost,
      newTotalMonthlyCost,
      monthlySavings,
      annualSavings,
      savingsPercentage,
      cpcSavings: {
        mono: currentMonoCPC - newMonoCPC,
        colour: currentColourCPC - newColourCPC,
      },
    };
  }

  /**
   * Calculate service score based on vendor attributes
   * @param {Object} vendor - Vendor information
   * @returns {number} - Service score (0-100)
   */
  static calculateServiceScore(vendor) {
    let score = 0;
    const maxScore = 100;

    const yearsInBusiness = vendor.yearsInBusiness || 0;
    score += Math.min(yearsInBusiness * 2, 20);

    const responseTime = vendor.responseTime || 24;
    score += Math.max(0, 20 - (responseTime - 4) * 2);

    if (vendor.serviceLevel) {
      const serviceLevelLower = vendor.serviceLevel.toLowerCase();
      if (serviceLevelLower.includes('premium') || serviceLevelLower.includes('gold')) {
        score += 20;
      } else if (serviceLevelLower.includes('standard') || serviceLevelLower.includes('silver')) {
        score += 15;
      } else if (serviceLevelLower.includes('basic') || serviceLevelLower.includes('bronze')) {
        score += 10;
      } else {
        score += 5;
      }
    }

    if (vendor.support) {
      const supportLower = vendor.support.toLowerCase();
      if (supportLower.includes('24/7')) {
        score += 20;
      } else if (supportLower.includes('24 hour') || supportLower.includes('24-hour')) {
        score += 15;
      } else if (supportLower.includes('business hours')) {
        score += 10;
      } else {
        score += 5;
      }
    }

    const rating = vendor.rating || 0;
    score += rating * 4;

    return Math.min(score, maxScore);
  }

  /**
   * Calculate machine capabilities score
   * @param {Object} vendorProduct - Vendor product
   * @param {Object} quoteRequest - User's quote request
   * @returns {number} - Capabilities score (0-100)
   */
  static calculateCapabilitiesScore(vendorProduct, quoteRequest) {
    let score = 0;
    const maxScore = 100;

    const requestedSpeed = quoteRequest.pagesPerMinuteEstimate || 30;
    const productSpeed = parseInt(vendorProduct.speed) || 0;

    if (productSpeed >= requestedSpeed) {
      score += 25;
    } else {
      const speedRatio = productSpeed / requestedSpeed;
      score += Math.round(25 * speedRatio);
    }

    const monthlyMonoVolume = quoteRequest.monthlyVolume?.mono || 0;
    const monthlyColourVolume = quoteRequest.monthlyVolume?.colour || 0;
    const totalMonthlyVolume = monthlyMonoVolume + monthlyColourVolume;

    if (
      totalMonthlyVolume <= vendorProduct.maxVolume &&
      totalMonthlyVolume >= vendorProduct.minVolume
    ) {
      score += 25;
    } else if (totalMonthlyVolume < vendorProduct.minVolume) {
      const volumeRatio = totalMonthlyVolume / vendorProduct.minVolume;
      score += Math.round(15 * volumeRatio);
    } else {
      const volumeRatio = vendorProduct.maxVolume / totalMonthlyVolume;
      score += Math.round(10 * volumeRatio);
    }

    const needsA3 = quoteRequest.machineDetails?.some((m) => m.isA3) || false;
    const productIsA3 =
      vendorProduct.description.includes('A3') || vendorProduct.description.includes('SRA3');

    if ((needsA3 && productIsA3) || (!needsA3 && !productIsA3)) {
      score += 20;
    } else if (!needsA3 && productIsA3) {
      score += 10;
    } else {
      score += 0;
    }

    const needsColour = quoteRequest.monthlyVolume?.colour > 0;
    const productHasColour =
      vendorProduct.description.includes('Colour') || vendorProduct.description.includes('Color');

    if ((needsColour && productHasColour) || (!needsColour && !productHasColour)) {
      score += 15;
    } else if (!needsColour && productHasColour) {
      score += 10;
    } else {
      score += 0;
    }

    let featureScore = 0;
    const requestedFeatures = [];

    if (quoteRequest.machineDetails?.some((m) => m.bookletFinisher)) {
      requestedFeatures.push('booklet');
    }
    if (quoteRequest.machineDetails?.some((m) => m.paperCut)) {
      requestedFeatures.push('paper cut');
    }
    if (quoteRequest.machineDetails?.some((m) => m.followMePrint)) {
      requestedFeatures.push('follow me');
    }

    const descriptionLower = vendorProduct.description.toLowerCase();
    requestedFeatures.forEach((feature) => {
      if (descriptionLower.includes(feature)) {
        featureScore += 5;
      }
    });

    score += Math.min(featureScore, 15);

    return Math.min(score, maxScore);
  }

  /**
   * Calculate company demographics score
   * @param {Object} vendor - Vendor information
   * @param {Object} quoteRequest - User's quote request
   * @returns {number} - Demographics score (0-100)
   */
  static calculateDemographicsScore(vendor, quoteRequest) {
    let score = 0;
    const maxScore = 100;

    if (quoteRequest.industryType && vendor.industries) {
      const vendorIndustries = Array.isArray(vendor.industries)
        ? vendor.industries
        : [vendor.industries];

      if (
        vendorIndustries.some((i) => i.toLowerCase() === quoteRequest.industryType.toLowerCase())
      ) {
        score += 40;
      } else {
        score += 20;
      }
    } else {
      score += 20;
    }

    score += 20;

    if (quoteRequest.locationPreference && quoteRequest.locationPreference.type) {
      const preferredType = quoteRequest.locationPreference.type.toLowerCase();
      const vendorLocation = vendor.location ? vendor.location.toLowerCase() : '';

      if (preferredType === 'local' && vendorLocation.includes('local')) {
        score += 30;
      } else if (preferredType === 'national' && vendorLocation.includes('national')) {
        score += 30;
      } else {
        score += 15;
      }
    } else {
      score += 15;
    }

    return Math.min(score, maxScore);
  }

  /**
   * Calculate total score for a vendor product
   * @param {Object} vendorProduct - Vendor product
   * @param {Object} vendor - Vendor information
   * @param {Object} quoteRequest - User's quote request
   * @param {Object} currentContract - Current contract details
   * @returns {Object} - Score information
   */
  static calculateTotalScore(vendorProduct, vendor, quoteRequest, currentContract) {
    const savingsInfo = this.calculateSavings(currentContract, vendorProduct, quoteRequest);
    const serviceScore = this.calculateServiceScore(vendor);
    const capabilitiesScore = this.calculateCapabilitiesScore(vendorProduct, quoteRequest);
    const demographicsScore = this.calculateDemographicsScore(vendor, quoteRequest);

    let savingsScore = 0;
    if (savingsInfo.savingsPercentage > 0) {
      savingsScore = Math.min(savingsInfo.savingsPercentage * 3.33, 100);
    }

    const weightedSavingsScore = savingsScore * 0.4;
    const weightedServiceScore = serviceScore * 0.25;
    const weightedCapabilitiesScore = capabilitiesScore * 0.25;
    const weightedDemographicsScore = demographicsScore * 0.1;

    const totalScore =
      weightedSavingsScore +
      weightedServiceScore +
      weightedCapabilitiesScore +
      weightedDemographicsScore;

    return {
      totalScore,
      savingsScore,
      serviceScore,
      capabilitiesScore,
      demographicsScore,
      weightedSavingsScore,
      weightedServiceScore,
      weightedCapabilitiesScore,
      weightedDemographicsScore,
      savingsInfo,
    };
  }

  /**
   * Find the best vendor products for a quote request
   * @param {Object} quoteRequest - User's quote request
   * @param {Array} invoiceFiles - Uploaded invoice files
   * @returns {Promise<Array>} - Top 3 vendor products with scores
   */
  static async findBestMatches(quoteRequest, invoiceFiles) {
    try {
      let currentContract = {};

      if (invoiceFiles && invoiceFiles.length > 0) {
        const fileResults = await Promise.all(
          invoiceFiles.map((file) => FileParser.processFile(file))
        );

        currentContract = fileResults.reduce((merged, result) => {
          if (result.contractInfo) {
            Object.entries(result.contractInfo).forEach(([key, value]) => {
              if (value !== null && (!merged[key] || merged[key] === null)) {
                merged[key] = value;
              }
            });
          }
          return merged;
        }, {});
      }

      if (!currentContract.leaseCost && quoteRequest.quarterlyPayment) {
        currentContract.leaseCost = quoteRequest.quarterlyPayment / 3;
      }

      if (!currentContract.monoCPC && quoteRequest.costPerCopy?.mono) {
        currentContract.monoCPC = quoteRequest.costPerCopy.mono;
      }

      if (!currentContract.colourCPC && quoteRequest.costPerCopy?.colour) {
        currentContract.colourCPC = quoteRequest.costPerCopy.colour;
      }

      const vendorProducts = await VendorProduct.find().populate('vendorId');

      const scoredProducts = [];

      for (const product of vendorProducts) {
        const vendor = product.vendorId;

        if (!vendor) continue;

        const scoreInfo = this.calculateTotalScore(product, vendor, quoteRequest, currentContract);

        scoredProducts.push({
          product,
          vendor,
          scoreInfo,
        });
      }

      scoredProducts.sort((a, b) => b.scoreInfo.totalScore - a.scoreInfo.totalScore);

      const topProducts = scoredProducts.slice(0, 3);

      return topProducts.map((item) => ({
        vendorId: item.vendor._id,
        vendorName: item.vendor.name || 'Unknown Vendor',
        manufacturer: item.product.manufacturer,
        model: item.product.model,
        speed: item.product.speed,
        description: item.product.description,
        totalMachineCost: item.product.totalMachineCost,
        costPerCopy: item.product.costPerCopy,
        score: item.scoreInfo.totalScore,
        scoreBreakdown: {
          savings: item.scoreInfo.weightedSavingsScore,
          service: item.scoreInfo.weightedServiceScore,
          capabilities: item.scoreInfo.weightedCapabilitiesScore,
          demographics: item.scoreInfo.weightedDemographicsScore,
        },
        savingsInfo: item.scoreInfo.savingsInfo,
      }));
    } catch (error) {
      console.error('Error finding best matches:', error);
      throw error;
    }
  }

  /**
   * Load vendor products from CSV files if database is empty
   * @returns {Promise<void>}
   */
  static async loadVendorProductsFromCSV() {
    try {
      const count = await VendorProduct.countDocuments();
      if (count > 0) {
        console.log(`Database already has ${count} vendor products.`);
        return;
      }

      const files = fs
        .readdirSync(path.join(__dirname, '..'))
        .filter((file) => file.endsWith('_Pricing_Table.csv'));

      if (files.length === 0) {
        console.log('No pricing table CSV files found.');
        return;
      }

      console.log(`Found ${files.length} CSV files for processing.`);
      // Add CSV parsing logic here if needed
      /*
      for (const file of files) {
        const filePath = path.join(__dirname, '..', file);
        const csvData = fs.readFileSync(filePath, 'utf-8');
        // Parse csvData and create VendorProduct documents
        // await VendorProduct.insertMany(parsedData);
      }
      */
    } catch (error) {
      console.error('Error loading vendor products from CSV:', error);
      throw error;
    }
  }
}

/**
 * Get vendor recommendations using VendorRecommendationService or OpenAI fallback
 * @param {Array} quotes - Array of quote requests
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of vendor recommendations
 */
async function getVendorRecommendations(quotes, userId) {
  try {
    // Try VendorRecommendationService first
    const quoteRequest = await CopierQuoteRequest.findOne({ userId }).sort({ createdAt: -1 });
    if (!quoteRequest) throw new Error('No quote request found');

    const matches = await VendorRecommendationService.findBestMatches(quoteRequest, []);
    if (matches.length >= 3) {
      console.log('✅ Returning VendorRecommendationService recommendations');
      return matches.map((match) => ({
        vendorName: match.vendorName,
        price: match.totalMachineCost,
        speed: match.speed,
        website: match.vendor?.website || 'https://www.example.com',
        score: match.score,
        savingsInfo: match.savingsInfo,
      }));
    }

    // Fallback to OpenAI if insufficient matches
    console.log('⚠️ Insufficient matches, falling back to OpenAI');
    const latestQuote = quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const prompt = `
      You are an AI assistant for a procurement platform. Based on this quote request:
      - Company: ${latestQuote.companyName}
      - Industry: ${latestQuote.industryType}
      - Employees: ${latestQuote.numEmployees}
      - Locations: ${latestQuote.numOfficeLocations}
      - Multiple Floors: ${latestQuote.multipleFloors}
      - Colour Preference: ${latestQuote.colour}
      - Minimum Speed: ${latestQuote.min_speed} ppm
      - Max Lease Price: £${latestQuote.max_lease_price}
      Recommend 3 photocopier vendors that match these needs. For each vendor, provide:
      - Vendor name (e.g., "EcoPrint")
      - Price (in GBP, within max_lease_price)
      - Speed (in ppm, at least min_speed)
      - Website URL (real or plausible, e.g., "https://www.ecoprint.com")
      Return the response as a JSON array in this exact format:
      [{"vendor": "", "price": 0, "speed": 0, "website": ""}, ...]
    `;

    const response = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt,
      max_tokens: 250,
      temperature: 0.7,
    });

    const aiResponseText = response.choices[0].text.trim();
    let vendorRecommendations = JSON.parse(aiResponseText);

    // Score OpenAI recommendations using VendorRecommendationService
    const scoredRecommendations = await Promise.all(
      vendorRecommendations.map(async (rec) => {
        const vendor = { name: rec.vendor, website: rec.website };
        const product = { speed: rec.speed, totalMachineCost: rec.price, description: 'Photocopier' };
        const scoreInfo = VendorRecommendationService.calculateTotalScore(
          product,
          vendor,
          quoteRequest,
          {}
        );
        return {
          vendorName: rec.vendor,
          price: rec.price,
          speed: rec.speed,
          website: rec.website,
          score: scoreInfo.totalScore,
          savingsInfo: scoreInfo.savingsInfo,
        };
      })
    );

    console.log('🤖 OpenAI Recommendations:', scoredRecommendations);
    return scoredRecommendations;
  } catch (error) {
    console.error('❌ Error getting recommendations:', error.message);
    // Final fallback
    return [
      {
        vendorName: 'Advanced Copiers',
        price: 450,
        speed: 30,
        website: 'https://www.advancedcopiers.com',
        score: 80,
        savingsInfo: { monthlySavings: 0, annualSavings: 0 },
      },
      {
        vendorName: 'EcoPrint',
        price: 470,
        speed: 28,
        website: 'https://www.ecoprint.com',
        score: 75,
        savingsInfo: { monthlySavings: 0, annualSavings: 0 },
      },
      {
        vendorName: 'OfficePrint',
        price: 500,
        speed: 35,
        website: 'https://www.officeprint.com',
        score: 70,
        savingsInfo: { monthlySavings: 0, annualSavings: 0 },
      },
    ];
  }
}

export { getVendorRecommendations, VendorRecommendationService };