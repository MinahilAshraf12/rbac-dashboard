// routes/super-admin/tenantRoutes.js
const express = require('express');
const router = express.Router();
const {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  suspendTenant,
  reactivateTenant,
  deleteTenant,
  getTenantUsage,
  getTenantActivities,
  verifyCustomDomain
} = require('../../controllers/super-admin/tenantController');
const { 
  protectSuperAdmin,
  checkSuperAdminPermission,
  logSuperAdminActivity
} = require('../../middleware/superAdmin');

// Apply super admin protection to all routes
router.use(protectSuperAdmin);

// Routes with specific permissions
router
  .route('/')
  .get(checkSuperAdminPermission('manage_tenants'), getTenants)
  .post(checkSuperAdminPermission('manage_tenants'), logSuperAdminActivity('create_tenant'), createTenant);

router
  .route('/:id')
  .get(checkSuperAdminPermission('manage_tenants'), getTenant)
  .put(checkSuperAdminPermission('manage_tenants'), logSuperAdminActivity('update_tenant'), updateTenant)
  .delete(checkSuperAdminPermission('manage_tenants'), logSuperAdminActivity('delete_tenant'), deleteTenant);

// Tenant management actions
router.put('/:id/suspend', 
  checkSuperAdminPermission('manage_tenants'), 
  logSuperAdminActivity('suspend_tenant'), 
  suspendTenant
);

router.put('/:id/reactivate', 
  checkSuperAdminPermission('manage_tenants'), 
  logSuperAdminActivity('reactivate_tenant'), 
  reactivateTenant
);

// Tenant information routes
router.get('/:id/usage', 
  checkSuperAdminPermission('view_analytics'), 
  getTenantUsage
);

router.get('/:id/activities', 
  checkSuperAdminPermission('view_analytics'), 
  getTenantActivities
);

// Domain management
router.put('/:id/verify-domain', 
  checkSuperAdminPermission('manage_domains'), 
  logSuperAdminActivity('verify_domain'), 
  verifyCustomDomain
);

module.exports = router;