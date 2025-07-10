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
 * Enhanced AI Recommendation Engine with proper volume and suitability matching
 */
class AIRecommendationEngine {
  
  constructor() {
    // Scoring weights for machine matching
    this.scoringWeights = {
      volumeMatch: 0.35,      // Most important - prevents oversizing
      costEfficiency: 0.25,   // Cost savings vs current
      speedSuitability: 0.20, // Speed appropriate for volume
      featureMatch: 0.15,     // Required features present
      paperCompatibility: 0.05 // Paper size support (binary filter)
    };
  }

  /**
   * Get suggested speed based on monthly volume (from your matrix)
   */
  static getSuggestedSpeed(monthlyVolume) {
    if (monthlyVolume <= 6000) return 20;
    if (monthlyVolume <= 13000) return 25;
    if (monthlyVolume <= 20000) return 30;
    if (monthlyVolume <= 30000) return 35;
    if (monthlyVolume <= 40000) return 45;
    if (monthlyVolume <= 50000) return 55;
    if (monthlyVolume <= 60000) return 65;
    return 75;
  }

  /**
   * Calculate volume range category
   */
  static getVolumeRange(monthlyVolume) {
    if (monthlyVolume <= 6000) return '0-6k';
    if (monthlyVolume <= 13000) return '6k-13k';
    if (monthlyVolume <= 20000) return '13k-20k';
    if (monthlyVolume <= 30000) return '20k-30k';
    if (monthlyVolume <= 40000) return '30k-40k';
    if (monthlyVolume <= 50000) return '40k-50k';
    return '50k+';
  }

  /**
   * Score how well a machine's volume capacity matches user needs
   */
  static scoreVolumeMatch(userVolume, product) {
    const { minVolume, maxVolume } = product;
    
    // Perfect match: within recommended range
    if (userVolume >= minVolume && userVolume <= maxVolume) {
      return 1.0;
    }
    
    // Under-utilization (machine too big) - HEAVILY penalize
    if (userVolume < minVolume) {
      const ratio = userVolume / minVolume;
      if (ratio < 0.3) return 0.05; // Severely oversized - almost eliminate
      if (ratio < 0.5) return 0.2;  // Very oversized
      return 0.4; // Somewhat oversized but might be acceptable
    }
    
    // Over-utilization (machine too small)
    if (userVolume > maxVolume) {
      const ratio = maxVolume / userVolume;
      if (ratio < 0.7) return 0.1; // Way too small
      return 0.3; // Tight but might work with light usage
    }
    
    return 0.5;
  }

  /**
   * Score speed suitability for volume
   */
  static scoreSpeedSuitability(userVolume, machineSpeed) {
    const suggestedSpeed = this.getSuggestedSpeed(userVolume);
    
    // Perfect range: suggested speed to 1.5x suggested
    if (machineSpeed >= suggestedSpeed && machineSpeed <= suggestedSpeed * 1.5) {
      return 1.0;
    }
    
    // Too slow for volume
    if (machineSpeed < suggestedSpeed) {
      const ratio = machineSpeed / suggestedSpeed;
      return Math.max(0.1, ratio);
    }
    
    // Too fast (overpowered but not terrible)
    if (machineSpeed > suggestedSpeed * 2) {
      return 0.6; // Overpowered but works
    }
    
    return 0.8; // Slightly overpowered
  }

  /**
   * Check paper size compatibility
   */
  static checkPaperCompatibility(requiredSize, product) {
    if (!requiredSize) return true; // No requirement specified
    
    // Check if product supports the required paper size
    const supportedSizes = product.paperSizes?.supported || [product.paperSizes?.primary];
    return supportedSizes.includes(requiredSize);
  }

  /**
   * Calculate comprehensive machine suitability score
   */
  static calculateSuitabilityScore(quoteRequest, product) {
    const userVolume = (quoteRequest.monthlyVolume?.mono || 0) + (quoteRequest.monthlyVolume?.colour || 0);
    
    // Paper compatibility is a hard filter
    const requiredPaperSize = quoteRequest.paperRequirements?.primarySize || 
                              quoteRequest.type || // fallback to legacy field
                              'A4'; // default assumption
    
    if (!this.checkPaperCompatibility(requiredPaperSize, product)) {
      return {
        score: 0,
        reason: `Machine doesn't support required ${requiredPaperSize} paper size`,
        suitable: false
      };
    }

    // Calculate component scores
    const volumeScore = this.scoreVolumeMatch(userVolume, product);
    const speedScore = this.scoreSpeedSuitability(userVolume, product.speed);
    
    // Volume score below threshold = not suitable
    if (volumeScore < 0.3) {
      let reason;
      if (userVolume < product.minVolume * 0.5) {
        reason = `Machine severely oversized - you'd pay for ${product.maxVolume} pages capacity while using only ${userVolume} pages/month`;
      } else if (userVolume < product.minVolume) {
        reason = `Machine oversized - recommended for ${product.minVolume}-${product.maxVolume} pages/month, you need ${userVolume} pages/month`;
      } else {
        reason = `Machine undersized - max capacity ${product.maxVolume} pages/month, you need ${userVolume} pages/month`;
      }
      
      return {
        score: volumeScore,
        reason,
        suitable: false
      };
    }

    // Calculate weighted total score
    const totalScore = (volumeScore * this.scoringWeights.volumeMatch) +
                      (speedScore * this.scoringWeights.speedSuitability);

    return {
      score: totalScore,
      suitable: totalScore >= 0.4, // Minimum threshold for suitability
      volumeScore,
      speedScore,
      reason: totalScore >= 0.4 ? 
        `Good fit for ${userVolume} pages/month usage` :
        `Below suitability threshold - volume or speed mismatch`
    };
  }

