// routes/tenantRoutes.js
const express = require('express');
const router = express.Router();
const {
  getTenantProfile,
  updateTenantSettings,
  getTenantDashboardStats,
  getSubscriptionInfo,
  requestPlanUpgrade,
  setupCustomDomain,
  verifyCustomDomain,
  getTenantUsers,
  inviteUser,
  getTenantActivities,
  exportTenantData
} = require('../controllers/tenantController');
const { protect, hasPermission } = require('../middleware/auth');
const { 
  requireTenant, 
  checkSubscriptionLimit,
  requireFeature,
  logTenantActivity
} = require('../middleware/tenant');

// Apply protection middleware to all routes
router.use(protect);
router.use(requireTenant); // Ensure tenant context

// Tenant profile and settings
router.get('/profile', getTenantProfile);
router.put('/settings', 
  hasPermission('settings', 'manage'), 
  logTenantActivity('update_settings'),
  updateTenantSettings
);

// Dashboard and analytics
router.get('/dashboard-stats', getTenantDashboardStats);

// Subscription management
router.get('/subscription', getSubscriptionInfo);
router.post('/upgrade-request', 
  logTenantActivity('request_upgrade'),
  requestPlanUpgrade
);

// Domain management
router.post('/custom-domain', 
  requireFeature('custom_domain'),
  logTenantActivity('setup_domain'),
  setupCustomDomain
);
router.post('/verify-domain', 
  requireFeature('custom_domain'),
  logTenantActivity('verify_domain'),
  verifyCustomDomain
);

// User management
router.get('/users', getTenantUsers);
router.post('/invite-user', 
  checkSubscriptionLimit('users'),
  logTenantActivity('invite_user'),
  inviteUser
);

// Activity tracking
router.get('/activities', getTenantActivities);

// Data export
router.get('/export', 
  requireFeature('data_export'),
  logTenantActivity('export_data'),
  exportTenantData
);

module.exports = router;

