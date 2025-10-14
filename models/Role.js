const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  // MULTI-TENANT FIELD (ADD THIS FIRST)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Role must belong to a tenant']
  },
  
  // EXISTING FIELDS
  name: {
    type: String,
    required: [true, 'Please add a role name'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: ['users', 'roles', 'categories', 'expenses', 'permissions', 'dashboard', 'settings', 'reports']
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'manage']
    }]
  }],
  isSystemRole: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 0
  },
  
  // ADDITIONAL MULTI-TENANT FIELDS
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  color: {
    type: String,
    default: '#6B7280'
  },
  maxUsers: {
    type: Number,
    default: -1 // -1 means unlimited
  },
  features: [{
    type: String,
    enum: [
      'expense_approval',
      'bulk_operations',
      'advanced_reports',
      'api_access',
      'export_data',
      'manage_categories',
      'manage_users',
      'view_all_expenses'
    ]
  }]
}, {
  timestamps: true
});

// Compound indexes for tenant isolation
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, isSystemRole: 1 });
roleSchema.index({ tenantId: 1, priority: -1 });

// Static method to find roles by tenant
roleSchema.statics.findByTenant = function(tenantId, includeSystem = true) {
  const query = { tenantId };
  
  if (!includeSystem) {
    query.isSystemRole = false;
  }
  
  return this.find(query)
    .populate('createdBy', 'name email')
    .sort({ priority: -1, name: 1 });
};

// Static method to create default roles for new tenant
roleSchema.statics.createDefaultRoles = async function(tenantId, createdBy) {
  const defaultRoles = [
    {
      name: 'Admin',
      description: 'Full access to all features within the organization',
      permissions: [
        { resource: 'users', actions: ['manage'] },
        { resource: 'roles', actions: ['manage'] },
        { resource: 'categories', actions: ['manage'] },
        { resource: 'expenses', actions: ['manage'] },
        { resource: 'dashboard', actions: ['read'] },
        { resource: 'settings', actions: ['manage'] },
        { resource: 'reports', actions: ['manage'] }
      ],
      isSystemRole: true,
      priority: 100,
      color: '#DC2626',
      features: [
        'expense_approval',
        'bulk_operations',
        'advanced_reports',
        'export_data',
        'manage_categories',
        'manage_users',
        'view_all_expenses'
      ]
    },
    {
      name: 'Manager',
      description: 'Expense management and team oversight',
      permissions: [
        { resource: 'users', actions: ['read'] },
        { resource: 'categories', actions: ['read'] },
        { resource: 'expenses', actions: ['manage'] },
        { resource: 'dashboard', actions: ['read'] },
        { resource: 'reports', actions: ['read', 'create'] }
      ],
      isSystemRole: true,
      priority: 80,
      color: '#F59E0B',
      features: [
        'expense_approval',
        'advanced_reports',
        'view_all_expenses'
      ]
    },
    {
      name: 'Employee',
      description: 'Basic expense tracking and submission',
      permissions: [
        { resource: 'expenses', actions: ['create', 'read', 'update'] },
        { resource: 'categories', actions: ['read'] },
        { resource: 'dashboard', actions: ['read'] }
      ],
      isSystemRole: true,
      priority: 40,
      color: '#10B981',
      maxUsers: -1
    },
    {
      name: 'Viewer',
      description: 'Read-only access to expenses and reports',
      permissions: [
        { resource: 'expenses', actions: ['read'] },
        { resource: 'categories', actions: ['read'] },
        { resource: 'dashboard', actions: ['read'] },
        { resource: 'reports', actions: ['read'] }
      ],
      isSystemRole: true,
      priority: 20,
      color: '#6B7280'
    }
  ];
  
  const roles = defaultRoles.map(role => ({
    ...role,
    tenantId,
    createdBy
  }));
  
  return await this.insertMany(roles);
};

// Instance method to check if role has specific permission
roleSchema.methods.hasPermission = function(resource, action) {
  const permission = this.permissions.find(p => p.resource === resource);
  if (!permission) return false;
  
  return permission.actions.includes(action) || permission.actions.includes('manage');
};

// Instance method to check if role has feature
roleSchema.methods.hasFeature = function(featureName) {
  return this.features.includes(featureName);
};

// Instance method to check if role can be assigned to more users
roleSchema.methods.canAssignToUser = async function() {
  if (this.maxUsers === -1) return true; // Unlimited
  
  const User = mongoose.model('User');
  const currentUserCount = await User.countDocuments({
    tenantId: this.tenantId,
    role: this._id,
    isActive: true
  });
  
  return currentUserCount < this.maxUsers;
};

// Instance method to get current user count for this role
roleSchema.methods.getCurrentUserCount = async function() {
  const User = mongoose.model('User');
  return await User.countDocuments({
    tenantId: this.tenantId,
    role: this._id,
    isActive: true
  });
};

module.exports = mongoose.model('Role', roleSchema);