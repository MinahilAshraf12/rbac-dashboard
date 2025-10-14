const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Protect routes middleware
// middleware/auth.js - protect function
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    console.log('🔐 Verifying token...');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    console.log('✅ Token decoded:', { userId: decoded.id });
    
    // ⬇️ CRITICAL: Populate both role AND tenantId
    req.user = await User.findById(decoded.id)
      .populate('role')
      .populate('tenantId');  // ⬅️ THIS IS CRITICAL
    
    if (!req.user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!req.user.isActive) {
      console.log('❌ User is inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    console.log('✅ User authenticated:', req.user.email);
    console.log('🏢 User tenantId:', req.user.tenantId?._id || req.user.tenantId); // ⬅️ ADD THIS DEBUG LOG

    // Set tenant from user
    if (req.user.tenantId) {
      req.tenant = req.user.tenantId;
      console.log('✅ Tenant set from user:', req.tenant.slug || req.tenant._id);
    } else {
      console.log('⚠️ User has no tenantId!');
    }

    next();
  } catch (error) {
    console.error('❌ Token error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Check if user has permission for specific resource and action
const hasPermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - no role assigned'
      });
    }

    const userPermissions = req.user.role.permissions;
    
    const hasPermission = userPermissions.some(permission => 
      permission.resource === resource && 
      (permission.actions.includes(action) || permission.actions.includes('manage'))
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied - insufficient permissions for ${resource}:${action}`
      });
    }

    next();
  };
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);

  const options = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    token,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      avatar: user.avatar
    }
  });
};

module.exports = {
  signToken,
  protect,
  hasPermission,
  sendTokenResponse
};