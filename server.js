require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { createUploadsDir } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const seedRoutes = require('./routes/seedRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Routes with validation
if (authRoutes && typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
} else {
  console.error('Auth routes not loaded properly');
}

if (userRoutes && typeof userRoutes === 'function') {
  app.use('/api/users', userRoutes);
} else {
  console.error('User routes not loaded properly');
}

if (roleRoutes && typeof roleRoutes === 'function') {
  app.use('/api/roles', roleRoutes);
} else {
  console.error('Role routes not loaded properly');
}

if (categoryRoutes && typeof categoryRoutes === 'function') {
  app.use('/api/categories', categoryRoutes);
} else {
  console.error('Category routes not loaded properly');
}

if (expenseRoutes && typeof expenseRoutes === 'function') {
  app.use('/api/expenses', expenseRoutes);
} else {
  console.error('Expense routes not loaded properly');
}

// Activity routes for real-time activity tracking
if (activityRoutes && typeof activityRoutes === 'function') {
  app.use('/api/activities', activityRoutes);
} else {
  console.error('Activity routes not loaded properly');
}

if (seedRoutes && typeof seedRoutes === 'function') {
  app.use('/api', seedRoutes);
} else {
  console.error('Seed routes not loaded properly');
}

// Error handling middleware (must be last)
if (errorHandler && typeof errorHandler === 'function') {
  app.use(errorHandler);
}

// if (notFoundHandler && typeof notFoundHandler === 'function') {
//   app.use(notFoundHandler);
// }

app.get("/", (req, res) => {
  res.send("Backend is working with custom domain 🚀");
});
// Add this to your existing server.js for LOCAL TESTING

// =====================
// LOCAL TENANT RESOLUTION MIDDLEWARE
// =====================
const localTenantResolver = (req, res, next) => {
  const host = req.get('Host');
  const referer = req.get('Referer');
  
  // For local development, check multiple ways to determine tenant
  console.log('Host:', host);
  console.log('Headers:', req.headers);
  
  // Method 1: Check custom header (we'll send this from frontend)
  if (req.headers['x-tenant-slug']) {
    req.userType = 'tenant';
    req.tenantSlug = req.headers['x-tenant-slug'];
  }
  // Method 2: Check query parameter (temporary for testing)
  else if (req.query.tenant) {
    req.userType = 'tenant';
    req.tenantSlug = req.query.tenant;
  }
  // Method 3: Check if admin in query/header
  else if (req.query.admin === 'true' || req.headers['x-admin'] === 'true') {
    req.userType = 'superadmin';
    req.tenantSlug = null;
  }
  // Method 4: Check for .local domains (if you added to hosts file)
  else if (host && host.includes('.local')) {
    const parts = host.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      if (subdomain === 'admin') {
        req.userType = 'superadmin';
        req.tenantSlug = null;
      } else {
        req.userType = 'tenant';
        req.tenantSlug = subdomain;
      }
    } else {
      req.userType = 'public';
      req.tenantSlug = null;
    }
  }
  // Default for localhost
  else {
    req.userType = 'public';
    req.tenantSlug = null;
  }
  
  console.log('Resolved - User Type:', req.userType, 'Tenant:', req.tenantSlug);
  next();
};

// =====================
// TENANT MODEL
// =====================
const TenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add tenant name'],
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Please add tenant slug'],
    unique: true,
    lowercase: true,
    trim: true
  },
  domain: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active'
  },
  plan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    default: 'starter'
  },
  settings: {
    maxUsers: { type: Number, default: 5 },
    maxExpenses: { type: Number, default: 1000 },
    features: {
      analytics: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      customCategories: { type: Boolean, default: true }
    }
  },
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Tenant = mongoose.model('Tenant', TenantSchema);

// =====================
// TENANT DATA MIDDLEWARE
// =====================
const tenantDataMiddleware = async (req, res, next) => {
  if (req.userType === 'tenant') {
    try {
      const tenant = await Tenant.findOne({ 
        slug: req.tenantSlug, 
        status: 'active' 
      });
      
      if (!tenant) {
        return res.status(404).json({ 
          success: false, 
          message: `Tenant '${req.tenantSlug}' not found or inactive` 
        });
      }
      
      req.tenantId = tenant._id;
      req.tenantData = tenant;
    } catch (error) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching tenant data',
        error: error.message 
      });
    }
  }
  next();
};

// Replace your existing middleware with this for local testing
app.use(localTenantResolver);
app.use(tenantDataMiddleware);

// =====================
// TEST ROUTES
// =====================

