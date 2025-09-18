require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { createUploadsDir } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// MULTI-TENANT MIDDLEWARE
const { identifyTenant, injectTenantContext } = require('./middleware/tenant');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const seedRoutes = require('./routes/seedRoutes');

// TODO: Create these new routes
// const superAdminRoutes = require('./routes/super-admin/tenantRoutes');
// const publicRoutes = require('./routes/public/authRoutes');

const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', true);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests from any subdomain of i-expense.ikftech.com
    if (!origin) return callback(null, true);
    
    const allowedDomains = [
      'i-expense.ikftech.com',
      'admin.i-expense.ikftech.com',
      'localhost:3000',
      'localhost:3001',
      'localhost:3002'
    ];
    
    // Check if origin is a subdomain of i-expense.ikftech.com
    const isSubdomain = origin.endsWith('.i-expense.ikftech.com');
    const isAllowed = allowedDomains.includes(origin) || isSubdomain;
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MULTI-TENANT MIDDLEWARE - Add tenant identification before routes
app.use(identifyTenant);
app.use(injectTenantContext);

// Health check route (before tenant middleware for monitoring)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Multi-tenant server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    tenant: req.tenant ? {
      id: req.tenant._id,
      name: req.tenant.name,
      slug: req.tenant.slug,
      plan: req.tenant.plan,
      status: req.tenant.status
    } : null,
    isSuperAdmin: req.isSuperAdmin || false
  });
});

// Public routes (no tenant required)
app.get('/api/public/plans', async (req, res) => {
  try {
    const SubscriptionPlan = require('./models/SubscriptionPlan');
    const plans = await SubscriptionPlan.getActivePlans();
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching plans'
    });
  }
});

// Super Admin routes (TODO: Create these)
/*
app.use('/api/super-admin/tenants', requireSuperAdmin, superAdminTenantRoutes);
app.use('/api/super-admin/subscriptions', requireSuperAdmin, superAdminSubscriptionRoutes);
app.use('/api/super-admin/analytics', requireSuperAdmin, superAdminAnalyticsRoutes);
*/

// Tenant-specific routes (existing routes with tenant context)
if (authRoutes && typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
} else {
  console.error('❌ Auth routes not loaded properly');
}

if (userRoutes && typeof userRoutes === 'function') {
  app.use('/api/users', userRoutes);
} else {
  console.error('❌ User routes not loaded properly');
}

if (roleRoutes && typeof roleRoutes === 'function') {
  app.use('/api/roles', roleRoutes);
} else {
  console.error('❌ Role routes not loaded properly');
}

if (categoryRoutes && typeof categoryRoutes === 'function') {
  app.use('/api/categories', categoryRoutes);
} else {
  console.error('❌ Category routes not loaded properly');
}

if (expenseRoutes && typeof expenseRoutes === 'function') {
  app.use('/api/expenses', expenseRoutes);
} else {
  console.error('❌ Expense routes not loaded properly');
}

if (activityRoutes && typeof activityRoutes === 'function') {
  app.use('/api/activities', activityRoutes);
} else {
  console.error('❌ Activity routes not loaded properly');
}

// Seed routes (for development)
if (seedRoutes && typeof seedRoutes === 'function') {
  app.use('/api', seedRoutes);
} else {
  console.error('❌ Seed routes not loaded properly');
}

// Migration route (for development)
app.post('/api/migrate', async (req, res) => {
  try {
    const { runMigration } = require('./scripts/migrate-to-multitenant');
    await runMigration();
    res.json({
      success: true,
      message: 'Migration completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

// Domain-specific home routes
app.get("/", (req, res) => {
  const hostname = req.get('host');
  
  if (hostname === 'admin.i-expense.ikftech.com') {
    res.json({
      message: "Super Admin Dashboard API",
      tenant: null,
      isSuperAdmin: true,
      endpoints: [
        '/api/super-admin/tenants',
        '/api/super-admin/subscriptions',
        '/api/super-admin/analytics'
      ]
    });
  } else if (hostname === 'i-expense.ikftech.com') {
    res.json({
      message: "Multi-Tenant SaaS Expense Management API",
      version: "2.0.0",
      endpoints: [
        '/api/public/plans',
        '/api/health'
      ]
    });
  } else if (req.tenant) {
    res.json({
      message: `${req.tenant.name} - Expense Management API`,
      tenant: {
        name: req.tenant.name,
        slug: req.tenant.slug,
        plan: req.tenant.plan,
        status: req.tenant.status,
        domain: req.tenant.fullDomain
      },
      endpoints: [
        '/api/auth',
        '/api/users',
        '/api/roles', 
        '/api/categories',
        '/api/expenses',
        '/api/activities'
      ]
    });
  } else {
    res.status(404).json({
      success: false,
      message: "Organization not found",
      hostname
    });
  }
});

// Error handling middleware (must be last)
if (errorHandler && typeof errorHandler === 'function') {
  app.use(errorHandler);
}

// 404 handler for API routes only
// app.use('/api/*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: `API route ${req.originalUrl} not found`,
//     tenant: req.tenant ? req.tenant.slug : null
//   });
// });

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await createUploadsDir();
    await connectDB();
    
    // Create default super admin on startup
    const SuperAdmin = require('./models/SuperAdmin');
    await SuperAdmin.createDefaultAdmin();
    
    app.listen(PORT, () => {
      console.log('\n🚀 Multi-Tenant Expense Management API');
      console.log('==========================================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('MongoDB Connected');
      console.log('Multi-tenant architecture enabled');
      console.log('File uploads enabled');
      console.log('Activity logging system enabled');
      
      console.log('\n🌐 Domain Configuration:');
      console.log('- Main Site: https://i-expense.ikftech.com');
      console.log('- Super Admin: https://admin.i-expense.ikftech.com');
      console.log('- Tenant Pattern: https://{tenant}.i-expense.ikftech.com');
      
      console.log('\n📋 Available API endpoints:');
      console.log('🔓 Public Routes:');
      console.log('- GET  /api/health - Health check');
      console.log('- GET  /api/public/plans - Subscription plans');
      console.log('- POST /api/migrate - Run migration (dev only)');
      
      console.log('\n👑 Super Admin Routes (admin.i-expense.ikftech.com):');
      console.log('- /api/super-admin/* - Super admin management');
      
      console.log('\n🏢 Tenant Routes ({tenant}.i-expense.ikftech.com):');
      console.log('- /api/auth/* - Authentication');
      console.log('- /api/users/* - User management');
      console.log('- /api/roles/* - Role management');
      console.log('- /api/categories/* - Category management');
      console.log('- /api/expenses/* - Expense management');
      console.log('- /api/activities/* - Activity tracking');
      
      console.log('\n🔐 Default Credentials:');
      console.log('Super Admin: admin@i-expense.ikftech.com / SuperAdmin123!');
      console.log('Demo Tenant: demo.i-expense.ikftech.com (existing users)');
      
      console.log('\n✅ Server ready for multi-tenant connections!');
      console.log('\n💡 Next Steps:');
      console.log('1. Run migration: POST /api/migrate');
      console.log('2. Test with existing credentials on demo.i-expense.ikftech.com');
      console.log('3. Access super admin at admin.i-expense.ikftech.com');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', () => {
  console.log('\n⚡ SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚡ SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;