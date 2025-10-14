const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const ActivityService = require('./activityService');
const bcrypt = require('bcryptjs');

class TenantService {
  
  // Create new tenant with initial setup
  static async createTenant({
    name,
    slug,
    ownerName,
    ownerEmail,
    ownerPassword,
    plan = 'free',
    source = 'organic'
  }) {
    try {
      // Check if slug is already taken
      const existingTenant = await Tenant.findOne({ slug });
      if (existingTenant) {
        throw new Error('Organization subdomain is already taken');
      }
      
      // Check if email is already used
      const existingUser = await User.findOne({ email: ownerEmail });
      if (existingUser) {
        throw new Error('Email is already registered');
      }
      
      // Get subscription plan
      const subscriptionPlan = await SubscriptionPlan.findOne({ slug: plan });
      if (!subscriptionPlan) {
        throw new Error('Invalid subscription plan');
      }
      
      // Create tenant first
      const tenant = await Tenant.create({
        name,
        slug,
        plan,
        status: 'trial',
        settings: {
          maxUsers: subscriptionPlan.limits.users,
          maxExpenses: subscriptionPlan.limits.expenses,
          storageLimit: subscriptionPlan.limits.storage,
          features: subscriptionPlan.availableFeatures
        },
        metadata: {
          source
        },
        // Will be updated after owner is created
        owner: null
      });
      
      // Create default roles for tenant
      const roles = await Role.createDefaultRoles(tenant._id, null);
      const adminRole = roles.find(role => role.name === 'Admin');
      
      // Create tenant owner user
      const hashedPassword = await bcrypt.hash(ownerPassword, 10);
      const owner = await User.create({
        name: ownerName,
        email: ownerEmail,
        password: hashedPassword,
        tenantId: tenant._id,
        tenantRole: 'tenant_admin',
        role: adminRole._id,
        isActive: true
      });
      
      // Update tenant with owner reference
      tenant.owner = owner._id;
      await tenant.save();
      
      // Update role createdBy field
      await Role.updateMany(
        { tenantId: tenant._id },
        { createdBy: owner._id }
      );
      
      // Create default categories
      await Category.createDefaultCategories(tenant._id, owner._id);
      
      // Log activity
      await ActivityService.logActivity({
        type: 'tenant_created',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: owner._id,
        newData: {
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          owner: ownerName
        }
      });
      
      return {
        tenant,
        owner,
        roles,
        loginUrl: `https://${tenant.slug}.i-expense.ikftech.com`
      };
      
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw error;
    }
  }
  
  // Get tenant by domain
  static async getTenantByDomain(domain) {
    try {
      return await Tenant.findByDomain(domain);
    } catch (error) {
      console.error('Error getting tenant by domain:', error);
      return null;
    }
  }
  
