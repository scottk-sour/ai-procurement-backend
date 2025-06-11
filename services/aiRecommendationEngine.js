import OpenAI from 'openai';
import QuoteFeedback from '../models/QuoteFeedback.js';
import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import VendorProduct from '../models/VendorProduct.js';
import FileParserService from './FileParserService.js';
import logger from './logger.js';
import natural from 'natural';

// Validate OpenAI API Key
if (!process.env.OPENAI_API_KEY) {
  logger.error('Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tokenizer = new natural.WordTokenizer();

/**
 * Parse lease term margin string, e.g. "12:0.7;24:0.65;36:0.6;48:0.55;60:0.5"
 * Returns { 12: 0.7, 24: 0.65, ... }
 */
function parseLeaseTermsAndMargins(str) {
  const result = {};
  if (!str) return result;
  str.split(';').forEach(pair => {
    const [term, margin] = pair.split(':');
    if (term && margin) {
      result[parseInt(term, 10)] = parseFloat(margin);
    }
  });
  return result;
}

/**
 * AI Recommendation Engine for generating vendor recommendations
 */
class AIRecommendationEngine {
  /**
   * Calculate savings compared to current contract
   */
  static calculateSavings(currentContract, vendorProduct, quoteRequest, quarterlyLease) {
    try {
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
      const newMonthlyLeaseCost = quarterlyLease / 3;

      const newMonoCPC = vendorProduct.A4MonoCPC || 0.008;
      const newColourCPC = vendorProduct.A4ColourCPC || 0.06;
      const newMonthlyCPCCost = monthlyMonoVolume * newMonoCPC + monthlyColourVolume * newColourCPC;

      const newTotalMonthlyCost = newMonthlyLeaseCost + newMonthlyCPCCost;

      const monthlySavings = currentTotalMonthlyCost - newTotalMonthlyCost;
      const annualSavings = monthlySavings * 12;
      const savingsPercentage = currentTotalMonthlyCost > 0
        ? (monthlySavings / currentTotalMonthlyCost) * 100
        : 0;

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
    } catch (error) {
      logger.error('Error in calculateSavings', { error: error.message });
      return { monthlySavings: 0, annualSavings: 0, savingsPercentage: 0, cpcSavings: { mono: 0, colour: 0 } };
    }
  }

  /**
   * Summarize user feedback into a preference profile
   */
  static async getUserPreferenceProfile(userId) {
    try {
      const feedback = await QuoteFeedback.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10);

      if (feedback.length === 0) {
        return 'No specific preferences known; prioritize cost and speed.';
      }

      const preferences = {
        acceptedVendors: [],
        rejectedVendors: [],
        comments: [],
        ratings: [],
      };

      feedback.forEach((fb) => {
        if (fb.accepted) {
          preferences.acceptedVendors.push(fb.vendorName);
        } else {
          preferences.rejectedVendors.push(fb.vendorName);
        }
        if (fb.comment) {
          preferences.comments.push(fb.comment);
        }
        if (fb.rating) {
          preferences.ratings.push(fb.rating);
        }
      });

      let summary = '';
      if (preferences.acceptedVendors.length > 0) {
        summary += `User prefers vendors like ${preferences.acceptedVendors.join(', ')}. `;
      }
      if (preferences.rejectedVendors.length > 0) {
        summary += `User avoids vendors like ${preferences.rejectedVendors.join(', ')}. `;
      }
      if (preferences.comments.length > 0) {
        const tokens = preferences.comments
          .map((comment) => tokenizer.tokenize(comment.toLowerCase()))
          .flat();
        const commonThemes = ['cost', 'price', 'speed', 'response', 'service', 'quality']
          .filter((theme) => tokens.includes(theme));
        if (commonThemes.length > 0) {
          summary += `User values: ${commonThemes.join(', ')}. `;
        }
      }
      if (preferences.ratings.length > 0) {
        const avgRating = preferences.ratings.reduce((sum, r) => sum + r, 0) / preferences.ratings.length;
        summary += `Average vendor rating: ${avgRating.toFixed(1)}/5. `;
      }

      return summary || 'No specific preferences identified; balance cost, speed, and service.';
    } catch (error) {
      logger.error('Error in getUserPreferenceProfile', { userId, error: error.message });
      return 'Error retrieving preferences; use default criteria.';
    }
  }

  /**
   * Generate vendor recommendations using OpenAI with user feedback,
   * and validate machine fit based on invoice-extracted usage.
   */
  static async generateRecommendations(quoteRequest, userId, invoiceFiles = []) {
    try {
      // 1. Extract contract info from invoice files
      let currentContract = {};
      let extractedUsage = { mono: 0, colour: 0 };

      if (invoiceFiles.length > 0) {
        const fileResults = await Promise.all(
          invoiceFiles.map((file) => FileParserService.processFile(file))
        );
        currentContract = fileResults.reduce((merged, result) => {
          if (result.contractInfo) {
            Object.entries(result.contractInfo).forEach(([key, value]) => {
              if (value !== null && (!merged[key] || merged[key] === null)) {
                merged[key] = value;
              }
            });
          }
          if (result.usage) {
            merged.usage = result.usage;
          }
          return merged;
        }, {});
        if (currentContract.usage) {
          extractedUsage = currentContract.usage;
        }
      }

      // Fallback to user input
      const monthlyMonoVolume = extractedUsage.mono || quoteRequest.monthlyVolume?.mono || 0;
      const monthlyColourVolume = extractedUsage.colour || quoteRequest.monthlyVolume?.colour || 0;

      // 2. Get user preference profile from feedback
      const preferenceProfile = await this.getUserPreferenceProfile(userId);

      // 3. Retrieve all relevant VendorProducts
      const vendorProducts = await VendorProduct.find().lean();

      // 4. Filter and score
      const results = [];
      const requestedTerm = quoteRequest.leaseTermMonths || 60; // Default to 5 years

      vendorProducts.forEach((product) => {
        // Check machine fit for usage
        const totalVolume = monthlyMonoVolume + monthlyColourVolume;
        let warning = undefined;
        if (totalVolume > product.maxVolume) {
          warning = `Your print volume (${totalVolume} pages/month) exceeds this model's recommended max (${product.maxVolume}). Not recommended.`;
        } else if (totalVolume < product.minVolume) {
          warning = `Your print volume (${totalVolume} pages/month) is below this model's recommended minimum (${product.minVolume}). You may be paying for capacity you don't need.`;
        }

        // Calculate lease cost for requested term
        const marginObj = parseLeaseTermsAndMargins(product.leaseTermsAndMargins);
        const margin = marginObj[requestedTerm] ?? marginObj[60] ?? 0.5;

        // Auxiliary calculation - assuming auxiliaries is an array of {item, price}
        let auxPrice = 0;
        if (Array.isArray(product.auxiliaries) && quoteRequest.selectedExtras) {
          auxPrice = quoteRequest.selectedExtras.reduce((sum, extra) => {
            const match = product.auxiliaries.find(
              (aux) => aux.item.trim().toLowerCase() === extra.trim().toLowerCase()
            );
            return match ? sum + parseFloat(match.price) : sum;
          }, 0);
        }

        const salePrice = product.salePrice || product.totalMachineCost || 0;
        const totalCost = salePrice + auxPrice;
        const totalLeaseValue = totalCost * (1 + margin);
        const quarterlyLease = (totalLeaseValue / requestedTerm) * 3;

        // Calculate savings (if user uploaded contract info)
        const savingsInfo = this.calculateSavings(currentContract, product, quoteRequest, quarterlyLease);

        results.push({
          vendorName: product.manufacturer,
          model: product.model,
          salePrice,
          totalLeaseValue: Math.round(totalLeaseValue * 100) / 100,
          quarterlyLease: Math.round(quarterlyLease * 100) / 100,
          termMonths: requestedTerm,
          A4MonoCPC: product.A4MonoCPC,
          A4ColourCPC: product.A4ColourCPC,
          features: product.features,
          warning,
          savingsInfo,
        });
      });

      // 5. Prioritise results: show only models that are a good fit, flag others
      const goodFits = results.filter(r => !r.warning);
      const flagged = results.filter(r => r.warning);

      // 6. Select top 3 good fits, fill with flagged if needed
      const topQuotes = goodFits
        .sort((a, b) => (b.savingsInfo.savingsPercentage - a.savingsInfo.savingsPercentage))
        .slice(0, 3);

      if (topQuotes.length < 3 && flagged.length > 0) {
        topQuotes.push(...flagged.slice(0, 3 - topQuotes.length));
      }

      return topQuotes.map(r => ({
        ...r,
        explanation: r.warning
          ? r.warning
          : `This model is a good fit for your actual print volume (${monthlyMonoVolume + monthlyColourVolume} pages/month).`,
      }));

    } catch (error) {
      logger.error('Error in generateRecommendations', { userId, error: error.message, stack: error.stack });
      return [];
    }
  }
}

export default AIRecommendationEngine;
