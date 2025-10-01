// routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const {
  getPublicPlans,
  registerTenant,
  checkDomainAvailability,
  getPublicTenantInfo
} = require('../controllers/publicController');

// Public subscription plans
router.get('/plans', getPublicPlans);

// Tenant registration
router.post('/register', registerTenant);

// Domain availability check
router.get('/check-domain/:slug', checkDomainAvailability);

// Get public tenant information (for login page branding)
router.get('/tenant/:slug', getPublicTenantInfo);

module.exports = router;