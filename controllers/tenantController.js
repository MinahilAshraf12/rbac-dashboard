// controllers/tenantController.js - New tenant-facing controller
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const Expense = require('../models/Expense');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const TenantService = require('../services/tenantService');
const ActivityService = require('../services/activityService');

// @desc    Get current tenant profile
// @route   GET /api/tenant/profile
// @access  Private (Tenant Admin)
const getTenantProfile = async (req, res) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    const tenant = await Tenant.findById(req.tenant._id)
      .populate('owner', 'name email')
      .populate('plan');

    // Get usage statistics
    const usage = await TenantService.getTenantUsage(req.tenant._id);

    const response = {
      ...tenant.toObject(),
      usage,
      trialInfo: {
        isTrialExpired: tenant.isTrialExpired,
        daysLeft: tenant.trialEndDate ? 
          Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / (1000 * 60 * 60 * 24))) : 0
      }
    };

    res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Get tenant profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update tenant settings
// @route   PUT /api/tenant/settings
// @access  Private (Tenant Admin)
const updateTenantSettings = async (req, res) => {
  try {
    // Check if user is tenant admin
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can update settings'
      });
    }

    const {
      name,
      settings,
      billing,
      metadata
    } = req.body;

    const tenant = await TenantService.updateTenantSettings(
      req.tenant._id,
      { name, settings, billing, metadata },
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: tenant
    });
  } catch (error) {
    console.error('Update tenant settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server Error'
    });
  }
};

// @desc    Get tenant dashboard statistics
// @route   GET /api/tenant/dashboard-stats
// @access  Private
const getTenantDashboardStats = async (req, res) => {
  try {
    const stats = await TenantService.getTenantDashboardStats(req.tenant._id);
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get tenant dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server Error'
    });
  }
};

// @desc    Get subscription information
// @route   GET /api/tenant/subscription
// @access  Private (Tenant Admin)
const getSubscriptionInfo = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can view subscription information'
      });
    }

    const tenant = await Tenant.findById(req.tenant._id);
    const plan = await SubscriptionPlan.findOne({ slug: tenant.plan });

    const usage = await TenantService.getTenantUsage(req.tenant._id);

    res.status(200).json({
      success: true,
      data: {
        currentPlan: {
          ...plan.toObject(),
          isActive: tenant.status === 'active' || tenant.status === 'trial'
        },
        subscription: tenant.subscription,
        usage,
        billing: tenant.billing,
        trialInfo: {
          isTrialExpired: tenant.isTrialExpired,
          daysLeft: tenant.trialEndDate ? 
            Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / (1000 * 60 * 60 * 24))) : 0
        }
      }
    });
  } catch (error) {
    console.error('Get subscription info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Request plan upgrade
// @route   POST /api/tenant/upgrade-request
// @access  Private (Tenant Admin)
const requestPlanUpgrade = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can request plan upgrades'
      });
    }

    const { requestedPlan, reason } = req.body;

    if (!requestedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Requested plan is required'
      });
    }

    // Verify requested plan exists
    const plan = await SubscriptionPlan.findOne({ slug: requestedPlan, isActive: true });
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan requested'
      });
    }

    // Log activity for upgrade request
    await ActivityService.logActivity({
      type: 'subscription_upgrade_requested',
      entityId: req.tenant._id,
      entityType: 'Tenant',
      entityName: req.tenant.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      newData: {
        requestedPlan,
        currentPlan: req.tenant.plan,
        reason
      },
      metadata: {
        requestedAt: new Date(),
        requestedBy: req.user.name
      }
    });

    res.status(200).json({
      success: true,
      message: 'Upgrade request submitted successfully. Our team will contact you shortly.',
      data: {
        requestedPlan: plan.name,
        currentPlan: req.tenant.plan,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Request plan upgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Setup custom domain
// @route   POST /api/tenant/custom-domain
// @access  Private (Tenant Admin)
const setupCustomDomain = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can setup custom domains'
      });
    }

    // Check if tenant has custom domain feature
    if (!req.tenant.hasFeature('custom_domain')) {
      return res.status(403).json({
        success: false,
        message: 'Custom domain feature not available in current plan',
        code: 'FEATURE_NOT_AVAILABLE'
      });
    }

    const { customDomain } = req.body;

    if (!customDomain) {
      return res.status(400).json({
        success: false,
        message: 'Custom domain is required'
      });
    }

    const tenant = await TenantService.setupCustomDomain(
      req.tenant._id,
      customDomain,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'Custom domain configured successfully. Please add the following DNS records:',
      data: {
        domain: customDomain,
        dnsRecords: [
          {
            type: 'CNAME',
            name: '@',
            value: 'i-expense.ikftech.com'
          },
          {
            type: 'TXT',
            name: '_verification',
            value: `verify-${req.tenant._id}`
          }
        ],
        verificationRequired: true
      }
    });
  } catch (error) {
    console.error('Setup custom domain error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server Error'
    });
  }
};

