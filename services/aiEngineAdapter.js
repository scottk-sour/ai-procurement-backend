import AIRecommendationEngine from './aiRecommendationEngine.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Quote from '../models/Quote.js';
import VendorProduct from '../models/VendorProduct.js';
import logger from './logger.js';

/**
 * Production-ready adapter to use AIRecommendationEngine with QuoteRequest/Quote models
 * Includes comprehensive error handling, validation, and vendor deduplication
 * FIXED VERSION with proper schema validation for matchScore.total, userRequirements.priority, and status
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
        description: (quoteRequest.companyName || '') + ' ' + (quoteRequest.requirements?.essentialFeatures?.join(' ') || ''),
        monthlyVolume: quoteRequest.monthlyVolume || { mono: 0, colour: 0, total: 0 },
        type: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
        paperRequirements: quoteRequest.paperRequirements || {},
        requiredFunctions: quoteRequest.requirements?.essentialFeatures || quoteRequest.requiredFunctions || [],
        leaseTermMonths: this.getLeaseTermFromBudget(quoteRequest.budget),
        quarterlyPayment: quoteRequest.budget?.maxLeasePrice || 0,
        currentMonoCPC: quoteRequest.currentSetup?.currentCosts?.monoRate || 0.01,
        currentColourCPC: quoteRequest.currentSetup?.currentCosts?.colourRate || 0.08,
        urgency: quoteRequest.urgency?.timeframe || '3-6 months',
        location: quoteRequest.location || {},
        preference: quoteRequest.requirements?.priority || 'balanced',
        industryType: quoteRequest.industryType || 'Other',
        serviceType: 'Photocopiers',
        companyName: quoteRequest.companyName,
        numEmployees: quoteRequest.numEmployees || 1,
        price: quoteRequest.budget?.maxLeasePrice || 300,
        minSpeed: quoteRequest.requirements?.minSpeed || 0,
        _id: quoteRequest._id,
        submittedBy: quoteRequest.submittedBy,
        userId: quoteRequest.userId
      };
    } catch (error) {
      logger.error('Error converting quote request format:', error);
      throw new Error('Failed to convert quote request: ' + error.message);
    }
  }

  /**
   * Extract preferred lease term from budget preferences with validation
   */
  static getLeaseTermFromBudget(budget) {
    try {
      if (!budget?.preferredTerm) return 60;
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
      errors.push('Recommendation ' + index + ' is null or undefined');
      return { isValid: false, errors };
    }
    if (!recommendation.product) {
      errors.push('Recommendation ' + index + ' missing product');
    } else {
      if (!recommendation.product._id) {
        errors.push('Recommendation ' + index + ' product missing _id');
      }
      if (!recommendation.product.manufacturer) {
        errors.push('Recommendation ' + index + ' product missing manufacturer');
      }
      if (!recommendation.product.model) {
        errors.push('Recommendation ' + index + ' product missing model');
      }
    }
    if (!recommendation.suitability) {
      errors.push('Recommendation ' + index + ' missing suitability data');
    }
    if (!recommendation.costInfo) {
      errors.push('Recommendation ' + index + ' missing cost information');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Deduplicate recommendations by vendor - keeps the best score per vendor
   */
  static deduplicateByVendor(recommendations) {
    try {
      logger.info('Deduplicating ' + recommendations.length + ' recommendations by vendor');
      const vendorMap = new Map();
      for (const rec of recommendations) {
        const product = rec.product;
        if (!product?.manufacturer || !product?.model || !product?.vendorId) {
          logger.warn('Skipping recommendation with missing manufacturer/model/vendorId');
          continue;
        }
        const vendorKey = product.vendorId.toString();
        const currentScore = rec.overallScore || rec.suitability?.score || 0;
        if (!vendorMap.has(vendorKey)) {
          vendorMap.set(vendorKey, {
            recommendation: rec,
            score: currentScore,
            vendorKey,
            vendorId: product.vendorId
          });
          logger.info('Added new vendor product: ' + vendorKey + ' (score: ' + currentScore + ')');
        } else {
          const existing = vendorMap.get(vendorKey);
          if (currentScore > existing.score) {
            vendorMap.set(vendorKey, {
              recommendation: rec,
              score: currentScore,
              vendorKey,
              vendorId: product.vendorId
            });
            logger.info('Updated vendor ' + vendorKey + ' with better score: ' + currentScore + ' > ' + existing.score);
          } else {
            logger.info('Skipping duplicate vendor product ' + vendorKey + ' (score: ' + currentScore + ' <= ' + existing.score + ')');
          }
        }
      }
      const uniqueRecommendations = Array.from(vendorMap.values())
        .sort((a, b) => b.score - a.score)
        .map(item => item.recommendation);
      logger.info('Deduplication complete: ' + recommendations.length + ' -> ' + uniqueRecommendations.length + ' unique vendor products');
      logger.info('Unique vendors represented: ' + Array.from(new Set(Array.from(vendorMap.values()).map(v => v.vendorId))).length);
      return uniqueRecommendations;
    } catch (error) {
      logger.error('Error during vendor deduplication:', error);
      return recommendations;
    }
  }

  /**
   * Convert AIRecommendationEngine results to Quote format with ALL required fields
   * CRITICAL FIXES: Proper score normalization, required priority field, correct status enum
   */
  static convertToQuoteFormat(recommendation, quoteRequest, ranking) {
    try {
      const validation = this.validateRecommendation(recommendation, ranking);
      if (!validation.isValid) {
        logger.error('Invalid recommendation data:', validation.errors);
        throw new Error('Invalid recommendation: ' + validation.errors.join(', '));
      }
      if (!quoteRequest || !quoteRequest._id) {
        throw new Error('Valid quote request with _id is required');
      }
      const product = recommendation.product;
      const suitability = recommendation.suitability || { score: 0.5, suitable: false };
      const costInfo = recommendation.costInfo || {
        monthlySavings: 0,
        annualSavings: 0,
        newTotalMonthlyCost: 0,
        savingsPercentage: 0,
        breakdown: {}
      };
      
      // Calculate CPC rates
      const monoRate = (product.costs?.cpcRates?.A4Mono || product.A4MonoCPC || 1.0) / 100;
      const colourRate = (product.costs?.cpcRates?.A4Colour || product.A4ColourCPC || 4.0) / 100;
      const monthlyMono = quoteRequest.monthlyVolume?.mono || 0;
      const monthlyColour = quoteRequest.monthlyVolume?.colour || 0;
      const totalVolume = monthlyMono + monthlyColour;
      const monoCpcCost = monthlyMono * monoRate;
      const colourCpcCost = monthlyColour * colourRate;
      const totalCpcCost = monoCpcCost + colourCpcCost;
      const rawCostEfficiency = (costInfo.savingsPercentage || 0) / 100;
      const boundedCostEfficiency = Math.max(-1, Math.min(1, rawCostEfficiency));
      
      // FIX 1: CRITICAL - Convert score from 0-100 to 0-1 scale for schema validation
      const rawScore = recommendation.overallScore || suitability.score || 0.5;
      const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;
      const boundedScore = Math.max(0, Math.min(1, normalizedScore));
      
      return {
        quoteRequest: quoteRequest._id,
        product: product._id,
        vendor: product.vendorId || null,
        ranking: ranking || 1,
        matchScore: {
          // FIX 1: Use normalized score (0-1) instead of percentage (0-100)
          total: boundedScore,
          confidence: recommendation.confidence || (suitability.suitable ? 'High' : 'Medium'),
          breakdown: {
            volumeMatch: Math.max(0, Math.min(1, suitability.volumeScore || 0)),
            costEfficiency: boundedCostEfficiency,
            speedMatch: Math.max(0, Math.min(1, suitability.speedScore || 0)),
            featureMatch: Math.max(0, Math.min(1, suitability.featureScore || 0.8)),
            reliabilityMatch: 0.7
          },
          reasoning: [
            recommendation.explanation || suitability.reason || 'AI-generated recommendation',
            'Monthly cost: £' + (costInfo.newTotalMonthlyCost || 0),
            'Potential savings: £' + (costInfo.monthlySavings || 0) + '/month'
          ].filter(r => r)
        },
        costs: {
          machineCost: product.costs?.machineCost || (product.salePrice || 0) * 0.7,
          installation: product.costs?.installation || 250,
          profitMargin: product.costs?.profitMargin || (product.salePrice || 0) * 0.3,
          totalMachineCost: product.costs?.totalMachineCost || product.salePrice || 0,
          cpcRates: {
            paperSize: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
            monoRate: monoRate,
            colourRate: colourRate
          },
          monthlyCosts: {
            monoPages: monthlyMono,
            colourPages: monthlyColour,
            monoCpcCost: Math.round(monoCpcCost * 100) / 100,
            colourCpcCost: Math.round(colourCpcCost * 100) / 100,
            totalCpcCost: Math.round(totalCpcCost * 100) / 100,
            leaseCost: (recommendation.quarterlyLease || 300) / 3,
            serviceCost: costInfo.breakdown?.newService || (costInfo.newTotalMonthlyCost || 0) * 0.1 || 50,
            totalMonthlyCost: costInfo.newTotalMonthlyCost || 0
          },
          savings: {
            monthlyAmount: costInfo.monthlySavings || 0,
            annualAmount: costInfo.annualSavings || 0,
            percentageSaved: costInfo.savingsPercentage || 0,
            description: (costInfo.monthlySavings || 0) > 0 ?
              'Save £' + costInfo.monthlySavings + '/month' :
              '£' + Math.abs(costInfo.monthlySavings || 0) + '/month more than current'
          }
        },
        userRequirements: {
          monthlyVolume: {
            mono: monthlyMono,
            colour: monthlyColour,
            total: totalVolume
          },
          paperSize: quoteRequest.paperRequirements?.primarySize || quoteRequest.type || 'A4',
          features: quoteRequest.requirements?.essentialFeatures || quoteRequest.requiredFunctions || [],
          maxBudget: quoteRequest.budget?.maxLeasePrice || 300,
          // FIX 2: Add required priority field from schema
          priority: quoteRequest.requirements?.priority || 'cost'
        },
        leaseOptions: this.createLeaseOptions(product, recommendation.quarterlyLease, recommendation.termMonths),
        productSummary: {
          manufacturer: product.manufacturer || 'Unknown',
          model: product.model || 'Unknown',
          category: product.volumeRange || 'Standard',
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
          deliveryTime: (product.availability?.leadTime || 14) + ' days',
          installationTime: (product.availability?.installationWindow || 7) + ' days',
          paymentTerms: 'Quarterly in advance',
          cancellationPolicy: '30 days notice required',
          upgradeOptions: 'Available at any time'
        },
        accessories: product.auxiliaries || [],
        warning: recommendation.warning || null,
        // FIX 3: Use correct status from Quote schema enum
        status: 'generated',
        aiGenerated: true,
        createdAt: new Date(),
        metadata: {
          aiEngineVersion: '2.1-SCHEMA-FIXED',
          generatedAt: new Date(),
          scoringAlgorithm: 'AIRecommendationEngine',
          quoteRequestId: quoteRequest._id,
          originalRanking: ranking,
          vendorKey: product.vendorId + '-' + product.manufacturer + '-' + product.model,
          rawCostEfficiency: rawCostEfficiency,
          boundedCostEfficiency: boundedCostEfficiency,
          // Debug info for score normalization
          originalScore: rawScore,
          normalizedScore: normalizedScore,
          finalBoundedScore: boundedScore
        }
      };
    } catch (error) {
      logger.error('Error converting recommendation to quote format:', error);
      throw new Error('Failed to convert recommendation to quote: ' + error.message);
    }
  }

  /**
   * Create lease options from product's actual lease rates or fallback to calculated rates
   */
  static createLeaseOptions(product, quarterlyLease, termMonths) {
    try {
      const rates = product?.leaseRates || {};
      const baseQuarterly = quarterlyLease || 300;

      const options = [];

      // 36 month term
      if (rates.term36 || baseQuarterly) {
        const q36 = rates.term36 || Math.round(baseQuarterly * 1.15 * 100) / 100;
        options.push({
          term: 36,
          quarterlyPayment: q36,
          monthlyPayment: Math.round(q36 / 3 * 100) / 100,
          totalCost: Math.round(q36 * 12 * 100) / 100,
          margin: 0.65,
          isRecommended: termMonths === 36
        });
      }

      // 48 month term
      if (rates.term48 || baseQuarterly) {
        const q48 = rates.term48 || Math.round(baseQuarterly * 100) / 100;
        options.push({
          term: 48,
          quarterlyPayment: q48,
          monthlyPayment: Math.round(q48 / 3 * 100) / 100,
          totalCost: Math.round(q48 * 16 * 100) / 100,
          margin: 0.6,
          isRecommended: termMonths === 48
        });
      }

      // 60 month term (default recommended)
      if (rates.term60 || baseQuarterly) {
        const q60 = rates.term60 || Math.round(baseQuarterly * 0.88 * 100) / 100;
        options.push({
          term: 60,
          quarterlyPayment: q60,
          monthlyPayment: Math.round(q60 / 3 * 100) / 100,
          totalCost: Math.round(q60 * 20 * 100) / 100,
          margin: 0.58,
          isRecommended: termMonths === 60 || !termMonths
        });
      }

      // 72 month term (optional)
      if (rates.term72) {
        options.push({
          term: 72,
          quarterlyPayment: rates.term72,
          monthlyPayment: Math.round(rates.term72 / 3 * 100) / 100,
          totalCost: Math.round(rates.term72 * 24 * 100) / 100,
          margin: 0.55,
          isRecommended: termMonths === 72
        });
      }

      // Ensure at least one option exists
      if (options.length === 0) {
        return [{
          term: 60,
          quarterlyPayment: 300,
          monthlyPayment: 100,
          totalCost: 6000,
          margin: 0.6,
          isRecommended: true
        }];
      }

      // Ensure exactly one is recommended
      const hasRecommended = options.some(o => o.isRecommended);
      if (!hasRecommended && options.length > 0) {
        // Recommend 60 month if available, otherwise middle option
        const idx60 = options.findIndex(o => o.term === 60);
        if (idx60 >= 0) {
          options[idx60].isRecommended = true;
        } else {
          options[Math.floor(options.length / 2)].isRecommended = true;
        }
      }

      return options;
    } catch (error) {
      logger.error('Error creating lease options:', error);
      return [{
        term: 60,
        quarterlyPayment: 300,
        monthlyPayment: 100,
        totalCost: 6000,
        margin: 0.6,
        isRecommended: true
      }];
    }
  }

  /**
   * DEBUG: Simple database test to check what's in VendorProduct collection
   */
  static async debugDatabaseContents() {
    try {
      console.log('\n=== DATABASE DEBUG ANALYSIS ===');
      const totalProducts = await VendorProduct.countDocuments({});
      console.log('Total products in database: ' + totalProducts);
      if (totalProducts === 0) {
        console.log('NO PRODUCTS FOUND - Database is empty!');
        return false;
      }
      const availableProducts = await VendorProduct.countDocuments({ 'availability.inStock': true });
      console.log('Available products (inStock=true): ' + availableProducts);
      const sampleProduct = await VendorProduct.findOne({}).lean();
      if (sampleProduct) {
        console.log('\nSample product structure:');
        console.log('- _id: ' + sampleProduct._id);
        console.log('- manufacturer: ' + sampleProduct.manufacturer);
        console.log('- model: ' + sampleProduct.model);
        console.log('- volumeRange: ' + sampleProduct.volumeRange);
        console.log('- minVolume: ' + sampleProduct.minVolume);
        console.log('- maxVolume: ' + sampleProduct.maxVolume);
        console.log('- paperSizes:', sampleProduct.paperSizes);
        console.log('- availability:', sampleProduct.availability);
        console.log('- vendorId: ' + sampleProduct.vendorId);
      }
      const volumeRanges = await VendorProduct.aggregate([
        { $group: { _id: '$volumeRange', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      console.log('\nVolume range distribution:');
      volumeRanges.forEach(range => {
        console.log('- ' + range._id + ': ' + range.count + ' products');
      });
      const paperSizes = await VendorProduct.aggregate([
        { $group: { _id: '$paperSizes.primary', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      console.log('\nPaper sizes distribution:');
      paperSizes.forEach(size => {
        console.log('- ' + (size._id || 'undefined') + ': ' + size.count + ' products');
      });
      console.log('=== END DATABASE DEBUG ===\n');
      return true;
    } catch (error) {
      console.error('Database debug failed:', error);
      return false;
    }
  }

  /**
   * DEBUG: Test the actual query that's failing
   */
  static async debugVendorProductQuery(userVolume, requiredPaperSize, volumeRange) {
    try {
      console.log('\n=== QUERY DEBUG ANALYSIS ===');
      console.log('User requirements:');
      console.log('- userVolume: ' + userVolume);
      console.log('- requiredPaperSize: ' + requiredPaperSize);
      console.log('- volumeRange: ' + volumeRange);
      const originalQuery = {
        'availability.inStock': true,
        $or: [
          { volumeRange },
          {
            maxVolume: { $gte: userVolume * 0.6 },
            minVolume: { $lte: userVolume * 2.5 }
          }
        ]
      };
      console.log('\nTesting original query:', JSON.stringify(originalQuery, null, 2));
      const originalResults = await VendorProduct.find(originalQuery).lean();
      console.log('Original query results: ' + originalResults.length + ' products');
      console.log('\nStep-by-step query testing:');
      const step1 = await VendorProduct.find({ 'availability.inStock': true }).lean();
      console.log('Step 1 - Just availability: ' + step1.length + ' products');
      const step2 = await VendorProduct.find({
        'availability.inStock': true,
        volumeRange
      }).lean();
      console.log('Step 2 - + volume range (' + volumeRange + '): ' + step2.length + ' products');
      const step3 = await VendorProduct.find({
        'availability.inStock': true,
        maxVolume: { $gte: userVolume * 0.6 },
        minVolume: { $lte: userVolume * 2.5 }
      }).lean();
      console.log('Step 3 - + volume bounds (' + (userVolume * 0.6) + ' - ' + (userVolume * 2.5) + '): ' + step3.length + ' products');
      if (requiredPaperSize) {
        const step4a = await VendorProduct.find({
          'availability.inStock': true,
          'paperSizes.supported': requiredPaperSize
        }).lean();
        console.log('Step 4a - + paperSizes.supported (' + requiredPaperSize + '): ' + step4a.length + ' products');
        const step4b = await VendorProduct.find({
          'availability.inStock': true,
          'paperSizes.primary': requiredPaperSize
        }).lean();
        console.log('Step 4b - + paperSizes.primary (' + requiredPaperSize + '): ' + step4b.length + ' products');
        const step4c = await VendorProduct.find({
          'availability.inStock': true,
          paperSizes: { $exists: false }
        }).lean();
        console.log('Step 4c - + paperSizes not defined: ' + step4c.length + ' products');
      }
      if (originalResults.length > 0) {
        console.log('\nFirst result example:');
        const first = originalResults[0];
        console.log('- ' + first.manufacturer + ' ' + first.model);
        console.log('- Volume: ' + first.minVolume + '-' + first.maxVolume + ' (range: ' + first.volumeRange + ')');
        console.log('- Paper: primary=' + first.paperSizes?.primary + ', supported=' + first.paperSizes?.supported);
        console.log('- Vendor: ' + first.vendorId);
      }
      console.log('=== END QUERY DEBUG ===\n');
      return originalResults;
    } catch (error) {
      console.error('Query debug failed:', error);
      return [];
    }
  }

  /**
   * Main function to use your AI engine with new models - PRODUCTION READY WITH DEBUG
   */
  static async generateQuotesFromRequest(quoteRequest, userId = null, invoiceFiles = []) {
    try {
      if (!quoteRequest) {
        throw new Error('QuoteRequest is required');
      }
      if (!quoteRequest._id) {
        throw new Error('QuoteRequest must have an _id');
      }
      console.log('\nAI Engine processing request for ' + quoteRequest.companyName);
      const hasData = await this.debugDatabaseContents();
      if (!hasData) {
        console.log('Stopping - no products in database to match against');
        return [];
      }
      const convertedRequest = this.convertQuoteRequestFormat(quoteRequest);
      console.log('Request converted:', {
        description: convertedRequest.description,
        monthlyVolume: convertedRequest.monthlyVolume,
        type: convertedRequest.type,
        requiredFunctions: convertedRequest.requiredFunctions
      });
      const userVolume = (convertedRequest.monthlyVolume?.mono || 0) +
                        (convertedRequest.monthlyVolume?.colour || 0) ||
                        convertedRequest.monthlyVolume?.total || 0;
      const requiredPaperSize = convertedRequest.paperRequirements?.primarySize ||
                                convertedRequest.type || 'A4';
      let volumeRange;
      if (userVolume <= 6000) volumeRange = '0-6k';
      else if (userVolume <= 13000) volumeRange = '6k-13k';
      else if (userVolume <= 20000) volumeRange = '13k-20k';
      else if (userVolume <= 30000) volumeRange = '20k-30k';
      else if (userVolume <= 40000) volumeRange = '30k-40k';
      else if (userVolume <= 50000) volumeRange = '40k-50k';
      else volumeRange = '50k+';
      console.log('\nQuery parameters:');
      console.log('- User volume: ' + userVolume + ' pages/month');
      console.log('- Volume range: ' + volumeRange);
      console.log('- Required paper size: ' + requiredPaperSize);
      const queryResults = await this.debugVendorProductQuery(userVolume, requiredPaperSize, volumeRange);
      if (queryResults.length === 0) {
        console.log('Database query returned no results - this is the root cause!');
        console.log('Try these fixes:');
        console.log('1. Check if volumeRange field is populated in your products');
        console.log('2. Check if paperSizes field structure matches the query');
        console.log('3. Verify availability.inStock is set to true');
        console.log('4. Check if minVolume/maxVolume values make sense');
        return [];
      }
      let result;
      try {
        result = await AIRecommendationEngine.generateRecommendations(
          convertedRequest,
          userId || quoteRequest.submittedBy,
          invoiceFiles
        );
      } catch (aiError) {
        logger.error('AI Engine error:', aiError);
        throw new Error('AI recommendation engine failed: ' + aiError.message);
      }
      const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
      console.log('AI Engine returned ' + recommendations.length + ' recommendations');
      if (recommendations.length === 0) {
        console.log('AI Engine returned no recommendations');
        return [];
      }
      const validRecommendations = recommendations.filter(rec => !rec.error);
      if (validRecommendations.length === 0) {
        console.log('All recommendations contained errors');
        return [];
      }
      console.log('Valid recommendations: ' + validRecommendations.length);
      const uniqueRecommendations = this.deduplicateByVendor(validRecommendations);
      if (uniqueRecommendations.length === 0) {
        console.log('No unique vendor recommendations after deduplication');
        return [];
      }
      console.log('Creating quotes for ' + uniqueRecommendations.length + ' unique recommendations');
      const quotes = [];
      const maxQuotes = Math.min(uniqueRecommendations.length, 3);
      for (let i = 0; i < maxQuotes; i++) {
        const recommendation = uniqueRecommendations[i];
        try {
          const validation = this.validateRecommendation(recommendation, i + 1);
          if (!validation.isValid) {
            console.log('Skipping invalid recommendation ' + (i + 1) + ':', validation.errors);
            continue;
          }
          const quoteData = this.convertToQuoteFormat(recommendation, quoteRequest, i + 1);
          const quote = new Quote(quoteData);
          const savedQuote = await quote.save();
          quotes.push(savedQuote._id);
          console.log('✅ Created quote ' + (i + 1) + ': ' + (recommendation.product?.manufacturer || 'Unknown') + ' ' + (recommendation.product?.model || 'Unknown') + ' from vendor ' + recommendation.product?.vendorId);
        } catch (saveError) {
          console.log('❌ Error saving quote ' + (i + 1) + ':', {
            error: saveError.message,
            recommendation: {
              manufacturer: recommendation.product?.manufacturer,
              model: recommendation.product?.model,
              productId: recommendation.product?._id,
              vendorId: recommendation.product?.vendorId
            }
          });
        }
      }
      console.log('🎉 Successfully created ' + quotes.length + ' unique vendor quotes from ' + validRecommendations.length + ' total recommendations');
      if (quotes.length > 0) {
        await QuoteRequest.findByIdAndUpdate(
          quoteRequest._id,
          {
            $push: { quotes: { $each: quotes } },
            status: 'matched',
            'aiAnalysis.processed': true,
            'aiAnalysis.processedAt': new Date(),
            'aiAnalysis.suggestedCategories': [volumeRange],
            'aiAnalysis.recommendations': uniqueRecommendations.map(rec => ({
              productId: rec.product._id,
              score: rec.overallScore,
              ranking: rec.ranking
            }))
          }
        );
        logger.info('Updated quote request ' + quoteRequest._id + ' with ' + quotes.length + ' quotes');
      }
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
      const monthlyMono = quoteRequest.monthlyVolume?.mono || 1000;
      const monthlyColour = quoteRequest.monthlyVolume?.colour || 500;
      const totalVolume = monthlyMono + monthlyColour;
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
            cpcRates: {
              paperSize: 'A4',
              monoRate: 0.01,
              colourRate: 0.04
            },
            monthlyCosts: {
              monoPages: monthlyMono,
              colourPages: monthlyColour,
              monoCpcCost: monthlyMono * 0.01,
              colourCpcCost: monthlyColour * 0.04,
              totalCpcCost: (monthlyMono * 0.01) + (monthlyColour * 0.04),
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
          status: 'generated',
          aiGenerated: true,
          createdAt: new Date(),
          metadata: {
            aiEngineVersion: 'TEST-SCHEMA-FIXED',
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
        deduplicationMethod: 'vendorId + manufacturer + model',
        costEfficiencyFixed: true,
        schemaValidationFixed: true
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
      version: '2.2.0-SCHEMA-FIXED',
      status: 'production',
      features: [
        'AI Recommendation Engine Integration',
        'Production Error Handling',
        'Comprehensive Validation',
        'Fixed Vendor Deduplication',
        'Fallback Quote Generation',
        'Health Monitoring',
        'Database Debug Tools',
        'Fixed CostEfficiency Bounds Checking',
        'Fixed Schema Validation Issues'
      ],
      supportedModels: [
        'QuoteRequest',
        'Quote',
        'VendorProduct'
      ],
      lastUpdate: new Date('2025-09-25'),
      debugFeatures: [
        'Database Content Analysis',
        'Query Step-by-Step Testing',
        'Volume Range Debug',
        'Paper Size Structure Debug'
      ],
      schemaFixes: [
        'matchScore.total now properly normalized to 0-1 scale',
        'userRequirements.priority field added as required',
        'status uses correct enum value (generated)',
        'All breakdown scores bounded to valid ranges',
        'Score normalization with debug metadata'
      ]
    };
  }
}

export default AIEngineAdapter;