  /**
   * Calculate cost efficiency including savings
   */
  static calculateCostEfficiency(quoteRequest, product, quarterlyLease, currentContract = {}) {
    try {
      const monthlyMonoVolume = quoteRequest.monthlyVolume?.mono || 0;
      const monthlyColourVolume = quoteRequest.monthlyVolume?.colour || 0;

      // Calculate new costs
      const newMonthlyLease = quarterlyLease / 3;
      const newMonoCPC = (product.costs?.cpcRates?.A4Mono || product.A4MonoCPC || 0) / 100; // Convert pence to pounds
      const newColourCPC = (product.costs?.cpcRates?.A4Colour || product.A4ColourCPC || 0) / 100;
      const newMonthlyCPC = (monthlyMonoVolume * newMonoCPC) + (monthlyColourVolume * newColourCPC);
      const newTotalMonthlyCost = newMonthlyLease + newMonthlyCPC;

      // Calculate current costs
      const currentMonthlyLease = (currentContract.leaseCost || quoteRequest.quarterlyPayment || 0) / 3;
      const currentMonoCPC = (currentContract.monoCPC || quoteRequest.currentMonoCPC || 0.01);
      const currentColourCPC = (currentContract.colourCPC || quoteRequest.currentColourCPC || 0.08);
      const currentMonthlyCPC = (monthlyMonoVolume * currentMonoCPC) + (monthlyColourVolume * currentColourCPC);
      const currentTotalMonthlyCost = currentMonthlyLease + currentMonthlyCPC;

      // Calculate savings
      const monthlySavings = currentTotalMonthlyCost - newTotalMonthlyCost;
      const annualSavings = monthlySavings * 12;
      const savingsPercentage = currentTotalMonthlyCost > 0 ? 
        (monthlySavings / currentTotalMonthlyCost) * 100 : 0;

      return {
        currentTotalMonthlyCost: Math.round(currentTotalMonthlyCost * 100) / 100,
        newTotalMonthlyCost: Math.round(newTotalMonthlyCost * 100) / 100,
        monthlySavings: Math.round(monthlySavings * 100) / 100,
        annualSavings: Math.round(annualSavings * 100) / 100,
        savingsPercentage: Math.round(savingsPercentage * 100) / 100,
        breakdown: {
          currentLease: currentMonthlyLease,
          newLease: newMonthlyLease,
          currentCPC: currentMonthlyCPC,
          newCPC: newMonthlyCPC
        }
      };
    } catch (error) {
      logger.error('Error calculating cost efficiency:', error);
      return {
        monthlySavings: 0,
        annualSavings: 0,
        savingsPercentage: 0,
        newTotalMonthlyCost: 0,
        currentTotalMonthlyCost: 0
      };
    }
  }

  /**
   * Parse lease term margin string (legacy support)
   */
  static parseLeaseTermsAndMargins(str) {
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
   * Get user preference profile from feedback
   */
  static async getUserPreferenceProfile(userId) {
    try {
      const feedback = await QuoteFeedback.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10);

      if (feedback.length === 0) {
        return 'No specific preferences known; prioritize suitable volume match and cost efficiency.';
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
        summary += `User prefers vendors: ${[...new Set(preferences.acceptedVendors)].join(', ')}. `;
      }
      if (preferences.rejectedVendors.length > 0) {
        summary += `User avoids vendors: ${[...new Set(preferences.rejectedVendors)].join(', ')}. `;
      }
      
      const avgRating = preferences.ratings.length > 0 ? 
        preferences.ratings.reduce((sum, r) => sum + r, 0) / preferences.ratings.length : 0;
      
      if (avgRating > 0) {
        summary += `Average vendor rating: ${avgRating.toFixed(1)}/5. `;
      }

      return summary || 'Balance volume suitability, cost efficiency, and service quality.';
    } catch (error) {
      logger.error('Error getting user preference profile:', { userId, error: error.message });
      return 'Focus on volume-appropriate machines with good cost efficiency.';
    }
  }

