// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { login, logout } = require('../controllers/authController');
const { getMe } = require('../controllers/tenantAuthController');
const { protect } = require('../middleware/auth');

// Login route (uses authController)
router.post('/login', login);

// Get current user (uses tenantAuthController)
router.get('/me', protect, getMe);

// Logout route (uses authController)
router.get('/logout', logout);

module.exports = router;