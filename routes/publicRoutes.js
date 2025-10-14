// routes/publicRoutes.js
const express = require('express');
const router = express.Router();

// Import tenant auth controller
const {
  signup,
  login,
  checkSlug,
  getTenantBySlug
} = require('../controllers/tenantAuthController');

// Public authentication routes
router.post('/signup', signup);
router.post('/login', login);
router.get('/check-slug/:slug', checkSlug);
router.get('/tenant/:slug', getTenantBySlug);

// Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    const SubscriptionPlan = require('../models/SubscriptionPlan');
    const plans = await SubscriptionPlan.getActivePlans();
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching plans'
    });
  }
});

module.exports = router;