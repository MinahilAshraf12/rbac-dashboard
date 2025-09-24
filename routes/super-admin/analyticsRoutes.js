// routes/super-admin/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const {
  getDashboardAnalytics,
  getSystemAnalytics,
  getTenantAnalytics,
  getRevenueAnalytics,
  getEngagementAnalytics,
  exportAnalytics
} = require('../../controllers/super-admin/analyticsController');
const { 
  protectSuperAdmin,
  checkSuperAdminPermission
} = require('../../middleware/superAdmin');

// Apply super admin protection to all routes
router.use(protectSuperAdmin);
router.use(checkSuperAdminPermission('view_analytics'));

// Analytics routes
router.get('/dashboard', getDashboardAnalytics);
router.get('/system', getSystemAnalytics);
router.get('/tenants', getTenantAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/engagement', getEngagementAnalytics);
router.get('/export', exportAnalytics);

module.exports = router;