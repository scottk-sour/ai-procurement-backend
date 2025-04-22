// controllers/aiController.js
export const suggestCopiers = async (req, res) => {
  try {
    const input = req.body;

    // For now, return mock machine suggestions
    const suggestions = [
      "Ricoh IM 550F",
      "Konica Minolta bizhub 4750i",
      "Canon iR-ADV DX 4725i"
    ];

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error("❌ Error in suggestCopiers:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
