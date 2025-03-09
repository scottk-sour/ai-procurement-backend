// /controllers/aiController.js

// Named export for your AI logic
export const getRecommendations = async (req, res) => {
    try {
      console.log('Received AI request:', req.body);
  
      // Dummy AI logic (replace with actual model/integration)
      const recommendations = [
        { vendor: 'Advanced Copiers', price: 450, speed: 30 },
        { vendor: 'EcoPrint',         price: 470, speed: 28 },
        { vendor: 'OfficePrint',      price: 500, speed: 35 }
      ];
  
      res.status(200).json({ recommendations });
    } catch (error) {
      console.error('AI Recommendations Error:', error);
      res.status(500).json({ error: 'Failed to generate AI recommendations' });
    }
  };
  