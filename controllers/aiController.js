import OpenAI from 'openai';

export const suggestCopiers = async (req, res) => {
  try {
    const { formData } = req.body;
    
    // Use your OPENAI_API_KEY from Render environment
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Make OpenAI call here
    const suggestions = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Based on this printing requirements data, suggest 3 suitable copier/printer models: 
          Monthly Volume: ${formData.monthlyVolume?.total || 'Unknown'} pages
          Industry: ${formData.industryType || 'Unknown'}
          Paper Size: ${formData.type || 'A4'}
          Speed Required: ${formData.min_speed || 'Any'} PPM
          Color: ${formData.colour || 'Unknown'}
          
          Please provide 3 specific model recommendations with brief explanations.`
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    
    // Parse the response into an array of suggestions
    const suggestionText = suggestions.choices[0].message.content;
    const suggestionArray = suggestionText.split('\n').filter(line => line.trim());
    
    res.json({ 
      suggestions: suggestionArray
    });
    
  } catch (error) {
    console.error('AI suggestion error:', error);
    res.status(500).json({ 
      error: 'AI suggestion failed',
      suggestions: [] 
    });
  }
};
