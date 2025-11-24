import OpenAI from 'openai';
import QuoteFeedback from '../models/QuoteFeedback.js';
import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
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

// Enhanced cosine similarity with safety checks
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    if (typeof vecA[i] !== 'number' || typeof vecB[i] !== 'number') continue;
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Production-ready AI Recommendation Engine with comprehensive error handling
 */
class AIRecommendationEngine {
  
  constructor() {
    // Scoring weights for machine matching (dynamic, but with defaults)
    this.scoringWeights = {
      volumeMatch: 0.35,      // Most important - prevents oversizing
      costEfficiency: 0.25,   // Cost savings vs current
      speedSuitability: 0.20, // Speed appropriate for volume
      featureMatch: 0.15,     // Required features present
      paperCompatibility: 0.05, // Paper size support (binary filter)
      semanticMatch: 0.15     // Semantic similarity matching
    };
  }

  /**
   * Get suggested speed based on monthly volume (from your matrix)
   */
  static getSuggestedSpeed(monthlyVolume) {
    if (!monthlyVolume || monthlyVolume <= 0) return 20;
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
    if (!monthlyVolume || monthlyVolume <= 6000) return '0-6k';
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
    try {
      if (!userVolume || !product || !product.minVolume || !product.maxVolume) {
        logger.warn('Invalid volume parameters:', { userVolume, productMin: product?.minVolume, productMax: product?.maxVolume });
        return 0;
      }
      
      const { minVolume, maxVolume } = product;
      
      // Perfect match: within recommended range
      if (userVolume >= minVolume && userVolume <= maxVolume) {
        // Bonus for being in the sweet spot (70-90% of max capacity)
        const utilization = userVolume / maxVolume;
        if (utilization >= 0.7 && utilization <= 0.9) return 1.0;
        if (utilization >= 0.5 && utilization <= 0.95) return 0.9;
        return 0.8; // Still good match but not optimal utilization
      }
      
      // Under-utilization (machine too big) - HEAVILY penalize
      if (userVolume < minVolume) {
        const ratio = userVolume / minVolume;
        if (ratio < 0.2) return 0.02; // Severely oversized - almost eliminate
        if (ratio < 0.4) return 0.1;  // Very oversized
        if (ratio < 0.6) return 0.25; // Moderately oversized
        return 0.4; // Slightly oversized but might be acceptable
      }
      
      // Over-utilization (machine too small) - also penalize but less severely
      if (userVolume > maxVolume) {
        const ratio = maxVolume / userVolume;
        if (ratio < 0.6) return 0.05; // Way too small - reliability issues
        if (ratio < 0.8) return 0.2;  // Too small but might work
        return 0.4; // Tight but acceptable with careful usage
      }
      
      return 0.5;
    } catch (error) {
      logger.error('Error in scoreVolumeMatch:', error);
      return 0;
    }
  }

  /**
   * Score speed suitability for volume
   */
  static scoreSpeedSuitability(userVolume, machineSpeed) {
    try {
      if (!userVolume || !machineSpeed) return 0.5;
      
      const suggestedSpeed = this.getSuggestedSpeed(userVolume);
      
      // Perfect range: suggested speed to 1.5x suggested
      if (machineSpeed >= suggestedSpeed && machineSpeed <= suggestedSpeed * 1.5) {
        return 1.0;
      }
      
      // Too slow for volume - will cause productivity issues
      if (machineSpeed < suggestedSpeed) {
        const ratio = machineSpeed / suggestedSpeed;
        if (ratio < 0.5) return 0.1; // Way too slow
        if (ratio < 0.7) return 0.3; // Too slow
        return Math.max(0.5, ratio * 0.8); // Somewhat slow but workable
      }
      
      // Too fast (overpowered but not terrible) - waste of money but works
      if (machineSpeed > suggestedSpeed * 2) {
        return 0.7; // Overpowered but works fine
      }
      
      return 0.85; // Slightly overpowered - good performance headroom
    } catch (error) {
      logger.error('Error in scoreSpeedSuitability:', error);
      return 0.5;
    }
  }

  /**
   * Check paper size compatibility (hard filter)
   */
  static checkPaperCompatibility(requiredSize, product) {
    try {
      if (!requiredSize) return true; // No requirement specified
      if (!product || !product.paperSizes) return false;
      
      // Check if product supports the required paper size
      const supportedSizes = product.paperSizes?.supported || [product.paperSizes?.primary];
      return Array.isArray(supportedSizes) ? supportedSizes.includes(requiredSize) : supportedSizes === requiredSize;
    } catch (error) {
      logger.error('Error in checkPaperCompatibility:', error);
      return false;
    }
  }

  /**
   * Enhanced feature matching with scoring
   */
  static scoreFeatureMatch(requiredFeatures, productFeatures) {
    try {
      if (!requiredFeatures || requiredFeatures.length === 0) return 1.0;
      if (!productFeatures || productFeatures.length === 0) return 0.0;
      
      const matchedFeatures = requiredFeatures.filter(feature => 
        productFeatures.some(pf => pf && pf.toLowerCase().includes(feature.toLowerCase()))
      );
      
      const score = matchedFeatures.length / requiredFeatures.length;
      return Math.max(0, Math.min(1, score));
    } catch (error) {
      logger.error('Error in scoreFeatureMatch:', error);
      return 0.5;
    }
  }

