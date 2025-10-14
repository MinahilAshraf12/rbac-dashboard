// routes/super-admin/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { protectSuperAdmin } = require('../../middleware/superAdmin');
const {
  getDashboardAnalytics,
  getSystemAnalytics,
  getTenantAnalytics,
  getRevenueAnalytics,
  getEngagementAnalytics,
  exportAnalytics
} = require('../../controllers/super-admin/analyticsController');

router.use(protectSuperAdmin);

router.get('/dashboard', getDashboardAnalytics);
router.get('/system', getSystemAnalytics);
router.get('/tenants', getTenantAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/engagement', getEngagementAnalytics);
router.get('/export', exportAnalytics);

module.exports = router;