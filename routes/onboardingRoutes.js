// routes/onboardingRoutes.js
const express = require('express');
const router = express.Router();
const {
  acceptInvite,
  completeOnboarding,
  checkInviteCode,
  setupTenantAccount
} = require('../controllers/onboardingController');

// Public routes (no auth required)
router.get('/check-invite/:code', checkInviteCode);
router.post('/accept-invite', acceptInvite);
router.post('/setup-account', setupTenantAccount);
router.post('/complete-onboarding', completeOnboarding);

module.exports = router;