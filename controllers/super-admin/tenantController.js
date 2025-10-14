// controllers/super-admin/tenantController.js
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Category = require('../../models/Category');
const Expense = require('../../models/Expense');
const Activity = require('../../models/Activity');
const SubscriptionPlan = require('../../models/SubscriptionPlan');
const TenantService = require('../../services/tenantService');
const ActivityService = require('../../services/activityService');

// @desc    Get all tenants with pagination and filters
// @route   GET /api/super-admin/tenants
// @access  Super Admin only
const getTenants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const plan = req.query.plan || '';
    const status = req.query.status || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build query
    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { customDomain: { $regex: search, $options: 'i' } }
      ];
    }

    if (plan) query.plan = plan;
    if (status) query.status = status;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const tenants = await Tenant.find(query)
      .populate('owner', 'name email lastLogin')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Tenant.countDocuments(query);

    // Enhance tenant data with additional statistics
    const enhancedTenants = await Promise.all(
      tenants.map(async (tenant) => {
        const [userCount, expenseCount, activeUsers] = await Promise.all([
          User.countDocuments({ tenantId: tenant._id }),
          Expense.countDocuments({ tenantId: tenant._id }),
          User.countDocuments({ tenantId: tenant._id, isActive: true })
        ]);

        // Calculate storage usage if needed
        const storageUsed = tenant.usage?.storageUsed || 0;
        const storageLimit = tenant.settings?.storageLimit || 1024;

        return {
          ...tenant,
          stats: {
            users: userCount,
            activeUsers,
            expenses: expenseCount,
            storageUsed,
            storageLimit,
            storageUsagePercentage: (storageUsed / storageLimit) * 100
          },
          // Add trial info
          trialInfo: {
            isTrialExpired: tenant.trialEndDate && new Date() > tenant.trialEndDate,
            daysLeft: tenant.trialEndDate 
              ? Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / (1000 * 60 * 60 * 24)))
              : 0
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enhancedTenants.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: enhancedTenants
    });

  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single tenant with detailed information
// @route   GET /api/super-admin/tenants/:id
// @access  Super Admin only
const getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('owner', 'name email lastLogin createdAt')
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Get detailed statistics
    const [
      userStats,
      expenseStats,
      categoryCount,
      recentActivities,
      subscriptionPlan
    ] = await Promise.all([
      User.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
            admins: { $sum: { $cond: [{ $eq: ['$tenantRole', 'tenant_admin'] }, 1, 0] } }
          }
        }
      ]),
      
      Expense.aggregate([
        { $match: { tenantId: tenant._id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            avgAmount: { $avg: '$totalAmount' }
          }
        }
      ]),

      Category.countDocuments({ tenantId: tenant._id, isActive: true }),

      ActivityService.getRecentActivitiesByTenant(tenant._id, 5),

      SubscriptionPlan.findOne({ slug: tenant.plan })
    ]);

    const enhancedTenant = {
      ...tenant,
      stats: {
        users: userStats[0] || { total: 0, active: 0, admins: 0 },
        expenses: expenseStats[0] || { total: 0, totalAmount: 0, avgAmount: 0 },
        categories: categoryCount,
        storage: {
          used: tenant.usage?.storageUsed || 0,
          limit: tenant.settings?.storageLimit || 1024
        }
      },
      subscriptionPlan,
      recentActivities,
      trialInfo: {
        isTrialExpired: tenant.trialEndDate && new Date() > tenant.trialEndDate,
        daysLeft: tenant.trialEndDate 
          ? Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / (1000 * 60 * 60 * 24)))
          : 0
      }
    };

    res.status(200).json({
      success: true,
      data: enhancedTenant
    });

  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new tenant (Super Admin)
