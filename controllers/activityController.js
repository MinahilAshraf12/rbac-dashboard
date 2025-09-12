// controllers/activityController.js
const ActivityService = require('../services/activityService');

// @desc    Get recent activities for dashboard
// @route   GET /api/activities/recent
// @access  Private
const getRecentActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activities = await ActivityService.getRecentActivities(limit);

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get notifications (unread activities)
// @route   GET /api/activities/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.user.id;
    
    // Get activities not performed by current user
    const activities = await ActivityService.getRecentActivities(limit);
    const notifications = activities.filter(activity => 
      activity.performedBy !== req.user.name && !activity.isRead
    );

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount: notifications.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get unread notifications count
// @route   GET /api/activities/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await ActivityService.getUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Mark notifications as read
// @route   PUT /api/activities/mark-read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { activityIds } = req.body;
    
    if (!activityIds || !Array.isArray(activityIds)) {
      return res.status(400).json({
        success: false,
        message: 'Activity IDs array is required'
      });
    }

    await ActivityService.markAsRead(activityIds);

    res.status(200).json({
      success: true,
      message: 'Activities marked as read'
    });
  } catch (error) {
    console.error('Error marking activities as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get all activities with pagination
// @route   GET /api/activities
// @access  Private
const getAllActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const entityType = req.query.entityType || '';
    const performedBy = req.query.performedBy || '';

    const activities = await ActivityService.getRecentActivities(limit * page);
    
    // Simple pagination by slicing the results
    const startIndex = (page - 1) * limit;
    const paginatedActivities = activities.slice(startIndex, startIndex + limit);

    res.status(200).json({
      success: true,
      data: paginatedActivities,
      pagination: {
        page,
        limit,
        total: activities.length,
        pages: Math.ceil(activities.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getRecentActivities,
  getNotifications,
  getUnreadCount,
  markAsRead,
  getAllActivities
};