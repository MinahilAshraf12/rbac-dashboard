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

    const query = {};

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
// @access  Private
const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, isActive } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected'
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: roleId,
      isActive: isActive !== undefined ? isActive : true
    });

    const populatedUser = await User.findById(user._id).populate('role').select('-password');

    // Log activity
    await ActivityService.logActivity({
      type: 'user_created',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      performedBy: req.user.id,
      newData: { name, email, role: role.name, isActive }
    });

    res.status(201).json({
      success: true,
      data: populatedUser
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
const updateUser = async (req, res) => {
  try {
    const { name, email, roleId, isActive } = req.body;

    const user = await User.findById(req.params.id).populate('role');
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

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken'
        });
      }
    }

    let role;
    if (roleId) {
      role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role selected'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(roleId && { role: roleId }),
        ...(isActive !== undefined && { isActive })
      },
      { new: true, runValidators: true }
    ).populate('role').select('-password');

    // Log activity with changes
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
    res.status(500).json({
      success: false,
      message: 'Server Error'
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