  // Update tenant settings
  static async updateTenantSettings(tenantId, settings, updatedBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      const oldSettings = { ...tenant.settings };
      
      // Update settings
      Object.keys(settings).forEach(key => {
        if (tenant.settings[key] !== undefined) {
          tenant.settings[key] = settings[key];
        }
      });
      
      await tenant.save();
      
      // Log activity
      await ActivityService.logActivity({
        type: 'tenant_settings_updated',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: updatedBy,
        oldData: oldSettings,
        newData: tenant.settings
      });
      
      return tenant;
    } catch (error) {
      console.error('Error updating tenant settings:', error);
      throw error;
    }
  }
  
  // Update subscription plan
  static async updateSubscriptionPlan(tenantId, newPlanSlug, updatedBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      const newPlan = await SubscriptionPlan.findOne({ slug: newPlanSlug });
      if (!newPlan) {
        throw new Error('Subscription plan not found');
      }
      
      const oldPlan = tenant.plan;
      
      // Update tenant plan and settings
      tenant.plan = newPlan.slug;
      tenant.settings.maxUsers = newPlan.limits.users;
      tenant.settings.maxExpenses = newPlan.limits.expenses;
      tenant.settings.storageLimit = newPlan.limits.storage;
      tenant.settings.features = newPlan.availableFeatures;
      
      // Update subscription status
      if (tenant.status === 'trial' && newPlan.slug !== 'free') {
        tenant.status = 'active';
      }
      
      await tenant.save();
      
      // Log activity
      await ActivityService.logActivity({
        type: 'subscription_updated',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: updatedBy,
        oldData: { plan: oldPlan },
        newData: { plan: newPlan.slug }
      });
      
      return tenant;
    } catch (error) {
      console.error('Error updating subscription plan:', error);
      throw error;
    }
  }
  
  // Get tenant dashboard statistics
  static async getTenantDashboardStats(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // Get current month date range
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      // Get user statistics
      const totalUsers = await User.countByTenant(tenantId);
      const activeUsers = await User.countByTenant(tenantId, true);
      
      // Get expense statistics
      const Expense = require('../models/Expense');
      const [monthlyExpenses, totalExpenses] = await Promise.all([
        Expense.aggregate([
          {
            $match: {
              tenantId: tenant._id,
              date: { $gte: startOfMonth, $lte: endOfMonth }
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              totalAmount: { $sum: '$totalAmount' }
            }
          }
        ]),
        Expense.aggregate([
          {
            $match: { tenantId: tenant._id }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              totalAmount: { $sum: '$totalAmount' }
            }
          }
        ])
      ]);
      
      // Get category count
      const categoryCount = await Category.countDocuments({ 
        tenantId: tenant._id, 
        isActive: true 
      });
      
      // Get recent activities
      const recentActivities = await ActivityService.getRecentActivitiesByTenant(
        tenantId, 
        10
      );
      
      return {
        tenant: {
          name: tenant.name,
          plan: tenant.plan,
          status: tenant.status,
          trialEndDate: tenant.trialEndDate,
          usage: tenant.usage
        },
        users: {
          total: totalUsers,
          active: activeUsers,
          limit: tenant.settings.maxUsers
        },
        expenses: {
          monthly: monthlyExpenses[0] || { count: 0, totalAmount: 0 },
          total: totalExpenses[0] || { count: 0, totalAmount: 0 },
          limit: tenant.settings.maxExpenses
        },
        categories: {
          count: categoryCount
        },
        storage: {
          used: tenant.usage.storageUsed,
          limit: tenant.settings.storageLimit
        },
        recentActivities
      };
    } catch (error) {
      console.error('Error getting tenant dashboard stats:', error);
      throw error;
    }
  }
  
  // Suspend tenant
  static async suspendTenant(tenantId, reason, suspendedBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      const oldStatus = tenant.status;
      tenant.status = 'suspended';
      
      // Initialize metadata if it doesn't exist
      if (!tenant.metadata) {
        tenant.metadata = {};
      }
      
      tenant.metadata.suspensionReason = reason;
      tenant.metadata.suspendedBy = suspendedBy;
      tenant.metadata.suspendedAt = new Date();
      
      await tenant.save();
      
      // Log activity
      await ActivityService.logActivity({
        type: 'tenant_suspended',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: suspendedBy,
        oldData: { status: oldStatus },
        newData: { status: 'suspended', reason }
      });
      
      return tenant;
    } catch (error) {
      console.error('Error suspending tenant:', error);
      throw error;
    }
  }
  
  // Reactivate tenant
  static async reactivateTenant(tenantId, reactivatedBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      const oldStatus = tenant.status;
      tenant.status = 'active';
      
      // Initialize metadata if it doesn't exist
      if (!tenant.metadata) {
        tenant.metadata = {};
      }
      
      tenant.metadata.suspensionReason = undefined;
      tenant.metadata.suspendedBy = undefined;
      tenant.metadata.suspendedAt = undefined;
      tenant.metadata.reactivatedBy = reactivatedBy;
      tenant.metadata.reactivatedAt = new Date();
      
      await tenant.save();
      
      // Log activity
      await ActivityService.logActivity({
        type: 'tenant_reactivated',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: reactivatedBy,
        oldData: { status: oldStatus },
        newData: { status: 'active' }
      });
      
      return tenant;
    } catch (error) {
      console.error('Error reactivating tenant:', error);
      throw error;
    }
  }
  
  // Delete tenant (HARD DELETE - Permanently removes from database)
