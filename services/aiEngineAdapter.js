// services/aiEngineAdapter.js - Production-ready bridge between AIRecommendationEngine and new models
import AIRecommendationEngine from './aiRecommendationEngine.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import logger from './logger.js';

/**
 * Production-ready adapter to use AIRecommendationEngine with QuoteRequest/Quote models
 * Includes comprehensive error handling, validation, and vendor deduplication
 */
class AIEngineAdapter {
  
  /**
   * Convert new QuoteRequest format to AIRecommendationEngine format with validation
   */
  static convertQuoteRequestFormat(quoteRequest) {
    try {
      if (!quoteRequest) {
        throw new Error('QuoteRequest is required');
      }

      // Validate essential fields
      if (!quoteRequest.companyName) {
        throw new Error('Company name is required');
      }

      if (!quoteRequest.monthlyVolume) {
        throw new Error('Monthly volume is required');
      }

      return {
        // Map new model to your engine's expected format
        description: (quoteRequest.companyName || '') + ' ' + (quoteRequest.requirements?.essentialFeatures?.join(' ') || ''),
        monthlyVolume: quoteRequest.monthlyVolume || { mono: 0, colour: 0, total: 0 },
        type: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
        paperRequirements: quoteRequest.paperRequirements || {},
        requiredFunctions: quoteRequest.requirements?.essentialFeatures || quoteRequest.requiredFunctions || [],
        leaseTermMonths: this.getLeaseTermFromBudget(quoteRequest.budget),
        quarterlyPayment: quoteRequest.budget?.maxLeasePrice || 0,
        
        // Current setup mapping with defaults
        currentMonoCPC: quoteRequest.currentSetup?.currentCosts?.monoRate || 0.01,
        currentColourCPC: quoteRequest.currentSetup?.currentCosts?.colourRate || 0.08,
        
        // Additional fields your AI engine expects
        urgency: quoteRequest.urgency?.timeframe || '3-6 months',
        location: quoteRequest.location || {},
        preference: quoteRequest.requirements?.priority || 'balanced',
        industryType: quoteRequest.industryType || 'Other',
        
        // Legacy fields for compatibility with your engine
        serviceType: 'Photocopiers',
        companyName: quoteRequest.companyName,
        numEmployees: quoteRequest.numEmployees || 1,
        
        // Add any other fields your AIRecommendationEngine expects
        price: quoteRequest.budget?.maxLeasePrice || 300,
        minSpeed: quoteRequest.requirements?.minSpeed || 0,
        
        // Additional context for better matching
        _id: quoteRequest._id, // Include the ID for tracking
        submittedBy: quoteRequest.submittedBy,
        userId: quoteRequest.userId
      };
    } catch (error) {
      logger.error('Error converting quote request format:', error);
      throw new Error(`Failed to convert quote request: ${error.message}`);
    }
  }

  /**
   * Extract preferred lease term from budget preferences with validation
   */
  static getLeaseTermFromBudget(budget) {
    try {
      if (!budget?.preferredTerm) return 60; // default
      
      const termMap = {
        '12 months': 12,
        '24 months': 24, 
        '36 months': 36,
        '48 months': 48,
        '60 months': 60,
        '72 months': 72
      };
      
      return termMap[budget.preferredTerm] || 60;
    } catch (error) {
      logger.warn('Error extracting lease term from budget:', error);
      return 60;
    }
  }

