import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import logger from '../services/logger.js';
import VendorProduct from '../models/VendorProduct.js';
import Vendor from '../models/Vendor.js';

// Production-grade OpenAI client with connection pooling and retries
class OpenAIService {
  constructor() {
    this.client = null;
    this.retryCount = 3;
    this.retryDelay = 1000;
  }

  getClient() {
    if (!this.client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 30000,
        maxRetries: 2
      });
      logger.info('OpenAI client initialized');
    }
    return this.client;
  }

  async completionWithRetry(params, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const completion = await this.getClient().chat.completions.create({
        ...params,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return completion;
    } catch (error) {
      if (attempt < this.retryCount && this.isRetryableError(error)) {
        logger.warn(`OpenAI API attempt ${attempt} failed, retrying...`, {
          error: error.message,
          attempt,
          retryAfter: this.retryDelay * attempt
        });
        await this.delay(this.retryDelay * attempt);
        return this.completionWithRetry(params, attempt + 1);
      }
      throw error;
    }
  }

  isRetryableError(error) {
    return (
      error.name === 'AbortError' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      (error.status >= 500 && error.status < 600) ||
      error.status === 429
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const openAIService = new OpenAIService();

export const aiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many AI requests. Please wait a moment before trying again.',
    success: false,
    suggestions: []
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, userAgent: req.get('User-Agent'), endpoint: req.path });
    res.status(429).json({
      error: 'Too many AI requests. Please wait a moment before trying again.',
      success: false,
      suggestions: [],
      retryAfter: 60
    });
  }
});

function validateFormData(formData) {
  const errors = [];
  if (!formData || typeof formData !== 'object') {
    errors.push('formData must be a valid object');
    return { isValid: false, errors };
  }
  if (formData.monthlyVolume) {
    if (typeof formData.monthlyVolume !== 'object') {
      errors.push('monthlyVolume must be an object');
    } else {
      const volume = formData.monthlyVolume.total || (formData.monthlyVolume.mono || 0) + (formData.monthlyVolume.colour || 0);
      if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 1000000)) {
        errors.push('monthlyVolume must be a positive number between 0 and 1,000,000');
      }
    }
  }
  if (formData.industryType !== undefined && typeof formData.industryType !== 'string') {
    errors.push('industryType must be a string');
  }
  if (formData.required_functions !== undefined) {
    if (!Array.isArray(formData.required_functions)) {
      errors.push('required_functions must be an array');
    } else if (formData.required_functions.length > 20) {
      errors.push('required_functions array cannot have more than 20 items');
    }
  }
  if (formData.max_lease_price !== undefined && (typeof formData.max_lease_price !== 'number' || formData.max_lease_price < 0 || formData.max_lease_price > 100000)) {
    errors.push('max_lease_price must be a positive number between 0 and 100,000');
  }
  const validPaperTypes = ['A4', 'A3', 'Letter', 'Legal', 'Tabloid'];
  if (formData.type !== undefined && !validPaperTypes.includes(formData.type)) {
    errors.push(`paper type must be one of: ${validPaperTypes.join(', ')}`);
  }
  if (formData.min_speed !== undefined && (typeof formData.min_speed !== 'number' || formData.min_speed < 1 || formData.min_speed > 200)) {
    errors.push('min_speed must be a number between 1 and 200');
  }
  return { isValid: errors.length === 0, errors };
}

