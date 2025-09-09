import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import logger from '../services/logger.js';

// Production-grade OpenAI client with connection pooling and retries
class OpenAIService {
  constructor() {
    this.client = null;
    this.retryCount = 3;
    this.retryDelay = 1000; // 1 second base delay
  }

  getClient() {
    if (!this.client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 30000, // 30 second timeout
        maxRetries: 2
      });
      
      logger.info('OpenAI client initialized');
    }
    return this.client;
  }

  async completionWithRetry(params, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
      
      const completion = await this.getClient().chat.completions.create({
        ...params,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return completion;
    } catch (error) {
      clearTimeout(timeoutId);
      
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
      (error.status >= 500 && error.status < 600) ||
      error.status === 429 // Rate limit
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const openAIService = new OpenAIService();

// Rate limiting middleware
export const aiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10, // Max 10 requests per minute per IP
  message: {
    error: 'Too many AI requests. Please wait a moment before trying again.',
    success: false,
    suggestions: []
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    
    res.status(429).json({
      error: 'Too many AI requests. Please wait a moment before trying again.',
      success: false,
      suggestions: [],
      retryAfter: Math.ceil(60) // seconds
    });
  }
});

// Enhanced input validation
function validateFormData(formData) {
  const errors = [];
  
  if (!formData || typeof formData !== 'object') {
    errors.push('formData must be a valid object');
    return { isValid: false, errors };
  }

  // Validate monthly volume
  if (formData.monthlyVolume) {
    const volume = formData.monthlyVolume.total || 
                  (formData.monthlyVolume.mono || 0) + (formData.monthlyVolume.colour || 0);
    
    if (typeof volume !== 'number' || volume < 0 || volume > 1000000) {
      errors.push('monthlyVolume must be a positive number between 0 and 1,000,000');
    }
  }

  // Validate industry type
  if (formData.industryType && typeof formData.industryType !== 'string') {
    errors.push('industryType must be a string');
  }

  // Validate required functions
  if (formData.required_functions && !Array.isArray(formData.required_functions)) {
    errors.push('required_functions must be an array');
  }

  // Validate budget
  if (formData.max_lease_price && (typeof formData.max_lease_price !== 'number' || formData.max_lease_price < 0)) {
    errors.push('max_lease_price must be a positive number');
  }

  return { isValid: errors.length === 0, errors };
}

// Enhanced response parsing with regex
function parseSuggestions(responseText) {
  try {
    if (!responseText || typeof responseText !== 'string') {
      return [];
    }

    // Multiple parsing strategies for robustness
    let suggestions = [];
    
    // Strategy 1: Model - Description format
    const modelDescPattern = /^(.+?)\s*[-–—]\s*(.+)$/gm;
    const matches = responseText.match(modelDescPattern);
    
    if (matches && matches.length > 0) {
      suggestions = matches.slice(0, 3).map(line => {
        const [, model, description] = line.match(/^(.+?)\s*[-–—]\s*(.+)$/) || [];
        return {
          model: model?.trim() || 'Unknown Model',
          description: description?.trim() || 'No description available',
          rawText: line.trim()
        };
      });
    }
    
    // Strategy 2: Numbered list fallback
    if (suggestions.length === 0) {
      const numberedPattern = /^\d+\.?\s*(.+)$/gm;
      const numberedMatches = responseText.match(numberedPattern);
      
      if (numberedMatches) {
        suggestions = numberedMatches.slice(0, 3).map(line => {
          const cleanLine = line.replace(/^\d+\.?\s*/, '').trim();
          const parts = cleanLine.split(/\s*[-–—]\s*/);
          
          return {
            model: parts[0]?.trim() || 'Model',
            description: parts[1]?.trim() || cleanLine,
            rawText: cleanLine
          };
        });
      }
    }
    
    // Strategy 3: Line-by-line fallback
    if (suggestions.length === 0) {
      const lines = responseText.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.toLowerCase().includes('here are') && !line.toLowerCase().includes('based on'))
        .slice(0, 3);
      
      suggestions = lines.map(line => ({
        model: 'Recommended Model',
        description: line,
        rawText: line
      }));
    }

    return suggestions.length > 0 ? suggestions : [{
      model: 'General Recommendation',
      description: 'Please contact our experts for personalized recommendations based on your specific requirements.',
      rawText: 'Fallback recommendation'
    }];
    
  } catch (error) {
    logger.error('Error parsing AI suggestions:', error);
    return [{
      model: 'Error',
      description: 'Unable to process recommendations. Please try again.',
      rawText: 'Error fallback'
    }];
  }
}