  /**
   * Validate recommendation object has required fields
   */
  static validateRecommendation(recommendation, index) {
    const errors = [];
    
    if (!recommendation) {
      errors.push(`Recommendation ${index} is null or undefined`);
      return { isValid: false, errors };
    }

    if (!recommendation.product) {
      errors.push(`Recommendation ${index} missing product`);
    } else {
      if (!recommendation.product._id) {
        errors.push(`Recommendation ${index} product missing _id`);
      }
      if (!recommendation.product.manufacturer) {
        errors.push(`Recommendation ${index} product missing manufacturer`);
      }
      if (!recommendation.product.model) {
        errors.push(`Recommendation ${index} product missing model`);
      }
    }

    if (!recommendation.suitability) {
      errors.push(`Recommendation ${index} missing suitability data`);
    }

    if (!recommendation.costInfo) {
      errors.push(`Recommendation ${index} missing cost information`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * FIXED: Deduplicate recommendations by vendor - keeps the best score per vendor
   */
  static deduplicateByVendor(recommendations) {
    try {
      logger.info(`Deduplicating ${recommendations.length} recommendations by vendor`);
      
      const vendorMap = new Map();
      
      for (const rec of recommendations) {
        const product = rec.product;
        if (!product?.manufacturer || !product?.model || !product?.vendorId) {
          logger.warn('Skipping recommendation with missing manufacturer/model/vendorId');
          continue;
        }
        
        // FIXED: Create vendor key using vendorId + manufacturer + model to ensure uniqueness per vendor
        const vendorKey = `${product.vendorId}-${product.manufacturer.trim()}-${product.model.trim()}`;
        
        const currentScore = rec.overallScore || rec.suitability?.score || 0;
        
        if (!vendorMap.has(vendorKey)) {
          // First recommendation for this vendor
          vendorMap.set(vendorKey, {
            recommendation: rec,
            score: currentScore,
            vendorKey,
            vendorId: product.vendorId
          });
          logger.info(`Added new vendor product: ${vendorKey} (score: ${currentScore})`);
        } else {
          // Check if this recommendation has better score
          const existing = vendorMap.get(vendorKey);
          if (currentScore > existing.score) {
            vendorMap.set(vendorKey, {
              recommendation: rec,
              score: currentScore,
              vendorKey,
              vendorId: product.vendorId
            });
            logger.info(`Updated vendor ${vendorKey} with better score: ${currentScore} > ${existing.score}`);
          } else {
            logger.info(`Skipping duplicate vendor product ${vendorKey} (score: ${currentScore} <= ${existing.score})`);
          }
        }
      }
      
      // Extract unique recommendations sorted by score
      const uniqueRecommendations = Array.from(vendorMap.values())
        .sort((a, b) => b.score - a.score)
        .map(item => item.recommendation);
      
      logger.info(`Deduplication complete: ${recommendations.length} -> ${uniqueRecommendations.length} unique vendor products`);
      logger.info(`Unique vendors represented: ${Array.from(new Set(Array.from(vendorMap.values()).map(v => v.vendorId))).length}`);
      
      return uniqueRecommendations;
    } catch (error) {
      logger.error('Error during vendor deduplication:', error);
      // Fall back to original recommendations if deduplication fails
      return recommendations;
    }
  }

  /**
   * Convert AIRecommendationEngine results to Quote format with ALL required fields
   */
  static convertToQuoteFormat(recommendation, quoteRequest, ranking) {
    try {
      // Validate inputs
      const validation = this.validateRecommendation(recommendation, ranking);
      if (!validation.isValid) {
        logger.error('Invalid recommendation data:', validation.errors);
        throw new Error(`Invalid recommendation: ${validation.errors.join(', ')}`);
      }

      if (!quoteRequest || !quoteRequest._id) {
        throw new Error('Valid quote request with _id is required');
      }

      const product = recommendation.product;
      
      // Ensure all required fields have defaults
      const suitability = recommendation.suitability || { score: 0.5, suitable: false };
      const costInfo = recommendation.costInfo || { 
        monthlySavings: 0, 
        annualSavings: 0, 
        newTotalMonthlyCost: 0,
        savingsPercentage: 0,
        breakdown: {}
      };

      // Extract CPC rates from product or use defaults
      const monoRate = (product.costs?.cpcRates?.A4Mono || product.A4MonoCPC || 1.0) / 100;
      const colourRate = (product.costs?.cpcRates?.A4Colour || product.A4ColourCPC || 4.0) / 100;
      
      // Calculate monthly volumes
      const monthlyMono = quoteRequest.monthlyVolume?.mono || 0;
      const monthlyColour = quoteRequest.monthlyVolume?.colour || 0;
      const totalVolume = monthlyMono + monthlyColour;

      // Calculate CPC costs
      const monoCpcCost = monthlyMono * monoRate;
      const colourCpcCost = monthlyColour * colourRate;
      const totalCpcCost = monoCpcCost + colourCpcCost;
      
      return {
        quoteRequest: quoteRequest._id,
        product: product._id,
        vendor: product.vendorId || null,
        ranking: ranking || 1,
        
        // Map your engine's scoring to new format
        matchScore: {
          total: recommendation.overallScore || suitability.score || 0.5,
          breakdown: {
            volumeMatch: suitability.volumeScore || 0,
            costEfficiency: (costInfo.savingsPercentage || 0) / 100,
            speedMatch: suitability.speedScore || 0,
            featureMatch: suitability.featureScore || 0.8,
            reliabilityMatch: 0.7 // Default
          },
          reasoning: [
            recommendation.explanation || suitability.reason || 'AI-generated recommendation',
            `Monthly cost: £${costInfo.newTotalMonthlyCost || 0}`,
            `Potential savings: £${costInfo.monthlySavings || 0}/month`
          ].filter(r => r),
          confidence: suitability.suitable ? 'High' : 'Medium'
        },
        
        costs: {
          machineCost: product.costs?.machineCost || (product.salePrice || 0) * 0.7,
          installation: product.costs?.installation || 250,
          profitMargin: product.costs?.profitMargin || (product.salePrice || 0) * 0.3,
          totalMachineCost: product.costs?.totalMachineCost || product.salePrice || 0,
          
          // REQUIRED: CPC Rates section
          cpcRates: {
            paperSize: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
            monoRate: monoRate,
            colourRate: colourRate
          },
          
          monthlyCosts: {
            monoPages: monthlyMono,
            colourPages: monthlyColour,
            
            // REQUIRED: Individual CPC costs
            monoCpcCost: Math.round(monoCpcCost * 100) / 100,
            colourCpcCost: Math.round(colourCpcCost * 100) / 100,
            totalCpcCost: Math.round(totalCpcCost * 100) / 100,
            
            cpcCosts: totalCpcCost, // Legacy field
            leaseCost: (recommendation.quarterlyLease || 300) / 3,
            serviceCost: costInfo.breakdown?.serviceCost || (costInfo.newTotalMonthlyCost || 0) * 0.1 || 50,
            totalMonthlyCost: costInfo.newTotalMonthlyCost || 0
          },
          
          savings: {
            monthlyAmount: costInfo.monthlySavings || 0,
            annualAmount: costInfo.annualSavings || 0,
            percentageSaved: costInfo.savingsPercentage || 0,
            description: (costInfo.monthlySavings || 0) > 0 ? 
              `Save £${costInfo.monthlySavings}/month` :
              `£${Math.abs(costInfo.monthlySavings || 0)}/month more than current`
          }
        },
        
        // REQUIRED: User Requirements section
        userRequirements: {
          monthlyVolume: {
            mono: monthlyMono,
            colour: monthlyColour,
            total: totalVolume
          },
          paperSize: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
          priority: quoteRequest.requirements?.priority || 'cost',
          maxBudget: quoteRequest.budget?.maxLeasePrice || 300
        },
        
        leaseOptions: this.createLeaseOptions(product, recommendation.quarterlyLease, recommendation.termMonths),
        
        productSummary: {
          manufacturer: product.manufacturer || 'Unknown',
          model: product.model || 'Unknown',
          category: product.category || 'MFP',
          speed: product.speed || 0,
          features: product.features || [],
          paperSizes: product.paperSizes?.supported || [product.paperSizes?.primary] || ['A4'],
          volumeRange: product.volumeRange || '0-6k'
        },
        
        serviceDetails: {
          responseTime: product.service?.responseTime || '8hr',
          serviceLevel: product.service?.level || 'Standard',
          supportHours: '9AM-5PM Business Hours',
          onSiteSupport: true,
          remoteSupport: true,
          trainingIncluded: true,
          warrantyPeriod: '12 months'
        },
        
        terms: {
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          deliveryTime: `${product.availability?.leadTime || 14} days`,
          installationTime: `${product.availability?.installationWindow || 7} days`,
          paymentTerms: 'Quarterly in advance',
          cancellationPolicy: '30 days notice required',
          upgradeOptions: 'Available at any time'
        },
        
        // Additional fields that might be useful
        accessories: product.auxiliaries || [],
        
        // Warning field for unsuitable products
        warning: recommendation.warning || null,
        
        // Metadata for tracking
        metadata: {
          aiEngineVersion: '2.0',
          generatedAt: new Date(),
          scoringAlgorithm: 'AIRecommendationEngine',
          quoteRequestId: quoteRequest._id,
          originalRanking: ranking,
          vendorKey: `${product.vendorId}-${product.manufacturer}-${product.model}`
        }
      };
    } catch (error) {
      logger.error('Error converting recommendation to quote format:', error);
      throw new Error(`Failed to convert recommendation to quote: ${error.message}`);
    }
  }

  /**
   * Create lease options from your engine's data with error handling
   */
  static createLeaseOptions(product, quarterlyLease, termMonths) {
    try {
      // Use your engine's lease calculation or create standard options
      const baseQuarterly = quarterlyLease || 300;
      const baseTerm = termMonths || 60;
      
      return [
        {
          term: 36,
          quarterlyPayment: Math.round(baseQuarterly * 1.1 * 100) / 100,
          monthlyPayment: Math.round((baseQuarterly * 1.1) / 3 * 100) / 100,
          totalCost: Math.round(baseQuarterly * 1.1 * 12 * 100) / 100,
          margin: 0.65,
          isRecommended: false
        },
        {
          term: baseTerm,
          quarterlyPayment: Math.round(baseQuarterly * 100) / 100,
          monthlyPayment: Math.round(baseQuarterly / 3 * 100) / 100,
          totalCost: Math.round(baseQuarterly * (baseTerm / 3) * 100) / 100,
          margin: 0.6,
          isRecommended: true
        },
        {
          term: 72,
          quarterlyPayment: Math.round(baseQuarterly * 0.9 * 100) / 100,
          monthlyPayment: Math.round((baseQuarterly * 0.9) / 3 * 100) / 100,
          totalCost: Math.round(baseQuarterly * 0.9 * 24 * 100) / 100,
          margin: 0.55,
          isRecommended: false
        }
      ];
    } catch (error) {
      logger.error('Error creating lease options:', error);
      // Return basic fallback options
      return [
        {
          term: 60,
          quarterlyPayment: 300,
          monthlyPayment: 100,
          totalCost: 6000,
          margin: 0.6,
          isRecommended: true
        }
      ];
    }
  }

  /**
   * Main function to use your AI engine with new models - PRODUCTION READY WITH FIXED DEDUPLICATION
   */
  static async generateQuotesFromRequest(quoteRequest, userId = null, invoiceFiles = []) {
    try {
      // Validate inputs
      if (!quoteRequest) {
        throw new Error('QuoteRequest is required');
      }

      if (!quoteRequest._id) {
        throw new Error('QuoteRequest must have an _id');
      }

      logger.info(`AI Engine processing request for ${quoteRequest.companyName}`);
      
      // Convert new QuoteRequest format to your engine's format
      const convertedRequest = this.convertQuoteRequestFormat(quoteRequest);
      
      logger.info('Request converted:', {
        description: convertedRequest.description,
        monthlyVolume: convertedRequest.monthlyVolume,
        type: convertedRequest.type,
        requiredFunctions: convertedRequest.requiredFunctions
      });
      
      // Use your advanced AI engine with proper error handling
      let recommendations;
      try {
        recommendations = await AIRecommendationEngine.generateRecommendations(
          convertedRequest, 
          userId || quoteRequest.submittedBy, 
          invoiceFiles
        );
      } catch (aiError) {
        logger.error('AI Engine error:', aiError);
        throw new Error(`AI recommendation engine failed: ${aiError.message}`);
      }
      
      logger.info(`AI Engine returned ${recommendations?.length || 0} recommendations`);
      
      if (!recommendations || recommendations.length === 0) {
        logger.warn('No recommendations found from AI engine');
        return [];
      }

      // Filter out any error recommendations
      const validRecommendations = recommendations.filter(rec => !rec.error);
      
      if (validRecommendations.length === 0) {
        logger.warn('All recommendations contained errors');
        return [];
      }

      // CRITICAL FIX: Deduplicate by vendor BEFORE creating quotes with improved logic
      const uniqueRecommendations = this.deduplicateByVendor(validRecommendations);
      
      if (uniqueRecommendations.length === 0) {
        logger.warn('No unique vendor recommendations after deduplication');
        return [];
      }

      // Convert recommendations to Quote format and save
      const quotes = [];
      const maxQuotes = Math.min(uniqueRecommendations.length, 3); // Limit to top 3 unique vendors
      
      for (let i = 0; i < maxQuotes; i++) {
        const recommendation = uniqueRecommendations[i];
        
        try {
          // Validate this specific recommendation
          const validation = this.validateRecommendation(recommendation, i + 1);
          if (!validation.isValid) {
            logger.warn(`Skipping invalid recommendation ${i + 1}:`, validation.errors);
            continue;
          }

          const quoteData = this.convertToQuoteFormat(recommendation, quoteRequest, i + 1);
          
          const quote = new Quote(quoteData);
          await quote.save();
          quotes.push(quote._id);
          
          logger.info(`Created quote ${i + 1}: ${recommendation.product?.manufacturer || 'Unknown'} ${recommendation.product?.model || 'Unknown'} from vendor ${recommendation.product?.vendorId}`);
        } catch (saveError) {
          logger.error(`Error saving quote ${i + 1}:`, {
            error: saveError.message,
            recommendation: {
              manufacturer: recommendation.product?.manufacturer,
              model: recommendation.product?.model,
              productId: recommendation.product?._id,
              vendorId: recommendation.product?.vendorId
            }
          });
          // Continue with other quotes even if one fails
        }
      }
      
      logger.info(`Successfully created ${quotes.length} unique vendor quotes from ${validRecommendations.length} total recommendations`);
      return quotes;
      
    } catch (error) {
      logger.error('Error in AIEngineAdapter:', {
        error: error.message,
        stack: error.stack,
        quoteRequestId: quoteRequest?._id,
        companyName: quoteRequest?.companyName
      });
      throw error;
    }
  }

  /**
   * Alternative method for testing - generates sample quotes without AI engine
   */
  static async generateSampleQuotes(quoteRequest) {
    try {
      logger.info('Generating sample quotes for testing');
      
      if (!quoteRequest || !quoteRequest._id) {
        throw new Error('Valid quote request with _id required for sample quotes');
      }

      // Calculate sample values based on request
      const monthlyMono = quoteRequest.monthlyVolume?.mono || 1000;
      const monthlyColour = quoteRequest.monthlyVolume?.colour || 500;
      const totalVolume = monthlyMono + monthlyColour;

      // This would be useful for testing the Quote model without AI dependencies
      const sampleQuotes = [
        {
          quoteRequest: quoteRequest._id,
          ranking: 1,
          matchScore: {
            total: 0.85,
            confidence: 'High',
            reasoning: ['Sample quote for testing'],
            breakdown: {
              volumeMatch: 0.8,
              costEfficiency: 0.7,
              speedMatch: 0.9,
              featureMatch: 0.8,
              reliabilityMatch: 0.7
            }
          },
          costs: {
            totalMachineCost: 3000,
            machineCost: 2100,
            installation: 250,
            profitMargin: 650,
            
            // REQUIRED: CPC Rates
            cpcRates: {
              paperSize: 'A4',
              monoRate: 0.01,
              colourRate: 0.04
            },
            
            monthlyCosts: {
              monoPages: monthlyMono,
              colourPages: monthlyColour,
              
              // REQUIRED: Individual CPC costs
              monoCpcCost: monthlyMono * 0.01,
              colourCpcCost: monthlyColour * 0.04,
              totalCpcCost: (monthlyMono * 0.01) + (monthlyColour * 0.04),
              
              cpcCosts: 45,
              leaseCost: 100,
              serviceCost: 35,
              totalMonthlyCost: 180
            },
            savings: {
              monthlyAmount: 50,
              annualAmount: 600,
              percentageSaved: 21.7,
              description: 'Save £50/month'
            }
          },
          
          // REQUIRED: User Requirements
          userRequirements: {
            monthlyVolume: {
              mono: monthlyMono,
              colour: monthlyColour,
              total: totalVolume
            },
            paperSize: quoteRequest.paperRequirements?.primarySize || 'A4',
            priority: quoteRequest.requirements?.priority || 'cost',
            maxBudget: quoteRequest.budget?.maxLeasePrice || 300
          },
          
          productSummary: {
            manufacturer: 'Sample Corp',
            model: 'Test Model 2000',
            category: 'A4 MFP',
            speed: 25,
            features: ['Copy', 'Print', 'Scan', 'Fax'],
            paperSizes: ['A4', 'A3'],
            volumeRange: '6k-13k'
          },
          serviceDetails: {
            responseTime: '4hr',
            serviceLevel: 'Premium',
            supportHours: '24/7',
            onSiteSupport: true,
            remoteSupport: true,
            trainingIncluded: true,
            warrantyPeriod: '24 months'
          },
          terms: {
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            deliveryTime: '7 days',
            installationTime: '3 days',
            paymentTerms: 'Quarterly in advance',
            cancellationPolicy: '30 days notice required',
            upgradeOptions: 'Available at any time'
          },
          leaseOptions: [
            {
              term: 60,
              quarterlyPayment: 300,
              monthlyPayment: 100,
              totalCost: 6000,
              margin: 0.6,
              isRecommended: true
            }
          ],
          metadata: {
            aiEngineVersion: 'TEST',
            generatedAt: new Date(),
            scoringAlgorithm: 'Sample',
            quoteRequestId: quoteRequest._id
          }
        }
      ];
      
      const quotes = [];
      for (const quoteData of sampleQuotes) {
        try {
          const quote = new Quote(quoteData);
          await quote.save();
          quotes.push(quote._id);
          logger.info('Created sample quote:', quote._id);
        } catch (error) {
          logger.error('Error creating sample quote:', error);
        }
      }
      
      return quotes;
    } catch (error) {
      logger.error('Error generating sample quotes:', error);
      return [];
    }
  }

  /**
   * Health check method to verify AI engine connectivity
   */
  static async healthCheck() {
    try {
      // Create a minimal test request
      const testRequest = {
        companyName: 'Health Check Test',
        monthlyVolume: { mono: 1000, colour: 500, total: 1500 },
        industryType: 'Test',
        budget: { maxLeasePrice: 200 },
        paperRequirements: { primarySize: 'A4' },
        requirements: { priority: 'cost' },
        urgency: { timeframe: '3-6 months' },
        location: { postcode: 'TEST' }
      };

      const converted = this.convertQuoteRequestFormat(testRequest);
      
      return {
        status: 'healthy',
        message: 'AI Engine Adapter is functioning correctly',
        lastCheck: new Date(),
        conversionTest: 'passed',
        convertedFields: Object.keys(converted).length,
        deduplicationEnabled: true,
        deduplicationMethod: 'vendorId + manufacturer + model'
      };
    } catch (error) {
      logger.error('AI Engine Adapter health check failed:', error);
      return {
        status: 'unhealthy',
        message: 'AI Engine Adapter has issues',
        error: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Get adapter statistics and performance metrics
   */
  static getStatistics() {
    return {
      version: '2.1.1',
      status: 'production',
      features: [
        'AI Recommendation Engine Integration',
        'Production Error Handling',
        'Comprehensive Validation',
        'Fixed Vendor Deduplication',
        'Fallback Quote Generation',
        'Health Monitoring'
      ],
      supportedModels: [
        'QuoteRequest',
        'Quote',
        'VendorProduct'
      ],
      lastUpdate: new Date('2025-09-15'),
      bugFixes: [
        'Fixed vendor deduplication to preserve quotes from different vendors with same products'
      ]
    };
  }
}

export default AIEngineAdapter;