function parseSuggestions(responseText) {
  try {
    if (!responseText || typeof responseText !== 'string') {
      return getDefaultSuggestions();
    }
    let suggestions = [];
    const modelDescPattern = /^(.+?)\s*[-–—]\s*(.+)$/gm;
    const matches = responseText.match(modelDescPattern);
    if (matches && matches.length > 0) {
      suggestions = matches.slice(0, 3).map((line, index) => {
        const matchResult = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (matchResult) {
          const [, model, description] = matchResult;
          return { model: model?.trim() || `Recommendation ${index + 1}`, description: description?.trim() || 'Professional multifunction printer suitable for your requirements.', rawText: line.trim() };
        }
        return { model: `Recommendation ${index + 1}`, description: line.trim(), rawText: line.trim() };
      });
    }
    if (suggestions.length === 0) {
      const numberedPattern = /^\d+\.?\s*(.+)$/gm;
      const numberedMatches = responseText.match(numberedPattern);
      if (numberedMatches) {
        suggestions = numberedMatches.slice(0, 3).map((line, index) => {
          const cleanLine = line.replace(/^\d+\.?\s*/, '').trim();
          const parts = cleanLine.split(/\s*[-–—]\s*/);
          return { model: parts[0]?.trim() || `Option ${index + 1}`, description: parts[1]?.trim() || parts[0]?.trim() || 'Suitable multifunction printer', rawText: cleanLine };
        });
      }
    }
    if (suggestions.length === 0) {
      const lines = responseText.split('\n').map(line => line.trim()).filter(line => line && line.length > 10 && !line.toLowerCase().includes('here are') && !line.toLowerCase().includes('based on') && !line.toLowerCase().includes('requirements')).slice(0, 3);
      if (lines.length > 0) {
        suggestions = lines.map((line, index) => ({ model: `Professional Option ${index + 1}`, description: line, rawText: line }));
      }
    }
    if (suggestions.length === 0) return getDefaultSuggestions();
    return suggestions.map(s => ({ model: s.model || 'Professional Printer', description: s.description || 'High-quality multifunction printer suitable for office use.', rawText: s.rawText || s.description || 'Professional recommendation' }));
  } catch (error) {
    logger.error('Error parsing AI suggestions:', error);
    return getDefaultSuggestions();
  }
}

function getDefaultSuggestions() {
  return [
    { model: 'Canon imageRUNNER ADVANCE', description: 'Reliable multifunction printer suitable for office environments with comprehensive printing, copying, and scanning capabilities.', rawText: 'Canon imageRUNNER ADVANCE - Professional office solution' },
    { model: 'Xerox WorkCentre Series', description: 'High-performance multifunction device with advanced document management features and excellent print quality.', rawText: 'Xerox WorkCentre Series - Enterprise-grade solution' },
    { model: 'HP LaserJet Pro MFP', description: 'Cost-effective multifunction printer with fast printing speeds and wireless connectivity options.', rawText: 'HP LaserJet Pro MFP - Versatile office printer' }
  ];
}

function buildPrompt(formData) {
  const volume = formData.monthlyVolume?.total || (formData.monthlyVolume?.mono || 0) + (formData.monthlyVolume?.colour || 0) || 'Not specified';
  const speedRequirement = formData.min_speed ? `${formData.min_speed} PPM minimum` : 'Standard office speed';
  const budget = formData.max_lease_price ? `£${formData.max_lease_price}/month maximum` : 'Budget flexible';
  const functions = formData.required_functions?.length > 0 ? formData.required_functions.slice(0, 10).join(', ') : 'Print, Copy, Scan';
  const sanitize = (str) => str ? str.replace(/[^\w\s\-.,]/g, '').slice(0, 100) : '';
  return `You are an expert copier/printer procurement specialist. Based on these requirements, recommend exactly 3 specific multifunction printer models that would be suitable:

REQUIREMENTS:
• Monthly Volume: ${volume} pages
• Industry: ${sanitize(formData.industryType) || 'General office'}
• Paper Size: ${formData.type || 'A4'}
• Speed Required: ${speedRequirement}
• Color Needed: ${sanitize(formData.colour) || 'Not specified'}
• Budget: ${budget}
• Required Functions: ${functions}
• Location: ${sanitize(formData.location) || 'UK'}

FORMAT: Provide exactly 3 recommendations in this format:
[Manufacturer Model] - [Brief explanation focusing on why it suits their volume and requirements]

EXAMPLE:
Canon imageRUNNER ADVANCE C3330i - Perfect for your 5,000 page monthly volume with fast 30ppm speeds and comprehensive scanning features.

Keep each recommendation to 1-2 sentences maximum. Focus on volume suitability, speed match, and key features that address their specific needs.`;
}

