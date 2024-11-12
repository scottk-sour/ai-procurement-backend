const express = require('express');
const router = express.Router();

// Sample route to test if the vendor route is working
router.get('/', (req, res) => {
    res.json({ message: 'Vendor route is working!' });
});

// Add more vendor routes here as needed, e.g., for creating, updating, and deleting vendors

// Export the router to use in the main app
module.exports = router;
