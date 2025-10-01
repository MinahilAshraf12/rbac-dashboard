// middleware/subscription.js - New subscription limits middleware
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Expense = require('../models/Expense');

// Check if tenant can perform action based on subscription limits
const checkSubscriptionLimits = (actionType) => {
  return async (req, res, next) => {
    try {
      if (!req.tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required'
        });
      }

      const tenant = req.tenant;
      
      switch (actionType) {
        case 'users':
          const currentUsers = await User.countDocuments({ 
            tenantId: tenant._id, 
            isActive: true 
          });
          
          if (tenant.settings.maxUsers !== -1 && currentUsers >= tenant.settings.maxUsers) {
            return res.status(403).json({
              success: false,
              message: 'User limit reached for current plan',
              code: 'USER_LIMIT_EXCEEDED',
              data: {
                current: currentUsers,
                limit: tenant.settings.maxUsers,
                plan: tenant.plan
              }
            });
          }
          break;

        case 'expenses':
          // Check monthly expense limit
          const thisMonth = new Date();
          thisMonth.setDate(1);
          thisMonth.setHours(0, 0, 0, 0);
          
          const monthlyExpenses = await Expense.countDocuments({
            tenantId: tenant._id,
            createdAt: { $gte: thisMonth }
          });
          
          if (tenant.settings.maxExpenses !== -1 && monthlyExpenses >= tenant.settings.maxExpenses) {
            return res.status(403).json({
              success: false,
              message: 'Monthly expense limit reached for current plan',
              code: 'EXPENSE_LIMIT_EXCEEDED',
              data: {
                current: monthlyExpenses,
                limit: tenant.settings.maxExpenses,
                plan: tenant.plan,
                resetDate: new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1)
              }
            });
          }
          break;

        case 'storage':
          const additionalStorage = req.files ? 
            req.files.reduce((total, file) => total + file.size, 0) / (1024 * 1024) : 0;
            
          if (tenant.settings.storageLimit !== -1 && 
              (tenant.usage.storageUsed + additionalStorage) > tenant.settings.storageLimit) {
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

        case 'api_calls':
          // Check API call limits (implement rate limiting)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // This would require a separate API call tracking collection
          // For now, we'll skip this implementation
          break;

        default:
          console.warn(`Unknown subscription limit type: ${actionType}`);
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

// Check if tenant has access to specific feature
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

// Check trial status
const checkTrialStatus = (req, res, next) => {
  if (!req.tenant) {
    return next();
  }

  if (req.tenant.status === 'trial' && req.tenant.isTrialExpired) {
    return res.status(402).json({
      success: false,
      message: 'Trial period has expired. Please upgrade your plan.',
      code: 'TRIAL_EXPIRED',
      data: {
        trialEndDate: req.tenant.trialEndDate,
        daysExpired: Math.ceil((new Date() - req.tenant.trialEndDate) / (1000 * 60 * 60 * 24)),
        upgradeUrl: `/upgrade?plan=basic`
      }
    });
  }

  next();
};

// Rate limiting per tenant
const tenantRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    skipSuccessfulRequests = false
  } = options;

  // In-memory store (use Redis in production)
  const requestCounts = new Map();

  return (req, res, next) => {
    if (!req.tenant) {
      return next();
    }

    const key = `${req.tenant._id}_${Math.floor(Date.now() / windowMs)}`;
    const current = requestCounts.get(key) || 0;

    if (current >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        data: {
          limit: maxRequests,
          windowMs,
          retryAfter: windowMs - (Date.now() % windowMs)
        }
      });
    }

    requestCounts.set(key, current + 1);

    // Clean up old entries
    const currentWindow = Math.floor(Date.now() / windowMs);
    for (const [storedKey] of requestCounts.entries()) {
      const [, window] = storedKey.split('_');
      if (parseInt(window) < currentWindow - 1) {
        requestCounts.delete(storedKey);
      }
    }

    next();
  };
};

module.exports = {
  checkSubscriptionLimits,
  requireFeature,
  checkTrialStatus,
  tenantRateLimit
};