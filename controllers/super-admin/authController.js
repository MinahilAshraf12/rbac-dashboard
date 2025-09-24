// controllers/super-admin/authController.js
const SuperAdmin = require('../../models/SuperAdmin');
const { sendSuperAdminTokenResponse } = require('../../middleware/superAdmin');
const ActivityService = require('../../services/activityService');

// @desc    Super Admin login
// @route   POST /api/super-admin/auth/login
// @access  Public (Super Admin domain only)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find super admin by email (use findOne instead of findByEmail)
    const superAdmin = await SuperAdmin.findOne({ email: email.toLowerCase(), isActive: true })
      .select('+password');

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (superAdmin.lockUntil && superAdmin.lockUntil > Date.now()) {
      const lockTimeLeft = Math.ceil((superAdmin.lockUntil - Date.now()) / (1000 * 60));
      return res.status(423).json({
        success: false,
        message: `Account is locked due to too many failed attempts. Try again in ${lockTimeLeft} minutes.`
      });
    }

    // Check if account is active
    if (!superAdmin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await superAdmin.matchPassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    superAdmin.lastLogin = new Date();
    await superAdmin.save();

    // Log successful login activity (optional - comment out if causing issues)
    try {
      await ActivityService.logActivity({
        type: 'super_admin_login',
        entityId: superAdmin._id,
        entityType: 'SuperAdmin',
        entityName: superAdmin.name,
        performedBy: superAdmin._id,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          loginTime: new Date()
        }
      });
    } catch (activityError) {
      console.log('Activity logging failed, but login continues:', activityError.message);
    }

    // Send token response
    sendSuperAdminTokenResponse(superAdmin, 200, res);

  } catch (error) {
    console.error('Super Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get current super admin
// @route   GET /api/super-admin/auth/me
// @access  Super Admin only
const getMe = async (req, res) => {
  try {
    // Use _id instead of id
    const superAdmin = await SuperAdmin.findById(req.user._id)
      .select('-password -twoFactorAuth.secret -twoFactorAuth.backupCodes');

    if (!superAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Super Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        permissions: superAdmin.permissions,
        isActive: superAdmin.isActive,
        lastLogin: superAdmin.lastLogin,
        avatar: superAdmin.avatar,
        preferences: superAdmin.preferences,
        twoFactorAuth: {
          enabled: superAdmin.twoFactorAuth ? superAdmin.twoFactorAuth.enabled : false
        }
      }
    });

  } catch (error) {
    console.error('Get super admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Super Admin logout
// @route   GET /api/super-admin/auth/logout
// @access  Super Admin only
const logout = async (req, res) => {
  try {
    // Log logout activity (optional - comment out if causing issues)
    try {
      await ActivityService.logActivity({
        type: 'super_admin_logout',
        entityId: req.user._id,
        entityType: 'SuperAdmin',
        entityName: req.user.name,
        performedBy: req.user._id,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          logoutTime: new Date()
        }
      });
    } catch (activityError) {
      console.log('Activity logging failed, but logout continues:', activityError.message);
    }

    // Clear cookie
    res.cookie('super_admin_token', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });

    res.status(200).json({
      success: true,
      message: 'Super Admin logged out successfully'
    });

  } catch (error) {
    console.error('Super Admin logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Change super admin password
// @route   PUT /api/super-admin/auth/change-password
// @access  Super Admin only
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get super admin with password
    const superAdmin = await SuperAdmin.findById(req.user._id).select('+password');

    // Verify current password
    const isCurrentPasswordValid = await superAdmin.matchPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    superAdmin.password = newPassword;
    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update super admin profile
// @route   PUT /api/super-admin/auth/profile
// @access  Super Admin only
const updateProfile = async (req, res) => {
  try {
    const { name, avatar, preferences } = req.body;

    const superAdmin = await SuperAdmin.findById(req.user._id);

    if (!superAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Super Admin not found'
      });
    }

    // Update fields
    if (name) superAdmin.name = name;
    if (avatar !== undefined) superAdmin.avatar = avatar;
    if (preferences) {
      superAdmin.preferences = {
        ...superAdmin.preferences,
        ...preferences
      };
    }

    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        avatar: superAdmin.avatar,
        preferences: superAdmin.preferences
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get super admin dashboard stats
// @route   GET /api/super-admin/auth/dashboard
// @access  Super Admin only
const getDashboardStats = async (req, res) => {
  try {
    // Mock data for now - replace with actual queries when models are available
    const mockStats = {
      overview: {
        totalTenants: 5,
        activeTenants: 4,
        totalUsers: 25,
        totalExpenses: 150,
        newTenantsThisMonth: 2,
        totalPlans: 4
      },
      tenantsByPlan: [
        { _id: 'free', count: 3 },
        { _id: 'basic', count: 1 },
        { _id: 'premium', count: 1 }
      ],
      recentActivities: [
        {
          type: 'super_admin_login',
          title: 'Admin Login',
          time: 'Just now'
        }
      ]
    };

    res.status(200).json({
      success: true,
      data: mockStats
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  login,
  getMe,
  logout,
  changePassword,
  updateProfile,
  getDashboardStats
};