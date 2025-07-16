// services/aiEngineAdapter.js - Bridge between your AIRecommendationEngine and new models
import AIRecommendationEngine from './aiRecommendationEngine.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';

/**
 * Adapter to use your advanced AIRecommendationEngine with the new QuoteRequest/Quote models
 */
class AIEngineAdapter {
  
  /**
   * Convert new QuoteRequest format to your AIRecommendationEngine format
   */
  static convertQuoteRequestFormat(quoteRequest) {
    return {
      // Map new model to your engine's expected format
      description: quoteRequest.companyName + ' ' + (quoteRequest.requirements?.essentialFeatures?.join(' ') || ''),
      monthlyVolume: quoteRequest.monthlyVolume,
      type: quoteRequest.paperRequirements?.primarySize || 'A4',
      paperRequirements: quoteRequest.paperRequirements,
      requiredFunctions: quoteRequest.requirements?.essentialFeatures || [],
      leaseTermMonths: this.getLeaseTermFromBudget(quoteRequest.budget),
      quarterlyPayment: quoteRequest.budget?.maxLeasePrice || 0,
      
      // Current setup mapping
      currentMonoCPC: quoteRequest.currentSetup?.currentCosts?.monoRate || 0.01,
      currentColourCPC: quoteRequest.currentSetup?.currentCosts?.colourRate || 0.08,
      
      // Additional fields your AI engine expects
      urgency: quoteRequest.urgency?.timeframe,
      location: quoteRequest.location,
      preference: quoteRequest.requirements?.priority || 'balanced',
      industryType: quoteRequest.industryType,
      
      // Legacy fields for compatibility with your engine
      serviceType: 'Photocopiers',
      companyName: quoteRequest.companyName,
      numEmployees: quoteRequest.numEmployees,
      
      // Add any other fields your AIRecommendationEngine expects
      price: quoteRequest.budget?.maxLeasePrice,
      minSpeed: quoteRequest.requirements?.minSpeed
    };
  }

  /**
   * Extract preferred lease term from budget preferences
   */
  static getLeaseTermFromBudget(budget) {
    if (!budget?.preferredTerm) return 60; // default
    
    const termMap = {
      '12 months': 12,
      '24 months': 24, 
      '36 months': 36,
      '48 months': 48,
      '60 months': 60
    };
    
    return termMap[budget.preferredTerm] || 60;
  }

