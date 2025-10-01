const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const Expense = require('../models/Expense');
const Tenant = require('../models/Tenant');
const SubscriptionPlan = require('../models/SubscriptionPlan');

// @desc    Seed database with sample data
// @route   GET/POST /api/seed
// @access  Public (for development only)
const seedDatabase = async (req, res) => {
  try {
    console.log('Starting database seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Role.deleteMany({});
    await Category.deleteMany({});
    await Expense.deleteMany({});
    await Tenant.deleteMany({});
    await SubscriptionPlan.deleteMany({});

    // Create subscription plans first
    const subscriptionPlans = [
      {
        name: 'Free',
        slug: 'free',
        description: 'Perfect for getting started with basic expense tracking',
        price: { monthly: 0, yearly: 0 },
        currency: 'USD',
        stripeProductId: 'prod_free_plan',
        stripePriceIds: { monthly: 'price_free_monthly', yearly: 'price_free_yearly' },
        features: [
          { name: 'Up to 5 users', included: true },
          { name: '100 expenses per month', included: true },
          { name: '1GB storage', included: true },
          { name: 'Basic reports', included: true }
        ],
        limits: {
          users: 5,
          expenses: 100,
          storage: 1024, // 1GB in MB
          categories: 20,
          apiCalls: 1000,
          fileUploadSize: 5
        },
        availableFeatures: ['basic_reports', 'file_uploads'],
        isActive: true,
        isPopular: false,
        sortOrder: 1,
        trial: { enabled: true, days: 14 }
      },
      {
        name: 'Basic',
        slug: 'basic',
        description: 'Growing teams with advanced features',
        price: { monthly: 29, yearly: 290 },
        currency: 'USD',
        stripeProductId: 'prod_basic_plan',
        stripePriceIds: { monthly: 'price_basic_monthly', yearly: 'price_basic_yearly' },
        features: [
          { name: 'Up to 25 users', included: true },
          { name: '1000 expenses per month', included: true },
          { name: '10GB storage', included: true },
          { name: 'Advanced reports', included: true },
          { name: 'API access', included: true }
        ],
        limits: {
          users: 25,
          expenses: 1000,
          storage: 10240, // 10GB in MB
          categories: -1, // Unlimited
          apiCalls: 10000,
          fileUploadSize: 10
        },
        availableFeatures: ['advanced_analytics', 'custom_categories', 'file_uploads', 'api_access'],
        isActive: true,
        isPopular: true,
        sortOrder: 2,
        trial: { enabled: true, days: 14 }
      },
      {
        name: 'Premium',
        slug: 'premium',
        description: 'Large organizations with enterprise needs',
        price: { monthly: 79, yearly: 790 },
        currency: 'USD',
        stripeProductId: 'prod_premium_plan',
        stripePriceIds: { monthly: 'price_premium_monthly', yearly: 'price_premium_yearly' },
        features: [
          { name: 'Up to 100 users', included: true },
          { name: 'Unlimited expenses', included: true },
          { name: '50GB storage', included: true },
          { name: 'All features included', included: true }
        ],
        limits: {
          users: 100,
          expenses: -1, // Unlimited
          storage: 51200, // 50GB in MB
          categories: -1, // Unlimited
          apiCalls: -1, // Unlimited
          fileUploadSize: 25
        },
        availableFeatures: [
          'advanced_analytics', 'custom_categories', 'file_uploads', 'api_access',
          'custom_domain', 'priority_support', 'data_export', 'audit_logs'
        ],
        isActive: true,
        isPopular: false,
        sortOrder: 3,
        trial: { enabled: true, days: 30 }
      }
    ];

    const createdPlans = await SubscriptionPlan.insertMany(subscriptionPlans);
    console.log('✓ Subscription plans seeded successfully');

    // Create demo tenant for development
    const demoTenant = await Tenant.create({
      name: 'Demo Organization',
      slug: 'demo',
      plan: 'basic',
      status: 'active',
      settings: {
        maxUsers: 25,
        maxExpenses: 1000,
        storageLimit: 10240,
        features: ['advanced_analytics', 'custom_categories', 'file_uploads', 'api_access']
      },
      usage: {
        currentUsers: 0,
        currentExpenses: 0,
        storageUsed: 0
      },
      metadata: {
        source: 'development_seed'
      }
    });

    console.log('✓ Demo tenant created successfully');

    // Create roles for the demo tenant
    const roles = [
      {
        name: 'Administrator',
        description: 'Full system access with all permissions',
        tenantId: demoTenant._id,
        permissions: [
          { resource: 'users', actions: ['manage'] },
          { resource: 'roles', actions: ['manage'] },
          { resource: 'categories', actions: ['manage'] },
          { resource: 'expenses', actions: ['manage'] },
          { resource: 'permissions', actions: ['manage'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'settings', actions: ['manage'] }
        ],
        isSystemRole: true,
        priority: 100,
        createdBy: null // Will be updated after user creation
      },
      {
        name: 'Manager', 
        description: 'Management access with most permissions',
        tenantId: demoTenant._id,
        permissions: [
          { resource: 'users', actions: ['create', 'read', 'update'] },
          { resource: 'roles', actions: ['read'] },
          { resource: 'categories', actions: ['manage'] },
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'permissions', actions: ['read'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'settings', actions: ['read', 'update'] }
        ],
        isSystemRole: true,
        priority: 80,
        createdBy: null
      },
      {
        name: 'Employee',
        description: 'Standard user with expense management permissions',
        tenantId: demoTenant._id,
        permissions: [
          { resource: 'categories', actions: ['read'] },
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'dashboard', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 60,
        createdBy: null
      },
      {
        name: 'Viewer',
        description: 'Read-only access to expenses and reports',
        tenantId: demoTenant._id,
        permissions: [
          { resource: 'expenses', actions: ['read'] },
          { resource: 'categories', actions: ['read'] },
          { resource: 'dashboard', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 40,
        createdBy: null
      }
    ];

    const createdRoles = await Role.insertMany(roles);
    console.log('✓ Roles seeded successfully');

    const adminRole = createdRoles.find(role => role.name === 'Administrator');
    const managerRole = createdRoles.find(role => role.name === 'Manager');
    const employeeRole = createdRoles.find(role => role.name === 'Employee');

    // Create users for demo tenant
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const users = [
      {
        name: 'Admin User',
        email: 'admin@demo.com',
        password: hashedPassword,
        tenantId: demoTenant._id,
        tenantRole: 'tenant_admin',
        role: adminRole._id,
        isActive: true
      },
      {
        name: 'Manager User',
        email: 'manager@demo.com',
        password: hashedPassword,
        tenantId: demoTenant._id,
        tenantRole: 'manager',
        role: managerRole._id,
        isActive: true
      },
      {
        name: 'Employee User',
        email: 'employee@demo.com',
        password: hashedPassword,
        tenantId: demoTenant._id,
        tenantRole: 'user',
        role: employeeRole._id,
        isActive: true
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log('✓ Users seeded successfully');

    const adminUser = createdUsers.find(user => user.email === 'admin@demo.com');

    // Update tenant owner
    demoTenant.owner = adminUser._id;
    await demoTenant.save();

    // Update role createdBy fields
    await Role.updateMany(
      { tenantId: demoTenant._id },
      { createdBy: adminUser._id }
    );

    // Create categories for demo tenant
    const categories = [
      {
        name: 'Food & Dining',
        description: 'Restaurant meals, groceries, and dining expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 1,
        createdBy: adminUser._id
      },
      {
        name: 'Transportation',
        description: 'Travel, fuel, parking, and transport expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 2,
        createdBy: adminUser._id
      },
      {
        name: 'Office Supplies',
        description: 'Stationery, equipment, and office-related expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 3,
        createdBy: adminUser._id
      },
      {
        name: 'Technology',
        description: 'Software, hardware, and IT-related expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 4,
        createdBy: adminUser._id
      },
      {
        name: 'Entertainment',
        description: 'Team events, recreation, and entertainment expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 5,
        createdBy: adminUser._id
      },
      {
        name: 'Utilities',
        description: 'Electricity, internet, phone, and utility bills',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 6,
        createdBy: adminUser._id
      },
      {
        name: 'Healthcare',
        description: 'Medical, dental, and health-related expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 7,
        createdBy: adminUser._id
      },
      {
        name: 'Education & Training',
        description: 'Courses, workshops, and educational expenses',
        tenantId: demoTenant._id,
        isActive: true,
        sortOrder: 8,
        createdBy: adminUser._id
      }
    ];

    const createdCategories = await Category.insertMany(categories);
    console.log('✓ Categories seeded successfully');

    // Create sample expenses for demo tenant
    const sampleExpenses = [
      {
        title: 'Team Lunch Meeting',
        description: 'Monthly team lunch at downtown restaurant',
        date: new Date('2024-01-15'),
        tenantId: demoTenant._id,
        category: createdCategories.find(c => c.name === 'Food & Dining')._id,
        payments: [
          { 
            user: 'John Doe', 
            amount: 45.50,
            subCategory: 'Restaurant',
            category: createdCategories.find(c => c.name === 'Food & Dining')._id
          },
          { 
            user: 'Jane Smith', 
            amount: 38.75,
            subCategory: 'Restaurant',
            category: createdCategories.find(c => c.name === 'Food & Dining')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Office WiFi Setup',
        description: 'Internet installation and router setup',
        date: new Date('2024-01-10'),
        tenantId: demoTenant._id,
        category: createdCategories.find(c => c.name === 'Technology')._id,
        payments: [
          { 
            user: 'Tech Support', 
            amount: 250.00,
            subCategory: 'Network Setup',
            category: createdCategories.find(c => c.name === 'Technology')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Quarterly Office Supplies',
        description: 'Bulk purchase of pens, papers, and office materials',
        date: new Date('2024-01-08'),
        tenantId: demoTenant._id,
        category: createdCategories.find(c => c.name === 'Office Supplies')._id,
        payments: [
          { 
            user: 'Sarah Wilson', 
            amount: 156.89,
            subCategory: 'Stationery',
            category: createdCategories.find(c => c.name === 'Office Supplies')._id
          }
        ],
        createdBy: createdUsers.find(u => u.tenantRole === 'manager')?._id || adminUser._id,
        status: 'pending'
      },
      {
        title: 'Client Transportation',
        description: 'Uber rides for client meetings',
        date: new Date('2024-01-12'),
        tenantId: demoTenant._id,
        category: createdCategories.find(c => c.name === 'Transportation')._id,
        payments: [
          { 
            user: 'Mike Johnson', 
            amount: 32.50,
            subCategory: 'Rideshare',
            category: createdCategories.find(c => c.name === 'Transportation')._id
          },
          { 
            user: 'David Brown', 
            amount: 28.75,
            subCategory: 'Rideshare',
            category: createdCategories.find(c => c.name === 'Transportation')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      }
    ];

    await Expense.insertMany(sampleExpenses);
    console.log('✓ Sample expenses seeded successfully');

    console.log('\n🎉 Database seeded successfully for multi-tenant development!');
    console.log('\n🔐 Login credentials:');
    console.log('   Tenant Admin: admin@demo.com / admin123');
    console.log('   Manager: manager@demo.com / admin123');
    console.log('   Employee: employee@demo.com / admin123');
    console.log('\n🏢 Demo tenant: demo.localhost:3000 (or localhost:3000 in development)');
    console.log('\n🚀 Ready for multi-tenant frontend connection!');
    
    res.status(200).json({
      success: true,
      message: 'Database seeded successfully with multi-tenant structure',
      data: {
        subscriptionPlans: createdPlans.length,
        tenant: {
          name: demoTenant.name,
          slug: demoTenant.slug,
          id: demoTenant._id
        },
        roles: createdRoles.length,
        users: createdUsers.length,
        categories: createdCategories.length,
        expenses: sampleExpenses.length
      },
      loginCredentials: [
        { email: 'admin@demo.com', password: 'admin123', role: 'Tenant Admin' },
        { email: 'manager@demo.com', password: 'admin123', role: 'Manager' },
        { email: 'employee@demo.com', password: 'admin123', role: 'Employee' }
      ]
    });
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    res.status(500).json({
      success: false,
      message: 'Error seeding database',
      error: error.message
    });
  }
};

module.exports = {
  seedDatabase
};