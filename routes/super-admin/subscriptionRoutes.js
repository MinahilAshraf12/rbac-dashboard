// routes/super-admin/subscriptionRoutes.js
const express = require('express');
const router = express.Router();
const {
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionStats,
  migrateTenantPlan,
  bulkUpdatePlans
} = require('../../controllers/super-admin/subscriptionController');
const { 
  protectSuperAdmin,
  checkSuperAdminPermission,
  logSuperAdminActivity
} = require('../../middleware/superAdmin');

// Apply super admin protection to all routes
router.use(protectSuperAdmin);

// Subscription plan CRUD routes
router
  .route('/plans')
  .get(checkSuperAdminPermission('manage_plans'), getSubscriptionPlans)
  .post(checkSuperAdminPermission('manage_plans'), logSuperAdminActivity('create_plan'), createSubscriptionPlan);

router
  .route('/plans/:id')
  .get(checkSuperAdminPermission('manage_plans'), getSubscriptionPlan)
  .put(checkSuperAdminPermission('manage_plans'), logSuperAdminActivity('update_plan'), updateSubscriptionPlan)
  .delete(checkSuperAdminPermission('manage_plans'), logSuperAdminActivity('delete_plan'), deleteSubscriptionPlan);

// Subscription analytics and management
router.get('/stats', 
  checkSuperAdminPermission('view_analytics'), 
  getSubscriptionStats
);

router.put('/migrate-tenant/:tenantId', 
  checkSuperAdminPermission('manage_subscriptions'), 
  logSuperAdminActivity('migrate_tenant_plan'), 
  migrateTenantPlan
);

router.put('/bulk-update', 
  checkSuperAdminPermission('manage_plans'), 
  logSuperAdminActivity('bulk_update_plans'), 
  bulkUpdatePlans
);

module.exports = router;