const User = require('../models/User');
const Role = require('../models/Role');
const ActivityService = require('../services/activityService');

// @desc    Get all users
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    // ✅ START WITH TENANT FILTER
    const query = { tenantId: req.user.tenantId };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (status !== '') query.isActive = status === 'active';

    const users = await User.find(query)
      .populate('role')
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('role').select('-password');

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
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private (Admin/Manager)
const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, isActive } = req.body;

    // Get tenantId from request
    const tenantId = req.tenant?._id;
    if (!tenantId && process.env.NODE_ENV !== 'development') {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email, tenantId });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Validate role if provided
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role selected'
        });
      }
    }

    // Create user with tenantId and createdBy
    const user = await User.create({
      name,
      email,
      password,
      role: roleId,
      isActive: isActive !== undefined ? isActive : true,
      tenantId,
      createdBy: req.user.id
    });

    // Populate role information
    const populatedUser = await User.findById(user._id)
      .populate('role', 'name description')
      .select('-password');

    // Log activity
    await ActivityService.logActivity({
      type: 'user_created',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      tenantId,
      performedBy: req.user.id,
      newData: {
        name: user.name,
        email: user.email,
        role: roleId
      }
    });

    res.status(201).json({
      success: true,
      data: populatedUser
    });
  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error: ' + error.message
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin/Manager)
const updateUser = async (req, res) => {
  try {
    const { name, email, roleId, isActive } = req.body;

    const user = await User.findById(req.params.id).populate('role', 'name');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Store old data for activity log
    const oldData = {
      name: user.name,
      email: user.email,
      role: user.role?.name,
      isActive: user.isActive
    };

    // Validate role if provided
    if (roleId && roleId !== user.role?._id.toString()) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role selected'
        });
      }
    }

    // Check email uniqueness if email is being changed
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ 
        email, 
        tenantId: user.tenantId,
        _id: { $ne: user._id }
      });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
    }

    // CRITICAL FIX: Use findByIdAndUpdate to preserve tenantId and createdBy
    const updateData = {
      ...(name && { name }),
      ...(email && { email }),
      ...(roleId && { role: roleId }),
      ...(isActive !== undefined && { isActive })
    };

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true,
        context: 'query'
      }
    )
    .populate('role', 'name description')
    .select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found after update'
      });
    }

    // Log activity
    const newData = {
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role?.name,
      isActive: updatedUser.isActive
    };

    const changes = [];
    if (oldData.name !== newData.name) changes.push(`Name: ${oldData.name} → ${newData.name}`);
    if (oldData.email !== newData.email) changes.push(`Email: ${oldData.email} → ${newData.email}`);
    if (oldData.role !== newData.role) changes.push(`Role: ${oldData.role} → ${newData.role}`);
    if (oldData.isActive !== newData.isActive) changes.push(`Status: ${oldData.isActive ? 'Active' : 'Inactive'} → ${newData.isActive ? 'Active' : 'Inactive'}`);

    await ActivityService.logActivity({
      type: 'user_updated',
      entityId: user._id,
      entityType: 'User',
      entityName: updatedUser.name,
      tenantId: user.tenantId,
      performedBy: req.user.id,
      oldData,
      newData,
      changes
    });

    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error: ' + error.message
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Store user data for activity log before deletion
    const userData = {
      name: user.name,
      email: user.email,
      role: user.role?.name
    };

    await User.findByIdAndDelete(req.params.id);

    // Log activity
    await ActivityService.logActivity({
      type: 'user_deleted',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      performedBy: req.user.id,
      oldData: userData
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
};