// Test different tenant contexts
app.get('/api/test-context', (req, res) => {
  res.json({
    success: true,
    context: {
      host: req.get('Host'),
      userType: req.userType,
      tenantSlug: req.tenantSlug,
      tenantId: req.tenantId,
      headers: {
        'x-tenant-slug': req.headers['x-tenant-slug'],
        'x-admin': req.headers['x-admin']
      },
      query: req.query
    }
  });
});

// Seed some test tenants
app.post('/api/seed-tenants', async (req, res) => {
  try {
    // Clear existing tenants
    await Tenant.deleteMany({});
    
    // Create test tenants
    const tenants = await Tenant.insertMany([
      {
        name: 'Test Company 1',
        slug: 'company1',
        domain: 'company1.expense.local',
        plan: 'starter'
      },
      {
        name: 'Test Company 2', 
        slug: 'company2',
        domain: 'company2.expense.local',
        plan: 'professional'
      },
      {
        name: 'Enterprise Corp',
        slug: 'enterprise',
        domain: 'enterprise.expense.local',
        plan: 'enterprise'
      }
    ]);
    
    res.json({
      success: true,
      message: `Created ${tenants.length} test tenants`,
      data: tenants
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =====================
// SUPER ADMIN ROUTES
// =====================
const superAdminRoutes = express.Router();

// Check if user is super admin
superAdminRoutes.use((req, res, next) => {
  if (req.userType !== 'superadmin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Super Admin access only',
      currentUserType: req.userType
    });
  }
  next();
});

// Get all tenants
superAdminRoutes.get('/tenants', async (req, res) => {
  try {
    const tenants = await Tenant.find()
      .populate('adminUser', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      count: tenants.length,
      data: tenants 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new tenant
superAdminRoutes.post('/tenants', async (req, res) => {
  try {
    const { name, slug, plan = 'starter' } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Name and slug are required'
      });
    }
    
    // Check if slug already exists
    const existingTenant = await Tenant.findOne({ slug: slug.toLowerCase() });
    if (existingTenant) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tenant slug already exists' 
      });
    }
    
    const tenant = await Tenant.create({
      name,
      slug: slug.toLowerCase(),
      domain: `${slug.toLowerCase()}.expense.local`,
      plan
    });
    
    res.status(201).json({ success: true, data: tenant });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get platform stats
superAdminRoutes.get('/stats', async (req, res) => {
  try {
    const totalTenants = await Tenant.countDocuments();
    const activeTenants = await Tenant.countDocuments({ status: 'active' });
    const totalExpenses = await Expense.countDocuments();
    const totalUsers = await User.countDocuments();
    
    res.json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        totalExpenses,
        totalUsers,
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mount super admin routes
app.use('/api/superadmin', superAdminRoutes);

// =====================
// WELCOME ROUTE (Context-aware)
// =====================
app.get('/api/welcome', (req, res) => {
  let message = '';
  let details = {};
  
  switch(req.userType) {
    case 'superadmin':
      message = 'Welcome to Super Admin Dashboard';
      details = { 
        access: 'full_platform',
        capabilities: ['manage_tenants', 'view_stats', 'system_settings']
      };
      break;
    case 'tenant':
      message = `Welcome to ${req.tenantSlug} Company Dashboard`;
      details = { 
        tenant: req.tenantSlug,
        tenantId: req.tenantId,
        plan: req.tenantData?.plan,
        capabilities: ['manage_expenses', 'view_reports', 'manage_users']
      };
      break;
    default:
      message = 'Welcome to Expense Manager';
      details = { 
        access: 'public',
        capabilities: ['view_features', 'register', 'login']
      };
  }
  
  res.json({
    success: true,
    message,
    context: {
      userType: req.userType,
      tenant: req.tenantSlug,
      domain: req.get('Host')
    },
    details
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await createUploadsDir();
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('\nMERN Admin Dashboard Backend');
      console.log('============================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('MongoDB Connected');
      console.log('File uploads enabled');
      console.log('Activity logging system enabled');
      console.log('\nAvailable API endpoints:');
      console.log('- /api/auth/* - Authentication');
      console.log('- /api/users/* - User management');
      console.log('- /api/roles/* - Role management');
      console.log('- /api/categories/* - Category management');
      console.log('- /api/expenses/* - Expense management');
      console.log('- /api/activities/* - Activity tracking');
      console.log('- /api/health - Health check');
      console.log('\nServer ready for connections!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();


process.on('SIGTERM', () => {
  console.log('\nSIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;