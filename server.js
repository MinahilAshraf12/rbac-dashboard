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
// const {  injectTenantContext, autoInjectTenantId } = require('./middleware/tenant');

const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', true);

// ============================================
// CORS Configuration
// ============================================
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
    callback(null, true); // ALLOW ALL during development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept',
    'X-Tenant-ID',  // ⬅️ ADD THIS
    'x-tenant-id'   // ⬅️ ADD THIS (lowercase version)
  ]
}));

// ============================================
// Basic Middleware
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// HEALTH CHECK (No authentication required)
// ============================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Multi-tenant server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// PUBLIC ROUTES (No authentication or tenant required)
// Must be BEFORE tenant middleware
// ============================================
const publicRoutes = require('./routes/publicRoutes');
app.use('/api/public', publicRoutes);

// ============================================
// SUPER ADMIN ROUTES (No tenant required)
// Must be BEFORE tenant middleware
// ============================================
const superAdminAuthRoutes = require('./routes/super-admin/authRoutes');
const superAdminTenantRoutes = require('./routes/super-admin/tenantRoutes');
const superAdminAnalyticsRoutes = require('./routes/super-admin/analyticsRoutes');
const superAdminSubscriptionRoutes = require('./routes/super-admin/subscriptionRoutes');

app.use('/api/super-admin/auth', superAdminAuthRoutes);
app.use('/api/super-admin/tenants', superAdminTenantRoutes);
app.use('/api/super-admin/analytics', superAdminAnalyticsRoutes);
app.use('/api/super-admin/subscriptions', superAdminSubscriptionRoutes);

// ============================================
// MULTI-TENANT MIDDLEWARE
// Apply tenant context to all routes below
// ============================================
// app.use(identifyTenant);
// app.use(injectTenantContext);
// app.use(autoInjectTenantId);

// ============================================
// SUBSCRIPTION ROUTES (Requires tenant context)
// ============================================
const subscriptionRoutes = require('./routes/subscriptionRoutes');
app.use('/api/subscription', subscriptionRoutes);

// ============================================
// TENANT-SCOPED ROUTES (Requires tenant context)
// ============================================
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const seedRoutes = require('./routes/seedRoutes');

// Auth routes with validation
if (authRoutes && typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
} else {
  console.error('❌ Auth routes not loaded properly');
}

// User routes with validation
if (userRoutes && typeof userRoutes === 'function') {
  app.use('/api/users', userRoutes);
} else {
  console.error('❌ User routes not loaded properly');
}

// Role routes with validation
if (roleRoutes && typeof roleRoutes === 'function') {
  app.use('/api/roles', roleRoutes);
} else {
  console.error('❌ Role routes not loaded properly');
}

// Category routes with validation
if (categoryRoutes && typeof categoryRoutes === 'function') {
  app.use('/api/categories', categoryRoutes);
} else {
  console.error('❌ Category routes not loaded properly');
}

// Expense routes with validation
if (expenseRoutes && typeof expenseRoutes === 'function') {
  app.use('/api/expenses', expenseRoutes);
} else {
  console.error('❌ Expense routes not loaded properly');
}

// Activity routes with validation
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

// ============================================
// MIGRATION ROUTE (Development only)
// ============================================
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

