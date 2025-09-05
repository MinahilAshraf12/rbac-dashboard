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
const { protect } = require('../middleware/auth');
const upload = require('../config/upload');

router.use(protect); // All routes are protected

router.get('/statistics', getExpenseStatistics);
router.get('/users', getExpenseUsers);
router.get('/summary', getExpenseSummary);

router
  .route('/')
  .get(getExpenses)
  .post(upload.any(), createExpense);

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