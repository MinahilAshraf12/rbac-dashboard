const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  // MULTI-TENANT FIELD
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: false,
    default: null
  },
  
  type: {
    type: String,
    required: true,
    enum: [
      // Tenant activities
      'user_created', 'user_updated', 'user_deleted',
      'role_created', 'role_updated', 'role_deleted', 
      'category_created', 'category_updated', 'category_deleted',
      'expense_created', 'expense_updated', 'expense_deleted',
      'expense_approved', 'expense_rejected',
      // Super Admin activities
      'super_admin_login', 
      'super_admin_logout',
      'super_admin_create_tenant',
      'super_admin_update_tenant',
      'super_admin_suspend_tenant',
      'super_admin_delete_tenant',
      'super_admin_change_password',
      'super_admin_update_profile'
    ]
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['User', 'Role', 'Category', 'Expense', 'Tenant', 'SuperAdmin']
  },
  entityName: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'performedByModel',
    required: true
  },
  performedByModel: {
    type: String,
    required: true,
    enum: ['User', 'SuperAdmin'],
    default: 'User'
  },
  metadata: {
    oldData: mongoose.Schema.Types.Mixed,
    newData: mongoose.Schema.Types.Mixed,
    changes: [String],
    ipAddress: String,
    userAgent: String,
    location: {
      country: String,
      city: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    }
  },
  isRead: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['system', 'user_action', 'data_change', 'security', 'billing'],
    default: 'user_action'
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  visibility: {
    type: String,
    enum: ['public', 'admin_only', 'system'],
    default: 'public'
  }
}, {
  timestamps: true
});

// Indexes
ActivitySchema.index({ tenantId: 1, createdAt: -1 });
ActivitySchema.index({ tenantId: 1, performedBy: 1 });
ActivitySchema.index({ tenantId: 1, entityType: 1 });
ActivitySchema.index({ tenantId: 1, isRead: 1 });
ActivitySchema.index({ tenantId: 1, priority: 1 });
ActivitySchema.index({ tenantId: 1, type: 1 });
ActivitySchema.index({ tenantId: 1, category: 1 });
ActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

ActivitySchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenantId };
  
  if (options.entityType) query.entityType = options.entityType;
  if (options.type) query.type = options.type;
  if (options.category) query.category = options.category;
  if (options.performedBy) query.performedBy = options.performedBy;
  if (options.priority) query.priority = options.priority;
  if (options.visibility) query.visibility = options.visibility;
  
  if (options.dateRange) {
    query.createdAt = {};
    if (options.dateRange.start) query.createdAt.$gte = new Date(options.dateRange.start);
    if (options.dateRange.end) query.createdAt.$lte = new Date(options.dateRange.end);
  }
  
  return this.find(query)
    .populate('performedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

ActivitySchema.statics.getStatsByTenant = async function(tenantId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $facet: {
        byType: [
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        byCategory: [
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        byUser: [
          { $group: { _id: '$performedBy', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        daily: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        total: [
          {
            $group: {
              _id: null,
              totalActivities: { $sum: 1 },
              unreadCount: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } }
            }
          }
        ]
      }
    }
  ]);
  
  return {
    byType: stats[0].byType,
    byCategory: stats[0].byCategory,
    byUser: stats[0].byUser,
    daily: stats[0].daily,
    summary: stats[0].total[0] || { totalActivities: 0, unreadCount: 0 }
  };
};

ActivitySchema.statics.markAsReadByTenant = function(tenantId, activityIds, userId) {
  const query = { 
    tenantId,
    _id: { $in: activityIds }
  };
  
  if (userId) {
    query.$or = [
      { visibility: 'public' },
      { performedBy: userId }
    ];
  }
  
  return this.updateMany(query, { 
    isRead: true,
    readAt: new Date(),
    readBy: userId
  });
};

ActivitySchema.statics.getUnreadCountByTenant = function(tenantId, userId = null) {
  const query = { 
    tenantId,
    isRead: false
  };
  
  if (userId) {
    query.performedBy = { $ne: userId };
    query.visibility = 'public';
  }
  
  return this.countDocuments(query);
};

ActivitySchema.statics.cleanOldActivitiesByTenant = function(tenantId, daysToKeep = 180) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  return this.deleteMany({
    tenantId,
    createdAt: { $lt: cutoffDate },
    priority: { $ne: 'critical' }
  });
};

ActivitySchema.methods.markAsRead = function(userId = null) {
  this.isRead = true;
  this.readAt = new Date();
  if (userId) this.readBy = userId;
  return this.save();
};

ActivitySchema.methods.isVisibleToUser = function(userId, userTenantRole) {
  if (this.visibility === 'public') return true;
  if (this.visibility === 'admin_only' && (userTenantRole === 'tenant_admin' || userTenantRole === 'manager')) return true;
  if (this.performedBy.toString() === userId.toString()) return true;
  return false;
};

module.exports = mongoose.model('Activity', ActivitySchema);