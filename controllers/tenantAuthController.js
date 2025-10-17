// controllers/tenantAuthController.js
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const Category = require('../models/Category');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @desc    Tenant Signup
// @route   POST /api/public/signup
// @access  Public
const signup = async (req, res) => {
  try {
    const { name, slug, ownerName, ownerEmail, ownerPassword } = req.body;

    console.log('📝 Signup request:', { name, slug, ownerName, ownerEmail });

    // Validate required fields
    if (!name || !slug || !ownerName || !ownerEmail || !ownerPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain can only contain lowercase letters, numbers, and hyphens'
      });
    }

    // Check if slug already exists
    const existingTenant = await Tenant.findOne({ slug });
    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: 'This subdomain is already taken'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: ownerEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Create tenant
    const tenant = await Tenant.create({
      name,
      slug,
      plan: 'free',
      status: 'trial',
      trialEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      settings: {
        maxUsers: 5,
        maxExpenses: 100,
        storageLimit: 1024,
        features: ['file_uploads']
      },
      usage: {
        currentUsers: 0,
        currentExpenses: 0,
        storageUsed: 0
      }
    });

    console.log('✅ Tenant created:', tenant.slug);

    // Create Admin role for this tenant
    const adminRole = await Role.create({
      tenantId: tenant._id,
      name: 'Admin',
      description: 'Full access administrator',
      permissions: [
        { resource: 'expenses', actions: ['create', 'read', 'update', 'delete', 'manage'] },
        { resource: 'users', actions: ['create', 'read', 'update', 'delete', 'manage'] },
        { resource: 'roles', actions: ['create', 'read', 'update', 'delete', 'manage'] },
        { resource: 'categories', actions: ['create', 'read', 'update', 'delete', 'manage'] },
        { resource: 'reports', actions: ['create', 'read', 'update', 'delete', 'manage'] },
        { resource: 'settings', actions: ['create', 'read', 'update', 'delete', 'manage'] }
      ],
      isSystemRole: true
    });

console.log('✅ Admin role created');

// Hash password
console.log('🔐 Hashing password...');
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(ownerPassword, salt);
console.log('✅ Password hashed');
console.log('🔐 Original password length:', ownerPassword.length);
console.log('🔐 Hash length:', hashedPassword.length);

// Create owner user
const owner = await User.create({
  tenantId: tenant._id,
  role: adminRole._id,
  name: ownerName,
  email: ownerEmail,
  password: hashedPassword,
  tenantRole: 'tenant_admin',
  isActive: true,
  isVerified: true
});

console.log('✅ Owner user created');

// Verify password was saved correctly
const savedUser = await User.findById(owner._id).select('+password');
console.log('🔍 Password saved correctly:', savedUser.password === hashedPassword);

// Test password immediately after creation
const testMatch = await bcrypt.compare(ownerPassword, savedUser.password);
console.log('🔍 Immediate password test:', testMatch ? 'PASS' : 'FAIL');

// Create default categories with slugs
const defaultCategories = [
  { 
    name: 'Travel', 
    slug: 'travel',
    description: 'Travel and transportation expenses', 
    color: '#3B82F6', 
    icon: 'plane',
    isActive: true
  },
  { 
    name: 'Food', 
    slug: 'food',
    description: 'Meals and dining expenses', 
    color: '#10B981', 
    icon: 'utensils',
    isActive: true
  },
  { 
    name: 'Office', 
    slug: 'office',
    description: 'Office supplies and equipment', 
    color: '#F59E0B', 
    icon: 'briefcase',
    isActive: true
  },
  { 
    name: 'Utilities', 
    slug: 'utilities',
    description: 'Utilities and bills', 
    color: '#8B5CF6', 
    icon: 'bolt',
    isActive: true
  },
  { 
    name: 'Other', 
    slug: 'other',
    description: 'Miscellaneous expenses', 
    color: '#6B7280', 
    icon: 'folder',
    isActive: true
  }
];

await Category.insertMany(
  defaultCategories.map(cat => ({
    ...cat,
    tenantId: tenant._id,
    createdBy: owner._id
  }))
);

console.log('✅ Default categories created');

    // Update tenant usage
    tenant.usage.currentUsers = 1;
    await tenant.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: owner._id,
        email: owner.email,
        tenantId: tenant._id,
        role: 'tenant_admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      tenant: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        trialEndDate: tenant.trialEndDate,
        settings: tenant.settings,
        usage: tenant.usage
      },
      user: {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
        role: owner.tenantRole
      },
      loginUrl: `https://${slug}.i-expense.ikftech.com`
    });

  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server Error'
    });
  }
};

// @desc    Tenant Login
// @route   POST /api/public/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt:', email);
    console.log('🔐 Password provided:', password ? 'Yes' : 'No');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email with explicit password selection
    const user = await User.findOne({ email })
      .select('+password') // Explicitly include password
      .populate('tenantId', 'name slug plan status settings usage trialEndDate')
      .populate('role', 'name permissions');

    console.log('👤 User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log('🔍 User isActive:', user.isActive);
    console.log('🔍 Has password field:', user.password ? 'Yes' : 'No');

    // Check if user is active
    if (!user.isActive) {
      console.log('❌ User is not active');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if tenant exists and is active
    if (!user.tenantId) {
      console.log('❌ No tenant associated');
      return res.status(403).json({
        success: false,
        message: 'No organization associated with this account'
      });
    }

    console.log('🏢 Tenant status:', user.tenantId.status);

    if (user.tenantId.status === 'suspended') {
      console.log('❌ Tenant is suspended');
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    // Verify password
    console.log('🔐 Comparing passwords...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('🔐 Password match:', isMatch);

    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log('✅ Login successful:', user.email);

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        tenantId: user.tenantId._id,
        role: user.tenantRole
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      tenant: {
        _id: user.tenantId._id,
        name: user.tenantId.name,
        slug: user.tenantId.slug,
        plan: user.tenantId.plan,
        status: user.tenantId.status,
        trialEndDate: user.tenantId.trialEndDate,
        settings: user.tenantId.settings,
        usage: user.tenantId.usage
      },
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.tenantRole,
        permissions: user.role?.permissions || []
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Check slug availability
// @route   GET /api/public/check-slug/:slug
// @access  Public
const checkSlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const existingTenant = await Tenant.findOne({ slug });

    res.status(200).json({
      success: true,
      available: !existingTenant
    });

  } catch (error) {
    console.error('❌ Check slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant by slug
// @route   GET /api/public/tenant/:slug
// @access  Public
const getTenantBySlug = async (req, res) => {
  try {
    // ✅ Get slug from params OR from subdomain middleware
    const slug = req.params.slug || req.tenantSlug;

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Tenant slug is required',
        hostname: req.hostname
      });
    }

    console.log('🔍 Fetching tenant:', slug);

    const tenant = await Tenant.findOne({ 
      slug, 
      isActive: true,
      status: { $ne: 'deleted' }
    })
    .select('name slug plan status settings usage trialEndDate')
    .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
        slug,
        hostname: req.hostname
      });
    }

    console.log('✅ Tenant found:', tenant.name);

    res.status(200).json({
      success: true,
      data: tenant
    });

  } catch (error) {
    console.error('❌ Get tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('tenantId', 'name slug plan status settings usage')
      .populate('role', 'name permissions')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('❌ Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  signup,
  login,
  checkSlug,
  getTenantBySlug,
  getMe
};