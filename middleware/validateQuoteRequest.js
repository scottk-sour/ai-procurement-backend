const validateQuoteRequest = (req, res, next) => {
    try {
      const { userRequirements } = req.body;
  
      // ✅ Check if userRequirements exists and is an object
      if (!userRequirements || typeof userRequirements !== 'object') {
        console.error("❌ ERROR: Missing or invalid userRequirements.");
        return res.status(400).json({ error: "Invalid or missing userRequirements object." });
      }
  
      // ✅ Ensure all required fields are set with sensible defaults
      req.validatedUserRequirements = {
        product: userRequirements.product?.trim() || "Generic Product",
        quantity: Number(userRequirements.quantity) > 0 ? Number(userRequirements.quantity) : 1,
        colour: userRequirements.colour?.trim() || "Monochrome",
        min_speed: Number(userRequirements.min_speed) > 0 ? Number(userRequirements.min_speed) : 20,
        max_lease_price: Number(userRequirements.max_lease_price) > 0 ? Number(userRequirements.max_lease_price) : 500,
        required_functions: Array.isArray(userRequirements.required_functions) && userRequirements.required_functions.length
          ? userRequirements.required_functions.map(func => func.trim())
          : ["Print"],
      };
  
      console.log("✅ Validated userRequirements:", req.validatedUserRequirements);
  
      next(); // ✅ Proceed to the next middleware
    } catch (error) {
      console.error("❌ ERROR in validateQuoteRequest middleware:", error.message);
      res.status(500).json({ error: "Internal server error during validation." });
    }
  };
  
  export default validateQuoteRequest;
  