  /**
   * Enhanced recommendation generation with proper filtering and scoring
   */
  static async generateRecommendations(quoteRequest, userId, invoiceFiles = []) {
    try {
      const userVolume = (quoteRequest.monthlyVolume?.mono || 0) + (quoteRequest.monthlyVolume?.colour || 0);
      const volumeRange = this.getVolumeRange(userVolume);
      const requiredPaperSize = quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4';
      
      logger.info('Generating recommendations', { 
        userVolume, 
        volumeRange, 
        requiredPaperSize,
        userId 
      });

      // 1. Extract contract info from invoices
      let currentContract = {};
      if (invoiceFiles.length > 0) {
        try {
          const fileResults = await Promise.all(
            invoiceFiles.map((file) => FileParserService.processFile(file))
          );
          currentContract = fileResults.reduce((merged, result) => {
            if (result.contractInfo) {
              Object.assign(merged, result.contractInfo);
            }
            return merged;
          }, {});
        } catch (error) {
          logger.warn('Error processing invoice files:', error);
        }
      }

      // 2. Get user preferences
      const preferenceProfile = await this.getUserPreferenceProfile(userId);

      // 3. Query suitable products with pre-filtering
      const queryFilter = {
        // Volume pre-filtering: find machines that can handle the volume
        maxVolume: { $gte: userVolume * 0.7 }, // At least 70% of user volume
        minVolume: { $lte: userVolume * 2 },   // Not more than 2x oversized
      };

      // Add paper size filter if specified
      if (requiredPaperSize) {
        queryFilter['paperSizes.supported'] = requiredPaperSize;
      }

      const vendorProducts = await VendorProduct.find(queryFilter).lean();
      
      logger.info(`Found ${vendorProducts.length} potentially suitable products`);

      if (vendorProducts.length === 0) {
        logger.warn('No products found matching basic criteria', queryFilter);
        return [];
      }

      // 4. Score and rank all products
      const scoredProducts = [];
      const requestedTerm = quoteRequest.leaseTermMonths || 60;

      for (const product of vendorProducts) {
        // Calculate suitability score
        const suitability = this.calculateSuitabilityScore(quoteRequest, product);
        
        // Calculate lease costs
        let quarterlyLease = 0;
        try {
          // Handle both old and new lease term formats
          let margin = 0.5; // default
          
          if (product.leaseTermsAndMargins) {
            if (typeof product.leaseTermsAndMargins === 'string') {
              // Legacy string format
              const marginObj = this.parseLeaseTermsAndMargins(product.leaseTermsAndMargins);
              margin = marginObj[requestedTerm] ?? marginObj[60] ?? 0.5;
            } else if (Array.isArray(product.leaseTermsAndMargins)) {
              // New array format
              const termOption = product.leaseTermsAndMargins.find(t => t.term === requestedTerm) ||
                                product.leaseTermsAndMargins.find(t => t.term === 60) ||
                                product.leaseTermsAndMargins[0];
              margin = termOption?.margin || 0.5;
            }
          }

          const salePrice = product.costs?.totalMachineCost || product.salePrice || 0;
          const totalLeaseValue = salePrice * (1 + margin);
          quarterlyLease = (totalLeaseValue / requestedTerm) * 3;
        } catch (error) {
          logger.warn('Error calculating lease for product:', { productId: product._id, error });
          continue;
        }

        // Calculate cost efficiency
        const costInfo = this.calculateCostEfficiency(quoteRequest, product, quarterlyLease, currentContract);

        scoredProducts.push({
          product,
          suitability,
          costInfo,
          quarterlyLease: Math.round(quarterlyLease * 100) / 100,
          termMonths: requestedTerm,
          overallScore: suitability.score + (costInfo.savingsPercentage / 100) * 0.2, // Slight bonus for savings
          
          // Legacy fields for compatibility
          vendorName: product.manufacturer,
          model: product.model,
          salePrice: product.costs?.totalMachineCost || product.salePrice,
          A4MonoCPC: product.costs?.cpcRates?.A4Mono || product.A4MonoCPC,
          A4ColourCPC: product.costs?.cpcRates?.A4Colour || product.A4ColourCPC,
          features: product.features,
          savingsInfo: costInfo
        });
      }

      // 5. Separate suitable from unsuitable products
      const suitableProducts = scoredProducts.filter(p => p.suitability.suitable);
      const unsuitableProducts = scoredProducts.filter(p => !p.suitability.suitable);

      // 6. Sort suitable products by overall score
      suitableProducts.sort((a, b) => b.overallScore - a.overallScore);

      // 7. Return top 3 suitable, or include warnings if none suitable
      let topRecommendations = suitableProducts.slice(0, 3);

      if (topRecommendations.length === 0) {
        logger.warn('No suitable products found, including top unsuitable with warnings');
        topRecommendations = unsuitableProducts
          .sort((a, b) => b.suitability.score - a.suitability.score)
          .slice(0, 3)
          .map(product => ({
            ...product,
            warning: product.suitability.reason,
            explanation: `⚠️ ${product.suitability.reason}`
          }));
      } else {
        topRecommendations = topRecommendations.map(product => ({
          ...product,
          explanation: `✅ ${product.suitability.reason}. Potential savings: £${product.costInfo.monthlySavings}/month`
        }));
      }

      logger.info(`Returning ${topRecommendations.length} recommendations`, {
        suitable: suitableProducts.length,
        unsuitable: unsuitableProducts.length
      });

      return topRecommendations;

    } catch (error) {
      logger.error('Error in generateRecommendations:', { 
        userId, 
        error: error.message, 
        stack: error.stack 
      });
      return [];
    }
  }
}

export default AIRecommendationEngine;