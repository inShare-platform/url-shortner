const express = require('express');
const router = express.Router();
const { shortenUrl, redirectUrl, getStats } = require('../controllers/urlController');

// API routes
router.post('/api/shorten', shortenUrl);
router.get('/api/stats/:shortCode', getStats);

// Redirect route (must be last to avoid conflicts)
router.get('/:shortCode', redirectUrl);

module.exports = router;
