const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const superAdminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    default: 'super_admin',
    immutable: true
  },
  permissions: [{
    type: String,
    enum: [
      'manage_tenants',
      'manage_subscriptions',
      'manage_plans',
      'view_analytics',
      'manage_system_settings',
      'manage_super_admins',
      'view_billing',
      'manage_domains',
      'access_support',
      'manage_integrations'
    ],
    default: [
      'manage_tenants',
      'manage_subscriptions',
      'manage_plans',
      'view_analytics',
      'manage_system_settings'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  avatar: {
    type: String,
    default: ''
  },
  twoFactorAuth: {
    enabled: {
      type: Boolean,
      default: false
    },
    secret: {
      type: String,
      select: false
    },
    backupCodes: [{
      code: String,
      used: {
        type: Boolean,
        default: false
      }
    }]
  },
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
      newTenant: {
        type: Boolean,
        default: true
      },
      subscriptionChanges: {
        type: Boolean,
        default: true
      },
      systemAlerts: {
        type: Boolean,
        default: true
      },
      weeklyReport: {
        type: Boolean,
        default: true
      }
    }
  },
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin'
    },
    notes: String,
    lastPasswordChange: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
superAdminSchema.index({ email: 1 });
superAdminSchema.index({ isActive: 1 });
superAdminSchema.index({ lastLogin: -1 });

// Virtual for account locked status
superAdminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for full name (if we add firstName/lastName later)
superAdminSchema.virtual('displayName').get(function() {
  return this.name || this.email.split('@')[0];
});

// Pre-save middleware to hash password
superAdminSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Update password change timestamp
    this.metadata.lastPasswordChange = new Date();
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
superAdminSchema.methods.matchPassword = async function(enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    return false;
  }
};

// Instance method to handle login attempts
superAdminSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // After 5 attempts, lock account for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
superAdminSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Instance method to check permission
superAdminSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission) || this.permissions.includes('manage_system_settings');
};

// Instance method to generate 2FA backup codes
superAdminSchema.methods.generateBackupCodes = function() {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push({
      code: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      used: false
    });
  }
  this.twoFactorAuth.backupCodes = codes;
  return codes.map(c => c.code);
};

// Instance method to use backup code
superAdminSchema.methods.useBackupCode = function(code) {
  const backupCode = this.twoFactorAuth.backupCodes.find(c => c.code === code && !c.used);
  if (backupCode) {
    backupCode.used = true;
    return true;
  }
  return false;
};

// Static method to find by email (for login)
superAdminSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase(), isActive: true }).select('+password +twoFactorAuth.secret');
};

// Static method to get active super admins
superAdminSchema.statics.getActiveAdmins = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

// Static method to create default super admin
superAdminSchema.statics.createDefaultAdmin = async function() {
  const adminCount = await this.countDocuments();
  
  if (adminCount === 0) {
    const defaultAdmin = new this({
      name: 'Super Administrator',
      email: 'admin@i-expense.ikftech.com',
      password: 'SuperAdmin123!',
      permissions: [
        'manage_tenants',
        'manage_subscriptions',
        'manage_plans',
        'view_analytics',
        'manage_system_settings',
        'manage_super_admins',
        'view_billing',
        'manage_domains',
        'access_support',
        'manage_integrations'
      ]
    });
    
    await defaultAdmin.save();
    console.log('Default super admin created: admin@i-expense.ikftech.com / SuperAdmin123!');
    return defaultAdmin;
  }
  
  return null;
};

module.exports = mongoose.model('SuperAdmin', superAdminSchema);