// @desc    Verify custom domain
// @route   POST /api/tenant/verify-domain
// @access  Private (Tenant Admin)
const verifyCustomDomain = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can verify domains'
      });
    }

    if (!req.tenant.customDomain) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured'
      });
    }

    // In a real implementation, you would verify DNS records here
    // For now, we'll simulate verification
    const tenant = await Tenant.findById(req.tenant._id);
    tenant.domainVerified = true;
    await tenant.save();

    // Log activity
    await ActivityService.logActivity({
      type: 'custom_domain_verified',
      entityId: tenant._id,
      entityType: 'Tenant',
      entityName: tenant.name,
      tenantId: tenant._id,
      performedBy: req.user.id,
      newData: {
        customDomain: tenant.customDomain,
        verified: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'Domain verified successfully',
      data: {
        domain: tenant.customDomain,
        verified: true,
        url: `https://${tenant.customDomain}`
      }
    });
  } catch (error) {
    console.error('Verify domain error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant users with enhanced info
// @route   GET /api/tenant/users
// @access  Private (Tenant Admin/Manager)
const getTenantUsers = async (req, res) => {
  try {
    if (!req.user.canManageUsers()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to view users'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    const query = { tenantId: req.tenant._id };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.tenantRole = role;
    if (status !== '') query.isActive = status === 'active';

    const users = await User.find(query)
      .populate('role')
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // Add usage statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const expenseCount = await Expense.countDocuments({
          tenantId: req.tenant._id,
          createdBy: user._id
        });

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const monthlyExpenses = await Expense.countDocuments({
          tenantId: req.tenant._id,
          createdBy: user._id,
          createdAt: { $gte: thisMonth }
        });

        return {
          ...user.toObject(),
          stats: {
            totalExpenses: expenseCount,
            monthlyExpenses,
            lastActivity: user.lastLogin || user.createdAt
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      count: usersWithStats.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: usersWithStats
    });
  } catch (error) {
    console.error('Get tenant users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Invite user to tenant
// @route   POST /api/tenant/invite-user
// @access  Private (Tenant Admin)
const inviteUser = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can invite users'
      });
    }

    const { email, name, roleId, tenantRole = 'user' } = req.body;

    if (!email || !name || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and role are required'
      });
    }

    // Check if tenant can add more users
    if (!req.tenant.canAddUser()) {
      return res.status(403).json({
        success: false,
        message: 'User limit reached for current plan',
        code: 'USER_LIMIT_EXCEEDED',
        data: {
          current: req.tenant.usage.currentUsers,
          limit: req.tenant.settings.maxUsers,
          plan: req.tenant.plan
        }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(),
      tenantId: req.tenant._id 
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists in this organization'
      });
    }

    // Verify role exists and belongs to tenant
    const role = await Role.findOne({ _id: roleId, tenantId: req.tenant._id });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected'
      });
    }

    // Generate temporary password for invite
    const tempPassword = Math.random().toString(36).substring(2, 15);

    // Create user with invited status
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: tempPassword,
      tenantId: req.tenant._id,
      tenantRole,
      role: roleId,
      invitedBy: req.user.id,
      invitedAt: new Date(),
      isActive: false // Will be activated when they accept invite
    });

    // Log activity
    await ActivityService.logActivity({
      type: 'user_invited',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      newData: {
        email: user.email,
        name: user.name,
        role: role.name,
        tenantRole
      }
    });

    // In a real app, send invitation email here
    // await sendInvitationEmail(user, req.tenant, tempPassword);

    res.status(201).json({
      success: true,
      message: 'User invitation sent successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: role.name,
        tenantRole: user.tenantRole,
        inviteCode: Buffer.from(`${user._id}:${tempPassword}`).toString('base64'),
        inviteUrl: `https://${req.tenant.fullDomain}/accept-invite?code=${Buffer.from(`${user._id}:${tempPassword}`).toString('base64')}`
      }
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant activities with enhanced filtering
// @route   GET /api/tenant/activities
// @access  Private
const getTenantActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type || '';
    const entityType = req.query.entityType || '';
    const performedBy = req.query.performedBy || '';
    const dateRange = req.query.dateRange || '';

    let options = {
      limit: limit * page,
      sort: { createdAt: -1 }
    };

    if (type) options.type = type;
    if (entityType) options.entityType = entityType;
    if (performedBy) options.performedBy = performedBy;

    if (dateRange) {
      const [startDate, endDate] = dateRange.split(',');
      if (startDate && endDate) {
        options.dateRange = {
          start: new Date(startDate),
          end: new Date(endDate)
        };
      }
    }

    const activities = await ActivityService.getRecentActivitiesByTenant(
      req.tenant._id,
      limit * page,
      options
    );

    const paginatedActivities = activities.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      success: true,
      data: paginatedActivities,
      pagination: {
        page,
        limit,
        total: activities.length,
        pages: Math.ceil(activities.length / limit),
        hasNext: page < Math.ceil(activities.length / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get tenant activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Export tenant data
// @route   GET /api/tenant/export
// @access  Private (Tenant Admin)
const exportTenantData = async (req, res) => {
  try {
    if (req.user.tenantRole !== 'tenant_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only tenant administrators can export data'
      });
    }

    // Check if tenant has data export feature
    if (!req.tenant.hasFeature('data_export')) {
      return res.status(403).json({
        success: false,
        message: 'Data export feature not available in current plan',
        code: 'FEATURE_NOT_AVAILABLE'
      });
    }

    const { type = 'all', format = 'json', dateRange } = req.query;

    let exportData = {};

    // Build date filter if provided
    let dateFilter = { tenantId: req.tenant._id };
    if (dateRange) {
      const [startDate, endDate] = dateRange.split(',');
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
    }

    if (type === 'all' || type === 'users') {
      exportData.users = await User.find({ tenantId: req.tenant._id })
        .populate('role', 'name')
        .select('-password');
    }

    if (type === 'all' || type === 'expenses') {
      exportData.expenses = await Expense.find(dateFilter)
        .populate('category', 'name')
        .populate('createdBy', 'name email');
    }

    if (type === 'all' || type === 'categories') {
      exportData.categories = await Category.find({ tenantId: req.tenant._id })
        .populate('createdBy', 'name email');
    }

    if (type === 'all' || type === 'activities') {
      exportData.activities = await ActivityService.getRecentActivitiesByTenant(
        req.tenant._id,
        1000
      );
    }

    // Log export activity
    await ActivityService.logActivity({
      type: 'data_exported',
      entityId: req.tenant._id,
      entityType: 'Tenant',
      entityName: req.tenant.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      metadata: {
        exportType: type,
        format,
        dateRange,
        recordCount: Object.keys(exportData).reduce((count, key) => 
          count + (Array.isArray(exportData[key]) ? exportData[key].length : 0), 0
        )
      }
    });

    if (format === 'csv') {
      // Convert to CSV format
      let csvContent = '';
      
      for (const [dataType, records] of Object.entries(exportData)) {
        if (Array.isArray(records) && records.length > 0) {
          csvContent += `\n${dataType.toUpperCase()}\n`;
          const headers = Object.keys(records[0]).join(',');
          csvContent += headers + '\n';
          
          records.forEach(record => {
            const values = Object.values(record).map(value => 
              typeof value === 'object' && value !== null ? JSON.stringify(value) : value
            );
            csvContent += values.join(',') + '\n';
          });
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${req.tenant.slug}_export_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csvContent);
    }

    // JSON format
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${req.tenant.slug}_export_${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json({
      success: true,
      exportInfo: {
        tenant: {
          name: req.tenant.name,
          slug: req.tenant.slug,
          plan: req.tenant.plan
        },
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.name,
        type,
        dateRange
      },
      data: exportData
    });
  } catch (error) {
    console.error('Export tenant data error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
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
};