// Query real vendor products from the database
async function getVendorQuotes(formData) {
  try {
    const monthlyVolume = formData.monthlyVolume?.total || ((formData.monthlyVolume?.mono || 0) + (formData.monthlyVolume?.colour || 0)) || 5000;
    const paperSize = formData.type || 'A4';
    const minSpeed = formData.min_speed || 20;
    const maxBudget = formData.max_lease_price || 1000;
    const requiredFeatures = formData.required_functions || ['Print', 'Copy', 'Scan'];

    const query = {
      minVolume: { $lte: monthlyVolume },
      maxVolume: { $gte: monthlyVolume },
      speed: { $gte: minSpeed }
    };
    if (paperSize === 'A3') query['paperSizes.supported'] = 'A3';

    let products = await VendorProduct.find(query)
      .populate({ path: 'vendorId', match: { 'account.status': 'active' }, select: 'name company performance.rating serviceCapabilities location' })
      .sort({ 'costs.totalMachineCost': 1 })
      .limit(10)
      .lean();
    products = products.filter(p => p.vendorId);

    if (products.length === 0) {
      products = await VendorProduct.find({})
        .populate({ path: 'vendorId', select: 'name company performance.rating serviceCapabilities location' })
        .sort({ 'costs.totalMachineCost': 1 })
        .limit(10)
        .lean();
      products = products.filter(p => p.vendorId);
    }

    const quotes = products.slice(0, 3).map((product, index) => {
      const matchScore = calculateMatchScore(product, { monthlyVolume, minSpeed, maxBudget, requiredFeatures, paperSize });
      const leaseTermMonths = 60;
      const monthlyLease = Math.round((product.costs.totalMachineCost / leaseTermMonths) * 100) / 100;
      const monoVolume = formData.monthlyVolume?.mono || Math.round(monthlyVolume * 0.8);
      const colourVolume = formData.monthlyVolume?.colour || Math.round(monthlyVolume * 0.2);
      const monthlyClickCharges = (monoVolume * product.costs.cpcRates.A4Mono / 100) + (colourVolume * product.costs.cpcRates.A4Colour / 100);
      const monthlyService = (product.service?.quarterlyService || 150) / 3;
      const totalMonthlyCost = Math.round((monthlyLease + monthlyClickCharges + monthlyService) * 100) / 100;

      return {
        vendor: {
          id: product.vendorId._id,
          name: product.vendorId.name,
          company: product.vendorId.company,
          rating: product.vendorId.performance?.rating || 4.0,
          responseTime: product.vendorId.serviceCapabilities?.responseTime || 'Next day'
        },
        product: {
          id: product._id,
          manufacturer: product.manufacturer,
          model: product.model,
          description: product.description || `${product.manufacturer} ${product.model} - Professional MFP`,
          speed: product.speed,
          category: product.category,
          features: product.features || ['Print', 'Copy', 'Scan'],
          paperSizes: product.paperSizes
        },
        costs: {
          machineCost: product.costs.machineCost,
          installation: product.costs.installation || 250,
          profitMargin: product.costs.profitMargin,
          totalMachineCost: product.costs.totalMachineCost,
          cpcRates: {
            monoRate: product.costs.cpcRates.A4Mono,
            colourRate: product.costs.cpcRates.A4Colour,
            A4Mono: product.costs.cpcRates.A4Mono,
            A4Colour: product.costs.cpcRates.A4Colour,
            A3Mono: product.costs.cpcRates.A3Mono || product.costs.cpcRates.A4Mono * 2,
            A3Colour: product.costs.cpcRates.A3Colour || product.costs.cpcRates.A4Colour * 2
          },
          monthlyCosts: {
            lease: monthlyLease,
            clickCharges: Math.round(monthlyClickCharges * 100) / 100,
            service: Math.round(monthlyService * 100) / 100,
            totalMonthlyCost
          }
        },
        service: {
          level: product.service?.level || 'Standard',
          responseTime: product.service?.responseTime || 'Next day',
          quarterlyService: product.service?.quarterlyService || 150
        },
        availability: {
          inStock: product.availability?.inStock ?? true,
          leadTime: product.availability?.leadTime || 14
        },
        matchScore: {
          total: matchScore.total,
          volumeMatch: matchScore.volumeMatch,
          speedMatch: matchScore.speedMatch,
          budgetMatch: matchScore.budgetMatch,
          featureMatch: matchScore.featureMatch
        },
        rank: index + 1
      };
    });
    return quotes;
  } catch (error) {
    logger.error('Error querying vendor products:', error);
    return [];
  }
}

