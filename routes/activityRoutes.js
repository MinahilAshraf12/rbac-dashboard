const express = require('express');
const router = express.Router();
const {
  getRecentActivities,
  getNotifications,
  getUnreadCount,
  markAsRead,
  getAllActivities
} = require('../controllers/activityController');
const { protect } = require('../middleware/auth');

// Apply protection middleware to all routes
router.use(protect);

// @route   GET /api/activities/recent
router.get('/recent', getRecentActivities);

// @route   GET /api/activities/notifications
router.get('/notifications', getNotifications);

// @route   GET /api/activities/unread-count
router.get('/unread-count', getUnreadCount);

// @route   PUT /api/activities/mark-read
router.put('/mark-read', markAsRead);

// @route   GET /api/activities
router.get('/', getAllActivities);

module.exports = router;