const Activity = require('../models/Activity');

class ActivityService {
  
  // Create new activity log
  static async logActivity({
    type,
    entityId,
    entityType,
    entityName,
    performedBy,
    oldData = null,
    newData = null,
    changes = []
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
        metadata: {
          oldData,
          newData,
          changes
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
      'expense_deleted': `Expense Deleted: ${entityName}`
    };
    
    return actionMap[type] || `Activity: ${entityName}`;
  }

  // Generate activity description
  static generateDescription(type, entityName, entityType) {
    const actionMap = {
      'user_created': `A new user "${entityName}" has been added to the system`,
      'user_updated': `User "${entityName}" profile has been updated`,
      'user_deleted': `User "${entityName}" has been removed from the system`,
      'role_created': `A new role "${entityName}" has been created`,
      'role_updated': `Role "${entityName}" permissions have been modified`,
      'role_deleted': `Role "${entityName}" has been removed`,
      'category_created': `A new expense category "${entityName}" has been added`,
      'category_updated': `Category "${entityName}" details have been updated`,
      'category_deleted': `Category "${entityName}" has been deleted`,
      'expense_created': `New expense "${entityName}" has been recorded`,
      'expense_updated': `Expense "${entityName}" has been modified`,
      'expense_deleted': `Expense "${entityName}" has been removed`
    };
    
    return actionMap[type] || `${entityType} "${entityName}" has been modified`;
  }

  // Get recent activities
  static async getRecentActivities(limit = 10, userId = null) {
    try {
      let query = {};
      if (userId) {
        query.performedBy = userId;
      }

      const activities = await Activity.find(query)
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit);

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
        createdAt: activity.createdAt
      }));
    } catch (error) {
      console.error('Error fetching activities:', error);
      return [];
    }
  }

  // Get unread notifications count
  static async getUnreadCount(userId = null) {
    try {
      let query = { isRead: false };
      if (userId) {
        query.performedBy = { $ne: userId }; // Don't show own activities as notifications
      }

      return await Activity.countDocuments(query);
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // Mark activities as read
  static async markAsRead(activityIds) {
    try {
      await Activity.updateMany(
        { _id: { $in: activityIds } },
        { isRead: true }
      );
      return true;
    } catch (error) {
      console.error('Error marking activities as read:', error);
      return false;
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
      'expense_deleted': 'Trash2'
    };
    
    return iconMap[type] || 'Activity';
  }

  // Get color for activity type
  static getColorForActivity(type) {
    if (type.includes('created')) return 'text-green-500';
    if (type.includes('updated')) return 'text-blue-500';
    if (type.includes('deleted')) return 'text-red-500';
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

  // Clean old activities (keep only last 30 days)
  static async cleanOldActivities() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      await Activity.deleteMany({
        createdAt: { $lt: thirtyDaysAgo }
      });
      
      console.log('Old activities cleaned successfully');
    } catch (error) {
      console.error('Error cleaning old activities:', error);
    }
  }
}

module.exports = ActivityService;