// @route   POST /api/super-admin/tenants
// @access  Super Admin only
const createTenant = async (req, res) => {
  try {
    const {
      name,
      slug,
      adminName,        // CHANGED from ownerName
      adminEmail,       // CHANGED from ownerEmail
      adminPassword,    // CHANGED from ownerPassword
      plan = 'free',
      domain,           // CHANGED from customDomain
      contactEmail,     // ADDED
      contactPhone,     // ADDED
      trialDays = 14
    } = req.body;

    // Validate required fields
    if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
        required: ['name', 'slug', 'adminName', 'adminEmail', 'adminPassword']
      });
    }

    // Create tenant using TenantService
    const result = await TenantService.createTenant({
      name,
      slug,
      ownerName: adminName,      // Map to service expected field
      ownerEmail: adminEmail,    // Map to service expected field
      ownerPassword: adminPassword, // Map to service expected field
      plan,
      // source: 'super_admin'
    });

    // Set custom domain if provided
    if (domain) {
      result.tenant.customDomain = domain;
      result.tenant.domainVerified = false;
      await result.tenant.save();
    }

    // Store contact info
    if (contactEmail) {
      result.tenant.contactEmail = contactEmail;
    }
    if (contactPhone) {
      result.tenant.contactPhone = contactPhone;
    }
    await result.tenant.save();

    // Extend trial if specified
    if (trialDays !== 14) {
      result.tenant.trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      await result.tenant.save();
    }

    // Log activity (Super Admin action)
    await ActivityService.logActivity({
      type: 'tenant_created',
      entityId: result.tenant._id,
      entityType: 'Tenant',
      entityName: result.tenant.name,
      performedBy: req.user.id,
      newData: {
        name,
        slug,
        plan,
        owner: adminName,
        customDomain: domain
      },
      metadata: {
        createdBy: 'super_admin'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        tenant: result.tenant,
        owner: result.owner,
        loginUrl: result.loginUrl
      }
    });

  } catch (error) {
    console.error('Create tenant error:', error);
    
    if (error.message.includes('already taken') || error.message.includes('already registered')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Update tenant
// @route   PUT /api/super-admin/tenants/:id
// @access  Super Admin only
const updateTenant = async (req, res) => {
  try {
    const {
      name,
      plan,
      status,
      customDomain,
      domainVerified,
      settings,
      trialEndDate
    } = req.body;

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Store old data for activity log
    const oldData = {
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      customDomain: tenant.customDomain,
      domainVerified: tenant.domainVerified,
      settings: tenant.settings
    };

    // Update fields
    if (name) tenant.name = name;
    if (plan) {
      // Validate plan exists
      const subscriptionPlan = await SubscriptionPlan.findOne({ slug: plan });
      if (!subscriptionPlan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription plan'
        });
      }
      
      tenant.plan = plan;
      // Update limits based on new plan
      tenant.settings.maxUsers = subscriptionPlan.limits.users;
      tenant.settings.maxExpenses = subscriptionPlan.limits.expenses;
      tenant.settings.storageLimit = subscriptionPlan.limits.storage;
      tenant.settings.features = subscriptionPlan.availableFeatures;
    }
    
    if (status) tenant.status = status;
    if (customDomain !== undefined) tenant.customDomain = customDomain;
    if (domainVerified !== undefined) tenant.domainVerified = domainVerified;
    if (settings) {
      tenant.settings = { ...tenant.settings, ...settings };
    }
    if (trialEndDate) tenant.trialEndDate = new Date(trialEndDate);

    await tenant.save();

    // Build changes array
    const changes = [];
    if (oldData.name !== tenant.name) changes.push(`Name: ${oldData.name} → ${tenant.name}`);
    if (oldData.plan !== tenant.plan) changes.push(`Plan: ${oldData.plan} → ${tenant.plan}`);
    if (oldData.status !== tenant.status) changes.push(`Status: ${oldData.status} → ${tenant.status}`);
    if (oldData.customDomain !== tenant.customDomain) changes.push(`Domain: ${oldData.customDomain || 'None'} → ${tenant.customDomain || 'None'}`);

    // Log activity
    await ActivityService.logActivity({
      type: 'tenant_updated',
      entityId: tenant._id,
      entityType: 'Tenant',
      entityName: tenant.name,
      performedBy: req.user.id,
      oldData,
      newData: {
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status,
        customDomain: tenant.customDomain,
        domainVerified: tenant.domainVerified
      },
      changes,
      metadata: {
        updatedBy: 'super_admin'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: tenant
    });

  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Suspend tenant
// @route   PUT /api/super-admin/tenants/:id/suspend
// @access  Super Admin only
const suspendTenant = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Suspension reason is required'
      });
    }

    const tenant = await TenantService.suspendTenant(
      req.params.id,
      reason,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'Tenant suspended successfully',
      data: tenant
    });

  } catch (error) {
    console.error('Suspend tenant error:', error);
    
    if (error.message === 'Tenant not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Reactivate tenant
// @route   PUT /api/super-admin/tenants/:id/reactivate
// @access  Super Admin only
const reactivateTenant = async (req, res) => {
  try {
    const tenant = await TenantService.reactivateTenant(
      req.params.id,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'Tenant reactivated successfully',
      data: tenant
    });

  } catch (error) {
    console.error('Reactivate tenant error:', error);
    
    if (error.message === 'Tenant not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete tenant (soft delete)
// @route   DELETE /api/super-admin/tenants/:id
// @access  Super Admin only
const deleteTenant = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Deletion reason is required'
      });
    }

    const tenant = await TenantService.deleteTenant(
      req.params.id,
      req.user.id,
      reason
    );

    res.status(200).json({
      success: true,
      message: 'Tenant deleted successfully',
      data: tenant
    });

  } catch (error) {
    console.error('Delete tenant error:', error);
    
    if (error.message === 'Tenant not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant usage statistics
// @route   GET /api/super-admin/tenants/:id/usage
// @access  Super Admin only
const getTenantUsage = async (req, res) => {
  try {
    const usage = await TenantService.getTenantUsage(req.params.id);

    res.status(200).json({
      success: true,
      data: usage
    });

  } catch (error) {
    console.error('Get tenant usage error:', error);
    
    if (error.message === 'Tenant not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant activities
// @route   GET /api/super-admin/tenants/:id/activities
// @access  Super Admin only
const getTenantActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    const activities = await Activity.findByTenant(tenant._id, {
      limit: limit * page,
      sort: { createdAt: -1 }
    });

    const paginatedActivities = activities.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      success: true,
      data: paginatedActivities,
      pagination: {
        page,
        limit,
        total: activities.length,
        pages: Math.ceil(activities.length / limit)
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

// @desc    Verify custom domain
// @route   PUT /api/super-admin/tenants/:id/verify-domain
// @access  Super Admin only
const verifyCustomDomain = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    if (!tenant.customDomain) {
      return res.status(400).json({
        success: false,
        message: 'No custom domain configured'
      });
    }

    // Here you would implement actual domain verification logic
    // For now, we'll just mark it as verified
    tenant.domainVerified = true;
    await tenant.save();

    // Log activity
    await ActivityService.logActivity({
      type: 'custom_domain_verified',
      entityId: tenant._id,
      entityType: 'Tenant',
      entityName: tenant.name,
      performedBy: req.user.id,
      newData: {
        customDomain: tenant.customDomain,
        verified: true
      },
      metadata: {
        verifiedBy: 'super_admin'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Domain verified successfully',
      data: {
        domain: tenant.customDomain,
        verified: true
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

module.exports = {
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
};