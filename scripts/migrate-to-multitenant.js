/**
 * Multi-Tenant Migration Script
 * This script migrates existing single-tenant data to multi-tenant structure
 * 
 * Run with: node scripts/migrate-to-multitenant.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const Tenant = require('../models/Tenant');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const SuperAdmin = require('../models/SuperAdmin');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const Expense = require('../models/Expense');
const Activity = require('../models/Activity');

async function connectDB() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_dashboard',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

async function createSubscriptionPlans() {
  console.log('\n📋 Creating subscription plans...');
  
  const plans = [
    {
      name: 'Free',
      slug: 'free',
      description: 'Perfect for getting started with basic expense tracking',
      price: { monthly: 0, yearly: 0 },
      stripeProductId: 'prod_free_plan',
      stripePriceIds: {
        monthly: 'price_free_monthly',
        yearly: 'price_free_yearly'
      },
      features: [
        { name: 'Up to 5 users', included: true },
        { name: '100 expenses per month', included: true },
        { name: '1GB storage', included: true },
        { name: 'Basic reports', included: true },
        { name: 'Email support', included: true }
      ],
      limits: {
        users: 5,
        expenses: 100,
        storage: 1024, // MB
        categories: 20,
        apiCalls: 1000,
        fileUploadSize: 5 // MB
      },
      availableFeatures: ['file_uploads', 'basic_reports'],
      isActive: true,
      sortOrder: 1,
      metadata: {
        color: '#10B981',
        badge: 'Most Popular',
        ctaText: 'Get Started Free'
      }
    },
    {
      name: 'Basic',
      slug: 'basic',
      description: 'Ideal for small teams with growing expense management needs',
      price: { monthly: 29, yearly: 290 }, // 17% savings yearly
      stripeProductId: 'prod_basic_plan',
      stripePriceIds: {
        monthly: 'price_basic_monthly',
        yearly: 'price_basic_yearly'
      },
      features: [
        { name: 'Up to 25 users', included: true },
        { name: '1,000 expenses per month', included: true },
        { name: '10GB storage', included: true },
        { name: 'Advanced reports', included: true },
        { name: 'Priority support', included: true },
        { name: 'Data export', included: true }
      ],
      limits: {
        users: 25,
        expenses: 1000,
        storage: 10240, // MB
        categories: 50,
        apiCalls: 10000,
        fileUploadSize: 10 // MB
      },
      availableFeatures: [
        'file_uploads',
        'advanced_analytics',
        'data_export',
        'custom_categories',
        'priority_support'
      ],
      isActive: true,
      sortOrder: 2,
      metadata: {
        color: '#3B82F6',
        ctaText: 'Start Basic Plan'
      }
    },
    {
      name: 'Premium',
      slug: 'premium',
      description: 'Perfect for growing businesses with advanced requirements',
      price: { monthly: 79, yearly: 790 }, // 17% savings yearly
      stripeProductId: 'prod_premium_plan',
      stripePriceIds: {
        monthly: 'price_premium_monthly',
        yearly: 'price_premium_yearly'
      },
      features: [
        { name: 'Up to 100 users', included: true },
        { name: 'Unlimited expenses', included: true },
        { name: '50GB storage', included: true },
        { name: 'Custom reports', included: true },
        { name: 'API access', included: true },
        { name: 'Custom domain', included: true },
        { name: 'Priority support', included: true }
      ],
      limits: {
        users: 100,
        expenses: -1, // unlimited
        storage: 51200, // MB
        categories: -1, // unlimited
        apiCalls: 50000,
        fileUploadSize: 25 // MB
      },
      availableFeatures: [
        'file_uploads',
        'advanced_analytics',
        'data_export',
        'custom_categories',
        'api_access',
        'custom_domain',
        'priority_support',
        'custom_reports',
        'integrations'
      ],
      isActive: true,
      isPopular: true,
      sortOrder: 3,
      metadata: {
        color: '#8B5CF6',
        badge: 'Recommended',
        ctaText: 'Upgrade to Premium'
      }
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For large organizations with custom requirements',
      price: { monthly: 199, yearly: 1990 }, // 17% savings yearly
      stripeProductId: 'prod_enterprise_plan',
      stripePriceIds: {
        monthly: 'price_enterprise_monthly',
        yearly: 'price_enterprise_yearly'
      },
      features: [
        { name: 'Unlimited users', included: true },
        { name: 'Unlimited expenses', included: true },
        { name: 'Unlimited storage', included: true },
        { name: 'White-label branding', included: true },
        { name: 'SSO integration', included: true },
        { name: 'Dedicated support', included: true },
        { name: 'Custom integrations', included: true }
      ],
      limits: {
        users: -1, // unlimited
        expenses: -1, // unlimited
        storage: -1, // unlimited
        categories: -1, // unlimited
        apiCalls: -1, // unlimited
        fileUploadSize: 100 // MB
      },
      availableFeatures: [
        'file_uploads',
        'advanced_analytics',
        'data_export',
        'custom_categories',
        'api_access',
        'custom_domain',
        'priority_support',
        'custom_reports',
        'integrations',
        'white_label',
        'sso',
        'audit_logs'
      ],
      isActive: true,
      sortOrder: 4,
      metadata: {
        color: '#EF4444',
        badge: 'Enterprise',
        ctaText: 'Contact Sales'
      }
    }
  ];
  
  for (const planData of plans) {
    const existingPlan = await SubscriptionPlan.findOne({ slug: planData.slug });
    if (!existingPlan) {
      await SubscriptionPlan.create(planData);
      console.log(`✅ Created plan: ${planData.name}`);
    } else {
      console.log(`⚠️  Plan already exists: ${planData.name}`);
    }
  }
}

async function createSuperAdmin() {
  console.log('\n👑 Creating super admin...');
  
  const existingSuperAdmin = await SuperAdmin.findOne({ email: 'admin@i-expense.ikftech.com' });
  
  if (!existingSuperAdmin) {
    await SuperAdmin.create({
      name: 'System Administrator',
      email: 'admin@i-expense.ikftech.com',
      password: 'SuperAdmin123!',
      permissions: [
        'manage_tenants',
        'manage_subscriptions',
        'manage_plans',
        'view_analytics',
        'manage_system_settings',
        'manage_super_admins',
        'view_billing',
        'manage_domains',
        'access_support',
        'manage_integrations'
      ]
    });
    console.log('✅ Super admin created: admin@i-expense.ikftech.com / SuperAdmin123!');
  } else {
    console.log('⚠️  Super admin already exists');
  }
}

async function createDefaultTenant() {
  console.log('\n🏢 Creating default tenant...');
  
  const existingTenant = await Tenant.findOne({ slug: 'demo' });
  
  if (existingTenant) {
    console.log('⚠️  Default tenant already exists');
    return existingTenant;
  }
  
  // Get the free plan
  const freePlan = await SubscriptionPlan.findOne({ slug: 'free' });
  
  // Create default tenant
  const tenant = await Tenant.create({
    name: 'Demo Organization',
    slug: 'demo',
    plan: 'free',
    status: 'active',
    settings: {
      maxUsers: freePlan.limits.users,
      maxExpenses: freePlan.limits.expenses,
      storageLimit: freePlan.limits.storage,
      features: freePlan.availableFeatures
    },
    metadata: {
      source: 'migration',
      industry: 'Technology'
    }
  });
  
  console.log('✅ Default tenant created: demo.i-expense.ikftech.com');
  return tenant;
}

async function migrateExistingData() {
  console.log('\n🔄 Migrating existing data...');
  
  const tenant = await Tenant.findOne({ slug: 'demo' });
  if (!tenant) {
    throw new Error('Default tenant not found');
  }
  
  // Check if data has already been migrated
  const existingTenantUser = await User.findOne({ tenantId: tenant._id });
  if (existingTenantUser) {
    console.log('⚠️  Data already migrated');
    return;
  }
  
  // Migrate Users
  console.log('📦 Migrating users...');
  const users = await User.find({ tenantId: { $exists: false } });
  
  if (users.length > 0) {
    for (const user of users) {
      user.tenantId = tenant._id;
      user.tenantRole = user.email.includes('admin') ? 'tenant_admin' : 'user';
      await user.save();
    }
    console.log(`✅ Migrated ${users.length} users`);
    
    // Update tenant owner to first admin user
    const adminUser = users.find(u => u.tenantRole === 'tenant_admin');
    if (adminUser && !tenant.owner) {
      tenant.owner = adminUser._id;
      await tenant.save();
    }
  }
  
  // Migrate Roles
  console.log('📦 Migrating roles...');
  const roles = await Role.find({ tenantId: { $exists: false } });
  
  if (roles.length > 0) {
    for (const role of roles) {
      role.tenantId = tenant._id;
      await role.save();
    }
    console.log(`✅ Migrated ${roles.length} roles`);
  }
  
  // Migrate Categories
  console.log('📦 Migrating categories...');
  const categories = await Category.find({ tenantId: { $exists: false } });
  
  if (categories.length > 0) {
    for (const category of categories) {
      category.tenantId = tenant._id;
      await category.save();
    }
    console.log(`✅ Migrated ${categories.length} categories`);
  }
  
  // Migrate Expenses
  console.log('📦 Migrating expenses...');
  const expenses = await Expense.find({ tenantId: { $exists: false } });
  
  if (expenses.length > 0) {
    for (const expense of expenses) {
      expense.tenantId = tenant._id;
      await expense.save();
    }
    console.log(`✅ Migrated ${expenses.length} expenses`);
  }
  
  // Migrate Activities
  console.log('📦 Migrating activities...');
  const activities = await Activity.find({ tenantId: { $exists: false } });
  
  if (activities.length > 0) {
    for (const activity of activities) {
      activity.tenantId = tenant._id;
      await activity.save();
    }
    console.log(`✅ Migrated ${activities.length} activities`);
  }
  
  // Update tenant usage statistics
  console.log('📊 Updating usage statistics...');
  const userCount = await User.countDocuments({ tenantId: tenant._id, isActive: true });
  const expenseCount = await Expense.countDocuments({ tenantId: tenant._id });
  
  tenant.usage.currentUsers = userCount;
  tenant.usage.currentExpenses = expenseCount;
  tenant.usage.lastUpdated = new Date();
  await tenant.save();
  
  console.log(`✅ Updated usage: ${userCount} users, ${expenseCount} expenses`);
}

async function createIndexes() {
  console.log('\n🔍 Creating database indexes...');
  
  try {
    // Tenant indexes
    await Tenant.createIndexes();
    console.log('✅ Tenant indexes created');
    
    // SubscriptionPlan indexes
    await SubscriptionPlan.createIndexes();
    console.log('✅ SubscriptionPlan indexes created');
    
    // SuperAdmin indexes
    await SuperAdmin.createIndexes();
    console.log('✅ SuperAdmin indexes created');
    
    // User indexes
    await User.createIndexes();
    console.log('✅ User indexes created');
    
    // Other model indexes
    await Role.createIndexes();
    await Category.createIndexes();
    await Expense.createIndexes();
    await Activity.createIndexes();
    
    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
}

async function runMigration() {
  console.log('🚀 Starting multi-tenant migration...\n');
  
  try {
    await connectDB();
    
    await createSubscriptionPlans();
    await createSuperAdmin();
    const tenant = await createDefaultTenant();
    await migrateExistingData();
    await createIndexes();
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Subscription plans created');
    console.log('   - Super admin created: admin@i-expense.ikftech.com');
    console.log('   - Default tenant created: demo.i-expense.ikftech.com');
    console.log('   - Existing data migrated to tenant');
    console.log('   - Database indexes created');
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Update your server.js to include tenant middleware');
    console.log('   2. Test the migration with existing login credentials');
    console.log('   3. Update frontend to handle multi-tenant routing');
    console.log('   4. Configure domain routing in your reverse proxy');
    
    console.log('\n🔐 Access Details:');
    console.log('   Super Admin: https://admin.i-expense.ikftech.com');
    console.log('   Demo Tenant: https://demo.i-expense.ikftech.com');
    console.log('   Main Site: https://i-expense.ikftech.com');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Database connection closed');
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = {
  runMigration,
  createSubscriptionPlans,
  createSuperAdmin,
  createDefaultTenant,
  migrateExistingData
};