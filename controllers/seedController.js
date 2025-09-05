const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const Expense = require('../models/Expense');

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

    // Create roles
    const roles = [
      {
        name: 'Administrator',
        description: 'Full system access with all permissions',
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
        priority: 100
      },
      {
        name: 'Admin', 
        description: 'Administrative access with most permissions',
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
        priority: 80
      },
      {
        name: 'Editor',
        description: 'Content management and editing permissions',
        permissions: [
          { resource: 'categories', actions: ['create', 'read', 'update'] },
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'users', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 60
      },
      {
        name: 'User',
        description: 'Basic user with expense management permissions',
        permissions: [
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'categories', actions: ['read'] },
          { resource: 'dashboard', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 40
      }
    ];

    const createdRoles = await Role.insertMany(roles);
    console.log('✓ Roles seeded successfully');

    const adminRole = createdRoles.find(role => role.name === 'Administrator');
    const editorRole = createdRoles.find(role => role.name === 'Editor');
    const userRole = createdRoles.find(role => role.name === 'User');

    // Create users
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const users = [
      {
        name: 'System Administrator',
        email: 'admin@example.com',
        password: hashedPassword,
        role: adminRole._id,
        isActive: true
      },
      {
        name: 'John Editor',
        email: 'editor@example.com',
        password: hashedPassword,
        role: editorRole._id,
        isActive: true
      },
      {
        name: 'Jane User',
        email: 'user@example.com',
        password: hashedPassword,
        role: userRole._id,
        isActive: true
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log('✓ Users seeded successfully');

    const adminUser = createdUsers.find(user => user.email === 'admin@example.com');

    // Create categories
    const categories = [
      {
        name: 'Food & Dining',
        description: 'Restaurant meals, groceries, and dining expenses',
        isActive: true,
        sortOrder: 1,
        createdBy: adminUser._id
      },
      {
        name: 'Transportation',
        description: 'Travel, fuel, parking, and transport expenses',
        isActive: true,
        sortOrder: 2,
        createdBy: adminUser._id
      },
      {
        name: 'Office Supplies',
        description: 'Stationery, equipment, and office-related expenses',
        isActive: true,
        sortOrder: 3,
        createdBy: adminUser._id
      },
      {
        name: 'Technology',
        description: 'Software, hardware, and IT-related expenses',
        isActive: true,
        sortOrder: 4,
        createdBy: adminUser._id
      },
      {
        name: 'Entertainment',
        description: 'Team events, recreation, and entertainment expenses',
        isActive: true,
        sortOrder: 5,
        createdBy: adminUser._id
      },
      {
        name: 'Utilities',
        description: 'Electricity, internet, phone, and utility bills',
        isActive: true,
        sortOrder: 6,
        createdBy: adminUser._id
      },
      {
        name: 'Healthcare',
        description: 'Medical, dental, and health-related expenses',
        isActive: true,
        sortOrder: 7,
        createdBy: adminUser._id
      },
      {
        name: 'Education & Training',
        description: 'Courses, workshops, and educational expenses',
        isActive: true,
        sortOrder: 8,
        createdBy: adminUser._id
      }
    ];

    const createdCategories = await Category.insertMany(categories);
    console.log('✓ Categories seeded successfully');

    // Create sample expenses
    const sampleExpenses = [
      {
        title: 'Team Lunch Meeting',
        description: 'Monthly team lunch at downtown restaurant',
        date: new Date('2024-01-15'),
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
        category: createdCategories.find(c => c.name === 'Office Supplies')._id,
        payments: [
          { 
            user: 'Sarah Wilson', 
            amount: 156.89,
            subCategory: 'Stationery',
            category: createdCategories.find(c => c.name === 'Office Supplies')._id
          }
        ],
        createdBy: createdUsers.find(u => u.role.toString() === editorRole._id.toString())?._id || adminUser._id,
        status: 'pending'
      },
      {
        title: 'Client Transportation',
        description: 'Uber rides for client meetings',
        date: new Date('2024-01-12'),
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
      },
      {
        title: 'Monthly Internet Bill',
        description: 'Office internet service payment',
        date: new Date('2024-01-01'),
        category: createdCategories.find(c => c.name === 'Utilities')._id,
        payments: [
          { 
            user: 'Admin Office', 
            amount: 89.99,
            subCategory: 'Internet',
            category: createdCategories.find(c => c.name === 'Utilities')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
      
        title: 'Training Workshop',
        description: 'Professional development workshop for team',
        date: new Date('2024-01-20'),
        category: createdCategories.find(c => c.name === 'Education & Training')._id,
        payments: [
          { 
            user: 'Emily Davis', 
            amount: 299.00,
            subCategory: 'Workshops',
            category: createdCategories.find(c => c.name === 'Education & Training')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'pending'
      }
    ];

    await Expense.insertMany(sampleExpenses);
    console.log('✓ Sample expenses seeded successfully');

    console.log('\n🎉 Database seeded successfully!');
    console.log('\n📝 Login credentials:');
    console.log('   Admin: admin@example.com / admin123');
    console.log('   Editor: editor@example.com / admin123');
    console.log('   User: user@example.com / admin123');
    console.log('\n🚀 Ready for frontend connection!');
    
    res.status(200).json({
      success: true,
      message: 'Database seeded successfully',
      data: {
        roles: createdRoles.length,
        users: createdUsers.length,
        categories: createdCategories.length,
        expenses: sampleExpenses.length
      }
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