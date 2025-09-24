require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { createUploadsDir } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// MULTI-TENANT MIDDLEWARE
const { identifyTenant, injectTenantContext, autoInjectTenantId } = require('./middleware/tenant');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const seedRoutes = require('./routes/seedRoutes');
const superAdminAuthRoutes = require('./routes/super-admin/authRoutes');
const superAdminTenantRoutes = require('./routes/super-admin/tenantRoutes');
const superAdminAnalyticsRoutes = require('./routes/super-admin/analyticsRoutes');
const superAdminSubscriptionRoutes = require('./routes/super-admin/subscriptionRoutes');

// TODO: Create these new routes
// const superAdminRoutes = require('./routes/super-admin/tenantRoutes');
// const publicRoutes = require('./routes/public/authRoutes');

const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', true);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:3002',
      'https://i-expense.ikftech.com',
      'https://admin.i-expense.ikftech.com',
      'https://demo.i-expense.ikftech.com'
    ];
    
    // Check exact match
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check wildcard subdomains
    if (origin.endsWith('.i-expense.ikftech.com')) {
      return callback(null, true);
    }
    
    // For development, allow anyway
    console.log('CORS blocking origin:', origin);
    callback(null, true); // ALLOW ALL during development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MULTI-TENANT MIDDLEWARE - Add tenant identification before routes
app.use(identifyTenant);
app.use(injectTenantContext);
app.use(autoInjectTenantId); 

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

// Add to server.js temporarily for debugging
// app.get('/api/debug/tenant', (req, res) => {
//   res.json({
//     hasTenant: !!req.tenant,
//     tenant: req.tenant ? {
//       id: req.tenant._id,
//       name: req.tenant.name,
//       slug: req.tenant.slug
//     } : null,
//     hostname: req.get('host'),
//     path: req.path
//   });
// });
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
// Super Admin routes (only accessible on admin.i-expense.ikftech.com)
app.use('/api/super-admin/auth', superAdminAuthRoutes);
app.use('/api/super-admin/tenants', superAdminTenantRoutes);
app.use('/api/super-admin/analytics', superAdminAnalyticsRoutes);
app.use('/api/super-admin/subscriptions', superAdminSubscriptionRoutes);

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

app.get("/", (req, res) => {
  const hostname = req.get('host');

    // Handle Render backend domain FIRST
  if (hostname.includes('.onrender.com')) {
    return res.json({
      success: true,
      message: "Multi-Tenant Expense Management API - Backend Server",
      version: "2.0.0",
      environment: process.env.NODE_ENV || 'production',
      server: "Render Backend",
      domains: {
        backend: hostname,
        super_admin: "admin.i-expense.ikftech.com",
        demo_tenant: "demo.i-expense.ikftech.com",
        main_site: "i-expense.ikftech.com"
      },
      endpoints: {
        health: "/api/health",
        public_plans: "/api/public/plans", 
        migration: "/api/migrate"
      },
      note: "This is the backend API. Use proper domains for frontend access."
    });
  }
  
  if (hostname === 'admin.i-expense.ikftech.com') {
    res.json({
      message: "Super Admin Dashboard API",
      tenant: null,
      isSuperAdmin: true,
      version: "2.0.0-super-admin",
      endpoints: {
        auth: [
          'POST /api/super-admin/auth/login',
          'GET  /api/super-admin/auth/me',
          'GET  /api/super-admin/auth/logout',
          'PUT  /api/super-admin/auth/change-password',
          'PUT  /api/super-admin/auth/profile',
          'GET  /api/super-admin/auth/dashboard'
        ],
        tenants: [
          'GET    /api/super-admin/tenants',
          'POST   /api/super-admin/tenants',
          'GET    /api/super-admin/tenants/:id',
          'PUT    /api/super-admin/tenants/:id',
          'DELETE /api/super-admin/tenants/:id',
          'PUT    /api/super-admin/tenants/:id/suspend',
          'PUT    /api/super-admin/tenants/:id/reactivate',
          'GET    /api/super-admin/tenants/:id/usage',
          'GET    /api/super-admin/tenants/:id/activities',
          'PUT    /api/super-admin/tenants/:id/verify-domain'
        ],
        analytics: [
          'GET /api/super-admin/analytics/dashboard',
          'GET /api/super-admin/analytics/system',
          'GET /api/super-admin/analytics/tenants',
          'GET /api/super-admin/analytics/revenue',
          'GET /api/super-admin/analytics/engagement',
          'GET /api/super-admin/analytics/export'
        ],
        subscriptions: [
          'GET    /api/super-admin/subscriptions/plans',
          'POST   /api/super-admin/subscriptions/plans',
          'GET    /api/super-admin/subscriptions/plans/:id',
          'PUT    /api/super-admin/subscriptions/plans/:id',
          'DELETE /api/super-admin/subscriptions/plans/:id',
          'GET    /api/super-admin/subscriptions/stats',
          'PUT    /api/super-admin/subscriptions/migrate-tenant/:tenantId',
          'PUT    /api/super-admin/subscriptions/bulk-update'
        ]
      }
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
      console.log('✅ Super Admin system enabled');
      
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
      console.log('- POST /api/super-admin/auth/login - Super admin login');
      console.log('- GET  /api/super-admin/auth/me - Get current super admin');
      console.log('- GET  /api/super-admin/tenants/* - Tenant management');
      console.log('- GET  /api/super-admin/analytics/* - System analytics');
      console.log('- GET  /api/super-admin/subscriptions/* - Subscription management');
      
      console.log('\n🏢 Tenant Routes ({tenant}.i-expense.ikftech.com):');
      console.log('- /api/auth/* - Authentication');
      console.log('- /api/users/* - User management');
      console.log('- /api/roles/* - Role management');
      console.log('- /api/categories/* - Category management');
      console.log('- /api/expenses/* - Expense management');
      console.log('- /api/activities/* - Activity tracking');
      
      console.log('\n🔑 Default Credentials:');
      console.log('Super Admin: admin@i-expense.ikftech.com / SuperAdmin123!');
      console.log('Demo Tenant: demo.i-expense.ikftech.com (existing users)');
      
      console.log('\n✅ Phase 2 Complete - Super Admin Backend Ready!');
      console.log('\n💡 Next Steps:');
      console.log('1. Test Super Admin login: POST admin.i-expense.ikftech.com/api/super-admin/auth/login');
      console.log('2. Test tenant management endpoints');
      console.log('3. Test analytics endpoints');
      console.log('4. Run migration: POST /api/migrate');
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