  /**
   * Convert AIRecommendationEngine results to Quote format
   */
  static convertToQuoteFormat(recommendation, quoteRequest, ranking) {
    const product = recommendation.product;
    
    return {
      quoteRequest: quoteRequest._id,
      product: product._id,
      vendor: product.vendorId,
      ranking,
      
      // Map your engine's scoring to new format
      matchScore: {
        total: recommendation.overallScore || recommendation.suitability?.score || 0.5,
        breakdown: {
          volumeMatch: recommendation.suitability?.volumeScore || 0,
          costEfficiency: recommendation.costInfo?.savingsPercentage / 100 || 0,
          speedMatch: recommendation.suitability?.speedScore || 0,
          featureMatch: 0.8, // Default since your engine handles features
          reliabilityMatch: 0.7 // Default
        },
        reasoning: [
          recommendation.explanation || recommendation.suitability?.reason || '',
          `Monthly cost: £${recommendation.costInfo?.newTotalMonthlyCost || 0}`,
          `Potential savings: £${recommendation.costInfo?.monthlySavings || 0}/month`
        ].filter(r => r),
        confidence: recommendation.suitability?.suitable ? 'High' : 'Medium'
      },
      
      costs: {
        machineCost: product.costs?.machineCost || product.salePrice * 0.7 || 0,
        installation: product.costs?.installation || 250,
        profitMargin: product.costs?.profitMargin || product.salePrice * 0.3 || 0,
        totalMachineCost: product.costs?.totalMachineCost || product.salePrice || 0,
        
        monthlyCosts: {
          monoPages: quoteRequest.monthlyVolume?.mono || 0,
          colourPages: quoteRequest.monthlyVolume?.colour || 0,
          cpcCosts: recommendation.costInfo?.breakdown?.newCPC || recommendation.costInfo?.newTotalMonthlyCost * 0.4 || 0,
          leaseCost: recommendation.quarterlyLease / 3 || 0,
          serviceCost: recommendation.costInfo?.breakdown?.serviceCost || recommendation.costInfo?.newTotalMonthlyCost * 0.1 || 50,
          totalMonthlyCost: recommendation.costInfo?.newTotalMonthlyCost || 0
        },
        
        savings: {
          monthlyAmount: recommendation.costInfo?.monthlySavings || 0,
          annualAmount: recommendation.costInfo?.annualSavings || 0,
          percentageSaved: recommendation.costInfo?.savingsPercentage || 0,
          description: recommendation.costInfo?.monthlySavings > 0 ? 
            `Save £${recommendation.costInfo.monthlySavings}/month` :
            `£${Math.abs(recommendation.costInfo?.monthlySavings || 0)}/month more than current`
        }
      },
      
      leaseOptions: this.createLeaseOptions(product, recommendation.quarterlyLease, recommendation.termMonths),
      
      productSummary: {
        manufacturer: product.manufacturer,
        model: product.model,
        category: product.category,
        speed: product.speed,
        features: product.features || [],
        paperSizes: product.paperSizes?.supported || [product.paperSizes?.primary],
        volumeRange: product.volumeRange
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
      warning: recommendation.warning || null
    };
  }

  /**
   * Create lease options from your engine's data
   */
  static createLeaseOptions(product, quarterlyLease, termMonths) {
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
  }

  /**
   * Main function to use your AI engine with new models
   */
  static async generateQuotesFromRequest(quoteRequest, userId = null, invoiceFiles = []) {
    try {
      console.log(`🤖 Using advanced AIRecommendationEngine for ${quoteRequest.companyName}`);
      
      // Convert new QuoteRequest format to your engine's format
      const convertedRequest = this.convertQuoteRequestFormat(quoteRequest);
      
      console.log('🔄 Converted request format:', {
        description: convertedRequest.description,
        monthlyVolume: convertedRequest.monthlyVolume,
        type: convertedRequest.type,
        requiredFunctions: convertedRequest.requiredFunctions
      });
      
      // Use your advanced AI engine
      const recommendations = await AIRecommendationEngine.generateRecommendations(
        convertedRequest, 
        userId || quoteRequest.submittedBy, 
        invoiceFiles
      );
      
      console.log(`📊 AI Engine returned ${recommendations.length} recommendations`);
      
      if (recommendations.length === 0) {
        console.log('⚠️ No recommendations found from AI engine');
        return [];
      }

      // Convert recommendations to Quote format and save
      const quotes = [];
      for (let i = 0; i < Math.min(recommendations.length, 3); i++) {
        const recommendation = recommendations[i];
        const quoteData = this.convertToQuoteFormat(recommendation, quoteRequest, i + 1);
        
        try {
          const quote = new Quote(quoteData);
          await quote.save();
          quotes.push(quote._id);
          
          console.log(`✅ Created quote ${i + 1}: ${recommendation.product?.manufacturer} ${recommendation.product?.model}`);
        } catch (saveError) {
          console.error(`❌ Error saving quote ${i + 1}:`, saveError.message);
          // Continue with other quotes even if one fails
        }
      }
      
      console.log(`📋 Successfully created ${quotes.length} quotes`);
      return quotes;
      
    } catch (error) {
      console.error('❌ Error in AIEngineAdapter:', error);
      throw error;
    }
  }

  /**
   * Helper method to validate that the recommendation has required fields
   */
  static validateRecommendation(recommendation) {
    if (!recommendation.product) {
      console.warn('⚠️ Recommendation missing product');
      return false;
    }
    
    if (!recommendation.product.manufacturer || !recommendation.product.model) {
      console.warn('⚠️ Product missing manufacturer or model');
      return false;
    }
    
    return true;
  }

  /**
   * Alternative method for testing - generates sample quotes without AI engine
   */
  static async generateSampleQuotes(quoteRequest) {
    console.log('🧪 Generating sample quotes for testing');
    
    // This would be useful for testing the Quote model without AI dependencies
    const sampleQuotes = [
      {
        quoteRequest: quoteRequest._id,
        ranking: 1,
        matchScore: {
          total: 0.85,
          confidence: 'High',
          reasoning: ['Sample quote for testing']
        },
        costs: {
          totalMachineCost: 3000,
          monthlyCosts: {
            totalMonthlyCost: 250
          }
        },
        productSummary: {
          manufacturer: 'Sample',
          model: 'Test Model',
          category: 'A4 MFP'
        }
      }
    ];
    
    const quotes = [];
    for (const quoteData of sampleQuotes) {
      try {
        const quote = new Quote(quoteData);
        await quote.save();
        quotes.push(quote._id);
      } catch (error) {
        console.error('Error creating sample quote:', error);
      }
    }
    
    return quotes;
  }
}

export default AIEngineAdapter;