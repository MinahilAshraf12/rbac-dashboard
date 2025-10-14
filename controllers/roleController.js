const Role = require('../models/Role');
const User = require('../models/User');
const ActivityService = require('../services/activityService');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private
const getRoles = async (req, res) => {
  try {
    // ✅ Add tenant filter
    const roles = await Role.find({ tenantId: req.user.tenantId })
      .sort({ priority: -1, name: 1 });

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
// @access  Private (Admin)
const createRole = async (req, res) => {
  try {
    const { name, description, permissions, priority, isSystemRole } = req.body;

    // Get tenantId from request
    const tenantId = req.tenant?._id;
    if (!tenantId && process.env.NODE_ENV !== 'development') {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    // Check if role already exists
    const roleExists = await Role.findOne({ 
      name: name.toLowerCase(),
      tenantId 
    });
    
    if (roleExists) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists'
      });
    }

    // Validate permissions structure
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        if (!perm.resource || !Array.isArray(perm.actions)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid permissions structure'
          });
        }
      }
    }

    // Create role with tenantId and createdBy
    const role = await Role.create({
      name,
      description,
      permissions: permissions || [],
      priority: priority || 0,
      isSystemRole: isSystemRole || false,
      tenantId,
      createdBy: req.user.id
    });

    const populatedRole = await Role.findById(role._id)
      .populate('createdBy', 'name email');

    // Log activity
    await ActivityService.logActivity({
      type: 'role_created',
      entityId: role._id,
      entityType: 'Role',
      entityName: role.name,
      tenantId,
      performedBy: req.user.id,
      newData: {
        name: role.name,
        description: role.description,
        permissions: role.permissions.length
      }
    });

    res.status(201).json({
      success: true,
      data: populatedRole
    });
  } catch (error) {
    console.error('Create role error:', error);
    
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

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private (Admin)
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

    // Prevent updating system roles
    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify system roles'
      });
    }

    // Store old data
    const oldData = {
      name: role.name,
      description: role.description,
      permissions: role.permissions.length
    };

    // Check name uniqueness if name is being changed
    if (name && name !== role.name) {
      const nameExists = await Role.findOne({ 
        name: name.toLowerCase(),
        tenantId: role.tenantId,
        _id: { $ne: role._id }
      });
      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Role name already in use'
        });
      }
    }

    // Validate permissions if provided
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        if (!perm.resource || !Array.isArray(perm.actions)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid permissions structure'
          });
        }
      }
    }

    // CRITICAL FIX: Use findByIdAndUpdate to preserve tenantId and createdBy
    const updateData = {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(permissions && { permissions }),
      ...(priority !== undefined && { priority })
    };

    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true,
        context: 'query'
      }
    ).populate('createdBy', 'name email');

    if (!updatedRole) {
      return res.status(404).json({
        success: false,
        message: 'Role not found after update'
      });
    }

    // Log activity
    const newData = {
      name: updatedRole.name,
      description: updatedRole.description,
      permissions: updatedRole.permissions.length
    };

    const changes = [];
    if (oldData.name !== newData.name) changes.push(`Name: ${oldData.name} → ${newData.name}`);
    if (oldData.description !== newData.description) changes.push(`Description changed`);
    if (oldData.permissions !== newData.permissions) changes.push(`Permissions: ${oldData.permissions} → ${newData.permissions}`);

    await ActivityService.logActivity({
      type: 'role_updated',
      entityId: role._id,
      entityType: 'Role',
      entityName: updatedRole.name,
      tenantId: role.tenantId,
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
    console.error('Update role error:', error);
    
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