  /**
   * Enhanced: Calculate hybrid semantic score (content + collaborative)
   */
  static async calculateHybridScore(quoteRequest, product, prefs) {
    try {
      // Build request description with null checks
      const requestText = [
        quoteRequest?.description || '',
        quoteRequest?.primaryBusinessActivity || '',
        quoteRequest?.currentPainPoints || '',
        quoteRequest?.requiredFunctions?.join(' ') || '',
        quoteRequest?.industryType || ''
      ].filter(Boolean).join(' ');

      if (requestText.length < 10) return 0.5; // Default if no meaningful text

      // Generate embedding for request
      const reqEmbedding = (await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: requestText.substring(0, 8000) // Limit length
      })).data[0].embedding;

      // Use product embedding if available
      const productEmbedding = product?.embedding || [];
      let similarity = 0;
      
      if (productEmbedding.length > 0) {
        similarity = cosineSimilarity(reqEmbedding, productEmbedding);
      } else {
        // Fallback: generate embedding for product
        const productText = `${product?.manufacturer || ''} ${product?.model || ''} ${product?.description || ''} ${product?.features?.join(' ') || ''}`;
        const prodEmbedding = (await openai.embeddings.create({
          model: 'text-embedding-3-large',
          input: productText.substring(0, 8000)
        })).data[0].embedding;
        similarity = cosineSimilarity(reqEmbedding, prodEmbedding);
      }

      // Collaborative filtering bonus
      let collabBonus = 0;
      if (prefs?.preferredVendors?.includes(product?.manufacturer)) {
        collabBonus = 0.15;
      }
      
      // Industry matching bonus
      if (quoteRequest?.industryType && product?.industries?.includes(quoteRequest.industryType)) {
        collabBonus += 0.1;
      }

