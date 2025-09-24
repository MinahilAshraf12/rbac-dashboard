// controllers/super-admin/subscriptionController.js
const SubscriptionPlan = require('../../models/SubscriptionPlan');
const Tenant = require('../../models/Tenant');
const ActivityService = require('../../services/activityService');

// @desc    Get all subscription plans
// @route   GET /api/super-admin/subscriptions/plans
// @access  Super Admin only
const getSubscriptionPlans = async (req, res) => {
  try {
    const { includeInactive = false } = req.query;
    
    const query = includeInactive === 'true' ? {} : { isActive: true };
    
    const plans = await SubscriptionPlan.find(query)
      .sort({ sortOrder: 1, price: 1 });

    // Add usage statistics for each plan
    const plansWithStats = await Promise.all(
      plans.map(async (plan) => {
        const tenantCount = await Tenant.countDocuments({ 
          plan: plan.slug,
          isActive: true 
        });

        const totalRevenue = plan.price.monthly * tenantCount;

        return {
          ...plan.toObject(),
          stats: {
            tenantCount,
            monthlyRevenue: totalRevenue,
            yearlyRevenue: plan.price.yearly * tenantCount
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      count: plansWithStats.length,
      data: plansWithStats
    });

  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single subscription plan
// @route   GET /api/super-admin/subscriptions/plans/:id
// @access  Super Admin only
const getSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Get tenants using this plan
    const tenants = await Tenant.find({ 
      plan: plan.slug,
      isActive: true 
    })
    .populate('owner', 'name email')
    .select('name slug status createdAt owner usage')
    .sort({ createdAt: -1 });

    const planWithDetails = {
      ...plan.toObject(),
      tenants,
      stats: {
        tenantCount: tenants.length,
        monthlyRevenue: plan.price.monthly * tenants.length,
        yearlyRevenue: plan.price.yearly * tenants.length
      }
    };

    res.status(200).json({
      success: true,
      data: planWithDetails
    });

  } catch (error) {
    console.error('Get subscription plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new subscription plan
// @route   POST /api/super-admin/subscriptions/plans
// @access  Super Admin only
const createSubscriptionPlan = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      price,
      currency = 'USD',
      stripeProductId,
      stripePriceIds,
      features,
      limits,
      availableFeatures,
      isActive = true,
      isPopular = false,
      sortOrder = 0,
      trial,
      metadata
    } = req.body;

    // Validate required fields
    if (!name || !slug || !description || !price || !limits) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, slug, description, price, and limits are required'
      });
    }

    // Check if slug already exists
    const existingPlan = await SubscriptionPlan.findOne({ slug });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Plan slug already exists'
      });
    }

    // Validate price structure
    if (!price.monthly || typeof price.monthly !== 'number' || price.monthly < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid monthly price is required'
      });
    }

    if (!price.yearly || typeof price.yearly !== 'number' || price.yearly < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid yearly price is required'
      });
    }

    // Validate limits structure
    if (!limits.users || !limits.expenses || !limits.storage) {
      return res.status(400).json({
        success: false,
        message: 'Limits must include users, expenses, and storage'
      });
    }

    const plan = await SubscriptionPlan.create({
      name,
      slug,
      description,
      price,
      currency,
      stripeProductId: stripeProductId || `prod_${slug}`,
      stripePriceIds: stripePriceIds || {
        monthly: `price_${slug}_monthly`,
        yearly: `price_${slug}_yearly`
      },
      features: features || [],
      limits,
      availableFeatures: availableFeatures || [],
      isActive,
      isPopular,
      sortOrder,
      trial: trial || { enabled: true, days: 14 },
      metadata: metadata || {}
    });

    // Log activity
    await ActivityService.logActivity({
      type: 'subscription_plan_created',
      entityId: plan._id,
      entityType: 'SubscriptionPlan',
      entityName: plan.name,
      performedBy: req.user.id,
      newData: {
        name,
        slug,
        monthlyPrice: price.monthly,
        yearlyPrice: price.yearly,
        limits
      },
      metadata: {
        createdBy: 'super_admin'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: plan
    });

  } catch (error) {
    console.error('Create subscription plan error:', error);
    
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update subscription plan
// @route   PUT /api/super-admin/subscriptions/plans/:id
// @access  Super Admin only
const updateSubscriptionPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      features,
      limits,
      availableFeatures,
      isActive,
      isPopular,
      sortOrder,
      trial,
      metadata
    } = req.body;

    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Store old data for activity log
    const oldData = {
      name: plan.name,
      description: plan.description,
      price: plan.price,
      limits: plan.limits,
      isActive: plan.isActive
    };

    // Update fields
    if (name) plan.name = name;
    if (description) plan.description = description;
    if (price) {
      if (price.monthly !== undefined) plan.price.monthly = price.monthly;
      if (price.yearly !== undefined) plan.price.yearly = price.yearly;
    }
    if (features) plan.features = features;
    if (limits) plan.limits = { ...plan.limits, ...limits };
    if (availableFeatures) plan.availableFeatures = availableFeatures;
    if (isActive !== undefined) plan.isActive = isActive;
    if (isPopular !== undefined) plan.isPopular = isPopular;
    if (sortOrder !== undefined) plan.sortOrder = sortOrder;
    if (trial) plan.trial = { ...plan.trial, ...trial };
    if (metadata) plan.metadata = { ...plan.metadata, ...metadata };

    await plan.save();

    // Update all tenants using this plan if limits changed
    if (limits) {
      await Tenant.updateMany(
        { plan: plan.slug },
        {
          $set: {
            'settings.maxUsers': plan.limits.users,
            'settings.maxExpenses': plan.limits.expenses,
            'settings.storageLimit': plan.limits.storage,
            'settings.features': plan.availableFeatures
          }
        }
      );
    }

    // Build changes array
    const changes = [];
    if (oldData.name !== plan.name) changes.push(`Name: ${oldData.name} → ${plan.name}`);
    if (oldData.price.monthly !== plan.price.monthly) changes.push(`Monthly Price: $${oldData.price.monthly} → $${plan.price.monthly}`);
    if (oldData.price.yearly !== plan.price.yearly) changes.push(`Yearly Price: $${oldData.price.yearly} → $${plan.price.yearly}`);
    if (oldData.isActive !== plan.isActive) changes.push(`Status: ${oldData.isActive ? 'Active' : 'Inactive'} → ${plan.isActive ? 'Active' : 'Inactive'}`);

    // Log activity
    await ActivityService.logActivity({
      type: 'subscription_plan_updated',
      entityId: plan._id,
      entityType: 'SubscriptionPlan',
      entityName: plan.name,
      performedBy: req.user.id,
      oldData,
      newData: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        limits: plan.limits,
        isActive: plan.isActive
      },
      changes,
      metadata: {
        updatedBy: 'super_admin'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: plan
    });

  } catch (error) {
    console.error('Update subscription plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete subscription plan
// @route   DELETE /api/super-admin/subscriptions/plans/:id
// @access  Super Admin only
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Check if any tenants are using this plan
    const tenantsUsingPlan = await Tenant.countDocuments({ 
      plan: plan.slug,
      isActive: true 
    });

    if (tenantsUsingPlan > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan. ${tenantsUsingPlan} tenant(s) are currently using this plan. Please migrate them to another plan first.`
      });
    }

    // Store plan data for activity log
    const planData = {
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      limits: plan.limits
    };

    await SubscriptionPlan.findByIdAndDelete(req.params.id);

    // Log activity
    await ActivityService.logActivity({
      type: 'subscription_plan_deleted',
      entityId: plan._id,
      entityType: 'SubscriptionPlan',
      entityName: plan.name,
      performedBy: req.user.id,
      oldData: planData,
      metadata: {
        deletedBy: 'super_admin'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully'
    });

  } catch (error) {
    console.error('Delete subscription plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get subscription statistics
// @route   GET /api/super-admin/subscriptions/stats
// @access  Super Admin only
const getSubscriptionStats = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get plan distribution and revenue
    const planStats = await Tenant.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'subscriptionplans',
          localField: 'plan',
          foreignField: 'slug',
          as: 'planDetails'
        }
      },
      { $unwind: { path: '$planDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$plan',
          tenantCount: { $sum: 1 },
          planName: { $first: '$planDetails.name' },
          monthlyPrice: { $first: '$planDetails.price.monthly' },
          yearlyPrice: { $first: '$planDetails.price.yearly' },
          monthlyRevenue: { 
            $sum: { 
              $cond: [
                { $ne: ['$planDetails', null] },
                '$planDetails.price.monthly',
                0
              ]
            }
          },
          yearlyRevenue: { 
            $sum: { 
              $cond: [
                { $ne: ['$planDetails', null] },
                '$planDetails.price.yearly',
                0
              ]
            }
          }
        }
      },
      { $sort: { tenantCount: -1 } }
    ]);

    // Get subscription growth over time
    const subscriptionGrowth = await Tenant.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            plan: '$plan'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Get trial conversion rates
    const trialStats = await Tenant.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate totals
    const totalTenants = planStats.reduce((sum, plan) => sum + plan.tenantCount, 0);
    const totalMonthlyRevenue = planStats.reduce((sum, plan) => sum + plan.monthlyRevenue, 0);
    const totalYearlyRevenue = planStats.reduce((sum, plan) => sum + plan.yearlyRevenue, 0);

    // Calculate conversion rate
    const trialTenants = trialStats.find(stat => stat._id === 'trial')?.count || 0;
    const activeTenants = trialStats.find(stat => stat._id === 'active')?.count || 0;
    const conversionRate = trialTenants > 0 ? (activeTenants / (activeTenants + trialTenants)) * 100 : 0;

    res.status(200).json({
      success: true,
      data: {
        period,
        summary: {
          totalTenants,
          totalMonthlyRevenue,
          totalYearlyRevenue,
          averageRevenuePerTenant: totalTenants > 0 ? Math.round(totalMonthlyRevenue / totalTenants) : 0,
          conversionRate: Math.round(conversionRate * 100) / 100
        },
        planDistribution: planStats,
        subscriptionGrowth,
        trialStats
      }
    });

  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Migrate tenant to different plan
// @route   PUT /api/super-admin/subscriptions/migrate-tenant/:tenantId
// @access  Super Admin only
const migrateTenantPlan = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { newPlan, reason } = req.body;

    if (!newPlan || !reason) {
      return res.status(400).json({
        success: false,
        message: 'New plan and reason are required'
      });
    }

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Verify new plan exists
    const subscriptionPlan = await SubscriptionPlan.findOne({ slug: newPlan });
    if (!subscriptionPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }

    const oldPlan = tenant.plan;

    // Update tenant plan and settings
    tenant.plan = newPlan;
    tenant.settings.maxUsers = subscriptionPlan.limits.users;
    tenant.settings.maxExpenses = subscriptionPlan.limits.expenses;
    tenant.settings.storageLimit = subscriptionPlan.limits.storage;
    tenant.settings.features = subscriptionPlan.availableFeatures;

    await tenant.save();

    // Log activity
    await ActivityService.logActivity({
      type: 'subscription_migrated',
      entityId: tenant._id,
      entityType: 'Tenant',
      entityName: tenant.name,
      performedBy: req.user.id,
      oldData: { plan: oldPlan },
      newData: { plan: newPlan },
      changes: [`Plan: ${oldPlan} → ${newPlan}`],
      metadata: {
        reason,
        migratedBy: 'super_admin'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Tenant plan migrated successfully',
      data: {
        tenantId: tenant._id,
        tenantName: tenant.name,
        oldPlan,
        newPlan,
        newLimits: {
          users: subscriptionPlan.limits.users,
          expenses: subscriptionPlan.limits.expenses,
          storage: subscriptionPlan.limits.storage
        }
      }
    });

  } catch (error) {
    console.error('Migrate tenant plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Bulk update subscription plans
// @route   PUT /api/super-admin/subscriptions/bulk-update
// @access  Super Admin only
const bulkUpdatePlans = async (req, res) => {
  try {
    const { planIds, updates } = req.body;

    if (!planIds || !Array.isArray(planIds) || planIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Plan IDs array is required'
      });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates object is required'
      });
    }

    // Validate plan IDs exist
    const plans = await SubscriptionPlan.find({ _id: { $in: planIds } });
    if (plans.length !== planIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more plan IDs are invalid'
      });
    }

    // Perform bulk update
    const result = await SubscriptionPlan.updateMany(
      { _id: { $in: planIds } },
      { $set: updates }
    );

    // If limits were updated, update all tenants using these plans
    if (updates.limits) {
      const updatedPlans = await SubscriptionPlan.find({ _id: { $in: planIds } });
      
      for (const plan of updatedPlans) {
        await Tenant.updateMany(
          { plan: plan.slug },
          {
            $set: {
              'settings.maxUsers': plan.limits.users,
              'settings.maxExpenses': plan.limits.expenses,
              'settings.storageLimit': plan.limits.storage,
              'settings.features': plan.availableFeatures
            }
          }
        );
      }
    }

    // Log activity for each plan
    for (const plan of plans) {
      await ActivityService.logActivity({
        type: 'subscription_plan_bulk_updated',
        entityId: plan._id,
        entityType: 'SubscriptionPlan',
        entityName: plan.name,
        performedBy: req.user.id,
        newData: updates,
        metadata: {
          bulkUpdate: true,
          updatedBy: 'super_admin'
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} subscription plans`,
      data: {
        modifiedCount: result.modifiedCount,
        planNames: plans.map(p => p.name)
      }
    });

  } catch (error) {
    console.error('Bulk update plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getSubscriptionStats,
  migrateTenantPlan,
  bulkUpdatePlans
};