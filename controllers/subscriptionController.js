// controllers/subscriptionController.js
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Expense = require('../models/Expense');

// @desc    Get subscription usage
// @route   GET /api/subscription/usage
// @access  Private
const getUsage = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get real counts from database
    const [userCount, expenseCount] = await Promise.all([
      User.countDocuments({ tenantId, isActive: true }),
      Expense.countDocuments({ tenantId })
    ]);

    // Update tenant usage
    tenant.usage.currentUsers = userCount;
    tenant.usage.currentExpenses = expenseCount;
    await tenant.save();

    res.status(200).json({
      success: true,
      data: {
        users: {
          current: userCount,
          limit: tenant.settings.maxUsers,
          percentage: tenant.settings.maxUsers === -1 ? 0 : Math.round((userCount / tenant.settings.maxUsers) * 100)
        },
        expenses: {
          current: expenseCount,
          limit: tenant.settings.maxExpenses,
          percentage: tenant.settings.maxExpenses === -1 ? 0 : Math.round((expenseCount / tenant.settings.maxExpenses) * 100)
        },
        storage: {
          current: tenant.usage.storageUsed || 0,
          limit: tenant.settings.storageLimit,
          percentage: Math.round((tenant.usage.storageUsed / tenant.settings.storageLimit) * 100)
        }
      }
    });

  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Check if can add resource
// @route   GET /api/subscription/check/:resource
// @access  Private
const checkLimit = async (req, res) => {
  try {
    const { resource } = req.params; // 'user', 'expense', 'storage'
    const tenantId = req.user.tenantId;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    let canAdd = true;
    let message = '';

    if (resource === 'user') {
      const userCount = await User.countDocuments({ tenantId, isActive: true });
      if (tenant.settings.maxUsers !== -1 && userCount >= tenant.settings.maxUsers) {
        canAdd = false;
        message = `You have reached your user limit (${tenant.settings.maxUsers}). Please upgrade your plan.`;
      }
    } else if (resource === 'expense') {
      const expenseCount = await Expense.countDocuments({ tenantId });
      if (tenant.settings.maxExpenses !== -1 && expenseCount >= tenant.settings.maxExpenses) {
        canAdd = false;
        message = `You have reached your expense limit (${tenant.settings.maxExpenses}). Please upgrade your plan.`;
      }
    }

    res.status(200).json({
      success: true,
      canAdd,
      message
    });

  } catch (error) {
    console.error('Check limit error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getUsage,
  checkLimit
};