static async deleteTenant(tenantId, deletedBy, reason) {
  try {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    
    console.log(`🗑️  Starting HARD DELETE for tenant: ${tenant.name}`);
    
    // Step 1: Delete all related data from database
    const deletionResults = await Promise.all([
      User.deleteMany({ tenantId: tenant._id }),
      require('../models/Expense').deleteMany({ tenantId: tenant._id }),
      Category.deleteMany({ tenantId: tenant._id }),
      Role.deleteMany({ tenantId: tenant._id }),
      require('../models/Activity').deleteMany({ tenantId: tenant._id })
    ]);
    
    console.log(`✅ Deleted related data:`, {
      users: deletionResults[0].deletedCount,
      expenses: deletionResults[1].deletedCount,
      categories: deletionResults[2].deletedCount,
      roles: deletionResults[3].deletedCount,
      activities: deletionResults[4].deletedCount
    });
    
    // Step 2: Store tenant info before deletion (for logging)
    const deletedTenantInfo = {
      _id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      deletedBy,
      deletedAt: new Date(),
      reason
    };
    
    // Step 3: Delete tenant from database PERMANENTLY
    await Tenant.findByIdAndDelete(tenantId);
    
    console.log(`✅ Tenant ${tenant.name} PERMANENTLY deleted from MongoDB`);
    
    return deletedTenantInfo;
    
  } catch (error) {
    console.error('❌ Error deleting tenant permanently:', error);
    throw error;
  }
}
  
  // Get tenant usage statistics
  static async getTenantUsage(tenantId) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // Recalculate usage statistics
      const [userCount, expenseCount] = await Promise.all([
        User.countByTenant(tenantId, true),
        require('../models/Expense').countDocuments({ tenantId })
      ]);
      
      // Update tenant usage
      tenant.usage.currentUsers = userCount;
      tenant.usage.currentExpenses = expenseCount;
      tenant.usage.lastUpdated = new Date();
      await tenant.save();
      
      return {
        users: {
          current: userCount,
          limit: tenant.settings.maxUsers,
          percentage: tenant.settings.maxUsers === -1 ? 0 : (userCount / tenant.settings.maxUsers) * 100
        },
        expenses: {
          current: expenseCount,
          limit: tenant.settings.maxExpenses,
          percentage: tenant.settings.maxExpenses === -1 ? 0 : (expenseCount / tenant.settings.maxExpenses) * 100
        },
        storage: {
          current: tenant.usage.storageUsed,
          limit: tenant.settings.storageLimit,
          percentage: (tenant.usage.storageUsed / tenant.settings.storageLimit) * 100
        }
      };
    } catch (error) {
      console.error('Error getting tenant usage:', error);
      throw error;
    }
  }
  
  // Validate tenant limits
  static async validateTenantLimits(tenantId) {
    try {
      const usage = await this.getTenantUsage(tenantId);
      const violations = [];
      
      if (usage.users.current > usage.users.limit && usage.users.limit !== -1) {
        violations.push({
          type: 'users',
          message: 'User limit exceeded',
          current: usage.users.current,
          limit: usage.users.limit
        });
      }
      
      if (usage.expenses.current > usage.expenses.limit && usage.expenses.limit !== -1) {
        violations.push({
          type: 'expenses',
          message: 'Expense limit exceeded',
          current: usage.expenses.current,
          limit: usage.expenses.limit
        });
      }
      
      if (usage.storage.current > usage.storage.limit) {
        violations.push({
          type: 'storage',
          message: 'Storage limit exceeded',
          current: usage.storage.current,
          limit: usage.storage.limit
        });
      }
      
      return {
        isValid: violations.length === 0,
        violations,
        usage
      };
    } catch (error) {
      console.error('Error validating tenant limits:', error);
      throw error;
    }
  }
  
  // Setup custom domain
  static async setupCustomDomain(tenantId, customDomain, setupBy) {
    try {
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      
      // Check if domain is already taken
      const existingTenant = await Tenant.findOne({ 
        customDomain,
        _id: { $ne: tenantId }
      });
      
      if (existingTenant) {
        throw new Error('Custom domain is already in use');
      }
      
      const oldDomain = tenant.customDomain;
      tenant.customDomain = customDomain;
      tenant.domainVerified = false; // Will be verified separately
      
      await tenant.save();
      
      // Log activity
      await ActivityService.logActivity({
        type: 'custom_domain_setup',
        entityId: tenant._id,
        entityType: 'Tenant',
        entityName: tenant.name,
        tenantId: tenant._id,
        performedBy: setupBy,
        oldData: { customDomain: oldDomain },
        newData: { customDomain }
      });
      
      return tenant;
    } catch (error) {
      console.error('Error setting up custom domain:', error);
      throw error;
    }
  }
}

module.exports = TenantService;