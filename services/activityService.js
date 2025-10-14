const Activity = require('../models/Activity');

class ActivityService {
  
  // Create new activity log (MODIFIED for multi-tenancy)
  static async logActivity({
    type,
    entityId,
    entityType,
    entityName,
    performedBy,
    tenantId = null, // NEW: Tenant context
    oldData = null,
    newData = null,
    changes = [],
    metadata = {}
  }) {
    try {
      const title = this.generateTitle(type, entityName);
      const description = this.generateDescription(type, entityName, entityType);
      
      const activity = await Activity.create({
        type,
        title,
        description,
        entityId,
        entityType,
        entityName,
        performedBy,
        tenantId, // NEW: Include tenant ID
        metadata: {
          oldData,
          newData,
          changes,
          ...metadata // Additional metadata like IP, user agent, etc.
        }
      });

      return activity;
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  // Generate activity title
  static generateTitle(type, entityName) {
    const actionMap = {
      'user_created': `New User: ${entityName}`,
      'user_updated': `User Updated: ${entityName}`,
      'user_deleted': `User Deleted: ${entityName}`,
      'role_created': `New Role: ${entityName}`,
      'role_updated': `Role Updated: ${entityName}`,
      'role_deleted': `Role Deleted: ${entityName}`,
      'category_created': `New Category: ${entityName}`,
      'category_updated': `Category Updated: ${entityName}`,
      'category_deleted': `Category Deleted: ${entityName}`,
      'expense_created': `New Expense: ${entityName}`,
      'expense_updated': `Expense Updated: ${entityName}`,
      'expense_deleted': `Expense Deleted: ${entityName}`,
      'expense_approved': `Expense Approved: ${entityName}`,
      'expense_rejected': `Expense Rejected: ${entityName}`,
      // NEW: Tenant-specific activities
      'tenant_created': `Organization Created: ${entityName}`,
      'tenant_updated': `Organization Updated: ${entityName}`,
      'tenant_settings_updated': `Settings Updated: ${entityName}`,
      'subscription_updated': `Subscription Updated: ${entityName}`,
      'tenant_suspended': `Organization Suspended: ${entityName}`,
      'tenant_reactivated': `Organization Reactivated: ${entityName}`,
      'custom_domain_setup': `Custom Domain Setup: ${entityName}`
    };
    
    return actionMap[type] || `Activity: ${entityName}`;
  }

  // Generate activity description
  static generateDescription(type, entityName, entityType) {
    const actionMap = {
      'user_created': `A new user "${entityName}" has been added to the organization`,
      'user_updated': `User "${entityName}" profile has been updated`,
      'user_deleted': `User "${entityName}" has been removed from the organization`,
      'role_created': `A new role "${entityName}" has been created`,
      'role_updated': `Role "${entityName}" permissions have been modified`,
      'role_deleted': `Role "${entityName}" has been removed`,
      'category_created': `A new expense category "${entityName}" has been added`,
      'category_updated': `Category "${entityName}" details have been updated`,
      'category_deleted': `Category "${entityName}" has been deleted`,
      'expense_created': `New expense "${entityName}" has been recorded`,
      'expense_updated': `Expense "${entityName}" has been modified`,
      'expense_deleted': `Expense "${entityName}" has been removed`,
      'expense_approved': `Expense "${entityName}" has been approved`,
      'expense_rejected': `Expense "${entityName}" has been rejected`,
      // NEW: Tenant-specific descriptions
      'tenant_created': `Organization "${entityName}" has been created`,
      'tenant_updated': `Organization "${entityName}" details have been updated`,
      'tenant_settings_updated': `Settings for "${entityName}" have been updated`,
      'subscription_updated': `Subscription plan for "${entityName}" has been changed`,
      'tenant_suspended': `Organization "${entityName}" has been suspended`,
      'tenant_reactivated': `Organization "${entityName}" has been reactivated`,
      'custom_domain_setup': `Custom domain has been configured for "${entityName}"`
    };
    
    return actionMap[type] || `${entityType} "${entityName}" has been modified`;
  }

  // Fixed getRecentActivities method in activityService.js
// Replace the existing method starting at line 112

static async getRecentActivities(limit = 10, userId = null, tenantId = null) {
  try {
    console.log('🔍 getRecentActivities called with:', { limit, userId, tenantId });
    
    const query = {};
    
    // Only filter by tenant if tenantId is provided
    if (tenantId) {
      query.tenantId = tenantId;
      console.log('📊 Filtering by tenantId:', tenantId);
    } else {
      console.log('⚠️ No tenantId provided, returning all activities');
    }
    
    // If user ID provided, can be for filtering or excluding own activities
    if (userId) {
      query.performedBy = userId;
      console.log('👤 Filtering by userId:', userId);
    }

    console.log('🔎 Final query:', query);

    const activities = await Activity.find(query)
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);

    // console.log(`✅ Found ${activities.length} activities`);
    
    // if (activities.length > 0) {
    //   console.log('📋 Sample activity:', {
    //     id: activities[0]._id,
    //     type: activities[0].type,
    //     tenantId: activities[0].tenantId,
    //     performedBy: activities[0].performedBy
    //   });
    // }

    return activities.map(activity => ({
      id: activity._id,
      type: activity.type,
      title: activity.title,
      message: activity.description,
      time: this.getRelativeTime(activity.createdAt),
      icon: this.getIconForActivity(activity.type),
      color: this.getColorForActivity(activity.type),
      entityType: activity.entityType,
      entityName: activity.entityName,
      performedBy: activity.performedBy?.name,
      isRead: activity.isRead,
      priority: activity.priority,
      category: activity.category,
      tenantId: activity.tenantId,
      createdAt: activity.createdAt
    }));
  } catch (error) {
    console.error('❌ Error fetching activities:', error);
    return [];
  }
}

  // NEW: Get recent activities by tenant
  static async getRecentActivitiesByTenant(tenantId, limit = 10, options = {}) {
    try {
      return await Activity.findByTenant(tenantId, {
        ...options,
        limit
      });
    } catch (error) {
      console.error('Error fetching tenant activities:', error);
      return [];
    }
  }

  // Get unread notifications count (MODIFIED for multi-tenancy)
  static async getUnreadCount(userId = null, tenantId = null) {
    try {
      let query = { isRead: false };
      
      if (tenantId) {
        query.tenantId = tenantId;
      }
      
      if (userId) {
        query.performedBy = { $ne: userId }; // Don't show own activities as notifications
      }

      return await Activity.countDocuments(query);
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // NEW: Get unread count by tenant
  static async getUnreadCountByTenant(tenantId, userId = null) {
    try {
      return await Activity.getUnreadCountByTenant(tenantId, userId);
    } catch (error) {
      console.error('Error getting tenant unread count:', error);
      return 0;
    }
  }

  // Mark activities as read (MODIFIED for multi-tenancy)
  static async markAsRead(activityIds, tenantId = null, userId = null) {
    try {
      let query = { _id: { $in: activityIds } };
      
      // Add tenant filter if provided
      if (tenantId) {
        query.tenantId = tenantId;
      }
      
      await Activity.updateMany(query, { 
        isRead: true,
        readAt: new Date(),
        readBy: userId
      });
      
      return true;
    } catch (error) {
      console.error('Error marking activities as read:', error);
      return false;
    }
  }

  // NEW: Mark tenant activities as read
  static async markTenantActivitiesAsRead(tenantId, activityIds, userId) {
    try {
      return await Activity.markAsReadByTenant(tenantId, activityIds, userId);
    } catch (error) {
      console.error('Error marking tenant activities as read:', error);
      return false;
    }
  }

  // Get activity statistics (NEW for multi-tenancy)
  static async getActivityStatistics(tenantId = null, days = 30) {
    try {
      if (tenantId) {
        return await Activity.getStatsByTenant(tenantId, days);
      }
      
      // Super admin view - all tenants
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const stats = await Activity.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $facet: {
            byTenant: [
              {
                $lookup: {
                  from: 'tenants',
                  localField: 'tenantId',
                  foreignField: '_id',
                  as: 'tenant'
                }
              },
              { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
              {
                $group: {
                  _id: '$tenantId',
                  tenantName: { $first: '$tenant.name' },
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 10 }
            ],
            byType: [
              {
                $group: {
                  _id: '$type',
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } }
            ],
            total: [
              {
                $group: {
                  _id: null,
                  totalActivities: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]);
      
      return {
        byTenant: stats[0].byTenant,
        byType: stats[0].byType,
        summary: stats[0].total[0] || { totalActivities: 0 }
      };
    } catch (error) {
      console.error('Error getting activity statistics:', error);
      return null;
    }
  }

  // Get icon for activity type
  static getIconForActivity(type) {
    const iconMap = {
      'user_created': 'UserPlus',
      'user_updated': 'UserCheck',
      'user_deleted': 'UserX',
      'role_created': 'ShieldPlus',
      'role_updated': 'Shield',
      'role_deleted': 'ShieldX',
      'category_created': 'FolderPlus',
      'category_updated': 'Folder',
      'category_deleted': 'FolderX',
      'expense_created': 'TrendingUp',
      'expense_updated': 'Edit',
      'expense_deleted': 'Trash2',
      'expense_approved': 'CheckCircle',
      'expense_rejected': 'XCircle',
      // NEW: Tenant-specific icons
      'tenant_created': 'Building',
      'tenant_updated': 'Building',
      'tenant_settings_updated': 'Settings',
      'subscription_updated': 'CreditCard',
      'tenant_suspended': 'AlertTriangle',
      'tenant_reactivated': 'CheckCircle',
      'custom_domain_setup': 'Globe'
    };
    
    return iconMap[type] || 'Activity';
  }

  // Get color for activity type
  static getColorForActivity(type) {
    if (type.includes('created')) return 'text-green-500';
    if (type.includes('updated')) return 'text-blue-500';
    if (type.includes('deleted')) return 'text-red-500';
    if (type.includes('approved')) return 'text-green-500';
    if (type.includes('rejected')) return 'text-red-500';
    if (type.includes('suspended')) return 'text-orange-500';
    if (type.includes('reactivated')) return 'text-green-500';
    return 'text-gray-500';
  }

  // Get relative time
  static getRelativeTime(date) {
    const now = new Date();
    const diffInMs = now - new Date(date);
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    
    return new Date(date).toLocaleDateString();
  }

  // Clean old activities (MODIFIED for multi-tenancy)
  static async cleanOldActivities(tenantId = null, daysToKeep = 180) {
    try {
      if (tenantId) {
        return await Activity.cleanOldActivitiesByTenant(tenantId, daysToKeep);
      }
      
      // Super admin - clean system-wide
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await Activity.deleteMany({
        createdAt: { $lt: cutoffDate },
        priority: { $ne: 'critical' }
      });
      
      console.log(`Cleaned ${result.deletedCount} old activities`);
      return result;
    } catch (error) {
      console.error('Error cleaning old activities:', error);
    }
  }
}

module.exports = ActivityService;