// Build comprehensive prompt
function buildPrompt(formData) {
  const volume = formData.monthlyVolume?.total || 
                (formData.monthlyVolume?.mono || 0) + (formData.monthlyVolume?.colour || 0) || 
                'Not specified';
  
  const speedRequirement = formData.min_speed ? `${formData.min_speed} PPM minimum` : 'Standard office speed';
  const budget = formData.max_lease_price ? `£${formData.max_lease_price}/month maximum` : 'Budget flexible';
  const functions = formData.required_functions?.length > 0 ? 
    formData.required_functions.join(', ') : 'Print, Copy, Scan';

  return `You are an expert copier/printer procurement specialist. Based on these requirements, recommend exactly 3 specific multifunction printer models that would be suitable:

REQUIREMENTS:
• Monthly Volume: ${volume} pages
• Industry: ${formData.industryType || 'General office'}
• Paper Size: ${formData.type || 'A4'}
• Speed Required: ${speedRequirement}
• Color Needed: ${formData.colour || 'Not specified'}
• Budget: ${budget}
• Required Functions: ${functions}
• Location: ${formData.location || 'UK'}

FORMAT: Provide exactly 3 recommendations in this format:
[Manufacturer Model] - [Brief explanation focusing on why it suits their volume and requirements]

EXAMPLE:
Canon imageRUNNER ADVANCE C3330i - Perfect for your 5,000 page monthly volume with fast 30ppm speeds and comprehensive scanning features.

Keep each recommendation to 1-2 sentences maximum. Focus on volume suitability, speed match, and key features that address their specific needs.`;
}

// Main controller function
export const suggestCopiers = async (req, res) => {
  const startTime = Date.now();
  let tokenUsage = null;
  
  try {
    logger.info('AI suggestion request received', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Input validation
    const { formData } = req.body;
    const validation = validateFormData(formData);
    
    if (!validation.isValid) {
      logger.warn('Invalid form data received', {
        errors: validation.errors,
        ip: req.ip
      });
      
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.errors,
        success: false,
        suggestions: []
      });
    }

    // Build prompt
    const prompt = buildPrompt(formData);
    
    logger.info('Generating AI suggestions', {
      industry: formData.industryType,
      volume: formData.monthlyVolume?.total || 0,
      budget: formData.max_lease_price
    });

    // Call OpenAI with retry logic
    const completion = await openAIService.completionWithRetry({
      model: process.env.OPENAI_MODEL || "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional office equipment procurement expert with deep knowledge of multifunction printers, copiers, and their optimal usage scenarios. Provide specific, accurate model recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3, // Lower for more consistent recommendations
      top_p: 0.9,
      frequency_penalty: 0.1
    });

    if (!completion?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from OpenAI');
    }

    // Extract token usage for cost tracking
    tokenUsage = completion.usage;
    
    // Parse suggestions
    const responseText = completion.choices[0].message.content;
    const suggestions = parseSuggestions(responseText);
    
    const processingTime = Date.now() - startTime;
    
    logger.info('AI suggestions generated successfully', {
      industry: formData.industryType,
      volume: formData.monthlyVolume?.total || 0,
      suggestionsCount: suggestions.length,
      processingTime,
      tokenUsage: tokenUsage ? {
        prompt: tokenUsage.prompt_tokens,
        completion: tokenUsage.completion_tokens,
        total: tokenUsage.total_tokens
      } : null
    });

    // Return enhanced response
    res.json({
      success: true,
      suggestions,
      metadata: {
        processingTime,
        model: process.env.OPENAI_MODEL || "gpt-4",
        tokenUsage,
        generatedAt: new Date().toISOString(),
        requestId: req.id || null // If you have request ID middleware
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Enhanced error logging with context
    logger.error('AI suggestion error', {
      error: {
        message: error.message,
        name: error.name,
        code: error.code,
        status: error.status
      },
      request: {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        formData: req.body.formData ? {
          industry: req.body.formData.industryType,
          volume: req.body.formData.monthlyVolume?.total
        } : null
      },
      processingTime,
      timestamp: new Date().toISOString()
    });

    // Specific error handling with appropriate HTTP status codes
    if (error.message.includes('API key') || error.message.includes('authentication')) {
      return res.status(500).json({
        error: 'Service configuration error. Please contact support.',
        success: false,
        suggestions: [],
        code: 'AUTH_ERROR'
      });
    }

    if (error.code === 'insufficient_quota' || error.status === 429) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable due to high demand. Please try again in a few minutes.',
        success: false,
        suggestions: [],
        code: 'QUOTA_EXCEEDED',
        retryAfter: 300 // 5 minutes
      });
    }

    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: 'Request timed out. Please try again.',
        success: false,
        suggestions: [],
        code: 'TIMEOUT'
      });
    }

    if (error.status >= 400 && error.status < 500) {
      return res.status(400).json({
        error: 'Invalid request. Please check your input and try again.',
        success: false,
        suggestions: [],
        code: 'CLIENT_ERROR'
      });
    }

    // Generic server error
    res.status(500).json({
      error: 'AI suggestion service temporarily unavailable. Please try again later.',
      success: false,
      suggestions: [],
      code: 'SERVER_ERROR'
    });
  }
};

// Health check endpoint
export const healthCheck = async (req, res) => {
  try {
    const client = openAIService.getClient();
    
    // Basic connectivity test
    const testCompletion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 5
    });

    res.json({
      status: 'healthy',
      openai: 'connected',
      model: process.env.OPENAI_MODEL || "gpt-4",
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      openai: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

export default {
  suggestCopiers,
  healthCheck,
  aiRateLimit
};
