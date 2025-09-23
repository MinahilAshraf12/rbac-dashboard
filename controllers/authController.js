const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { sendTokenResponse } = require('../middleware/auth');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email and password'
      });
    }

    // Check if we're in development mode and have no tenant
    const isDevelopment = process.env.NODE_ENV === 'development';
    const tenantId = req.tenant?._id;

    let user;
    
    if (isDevelopment && !tenantId) {
      // In development without tenant, find user by email only
      console.log('🔧 Development mode: Finding user without tenant restriction');
      user = await User.findOne({ email }).select('+password').populate('role');
    } else if (tenantId) {
      // Normal tenant-specific lookup
      user = await User.findOne({ 
        email, 
        tenantId: tenantId 
      }).select('+password').populate('role');
    } else {
      return res.status(401).json({
        success: false,
        message: 'Organization context required for login'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Prepare response data
    const responseData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
      isActive: user.isActive,
      avatar: user.avatar,
      lastLogin: user.lastLogin
    };

    // Include tenant information if available
    if (req.tenant) {
      responseData.tenant = {
        id: req.tenant._id,
        name: req.tenant.name,
        slug: req.tenant.slug,
        plan: req.tenant.plan,
        status: req.tenant.status
      };
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('role')
      .populate('tenantId', 'name slug plan status');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const responseData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
      isActive: user.isActive,
      avatar: user.avatar,
      lastLogin: user.lastLogin,
      preferences: user.preferences
    };

    // Include tenant information if available
    if (user.tenantId) {
      responseData.tenant = user.tenantId;
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Log user out / clear cookie
// @route   GET /api/auth/logout
// @access  Public
const logout = async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

module.exports = {
  login,
  getMe,
  logout
};