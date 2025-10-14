const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  // MULTI-TENANT FIELDS
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'User must belong to a tenant']
  },
  tenantRole: {
    type: String,
    enum: ['tenant_admin', 'manager', 'user'],
    required: [true, 'Tenant role is required'],
    default: 'user'
  },
  // EXISTING FIELDS
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  avatar: {
    type: String,
    default: ''
  },
  // ADDITIONAL MULTI-TENANT FIELDS
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  invitedAt: {
    type: Date
  },
  acceptedInviteAt: {
    type: Date
  },
  permissions: [{
    resource: String,
    actions: [String]
  }],
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    emailNotifications: {
      expenseUpdates: {
        type: Boolean,
        default: true
      },
      weeklyReports: {
        type: Boolean,
        default: true
      },
      systemAlerts: {
        type: Boolean,
        default: true
      }
    }
  }
}, {
  timestamps: true
});

// Compound index for tenant isolation and performance
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, isActive: 1 });
userSchema.index({ tenantId: 1, tenantRole: 1 });
userSchema.index({ tenantId: 1, role: 1 });

// Encrypt password using bcrypt
// userSchema.pre('save', async function(next) {
//   if (!this.isModified('password')) {
//     return next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user has specific permission
userSchema.methods.hasPermission = function(resource, action) {
  // Tenant admin has all permissions
  if (this.tenantRole === 'tenant_admin') {
    return true;
  }
  
  // Check custom permissions
  const permission = this.permissions.find(p => p.resource === resource);
  if (permission && permission.actions.includes(action)) {
    return true;
  }
  
  // Check role-based permissions (existing functionality)
  if (this.role && this.role.permissions) {
    return this.role.permissions.some(permission => 
      permission.resource === resource && 
      (permission.actions.includes(action) || permission.actions.includes('manage'))
    );
  }
  
  return false;
};

// Static method to find users by tenant
userSchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenantId, isActive: true };
  
  if (options.role) {
    query.tenantRole = options.role;
  }
  
  return this.find(query)
    .populate('role')
    .populate('tenantId', 'name slug')
    .sort(options.sort || { createdAt: -1 });
};

// Static method to count users by tenant
userSchema.statics.countByTenant = function(tenantId, activeOnly = true) {
  const query = { tenantId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.countDocuments(query);
};

// Static method to find tenant admins
userSchema.statics.findTenantAdmins = function(tenantId) {
  return this.find({ 
    tenantId, 
    tenantRole: 'tenant_admin', 
    isActive: true 
  }).populate('role');
};

// Instance method to check if user is tenant admin
userSchema.methods.isTenantAdmin = function() {
  return this.tenantRole === 'tenant_admin';
};

// Instance method to check if user can manage other users
userSchema.methods.canManageUsers = function() {
  return this.tenantRole === 'tenant_admin' || this.tenantRole === 'manager';
};

// Post-save middleware to update tenant user count
userSchema.post('save', async function(doc) {
  if (doc.isNew && doc.isActive) {
    try {
      const Tenant = mongoose.model('Tenant');
      await Tenant.updateUsage(doc.tenantId, 'user', 1);
    } catch (error) {
      console.error('Error updating tenant user count:', error);
    }
  }
});

// Post-remove middleware to decrease tenant user count
userSchema.post('remove', async function(doc) {
  if (doc.isActive) {
    try {
      const Tenant = mongoose.model('Tenant');
      await Tenant.updateUsage(doc.tenantId, 'user', -1);
    } catch (error) {
      console.error('Error updating tenant user count:', error);
    }
  }
});

module.exports = mongoose.model('User', userSchema);