// ============================================
// ROOT ROUTE - API Documentation
// ============================================
app.get("/", (req, res) => {
  const hostname = req.get('host');

  // Handle Render backend domain FIRST
  if (hostname.includes('.onrender.com')) {
    return res.json({
      success: true,
      message: "Multi-Tenant Expense Management API - Backend Server",
      version: "3.0.0",
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
        public_signup: "/api/public/signup",
        public_login: "/api/public/login",
        public_plans: "/api/public/plans",
        check_slug: "/api/public/check-slug/:slug",
        tenant_info: "/api/public/tenant/:slug"
      },
      note: "This is the backend API. Use proper domains for frontend access."
    });
  }
  
  // Super Admin Dashboard API
  if (hostname === 'admin.i-expense.ikftech.com') {
    return res.json({
      message: "Super Admin Dashboard API",
      tenant: null,
      isSuperAdmin: true,
      version: "3.0.0-super-admin",
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
          'GET    /api/super-admin/tenants/:id/activities'
        ],
        analytics: [
          'GET /api/super-admin/analytics/dashboard',
          'GET /api/super-admin/analytics/system',
          'GET /api/super-admin/analytics/tenants',
          'GET /api/super-admin/analytics/revenue'
        ],
        subscriptions: [
          'GET    /api/super-admin/subscriptions/plans',
          'POST   /api/super-admin/subscriptions/plans',
          'GET    /api/super-admin/subscriptions/plans/:id',
          'PUT    /api/super-admin/subscriptions/plans/:id',
          'DELETE /api/super-admin/subscriptions/plans/:id'
        ]
      }
    });
  }
  
  // Main public site
  if (hostname === 'i-expense.ikftech.com' || hostname === 'localhost:5000') {
    return res.json({
      message: "Multi-Tenant SaaS Expense Management API",
      version: "3.0.0",
      public_endpoints: [
        'GET  /api/health',
        'POST /api/public/signup',
        'POST /api/public/login',
        'GET  /api/public/check-slug/:slug',
        'GET  /api/public/tenant/:slug',
        'GET  /api/public/plans'
      ],
      super_admin: 'https://admin.i-expense.ikftech.com',
      tenant_pattern: 'https://{tenant-slug}.i-expense.ikftech.com'
    });
  }
  
  // Tenant-specific API
  if (req.tenant) {
    return res.json({
      message: `${req.tenant.name} - Expense Management API`,
      tenant: {
        name: req.tenant.name,
        slug: req.tenant.slug,
        plan: req.tenant.plan,
        status: req.tenant.status
      },
      endpoints: [
        '/api/auth',
        '/api/users',
        '/api/roles', 
        '/api/categories',
        '/api/expenses',
        '/api/activities',
        '/api/subscription'
      ]
    });
  }
  
  // Fallback - Organization not found
  res.status(404).json({
    success: false,
    message: "Organization not found",
    hostname,
    hint: "Use format: {tenant-slug}.i-expense.ikftech.com"
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE (Must be last)
// ============================================
if (errorHandler && typeof errorHandler === 'function') {
  app.use(errorHandler);
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Create uploads directory
    await createUploadsDir();
    
    // Connect to MongoDB
    await connectDB();
    
    // Create default super admin on startup
    const SuperAdmin = require('./models/SuperAdmin');
    await SuperAdmin.createDefaultAdmin();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log('\n🚀 Multi-Tenant Expense Management API');
      console.log('==========================================');
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('✅ MongoDB Connected');
      console.log('✅ Multi-tenant architecture enabled');
      console.log('✅ File uploads enabled');
      console.log('✅ Activity logging enabled');
      console.log('✅ Super Admin system enabled');
      
      console.log('\n🌐 Domain Configuration:');
      console.log('📍 Main Site: https://i-expense.ikftech.com');
      console.log('📍 Super Admin: https://admin.i-expense.ikftech.com');
      console.log('📍 Tenant Pattern: https://{tenant}.i-expense.ikftech.com');
      console.log('📍 Local Dev: http://localhost:5000');
      
      console.log('\n📋 Available API Endpoints:');
      
      console.log('\n🔓 Public Routes (No auth required):');
      console.log('  - GET  /api/health');
      console.log('  - POST /api/public/signup');
      console.log('  - POST /api/public/login');
      console.log('  - GET  /api/public/check-slug/:slug');
      console.log('  - GET  /api/public/tenant/:slug');
      console.log('  - GET  /api/public/plans');
      
      console.log('\n👑 Super Admin Routes:');
      console.log('  - POST /api/super-admin/auth/login');
      console.log('  - GET  /api/super-admin/auth/me');
      console.log('  - GET  /api/super-admin/tenants');
      console.log('  - GET  /api/super-admin/analytics/dashboard');
      console.log('  - GET  /api/super-admin/subscriptions/plans');
      
      console.log('\n🏢 Tenant Routes (Requires tenant context):');
      console.log('  - POST /api/auth/login');
      console.log('  - GET  /api/auth/me');
      console.log('  - GET  /api/users');
      console.log('  - GET  /api/expenses');
      console.log('  - GET  /api/categories');
      console.log('  - GET  /api/subscription/usage');
      
      console.log('\n🔑 Default Credentials:');
      console.log('  Super Admin: admin@i-expense.ikftech.com / SuperAdmin123!');
      
      console.log('\n✅ Phase 3 Ready - Tenant Signup & Auth System Active!');
      console.log('\n💡 Next Steps:');
      console.log('  1. Test tenant signup: POST /api/public/signup');
      console.log('  2. Test tenant login: POST /api/public/login');
      console.log('  3. Test frontend at: http://localhost:3000');
      console.log('==========================================\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('\n⚡ SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚡ SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;