      return Math.min(1.0, similarity * 0.7 + collabBonus);
    } catch (error) {
      logger.error('Hybrid score calculation error:', error);
      return 0.5; // Default score on error
    }
  }
  /**
   * Calculate comprehensive machine suitability score
   */
  static async calculateSuitabilityScore(quoteRequest, product, prefs) {
    try {
      // Validate inputs
      if (!quoteRequest || !product) {
        logger.warn('Missing quoteRequest or product for suitability calculation');
        return {
          score: 0,
          reason: 'Missing required data',
          suitable: false,
          breakdown: {}
        };
      }

      // Extract user volume from enhanced quote request with null checks
      const userVolume = (quoteRequest.monthlyVolume?.mono || 0) + 
                        (quoteRequest.monthlyVolume?.colour || 0) ||
                        quoteRequest.monthlyVolume?.total || 0;
      
      // Paper compatibility is a hard filter
      const requiredPaperSize = quoteRequest.paperRequirements?.primarySize || 
                                quoteRequest.type || 'A4';
      
      if (!this.checkPaperCompatibility(requiredPaperSize, product)) {
        return {
          score: 0,
          reason: `Machine doesn't support required ${requiredPaperSize} paper size`,
          suitable: false,
          breakdown: { paperCompatible: false }
        };
      }

      // Calculate component scores with error handling
      const volumeScore = this.scoreVolumeMatch(userVolume, product);
      const speedScore = this.scoreSpeedSuitability(userVolume, product.speed);
      const featureScore = this.scoreFeatureMatch(
        quoteRequest.requiredFunctions || quoteRequest.required_functions, 
        product.features
      );
      
      // Volume score below threshold = not suitable
      if (volumeScore < 0.25) {
        let reason;
        if (userVolume < (product.minVolume || 0) * 0.4) {
          reason = `Machine severely oversized - designed for ${product.minVolume || 'unknown'}-${product.maxVolume || 'unknown'} pages/month, you need ${userVolume} pages/month. You'd pay for unused capacity.`;
        } else if (userVolume < (product.minVolume || 0)) {
          reason = `Machine oversized - recommended for ${product.minVolume || 'unknown'}-${product.maxVolume || 'unknown'} pages/month, you need ${userVolume} pages/month`;
        } else {
          reason = `Machine undersized - max capacity ${product.maxVolume || 'unknown'} pages/month, you need ${userVolume} pages/month. Risk of reliability issues.`;
        }
        
        return {
          score: volumeScore,
          reason,
          suitable: false,
          breakdown: { volumeScore, speedScore, featureScore, paperCompatible: true }
        };
      }

      // Calculate hybrid semantic score
      const hybridScore = await this.calculateHybridScore(quoteRequest, product, prefs);

      // Calculate weighted total score using dynamic weights
      const weights = this.scoringWeights;
      const totalScore = (volumeScore * weights.volumeMatch) +
                        (speedScore * weights.speedSuitability) +
                        (featureScore * weights.featureMatch) +
                        (hybridScore * weights.semanticMatch) +
                        (1.0 * weights.paperCompatibility); // Full points for compatible paper

      const suitable = totalScore >= 0.4 && volumeScore >= 0.25;

      return {
        score: totalScore,
        suitable,
        volumeScore,
        speedScore,
        featureScore,
        hybridScore,
        breakdown: { volumeScore, speedScore, featureScore, hybridScore, paperCompatible: true },
        reason: suitable ? 
          `Good match for ${userVolume} pages/month usage (${Math.round(totalScore * 100)}% compatibility)` :
          `Below suitability threshold - score: ${Math.round(totalScore * 100)}%`
      };
    } catch (error) {
      logger.error('Error calculating suitability score:', error);
      return {
        score: 0,
        suitable: false,
        reason: 'Error calculating compatibility score',
        breakdown: {}
      };
    }
  }

  /**
   * Enhanced cost efficiency calculation with comprehensive error handling
   */
  static calculateCostEfficiency(quoteRequest, product, quarterlyLease, currentContract = {}) {
    try {
      // Validate inputs
      if (!quoteRequest || !product) {
        logger.warn('Missing inputs for cost efficiency calculation');
        return this.getDefaultCostEfficiency();
      }

      const monthlyMonoVolume = quoteRequest.monthlyVolume?.mono || 0;
      const monthlyColourVolume = quoteRequest.monthlyVolume?.colour || 0;

      // Calculate new costs (enhanced with proper CPC handling)
      const newMonthlyLease = (quarterlyLease || 300) / 3;
      const newMonoCPC = (product.costs?.cpcRates?.A4Mono || product.A4MonoCPC || 1.0) / 100;
      const newColourCPC = (product.costs?.cpcRates?.A4Colour || product.A4ColourCPC || 4.0) / 100;
      const newMonthlyCPC = (monthlyMonoVolume * newMonoCPC) + (monthlyColourVolume * newColourCPC);
      const newServiceCost = (product.service?.quarterlyService || 150) / 3;
      const newTotalMonthlyCost = newMonthlyLease + newMonthlyCPC + newServiceCost;

      // Calculate current costs (from quote request)
      const currentMonthlyLease = (quoteRequest.quarterlyLeaseCost || 300) / 3;
      const currentMonoCPC = (quoteRequest.currentMonoCPC || 1.5) / 100;
      const currentColourCPC = (quoteRequest.currentColorCPC || 5.0) / 100;
      const currentMonthlyCPC = (monthlyMonoVolume * currentMonoCPC) + (monthlyColourVolume * currentColourCPC);
      const currentServiceCost = 50; // Estimated
      const currentTotalMonthlyCost = currentMonthlyLease + currentMonthlyCPC + currentServiceCost;

      // Calculate savings
      const monthlySavings = currentTotalMonthlyCost - newTotalMonthlyCost;
      const annualSavings = monthlySavings * 12;
      const savingsPercentage = currentTotalMonthlyCost > 0 ? 
        (monthlySavings / currentTotalMonthlyCost) * 100 : 0;

      // Cost efficiency score (0-1)
      let efficiencyScore = 0.5;
      if (monthlySavings > 0) {
        efficiencyScore = Math.min(1.0, 0.5 + (savingsPercentage / 100));
      } else if (monthlySavings < 0) {
        efficiencyScore = Math.max(0.0, 0.5 - (Math.abs(savingsPercentage) / 100));
      }

      return {
        currentTotalMonthlyCost: Math.round(currentTotalMonthlyCost * 100) / 100,
        newTotalMonthlyCost: Math.round(newTotalMonthlyCost * 100) / 100,
        monthlySavings: Math.round(monthlySavings * 100) / 100,
        annualSavings: Math.round(annualSavings * 100) / 100,
        savingsPercentage: Math.round(savingsPercentage * 100) / 100,
        efficiencyScore,
        breakdown: {
          currentLease: Math.round(currentMonthlyLease * 100) / 100,
          newLease: Math.round(newMonthlyLease * 100) / 100,
          currentCPC: Math.round(currentMonthlyCPC * 100) / 100,
          newCPC: Math.round(newMonthlyCPC * 100) / 100,
          currentService: Math.round(currentServiceCost * 100) / 100,
          newService: Math.round(newServiceCost * 100) / 100
        }
      };
    } catch (error) {
      logger.error('Error calculating cost efficiency:', error);
      return this.getDefaultCostEfficiency();
    }
  }

  /**
   * Default cost efficiency object
   */
  static getDefaultCostEfficiency() {
    return {
      monthlySavings: 0,
      annualSavings: 0,
      savingsPercentage: 0,
      newTotalMonthlyCost: 0,
      currentTotalMonthlyCost: 0,
      efficiencyScore: 0.5,
      breakdown: {}
    };
  }

  /**
   * Enhanced lease margin calculation with error handling
   */
  static getLeaseMargin(product, requestedTerm) {
    let margin = 0.55; // Default margin
    
    try {
      if (!product || !product.leaseTermsAndMargins) {
        return margin;
      }

      if (typeof product.leaseTermsAndMargins === 'string') {
        // Legacy string format: "36:0.6;48:0.55;60:0.5"
        const marginObj = {};
        product.leaseTermsAndMargins.split(';').forEach(pair => {
          const [term, marginValue] = pair.split(':');
          if (term && marginValue) {
            marginObj[parseInt(term, 10)] = parseFloat(marginValue);
          }
        });
        margin = marginObj[requestedTerm] || marginObj[60] || marginObj[48] || marginObj[36] || 0.55;
      } else if (Array.isArray(product.leaseTermsAndMargins)) {
        // New array format from schema
        const termOption = product.leaseTermsAndMargins.find(t => t.term === requestedTerm) ||
                          product.leaseTermsAndMargins.find(t => t.term === 60) ||
                          product.leaseTermsAndMargins.find(t => t.term === 48) ||
                          product.leaseTermsAndMargins[0];
        margin = termOption?.margin || 0.55;
      }
      
      return Math.max(0.3, Math.min(1.0, margin)); // Clamp between 30% and 100%
    } catch (error) {
      logger.warn('Error parsing lease margin, using default:', error);
      return 0.55;
    }
  }
  /**
   * Enhanced user preference learning with LLM analysis and error handling
   */
  static async getUserPreferenceProfile(userId) {
    try {
      if (!userId) {
        return this.getDefaultPreferences();
      }

      const feedback = await QuoteFeedback.find({ userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      if (feedback.length < 3) {
        return this.getDefaultPreferences();
      }

      const preferences = {
        acceptedVendors: [],
        rejectedVendors: [],
        comments: [],
        ratings: [],
        patterns: {}
      };

      feedback.forEach((fb) => {
        if (fb.accepted && fb.vendorName) {
          preferences.acceptedVendors.push(fb.vendorName);
        } else if (!fb.accepted && fb.vendorName) {
          preferences.rejectedVendors.push(fb.vendorName);
        }
        if (fb.comment) {
          preferences.comments.push(fb.comment);
        }
        if (fb.rating) {
          preferences.ratings.push(fb.rating);
        }
      });

      // LLM analysis for preferences
      if (preferences.comments.length > 0) {
        try {
          const feedbackText = preferences.comments.slice(0, 10).join('\n');
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { 
                role: 'system', 
                content: 'Analyze user feedback to determine procurement preferences. Return JSON with: {costPriority: 0-1, speedPriority: 0-1, featurePriority: 0-1, reliabilityPriority: 0-1, summary: string, keyPreferences: [string]}' 
              },
              { role: 'user', content: feedbackText }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3
          });
          
          const aiPrefs = JSON.parse(response.choices[0].message.content);
          
          return {
            summary: aiPrefs.summary || 'Preferences learned from user feedback',
            preferredVendors: [...new Set(preferences.acceptedVendors)],
            rejectedVendors: [...new Set(preferences.rejectedVendors)],
            costPriority: aiPrefs.costPriority || 0.5,
            speedPriority: aiPrefs.speedPriority || 0.5,
            featurePriority: aiPrefs.featurePriority || 0.5,
            reliabilityPriority: aiPrefs.reliabilityPriority || 0.5,
            keyPreferences: aiPrefs.keyPreferences || [],
            avgRating: preferences.ratings.length > 0 ? 
              preferences.ratings.reduce((a, b) => a + b, 0) / preferences.ratings.length : 0
          };
        } catch (aiError) {
          logger.warn('LLM preference analysis failed, using simple analysis:', aiError);
        }
      }

      // Fallback to simple analysis
      return {
        summary: `Based on ${feedback.length} interactions`,
        preferredVendors: [...new Set(preferences.acceptedVendors)],
        rejectedVendors: [...new Set(preferences.rejectedVendors)],
        costPriority: 0.6,
        speedPriority: 0.5,
        featurePriority: 0.4,
        reliabilityPriority: 0.7,
        keyPreferences: [],
        avgRating: preferences.ratings.length > 0 ? 
          preferences.ratings.reduce((a, b) => a + b, 0) / preferences.ratings.length : 0
      };

    } catch (error) {
      logger.error('Error getting user preference profile:', { userId, error: error.message });
      return this.getDefaultPreferences();
    }
  }

  /**
   * Default preferences for new users
   */
  static getDefaultPreferences() {
    return {
      summary: 'New user - prioritizing volume suitability and cost efficiency',
      preferredVendors: [],
      rejectedVendors: [],
      costPriority: 0.6,
      speedPriority: 0.5,
      featurePriority: 0.4,
      reliabilityPriority: 0.6,
      keyPreferences: ['suitable volume range', 'good value for money'],
      avgRating: 0
    };
  }
  /**
   * Main recommendation generation with enhanced filtering and scoring - PRODUCTION READY
   */
  static async generateRecommendations(quoteRequest, userId, invoiceFiles = []) {
    try {
      // Validate essential inputs
      if (!quoteRequest) {
        throw new Error('Quote request is required');
      }

      // Extract user volume from comprehensive quote request with fallbacks
      const userVolume = (quoteRequest.monthlyVolume?.mono || 0) + 
                        (quoteRequest.monthlyVolume?.colour || 0) ||
                        quoteRequest.monthlyVolume?.total || 5000; // Default fallback
      
      const volumeRange = this.getVolumeRange(userVolume);
      const requiredPaperSize = quoteRequest.paperRequirements?.primarySize || 
                              quoteRequest.type || 'A4';
      
      logger.info('Generating recommendations', { 
        userVolume, 
        volumeRange, 
        requiredPaperSize,
        userId,
        quoteRequestId: quoteRequest._id
      });

      // Get user preferences with dynamic scoring weights
      const preferenceProfile = await this.getUserPreferenceProfile(userId);
      
      // Initialize scoringWeights if not present (safety check)
      if (!this.scoringWeights) {
        this.scoringWeights = {
          volumeMatch: 0.35,
          costEfficiency: 0.25,
          speedSuitability: 0.20,
          featureMatch: 0.15,
          paperCompatibility: 0.05,
          semanticMatch: 0.15
        };
      }
      
      // Adjust scoring weights based on user preferences
      this.scoringWeights.costEfficiency = 0.15 + (preferenceProfile.costPriority * 0.2);
      this.scoringWeights.speedSuitability = 0.15 + (preferenceProfile.speedPriority * 0.15);
      this.scoringWeights.featureMatch = 0.1 + (preferenceProfile.featurePriority * 0.15);

      // Enhanced query with broader initial filtering
      const queryFilter = {
        'availability.inStock': true,
        // Volume filtering with tolerance
        $or: [
          { volumeRange }, // Exact match preferred
          { 
            maxVolume: { $gte: userVolume * 0.6 }, 
            minVolume: { $lte: userVolume * 2.5 } 
          }
        ]
      };

      // Paper size support - make this more flexible
      if (requiredPaperSize) {
        queryFilter.$and = [
          {
            $or: [
              { 'paperSizes.supported': requiredPaperSize },
              { 'paperSizes.primary': requiredPaperSize },
              { paperSizes: { $exists: false } } // Include products without explicit paper size data
            ]
          }
        ];
      }

      // Add feature requirements if specified
      const requiredFeatures = quoteRequest.requiredFunctions || quoteRequest.required_functions;
      if (requiredFeatures && requiredFeatures.length > 0) {
        if (!queryFilter.$and) queryFilter.$and = [];
        queryFilter.$and.push({ features: { $in: requiredFeatures } });
      }

      const vendorProducts = await VendorProduct.find(queryFilter)
        .populate('vendorId', 'name company performance')
        .sort({ 'costs.totalMachineCost': 1 })
        .lean();
      
      logger.info(`Found ${vendorProducts.length} potentially suitable products`);

      if (vendorProducts.length === 0) {
        logger.warn('No products found matching basic criteria', queryFilter);
        return this.generateFallbackRecommendations(quoteRequest, userVolume);
      }

      // Score and rank all products
      const scoredProducts = [];
      const requestedTerm = quoteRequest.urgency?.timeframe === '1-2 months' ? 36 : 
                           quoteRequest.urgency?.timeframe === '3-6 months' ? 48 : 60;

      for (const product of vendorProducts) {
        try {
          // Validate product has minimum required fields
          if (!product || !product.manufacturer || !product.model) {
            logger.warn('Product missing essential data:', product?._id);
            continue;
          }

          // Calculate suitability score
          const suitability = await this.calculateSuitabilityScore(quoteRequest, product, preferenceProfile);
          
          // Calculate lease costs
          const margin = this.getLeaseMargin(product, requestedTerm);
          const salePrice = product.costs?.totalMachineCost || product.salePrice || 0;
          const totalLeaseValue = salePrice * (1 + margin);
          const quarterlyLease = (totalLeaseValue / requestedTerm) * 3;

          // Calculate cost efficiency - FIXED: Initialize costInfo properly
          let costInfo = this.calculateCostEfficiency(quoteRequest, product, quarterlyLease);
          
          // Ensure costInfo is properly initialized
          if (!costInfo || typeof costInfo !== 'object') {
            costInfo = this.getDefaultCostEfficiency();
          }

          // Apply preference bonuses/penalties
          let preferenceBonus = 0;
          if (preferenceProfile.preferredVendors.includes(product.manufacturer)) {
            preferenceBonus += 0.1;
          }
          if (preferenceProfile.rejectedVendors.includes(product.manufacturer)) {
            preferenceBonus -= 0.15;
          }

          // Calculate overall score - FIXED: Ensure all scores are valid numbers
          const overallScore = Math.max(0, Math.min(1, 
            (suitability.score || 0) + 
            ((costInfo.efficiencyScore || 0.5) * 0.2) + 
            preferenceBonus
          ));

          scoredProducts.push({
            product,
            suitability,
            costInfo,
            quarterlyLease: Math.round(quarterlyLease * 100) / 100,
            termMonths: requestedTerm,
            overallScore,
            preferenceBonus,
            
            // Legacy compatibility fields
            vendorName: product.manufacturer,
            model: product.model,
            salePrice: product.costs?.totalMachineCost || product.salePrice,
            A4MonoCPC: product.costs?.cpcRates?.A4Mono || product.A4MonoCPC,
            A4ColourCPC: product.costs?.cpcRates?.A4Colour || product.A4ColourCPC,
            features: product.features || [],
            savingsInfo: costInfo
          });
        } catch (productError) {
          logger.warn(`Error processing product ${product._id}:`, productError);
          continue;
        }
      }

      // Separate suitable from unsuitable
      const suitableProducts = scoredProducts.filter(p => p.suitability.suitable && p.overallScore > 0.3);
      const unsuitableProducts = scoredProducts.filter(p => !p.suitability.suitable);

      // Sort suitable products by overall score
      suitableProducts.sort((a, b) => b.overallScore - a.overallScore);

      // Helper function: Extract vendor ID as string
      const getVendorId = (product) => {
        if (!product || !product.vendor) return 'unknown';

        // If vendor has an _id field (populated vendor object)
        if (product.vendor._id) {
          return typeof product.vendor._id === 'string'
            ? product.vendor._id
            : String(product.vendor._id);
        }

        // If vendor is directly the ID (ObjectId or string)
        return typeof product.vendor === 'string'
          ? product.vendor
          : String(product.vendor);
      };

      // Helper function: Select products with vendor diversity
      const selectDiverseProducts = (products, maxCount = 3) => {
        if (products.length === 0) return [];

        const selected = [];
        const usedVendors = new Set();
        const remaining = [];

        // First pass: Take top product from each unique vendor
        for (const product of products) {
          const vendorId = getVendorId(product);

          if (!usedVendors.has(vendorId) && selected.length < maxCount) {
            selected.push(product);
            usedVendors.add(vendorId);
          } else {
            remaining.push(product);
          }
        }

        // Second pass: Fill remaining slots if we have fewer than maxCount
        if (selected.length < maxCount) {
          const spotsLeft = maxCount - selected.length;
          selected.push(...remaining.slice(0, spotsLeft));
        }

        return selected;
      };

      // Generate final recommendations
      let topRecommendations = [];

      if (suitableProducts.length >= 3) {
        // We have enough suitable products - apply vendor diversity
        const diverseProducts = selectDiverseProducts(suitableProducts, 3);
        topRecommendations = diverseProducts.map((product, index) => ({
          ...product,
          ranking: index + 1,
          confidence: this.getConfidenceLevel(product.overallScore),
          explanation: this.generateExplanation(product, 'suitable', preferenceProfile),
          recommendation: this.generateRecommendationText(product, index + 1, userVolume)
        }));
      } else if (suitableProducts.length > 0) {
        // Some suitable products, fill with best unsuitable ones
        const additionalNeeded = 3 - suitableProducts.length;

        // Track vendors already used by suitable products
        const usedVendors = new Set(
          suitableProducts.map(p => getVendorId(p))
        );

        // Sort unsuitable products and apply vendor diversity
        const sortedUnsuitable = unsuitableProducts
          .sort((a, b) => b.suitability.score - a.suitability.score);

        // Select diverse unsuitable products, avoiding already-used vendors
        const diverseUnsuitable = [];
        const remainingUnsuitable = [];

        for (const product of sortedUnsuitable) {
          const vendorId = getVendorId(product);
          if (!usedVendors.has(vendorId) && diverseUnsuitable.length < additionalNeeded) {
            diverseUnsuitable.push(product);
            usedVendors.add(vendorId);
          } else {
            remainingUnsuitable.push(product);
          }
        }

        // Fill remaining slots if needed
        if (diverseUnsuitable.length < additionalNeeded) {
          const spotsLeft = additionalNeeded - diverseUnsuitable.length;
          diverseUnsuitable.push(...remainingUnsuitable.slice(0, spotsLeft));
        }

        topRecommendations = [
          ...suitableProducts.map((product, index) => ({
            ...product,
            ranking: index + 1,
            confidence: this.getConfidenceLevel(product.overallScore),
            explanation: this.generateExplanation(product, 'suitable', preferenceProfile),
            recommendation: this.generateRecommendationText(product, index + 1, userVolume)
          })),
          ...diverseUnsuitable.map((product, index) => ({
            ...product,
            ranking: suitableProducts.length + index + 1,
            confidence: 'Low',
            warning: product.suitability.reason,
            explanation: this.generateExplanation(product, 'unsuitable', preferenceProfile),
            recommendation: this.generateRecommendationText(product, suitableProducts.length + index + 1, userVolume, true)
          }))
        ];
      } else {
        // No suitable products found
        logger.warn('No suitable products found, returning best available with warnings');
        const sortedUnsuitable = unsuitableProducts
          .sort((a, b) => b.suitability.score - a.suitability.score);
        const diverseUnsuitable = selectDiverseProducts(sortedUnsuitable, 3);
        topRecommendations = diverseUnsuitable.map((product, index) => ({
            ...product,
            ranking: index + 1,
            confidence: 'Low',
            warning: product.suitability.reason,
            explanation: this.generateExplanation(product, 'fallback', preferenceProfile),
            recommendation: this.generateRecommendationText(product, index + 1, userVolume, true)
          }));
      }

      // Add AI insights and metadata
      const finalRecommendations = topRecommendations.map(rec => ({
        ...rec,
        aiInsights: {
          volumeMatch: `${Math.round((rec.suitability.volumeScore || 0) * 100)}%`,
          speedSuitability: `${Math.round((rec.suitability.speedScore || 0) * 100)}%`,
          featureMatch: `${Math.round((rec.suitability.featureScore || 0) * 100)}%`,
          overallCompatibility: `${Math.round(rec.overallScore * 100)}%`,
          estimatedROI: (rec.costInfo.annualSavings || 0) > 0 ? 
            `£${rec.costInfo.annualSavings} annual savings` : 
            `£${Math.abs(rec.costInfo.annualSavings || 0)} annual increase`,
          recommendation: rec.ranking === 1 ? 'Recommended' : 
                         rec.ranking === 2 ? 'Good Alternative' : 
                         'Consideration Option'
        },
        metadata: {
          generatedAt: new Date(),
          userId,
          preferenceProfile: preferenceProfile.summary,
          scoringWeights: { ...this.scoringWeights }
        }
      }));
      // **FIXED: CREATE ACTUAL QUOTE DOCUMENTS WITH COMPLETE SCHEMA**
      const createdQuotes = [];
      
      for (const recommendation of finalRecommendations.slice(0, 3)) {
        try {
          // Calculate all required cost fields
          const monthlyMonoVolume = quoteRequest.monthlyVolume?.mono || 0;
          const monthlyColourVolume = quoteRequest.monthlyVolume?.colour || 0;
          const monoCpcRate = (recommendation.product.costs?.cpcRates?.A4Mono || 1.0) / 100;
          const colourCpcRate = (recommendation.product.costs?.cpcRates?.A4Colour || 4.0) / 100;
          const monthlyCpcCostMono = monthlyMonoVolume * monoCpcRate;
          const monthlyCpcCostColour = monthlyColourVolume * colourCpcRate;
          const totalCpcCost = monthlyCpcCostMono + monthlyCpcCostColour;
          const leaseCost = recommendation.quarterlyLease / 3;
          const serviceCost = 50; // Default service cost
          const totalMonthlyCost = leaseCost + totalCpcCost + serviceCost;

          const newQuote = new Quote({
            quoteRequest: quoteRequest._id,
            product: recommendation.product._id,
            vendor: recommendation.product.vendorId._id || recommendation.product.vendorId,
            
            // REQUIRED: ranking
            ranking: recommendation.ranking,
            
            // REQUIRED: productSummary
            productSummary: {
              manufacturer: recommendation.product.manufacturer,
              model: recommendation.product.model,
              speed: recommendation.product.speed || 25,
              category: recommendation.product.volumeRange || 'Standard'
            },
            
            // REQUIRED: userRequirements
            userRequirements: {
              monthlyVolume: {
                mono: monthlyMonoVolume,
                colour: monthlyColourVolume,
                total: userVolume
              },
              paperSize: requiredPaperSize,
              features: quoteRequest.requiredFunctions || quoteRequest.required_functions || [],
              priority: quoteRequest.requirements?.priority || 'cost',
              maxBudget: quoteRequest.budget?.maxLeasePrice || 0
            },
            
            // REQUIRED: costs (all nested fields required)
            costs: {
              machineCost: recommendation.product.costs?.totalMachineCost || 0,
              installation: 0,
              profitMargin: recommendation.product.costs?.profitMargin || 0.55,
              totalMachineCost: recommendation.product.costs?.totalMachineCost || 0,
              cpcRates: {
                monoRate: monoCpcRate * 100, // Store as pence
                colourRate: colourCpcRate * 100, // Store as pence
                paperSize: requiredPaperSize
              },
              monthlyCosts: {
                monoPages: monthlyMonoVolume,
                colourPages: monthlyColourVolume,
                monoCpcCost: Math.round(monthlyCpcCostMono * 100) / 100,
                colourCpcCost: Math.round(monthlyCpcCostColour * 100) / 100,
                totalCpcCost: Math.round(totalCpcCost * 100) / 100,
                leaseCost: Math.round(leaseCost * 100) / 100,
                serviceCost: Math.round(serviceCost * 100) / 100,
                totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100
              }
            },
            
            // REQUIRED: matchScore - **FIXED WITH BREAKDOWN**
            matchScore: {
              total: Math.max(0, Math.min(1, recommendation.overallScore)),
              confidence: recommendation.confidence,
              breakdown: {
                volumeMatch: recommendation.suitability?.volumeScore || 0,
                costEfficiency: recommendation.costInfo?.efficiencyScore || 0.5,
                speedMatch: recommendation.suitability?.speedScore || 0,
                featureMatch: recommendation.suitability?.featureScore || 0,
                reliabilityMatch: 0.7
              },
              reasoning: [recommendation.explanation || 'AI-generated recommendation']
            },
            
            // REQUIRED: terms
            terms: {
              validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            },
            
            // **FIXED: Use valid enum status**
            status: 'generated',
            
            // Optional fields
            aiGenerated: true,
            recommendation: {
              ranking: recommendation.ranking,
              explanation: recommendation.explanation,
              aiInsights: recommendation.aiInsights,
              suitabilityScore: recommendation.suitability.score,
              warning: recommendation.warning
            },
            createdAt: new Date()
          });

          const savedQuote = await newQuote.save();
          createdQuotes.push(savedQuote);
          
          logger.info(`Created quote ${savedQuote._id} for product ${recommendation.product._id}`);
          
        } catch (quoteError) {
          logger.error('Error creating quote:', quoteError);
          continue; // Continue with other quotes even if one fails
        }
      }

      // **UPDATE QUOTE REQUEST WITH CREATED QUOTES**
      if (createdQuotes.length > 0) {
        await QuoteRequest.findByIdAndUpdate(
          quoteRequest._id,
          { 
            $push: { quotes: { $each: createdQuotes.map(q => q._id) } },
            status: 'completed',
            'aiAnalysis.processed': true,
            'aiAnalysis.processedAt': new Date(),
            'aiAnalysis.suggestedCategories': [volumeRange],
            'aiAnalysis.recommendations': finalRecommendations.map(rec => ({
              productId: rec.product._id,
              score: rec.overallScore,
              ranking: rec.ranking
            }))
          }
        );

        logger.info(`Updated quote request ${quoteRequest._id} with ${createdQuotes.length} quotes`);
      }

      logger.info(`Generated ${finalRecommendations.length} recommendations and ${createdQuotes.length} quotes`, {
        suitable: suitableProducts.length,
        unsuitable: unsuitableProducts.length,
        topScore: finalRecommendations[0]?.overallScore
      });

      return {
        recommendations: finalRecommendations,
        quotes: createdQuotes,
        summary: {
          totalRecommendations: finalRecommendations.length,
          quotesCreated: createdQuotes.length,
          suitableProducts: suitableProducts.length,
          userVolume,
          preferenceProfile: preferenceProfile.summary
        }
      };

    } catch (error) {
      logger.error('Error in generateRecommendations:', { 
        userId, 
        error: error.message, 
        stack: error.stack 
      });
      return this.generateErrorFallback(error);
    }
  }
  /**
   * Generate fallback recommendations when no products match basic criteria
   */
  static async generateFallbackRecommendations(quoteRequest, userVolume) {
    try {
      logger.info('Generating fallback recommendations');
      
      // Broaden search criteria significantly
      const fallbackProducts = await VendorProduct.find({
        'availability.inStock': true,
        $or: [
          { maxVolume: { $gte: userVolume * 0.3 } },
          { minVolume: { $lte: userVolume * 3 } }
        ]
      })
      .limit(10)
      .sort({ 'costs.totalMachineCost': 1 })
      .lean();

      return {
        recommendations: fallbackProducts.slice(0, 3).map((product, index) => ({
          product,
          ranking: index + 1,
          confidence: 'Very Low',
          warning: 'No ideal matches found - these are compromise options',
          explanation: `⚠️ Limited suitable options available. This machine may not be optimal for your ${userVolume} pages/month requirement.`,
          recommendation: `Option ${index + 1}: ${product.manufacturer} ${product.model} - requires careful evaluation`,
          quarterlyLease: 0,
          overallScore: 0.2,
          suitability: { score: 0.2, suitable: false },
          costInfo: { monthlySavings: 0, annualSavings: 0 }
        })),
        quotes: [],
        summary: {
          totalRecommendations: Math.min(3, fallbackProducts.length),
          quotesCreated: 0,
          fallback: true
        }
      };
    } catch (error) {
      logger.error('Error generating fallback recommendations:', error);
      return this.generateErrorFallback(error);
    }
  }

  /**
   * Generate error fallback response
   */
  static generateErrorFallback(error) {
    return {
      recommendations: [{
        error: true,
        message: 'Unable to generate recommendations at this time',
        recommendation: 'Please try again or contact support for assistance',
        technicalError: error.message,
        ranking: 1,
        confidence: 'None'
      }],
      quotes: [],
      summary: {
        error: true,
        message: error.message
      }
    };
  }

  /**
   * Determine confidence level based on overall score
   */
  static getConfidenceLevel(score) {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    if (score >= 0.4) return 'Low';
    return 'Very Low';
  }

  /**
   * Generate human-readable explanation
   */
  static generateExplanation(product, type, preferenceProfile) {
    const score = Math.round(product.overallScore * 100);
    const savings = product.costInfo.monthlySavings || 0;
    
    switch (type) {
      case 'suitable':
        return `✅ Excellent match (${score}% compatibility). ${savings > 0 ? 
          `Potential savings: £${savings}/month.` : 
          `Cost increase: £${Math.abs(savings)}/month but with better performance.`} ${
          preferenceProfile.preferredVendors.includes(product.vendorName) ? 
          'From your preferred vendor.' : ''
        }`;
        
      case 'unsuitable':
        return `⚠️ ${product.suitability.reason} Compatibility score: ${score}%. Consider if specific requirements justify the mismatch.`;
        
      case 'fallback':
        return `⚠️ Limited options available. This machine may not be optimal for your requirements. Manual evaluation recommended.`;
        
      default:
        return `Compatibility score: ${score}%`;
    }
  }

  /**
   * Generate recommendation text
   */
  static generateRecommendationText(product, ranking, userVolume, hasWarning = false) {
    const rankText = ranking === 1 ? '🥇 Top Choice' : 
                    ranking === 2 ? '🥈 Strong Alternative' : 
                    ranking === 3 ? '🥉 Additional Option' : 
                    `Option ${ranking}`;
    
    const warningText = hasWarning ? ' ⚠️ Review carefully' : '';
    
    return `${rankText}: ${product.vendorName} ${product.model} - ${product.product.speed}ppm, suitable for ${product.product.minVolume}-${product.product.maxVolume} pages/month${warningText}`;
  }

  /**
   * Extract contract information from uploaded files
   */
  static async extractContractInfo(invoiceFiles) {
    if (!invoiceFiles || invoiceFiles.length === 0) return {};
    
    try {
      const fileResults = await Promise.all(
        invoiceFiles.map(async (file) => {
          try {
            return await FileParserService.processFile(file);
          } catch (fileError) {
            logger.warn(`Error processing file ${file.name}:`, fileError);
            return { contractInfo: {} };
          }
        })
      );
      
      return fileResults.reduce((merged, result) => {
        if (result.contractInfo) {
          Object.assign(merged, result.contractInfo);
        }
        return merged;
      }, {});
    } catch (error) {
      logger.warn('Error extracting contract info from files:', error);
      return {};
    }
  }

  /**
   * Validate quote request data
   */
  static validateQuoteRequest(quoteRequest) {
    const errors = [];
    
    if (!quoteRequest.monthlyVolume || 
        (!quoteRequest.monthlyVolume.total && 
         !quoteRequest.monthlyVolume.mono && 
         !quoteRequest.monthlyVolume.colour)) {
      errors.push('Monthly volume information is required');
    }
    
    if (!quoteRequest.companyName) {
      errors.push('Company name is required');
    }
    
    if (!quoteRequest.industryType) {
      errors.push('Industry type is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Main entry point with validation and quote generation
   */
  static async generateValidatedRecommendations(quoteRequest, userId, invoiceFiles = []) {
    try {
      // Validate input
      const validation = this.validateQuoteRequest(quoteRequest);
      if (!validation.isValid) {
        logger.warn('Invalid quote request:', validation.errors);
        return {
          success: false,
          errors: validation.errors,
          recommendations: [],
          quotes: []
        };
      }

      // Extract contract info from files
      const contractInfo = await this.extractContractInfo(invoiceFiles);
      
      // Generate recommendations and create quotes
      const result = await this.generateRecommendations(
        quoteRequest, 
        userId, 
        invoiceFiles
      );

      return {
        success: true,
        recommendations: result.recommendations || [],
        quotes: result.quotes || [],
        metadata: {
          totalProcessed: result.recommendations?.length || 0,
          quotesCreated: result.quotes?.length || 0,
          contractInfoExtracted: Object.keys(contractInfo).length > 0,
          generatedAt: new Date(),
          userId,
          summary: result.summary
        }
      };
    } catch (error) {
      logger.error('Error in generateValidatedRecommendations:', error);
      return {
        success: false,
        error: error.message,
        recommendations: [],
        quotes: []
      };
    }
  }
}

export default AIRecommendationEngine;
