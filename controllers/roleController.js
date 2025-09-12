const Role = require('../models/Role');
const User = require('../models/User');
const ActivityService = require('../services/activityService');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private
const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().sort({ priority: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Private
const getRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    res.status(200).json({
      success: true,
      data: role
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new role
// @route   POST /api/roles
// @access  Private
const createRole = async (req, res) => {
  try {
    const { name, description, permissions, priority, isSystemRole } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name and description are required'
      });
    }

    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists'
      });
    }

    if (permissions && Array.isArray(permissions)) {
      const validResources = ['users', 'roles', 'categories', 'expenses', 'permissions', 'dashboard', 'settings'];
      const validActions = ['create', 'read', 'update', 'delete', 'manage'];
      
      for (const permission of permissions) {
        if (!validResources.includes(permission.resource)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource: ${permission.resource}`
          });
        }
        
        for (const action of permission.actions) {
          if (!validActions.includes(action)) {
            return res.status(400).json({
              success: false,
              message: `Invalid action: ${action}`
            });
          }
        }
      }
    }

    const role = await Role.create({
      name: name.trim(),
      description: description.trim(),
      permissions: permissions || [],
      priority: priority || 0,
      isSystemRole: isSystemRole || false
    });

    // Log activity
    await ActivityService.logActivity({
      type: 'role_created',
      entityId: role._id,
      entityType: 'Role',
      entityName: role.name,
      performedBy: req.user.id,
      newData: { name, description, permissions, priority, isSystemRole }
    });

    res.status(201).json({
      success: true,
      data: role
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

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private
const updateRole = async (req, res) => {
  try {
    const { name, description, permissions, priority } = req.body;

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify system roles'
      });
    }

    // Store old data for activity log
    const oldData = {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      priority: role.priority
    };

    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ name, _id: { $ne: req.params.id } });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role name is already taken'
        });
      }
    }

    if (permissions && Array.isArray(permissions)) {
      const validResources = ['users', 'roles', 'categories', 'expenses', 'permissions', 'dashboard', 'settings'];
      const validActions = ['create', 'read', 'update', 'delete', 'manage'];
      
      for (const permission of permissions) {
        if (!validResources.includes(permission.resource)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource: ${permission.resource}`
          });
        }
        
        for (const action of permission.actions) {
          if (!validActions.includes(action)) {
            return res.status(400).json({
              success: false,
              message: `Invalid action: ${action}`
            });
          }
        }
      }
    }

    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.trim() }),
        ...(description && { description: description.trim() }),
        ...(permissions && { permissions }),
        ...(priority !== undefined && { priority })
      },
      { new: true, runValidators: true }
    );

    // Log activity with changes
    const newData = {
      name: updatedRole.name,
      description: updatedRole.description,
      permissions: updatedRole.permissions,
      priority: updatedRole.priority
    };

    const changes = [];
    if (oldData.name !== newData.name) changes.push(`Name: ${oldData.name} → ${newData.name}`);
    if (oldData.description !== newData.description) changes.push(`Description updated`);
    if (JSON.stringify(oldData.permissions) !== JSON.stringify(newData.permissions)) changes.push(`Permissions updated`);
    if (oldData.priority !== newData.priority) changes.push(`Priority: ${oldData.priority} → ${newData.priority}`);

    await ActivityService.logActivity({
      type: 'role_updated',
      entityId: role._id,
      entityType: 'Role',
      entityName: updatedRole.name,
      performedBy: req.user.id,
      oldData,
      newData,
      changes
    });

    res.status(200).json({
      success: true,
      data: updatedRole
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private
const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system roles'
      });
    }

    const usersWithRole = await User.countDocuments({ role: req.params.id });
    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${usersWithRole} user(s). Please reassign users before deleting.`
      });
    }

    // Store role data for activity log before deletion
    const roleData = {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      priority: role.priority
    };

    await Role.findByIdAndDelete(req.params.id);

    // Log activity
    await ActivityService.logActivity({
      type: 'role_deleted',
      entityId: role._id,
      entityType: 'Role',
      entityName: role.name,
      performedBy: req.user.id,
      oldData: roleData
    });

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole
};