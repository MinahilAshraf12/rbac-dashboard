// middleware/superAdmin.js
const jwt = require('jsonwebtoken');
const SuperAdmin = require('../models/SuperAdmin');

// Generate JWT Token for Super Admin
const signSuperAdminToken = (id) => {
  return jwt.sign({ id, type: 'super_admin' }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Protect Super Admin routes middleware
const protectSuperAdmin = async (req, res, next) => {
  let token;

  // Check for token in header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Check for token in cookie (only if cookies exist)
  else if (req.cookies && req.cookies.super_admin_token) {
    token = req.cookies.super_admin_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route - Super Admin authentication required'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Check if it's a super admin token
    if (decoded.type !== 'super_admin') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type - Super Admin access required'
      });
    }

    // Get super admin from database
    const superAdmin = await SuperAdmin.findById(decoded.id).select('-password');
    
    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Super Admin account not found'
      });
    }

    if (!superAdmin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Super Admin account is deactivated'
      });
    }

    // Check if locked (virtual property)
    if (superAdmin.lockUntil && superAdmin.lockUntil > Date.now()) {
      return res.status(401).json({
        success: false,
        message: 'Super Admin account is locked due to multiple failed login attempts'
      });
    }

    // Attach super admin to request
    req.user = superAdmin;
    req.isSuperAdmin = true;
    
    // Update last activity
    superAdmin.lastLogin = new Date();
    await superAdmin.save();

    next();
  } catch (error) {
    console.error('Super Admin auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route - Invalid token'
    });
  }
};

// Check super admin permissions
const checkSuperAdminPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - Super Admin required'
      });
    }

    // Check if super admin has the required permission
    const hasPermission = req.user.permissions && req.user.permissions.includes(permission);
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied - Missing permission: ${permission}`
      });
    }

    next();
  };
};

// Send super admin token response
const sendSuperAdminTokenResponse = (superAdmin, statusCode, res) => {
  const token = signSuperAdminToken(superAdmin._id);

  const options = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.status(statusCode)
    .cookie('super_admin_token', token, options)
    .json({
      success: true,
      token,
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        permissions: superAdmin.permissions,
        isActive: superAdmin.isActive,
        avatar: superAdmin.avatar,
        lastLogin: superAdmin.lastLogin
      }
    });
};

// Log super admin activities
const logSuperAdminActivity = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 400) {
        setImmediate(async () => {
          try {
            const ActivityService = require('../services/activityService');
            await ActivityService.logActivity({
              type: `super_admin_${action}`,
              entityId: req.params.id || req.user._id,
              entityType: 'SuperAdmin',
              entityName: req.user.name,
              performedBy: req.user._id,
              metadata: {
                action,
                method: req.method,
                path: req.path,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date()
              }
            });
          } catch (error) {
            console.error('Super admin activity logging error:', error);
          }
        });
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  signSuperAdminToken,
  protectSuperAdmin,
  checkSuperAdminPermission,
  sendSuperAdminTokenResponse,
  logSuperAdminActivity
};