function calculateMatchScore(product, requirements) {
  const scores = { volumeMatch: 0, speedMatch: 0, budgetMatch: 0, featureMatch: 0 };
  const volumeRange = product.maxVolume - product.minVolume;
  const volumePosition = (requirements.monthlyVolume - product.minVolume) / volumeRange;
  scores.volumeMatch = Math.max(0, 1 - Math.abs(volumePosition - 0.5) * 2);
  if (product.speed >= requirements.minSpeed) {
    const speedExcess = (product.speed - requirements.minSpeed) / requirements.minSpeed;
    scores.speedMatch = Math.min(1, 0.7 + speedExcess * 0.3);
  } else {
    scores.speedMatch = product.speed / requirements.minSpeed * 0.5;
  }
  const monthlyEquivalent = product.costs.totalMachineCost / 60;
  if (monthlyEquivalent <= requirements.maxBudget) {
    scores.budgetMatch = 1 - (monthlyEquivalent / requirements.maxBudget) * 0.3;
  } else {
    scores.budgetMatch = Math.max(0, requirements.maxBudget / monthlyEquivalent * 0.7);
  }
  if (requirements.requiredFeatures && requirements.requiredFeatures.length > 0) {
    const productFeatures = (product.features || []).map(f => f.toLowerCase());
    const matchedFeatures = requirements.requiredFeatures.filter(f => productFeatures.some(pf => pf.includes(f.toLowerCase())));
    scores.featureMatch = matchedFeatures.length / requirements.requiredFeatures.length;
  } else {
    scores.featureMatch = 0.8;
  }
  scores.total = Math.round((scores.volumeMatch * 0.35 + scores.speedMatch * 0.25 + scores.budgetMatch * 0.25 + scores.featureMatch * 0.15) * 100) / 100;
  return scores;
}

