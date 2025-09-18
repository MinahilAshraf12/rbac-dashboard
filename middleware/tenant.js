const Tenant = require('../models/Tenant');
const SuperAdmin = require('../models/SuperAdmin');

// Middleware to identify tenant from domain/subdomain
const identifyTenant = async (req, res, next) => {
  try {
    const hostname = req.get('host');
    let tenant = null;
    
    // Skip tenant identification for super admin routes
    if (hostname === 'admin.i-expense.ikftech.com' || req.path.startsWith('/api/super-admin')) {
      req.tenant = null;
      req.isSuperAdmin = true;
      return next();
    }
    
    // Skip for public routes and health checks
    const publicRoutes = ['/api/health', '/api/seed', '/api/public'];
    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    
    if (isPublicRoute) {
      return next();
    }
    
    // Main domain - landing page
    if (hostname === 'i-expense.ikftech.com' && req.path.startsWith('/api/public')) {
      return next();
    }
    
    // Extract tenant from subdomain or custom domain
    if (hostname.includes('i-expense.ikftech.com')) {
      const subdomain = hostname.split('.')[0];
      
      // Skip www and admin subdomains
      if (subdomain !== 'www' && subdomain !== 'admin' && subdomain !== 'i-expense') {
        tenant = await Tenant.findOne({ 
          slug: subdomain, 
          isActive: true 
        }).populate('owner', 'name email');
      }
    } else {
      // Check for custom domain
      tenant = await Tenant.findOne({ 
        customDomain: hostname, 
        domainVerified: true,
        isActive: true 
      }).populate('owner', 'name email');
    }
    
    // If no tenant found and not a public route, return 404
    if (!tenant && !isPublicRoute) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
        code: 'TENANT_NOT_FOUND'
      });
    }
    
    // Check if tenant is active
    if (tenant && tenant.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Organization account is suspended',
        code: 'TENANT_SUSPENDED'
      });
    }
    
    // Check if trial has expired
    if (tenant && tenant.status === 'trial' && tenant.isTrialExpired) {
      return res.status(402).json({
        success: false,
        message: 'Trial period has expired. Please upgrade your subscription.',
        code: 'TRIAL_EXPIRED',
        data: {
          trialEndDate: tenant.trialEndDate,
          upgradeUrl: `/upgrade?tenant=${tenant.slug}`
        }
      });
    }
    
    req.tenant = tenant;
    req.isSuperAdmin = false;
    next();
    
  } catch (error) {
    console.error('Tenant identification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during tenant identification'
    });
  }
};

// Middleware to require tenant context
const requireTenant = (req, res, next) => {
  if (!req.tenant) {
    return res.status(400).json({
      success: false,
      message: 'Tenant context required',
      code: 'TENANT_REQUIRED'
    });
  }
  next();
};

// Middleware to check subscription limits
const checkSubscriptionLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      if (!req.tenant) return next();
      
      const tenant = req.tenant;
      
      switch (limitType) {
        case 'users':
          if (!tenant.canAddUser()) {
            return res.status(403).json({
              success: false,
              message: 'User limit reached for current plan',
              code: 'USER_LIMIT_EXCEEDED',
              data: {
                current: tenant.usage.currentUsers,
                limit: tenant.settings.maxUsers,
                plan: tenant.plan
              }
            });
          }
          break;
          
        case 'expenses':
          if (!tenant.canAddExpense()) {
            return res.status(403).json({
              success: false,
              message: 'Expense limit reached for current plan',
              code: 'EXPENSE_LIMIT_EXCEEDED',
              data: {
                current: tenant.usage.currentExpenses,
                limit: tenant.settings.maxExpenses,
                plan: tenant.plan
              }
            });
          }
          break;
          
        case 'storage':
          const additionalStorage = req.files ? 
            req.files.reduce((total, file) => total + file.size, 0) / (1024 * 1024) : 0;
            
          if (!tenant.hasStorageSpace(additionalStorage)) {
            return res.status(413).json({
              success: false,
              message: 'Storage limit exceeded',
              code: 'STORAGE_LIMIT_EXCEEDED',
              data: {
                current: tenant.usage.storageUsed,
                additional: Math.round(additionalStorage),
                limit: tenant.settings.storageLimit,
                plan: tenant.plan
              }
            });
          }
          break;
          
        default:
          console.warn(`Unknown limit type: ${limitType}`);
      }
      
      next();
    } catch (error) {
      console.error('Subscription limit check error:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking subscription limits'
      });
    }
  };
};

// Middleware to check feature availability
const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    if (!req.tenant.hasFeature(featureName)) {
      return res.status(403).json({
        success: false,
        message: `Feature "${featureName}" not available in current plan`,
        code: 'FEATURE_NOT_AVAILABLE',
        data: {
          feature: featureName,
          plan: req.tenant.plan,
          availableFeatures: req.tenant.settings.features
        }
      });
    }
    
    next();
  };
};

// Middleware for super admin only routes
const requireSuperAdmin = async (req, res, next) => {
  try {
    // Check if this is a super admin route
    if (!req.isSuperAdmin && !req.path.startsWith('/api/super-admin')) {
      return res.status(403).json({
        success: false,
        message: 'Super admin access required'
      });
    }
    
    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during super admin verification'
    });
  }
};

// Middleware to inject tenant context into queries
const injectTenantContext = (req, res, next) => {
  if (req.tenant) {
    // Add tenant filter to query parameters
    req.tenantFilter = { tenantId: req.tenant._id };
    
    // Store original query methods
    const originalFind = req.query.find;
    const originalFindOne = req.query.findOne;
    
    // Override query to always include tenant filter
    req.addTenantFilter = (query = {}) => {
      return { ...query, tenantId: req.tenant._id };
    };
  }
  
  next();
};

// Middleware to validate tenant ownership of resource
const validateTenantOwnership = (Model, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required'
        });
      }
      
      const resourceId = req.params[paramName];
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      if (resource.tenantId.toString() !== req.tenant._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this resource',
          code: 'TENANT_RESOURCE_ACCESS_DENIED'
        });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Tenant ownership validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during resource validation'
      });
    }
  };
};

// Middleware to log tenant activity
const logTenantActivity = (activityType) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 400) {
        // Log activity asynchronously
        setImmediate(async () => {
          try {
            const ActivityService = require('../services/activityService');
            await ActivityService.logActivity({
              type: activityType,
              tenantId: req.tenant?._id,
              performedBy: req.user?._id || req.user?.id,
              metadata: {
                method: req.method,
                path: req.path,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
              }
            });
          } catch (error) {
            console.error('Activity logging error:', error);
          }
        });
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  identifyTenant,
  requireTenant,
  checkSubscriptionLimit,
  requireFeature,
  requireSuperAdmin,
  injectTenantContext,
  validateTenantOwnership,
  logTenantActivity
};