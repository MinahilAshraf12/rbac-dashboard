const express = require('express');
const router = express.Router();
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStatistics,
  getExpenseUsers,
  getExpenseSummary,
  downloadFile,
  getFileInfo,
  repairTotal
} = require('../controllers/expenseController');
const {
  getExpenseAnalytics,
  getRecentActivity,
  getDashboardStats
} = require('../controllers/expenseAnalyticsController');
const { protect } = require('../middleware/auth');
const { checkSubscriptionLimits } = require('../middleware/subscription');
const upload = require('../config/upload');

router.use(protect); // All routes are protected

// Analytics routes
router.get('/analytics', getExpenseAnalytics);
router.get('/recent-activity', getRecentActivity);
router.get('/dashboard-stats', getDashboardStats);

router.get('/statistics', getExpenseStatistics);
router.get('/users', getExpenseUsers);
router.get('/summary', getExpenseSummary);

router
  .route('/')
  .get(getExpenses)
  .post(
    checkSubscriptionLimits('expenses'), // ADD subscription check
    upload.any(), 
    createExpense
  );

router
  .route('/:id')
  .get(getExpense)
  .put(upload.any(), updateExpense)
  .delete(deleteExpense);

// File routes
router.get('/:id/files/:paymentIndex', downloadFile);
router.get('/:id/files/:paymentIndex/info', getFileInfo);

// Debug route for total repair
router.get('/:id/repair-total', repairTotal);

module.exports = router;