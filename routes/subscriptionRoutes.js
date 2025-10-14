const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { injectTenantContext } = require('../middleware/tenant');
const User = require('../models/User');
const Expense = require('../models/Expense');

// Get current usage stats
router.get('/usage', protect, injectTenantContext, async (req, res) => {
  try {
    const tenant = req.tenant;
    
    if (!tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    const currentUsers = await User.countDocuments({ 
      tenantId: tenant._id, 
      isActive: true 
    });
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const currentExpenses = await Expense.countDocuments({
      tenantId: tenant._id,
      createdAt: { $gte: thisMonth }
    });
    
    const storageUsed = tenant.usage?.storageUsed || 0;
    
    res.json({
      success: true,
      data: {
        users: {
          current: currentUsers,
          limit: tenant.settings.maxUsers,
          percentage: tenant.settings.maxUsers === -1 ? 0 : 
            Math.round((currentUsers / tenant.settings.maxUsers) * 100)
        },
        expenses: {
          current: currentExpenses,
          limit: tenant.settings.maxExpenses,
          percentage: tenant.settings.maxExpenses === -1 ? 0 : 
            Math.round((currentExpenses / tenant.settings.maxExpenses) * 100)
        },
        storage: {
          current: storageUsed,
          limit: tenant.settings.storageLimit,
          percentage: tenant.settings.storageLimit === -1 ? 0 : 
            Math.round((storageUsed / tenant.settings.storageLimit) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching usage statistics'
    });
  }
});

// Get subscription plans
router.get('/plans', async (req, res) => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      limits: { maxUsers: 5, maxExpenses: 100, storageLimit: 1024 },
      features: ['file_uploads']
    },
    {
      id: 'basic',
      name: 'Basic',
      price: 29,
      limits: { maxUsers: 25, maxExpenses: 1000, storageLimit: 10240 },
      features: ['file_uploads', 'custom_categories', 'advanced_analytics']
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 79,
      limits: { maxUsers: 100, maxExpenses: -1, storageLimit: 51200 },
      features: ['file_uploads', 'custom_categories', 'advanced_analytics', 'api_access', 'custom_branding']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 199,
      limits: { maxUsers: -1, maxExpenses: -1, storageLimit: 204800 },
      features: ['file_uploads', 'custom_categories', 'advanced_analytics', 'api_access', 'custom_branding', 'priority_support', 'sso']
    }
  ];
  
  res.json({
    success: true,
    data: plans
  });
});

// Upgrade tenant plan
router.post('/upgrade', protect, injectTenantContext, async (req, res) => {
  try {
    const { planId } = req.body;
    const tenant = req.tenant;
    
    if (!tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }
    
    const planConfigs = {
      free: { maxUsers: 5, maxExpenses: 100, storageLimit: 1024, features: ['file_uploads'] },
      basic: { maxUsers: 25, maxExpenses: 1000, storageLimit: 10240, features: ['file_uploads', 'custom_categories'] },
      premium: { maxUsers: 100, maxExpenses: -1, storageLimit: 51200, features: ['file_uploads', 'custom_categories', 'advanced_analytics', 'api_access'] },
      enterprise: { maxUsers: -1, maxExpenses: -1, storageLimit: 204800, features: ['file_uploads', 'custom_categories', 'advanced_analytics', 'api_access', 'priority_support'] }
    };
    
    const config = planConfigs[planId];
    if (!config) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }
    
    tenant.plan = planId;
    tenant.settings.maxUsers = config.maxUsers;
    tenant.settings.maxExpenses = config.maxExpenses;
    tenant.settings.storageLimit = config.storageLimit;
    tenant.settings.features = config.features;
    
    await tenant.save();
    
    res.json({
      success: true,
      message: `Successfully upgraded to ${planId} plan`,
      data: {
        plan: tenant.plan,
        limits: {
          maxUsers: tenant.settings.maxUsers,
          maxExpenses: tenant.settings.maxExpenses,
          storageLimit: tenant.settings.storageLimit
        },
        features: tenant.settings.features
      }
    });
  } catch (error) {
    console.error('Error upgrading plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error upgrading plan'
    });
  }
});

module.exports = router;