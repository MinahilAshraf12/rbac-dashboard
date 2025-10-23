require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { createUploadsDir } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', true);

// ============================================
// CORS Configuration - FIXED VERSION
// ============================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://i-expense.ikftech.com',
  'https://www.i-expense.ikftech.com',
  'https://admin.i-expense.ikftech.com',
  'https://rbac-dashboard-2.onrender.com',
  'https://rbac-frontend-pi.vercel.app',
  'https://i-expense.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all subdomains of i-expense.ikftech.com
    if (origin.endsWith('.i-expense.ikftech.com')) {
      return callback(null, true);
    }
    
    // Allow all Vercel deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow localhost on any port
    if (origin.includes('localhost')) {
      return callback(null, true);
    }
    
    // Check explicit allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // During development, allow all origins
    console.log('🔓 CORS: Allowing origin:', origin);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept',
    'X-Tenant-ID',
    'x-tenant-id',
    'Cache-Control',
    'Pragma',
    'X-Forwarded-Host',
    'Host'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ============================================
// Basic Middleware
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logger
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} from ${req.get('host') || 'unknown'}`);
  next();
});

// ============================================
// HEALTH CHECK (No authentication required)
// ============================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Multi-tenant server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ============================================
// PUBLIC ROUTES (No authentication or tenant required)
// ✅ CRITICAL: Must be BEFORE tenant middleware
// ============================================
const publicRoutes = require('./routes/publicRoutes');
app.use('/api/public', publicRoutes);

console.log('✅ Public routes registered at /api/public');

// ============================================
// SUPER ADMIN ROUTES (No tenant required)
// ✅ CRITICAL: Must be BEFORE tenant middleware
// ============================================
const superAdminAuthRoutes = require('./routes/super-admin/authRoutes');
const superAdminTenantRoutes = require('./routes/super-admin/tenantRoutes');
const superAdminAnalyticsRoutes = require('./routes/super-admin/analyticsRoutes');
const superAdminSubscriptionRoutes = require('./routes/super-admin/subscriptionRoutes');

app.use('/api/super-admin/auth', superAdminAuthRoutes);
app.use('/api/super-admin/tenants', superAdminTenantRoutes);
app.use('/api/super-admin/analytics', superAdminAnalyticsRoutes);
app.use('/api/super-admin/subscriptions', superAdminSubscriptionRoutes);

console.log('✅ Super admin routes registered');

// ============================================
// SEED & MIGRATION ROUTES (Development)
// ============================================
const seedRoutes = require('./routes/seedRoutes');
app.use('/api', seedRoutes);

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
// ⚠️ TENANT MIDDLEWARE
// Apply ONLY to protected routes below
// ============================================
const { identifyTenant, injectTenantContext, autoInjectTenantId } = require('./middleware/tenant');
const { protect } = require('./middleware/auth');

console.log('✅ Tenant middleware loaded');

// ============================================
// PROTECTED TENANT ROUTES
// ✅ These routes require tenant context
// ============================================
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

// Auth routes (login, logout, me)
if (authRoutes && typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes registered');
} else {
  console.error('❌ Auth routes not loaded properly');
}

// Subscription routes (public access to check limits)
if (subscriptionRoutes && typeof subscriptionRoutes === 'function') {
  app.use('/api/subscription', subscriptionRoutes);
  console.log('✅ Subscription routes registered');
} else {
  console.error('❌ Subscription routes not loaded properly');
}

// ============================================
// PROTECTED ROUTES WITH TENANT MIDDLEWARE
// ✅ Apply tenant detection + authentication
// ============================================

// Users (requires auth + tenant)
if (userRoutes && typeof userRoutes === 'function') {
  app.use('/api/users', protect, identifyTenant, userRoutes);
  console.log('✅ User routes registered with tenant middleware');
} else {
  console.error('❌ User routes not loaded properly');
}

// Roles (requires auth + tenant)
if (roleRoutes && typeof roleRoutes === 'function') {
  app.use('/api/roles', protect, identifyTenant, roleRoutes);
  console.log('✅ Role routes registered with tenant middleware');
} else {
  console.error('❌ Role routes not loaded properly');
}

// Categories (requires auth + tenant)
if (categoryRoutes && typeof categoryRoutes === 'function') {
  app.use('/api/categories', protect, identifyTenant, categoryRoutes);
  console.log('✅ Category routes registered with tenant middleware');
} else {
  console.error('❌ Category routes not loaded properly');
}

// Expenses (requires auth + tenant)
if (expenseRoutes && typeof expenseRoutes === 'function') {
  app.use('/api/expenses', protect, identifyTenant, expenseRoutes);
  console.log('✅ Expense routes registered with tenant middleware');
} else {
  console.error('❌ Expense routes not loaded properly');
}

// Activities (requires auth + tenant)
if (activityRoutes && typeof activityRoutes === 'function') {
  app.use('/api/activities', protect, identifyTenant, activityRoutes);
  console.log('✅ Activity routes registered with tenant middleware');
} else {
  console.error('❌ Activity routes not loaded properly');
}

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
          'PUT    /api/super-admin/tenants/:id/reactivate'
        ],
        analytics: [
          'GET /api/super-admin/analytics/dashboard',
          'GET /api/super-admin/analytics/system',
          'GET /api/super-admin/analytics/tenants'
        ]
      }
    });
  }
  
  // Main public site
  if (hostname === 'i-expense.ikftech.com' || hostname.includes('localhost')) {
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
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE (Must be last)
// ============================================
if (errorHandler && typeof errorHandler === 'function') {
  app.use(errorHandler);
} else {
  // Fallback error handler
  app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });
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
      console.log('🔗 Main Site: https://i-expense.ikftech.com');
      console.log('🔗 Super Admin: https://admin.i-expense.ikftech.com');
      console.log('🔗 Tenant Pattern: https://{tenant}.i-expense.ikftech.com');
      console.log('🔗 Backend API: https://rbac-dashboard-2.onrender.com');
      console.log('🔗 Local Dev: http://localhost:5000');
      
      console.log('\n📋 Route Registration Summary:');
      console.log('  ✅ Public routes (no middleware)');
      console.log('  ✅ Super admin routes (no tenant)');
      console.log('  ✅ Protected routes (with tenant middleware)');
      
      console.log('\n🔓 Public Routes (No auth required):');
      console.log('  - GET  /api/health');
      console.log('  - POST /api/public/signup');
      console.log('  - POST /api/public/login');
      console.log('  - GET  /api/public/check-slug/:slug');
      console.log('  - GET  /api/public/tenant/:slug ⭐ KEY ROUTE');
      console.log('  - GET  /api/public/plans');
      
      console.log('\n👑 Super Admin Routes:');
      console.log('  - POST /api/super-admin/auth/login');
      console.log('  - GET  /api/super-admin/auth/me');
      console.log('  - GET  /api/super-admin/tenants');
      console.log('  - GET  /api/super-admin/analytics/dashboard');
      
      console.log('\n🏢 Tenant Routes (Requires auth + tenant):');
      console.log('  - POST /api/auth/login');
      console.log('  - GET  /api/auth/me');
      console.log('  - GET  /api/users');
      console.log('  - GET  /api/expenses');
      console.log('  - GET  /api/categories');
      
      console.log('\n🔑 Default Credentials:');
      console.log('  Super Admin: admin@i-expense.ikftech.com / SuperAdmin123!');
      
      console.log('\n✅ Server Ready - All Routes Registered!');
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
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚡ SIGINT received. Shutting down gracefully...');
  mongoose.connection.close();
  process.exit(0);
});

module.exports = app;
