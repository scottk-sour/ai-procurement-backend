import OpenAI from 'openai';

// Initialize OpenAI client once (better performance)
let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
};

export const suggestCopiers = async (req, res) => {
  try {
    // Input validation
    const { formData } = req.body;
    
    if (!formData) {
      return res.status(400).json({ 
        error: 'Form data is required',
        suggestions: [] 
      });
    }

    // Rate limiting check (optional - add if needed)
    // You could implement rate limiting here based on user IP or ID

    const openai = getOpenAIClient();
    
    // Build more robust prompt
    const prompt = `Based on these printing requirements, suggest 3 suitable copier/printer models:

Requirements:
- Monthly Volume: ${formData.monthlyVolume?.total || 'Not specified'} pages
- Industry: ${formData.industryType || 'General office'}
- Paper Size: ${formData.type || 'A4'}
- Speed Required: ${formData.min_speed || 'Standard'} PPM
- Color: ${formData.colour || 'Not specified'}
- Budget: ${formData.max_lease_price ? `£${formData.max_lease_price}/month` : 'Not specified'}
- Functions: ${formData.required_functions?.join(', ') || 'Standard office functions'}

Please provide exactly 3 specific copier/printer model recommendations. Format each as:
Model Name - Brief explanation (1-2 sentences)

Keep responses concise and professional.`;

    const suggestions = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system", 
          content: "You are an expert in office equipment procurement. Provide specific, accurate printer/copier model recommendations based on user requirements."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 400,
      temperature: 0.5, // Lower for more consistent results
      timeout: 10000 // 10 second timeout
    });
    
    if (!suggestions.choices?.[0]?.message?.content) {
      throw new Error('No valid response from OpenAI');
    }

    // Parse the response into an array of suggestions
    const suggestionText = suggestions.choices[0].message.content;
    const suggestionArray = suggestionText
      .split('\n')
      .filter(line => line.trim() && line.includes('-'))
      .slice(0, 3) // Ensure max 3 suggestions
      .map(line => line.trim());
    
    // Log successful request (without sensitive data)
    console.log(`AI suggestions generated for ${formData.industryType || 'unknown'} industry, ${formData.monthlyVolume?.total || 0} pages/month`);
    
    res.json({ 
      suggestions: suggestionArray,
      success: true
    });
    
  } catch (error) {
    // Enhanced error logging
    console.error('AI suggestion error:', {
      message: error.message,
      name: error.name,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    // Different error responses based on error type
    if (error.message.includes('API key')) {
      return res.status(500).json({ 
        error: 'AI service configuration error',
        suggestions: [],
        success: false
      });
    }
    
    if (error.code === 'insufficient_quota') {
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable',
        suggestions: [],
        success: false
      });
    }
    
    if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'AI service timeout',
        suggestions: [],
        success: false
      });
    }
    
    // Generic error response
    res.status(500).json({ 
      error: 'AI suggestion service temporarily unavailable',
      suggestions: [],
      success: false
    });
  }
};
