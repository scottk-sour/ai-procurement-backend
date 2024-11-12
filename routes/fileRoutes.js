const express = require('express');
const router = express.Router();

// Example route for files
router.get('/', (req, res) => {
    res.json({ message: 'File route is working!' });
});

module.exports = router;