export const suggestCopiers = async (req, res) => {
  const startTime = Date.now();
  let tokenUsage = null;

  try {
    logger.info('AI suggestion request received', { ip: req.ip, userAgent: req.get('User-Agent'), timestamp: new Date().toISOString(), hasFormData: !!req.body?.formData });

    let formData = req.body?.formData || req.body;
    if (!formData || typeof formData !== 'object') {
      logger.warn('Missing formData in request', { ip: req.ip });
      return res.status(400).json({ error: 'formData is required', success: false, suggestions: [] });
    }

    const validation = validateFormData(formData);
    if (!validation.isValid) {
      logger.warn('Invalid form data received', { errors: validation.errors, ip: req.ip, formData: formData ? Object.keys(formData) : null });
      return res.status(400).json({ error: 'Invalid request data', details: validation.errors, success: false, suggestions: [] });
    }

    logger.info('Querying vendor products', { industry: formData.industryType, volume: formData.monthlyVolume?.total || 0, budget: formData.max_lease_price });

    // FIRST: Try to get real vendor quotes from the database
    const vendorQuotes = await getVendorQuotes(formData);

    if (vendorQuotes && vendorQuotes.length >= 3) {
      const processingTime = Date.now() - startTime;
      logger.info('Vendor quotes retrieved successfully', { industry: formData.industryType, volume: formData.monthlyVolume?.total || 0, quotesCount: vendorQuotes.length, processingTime, source: 'database' });
      return res.json({
        success: true,
        suggestions: vendorQuotes,
        metadata: { processingTime, source: 'database', quotesCount: vendorQuotes.length, generatedAt: new Date().toISOString(), requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
      });
    }

    // FALLBACK: Use OpenAI if not enough database results
    logger.info('Falling back to AI suggestions', { dbQuotesFound: vendorQuotes?.length || 0, reason: 'insufficient_database_results' });

    const prompt = buildPrompt(formData);
    logger.info('Generating AI suggestions', { industry: formData.industryType, volume: formData.monthlyVolume?.total || 0, budget: formData.max_lease_price, promptLength: prompt.length });

    const model = process.env.OPENAI_MODEL || "gpt-4";
    const completion = await openAIService.completionWithRetry({
      model,
      messages: [
        { role: "system", content: "You are a professional office equipment procurement expert with deep knowledge of multifunction printers, copiers, and their optimal usage scenarios. Provide specific, accurate model recommendations based on the user's requirements. Always respond with exactly 3 recommendations in the requested format." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.1
    });

    if (!completion?.choices?.[0]?.message?.content) throw new Error('Invalid response structure from OpenAI');

    tokenUsage = completion.usage;
    const responseText = completion.choices[0].message.content;
    const aiSuggestions = parseSuggestions(responseText);
    const combinedSuggestions = [...vendorQuotes, ...aiSuggestions.slice(0, 3 - vendorQuotes.length)];
    const processingTime = Date.now() - startTime;

    logger.info('AI suggestions generated successfully', { industry: formData.industryType, volume: formData.monthlyVolume?.total || 0, suggestionsCount: combinedSuggestions.length, dbQuotes: vendorQuotes.length, aiSuggestions: aiSuggestions.length, processingTime, model, tokenUsage: tokenUsage ? { prompt: tokenUsage.prompt_tokens, completion: tokenUsage.completion_tokens, total: tokenUsage.total_tokens } : null });

    res.json({
      success: true,
      suggestions: combinedSuggestions,
      metadata: { processingTime, source: vendorQuotes.length > 0 ? 'hybrid' : 'ai', model, dbQuotesCount: vendorQuotes.length, tokenUsage: process.env.NODE_ENV === 'production' ? undefined : tokenUsage, generatedAt: new Date().toISOString(), requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('AI suggestion error', { error: { message: error.message, name: error.name, code: error.code, status: error.status, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }, request: { ip: req.ip, userAgent: req.get('User-Agent'), hasFormData: !!req.body?.formData, formDataKeys: req.body?.formData ? Object.keys(req.body.formData) : null }, processingTime, timestamp: new Date().toISOString() });

    if (error.message.includes('API key') || error.message.includes('authentication')) {
      return res.status(500).json({ error: 'Service configuration error. Please contact support.', success: false, suggestions: getDefaultSuggestions(), code: 'AUTH_ERROR' });
    }
    if (error.code === 'insufficient_quota' || error.status === 429) {
      return res.status(503).json({ error: 'AI service temporarily unavailable due to high demand. Please try again in a few minutes.', success: false, suggestions: getDefaultSuggestions(), code: 'QUOTA_EXCEEDED', retryAfter: 300 });
    }
    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(408).json({ error: 'Request timed out. Please try again.', success: false, suggestions: getDefaultSuggestions(), code: 'TIMEOUT' });
    }
    if (error.status >= 400 && error.status < 500) {
      return res.status(400).json({ error: 'Invalid request. Please check your input and try again.', success: false, suggestions: getDefaultSuggestions(), code: 'CLIENT_ERROR' });
    }
    res.status(500).json({ error: 'AI suggestion service temporarily unavailable. Please try again later.', success: false, suggestions: getDefaultSuggestions(), code: 'SERVER_ERROR' });
  }
};

export const healthCheck = async (req, res) => {
  try {
    const healthData = { status: 'healthy', timestamp: new Date().toISOString(), version: '2.0.0', environment: process.env.NODE_ENV, uptime: Math.floor(process.uptime()) };
    if (process.env.OPENAI_API_KEY) {
      try {
        const client = openAIService.getClient();
        await Promise.race([
          client.chat.completions.create({ model: "gpt-3.5-turbo", messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
        ]);
        healthData.openai = 'connected';
        healthData.model = process.env.OPENAI_MODEL || "gpt-4";
      } catch (openaiError) {
        logger.warn('OpenAI health check failed:', openaiError.message);
        healthData.openai = 'disconnected';
        healthData.openaiError = openaiError.message;
      }
    } else {
      healthData.openai = 'not_configured';
    }
    const statusCode = healthData.openai === 'connected' || healthData.openai === 'not_configured' ? 200 : 503;
    res.status(statusCode).json(healthData);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({ status: 'unhealthy', error: error.message, timestamp: new Date().toISOString(), version: '2.0.0' });
  }
};

export default { suggestCopiers, healthCheck, aiRateLimit };
