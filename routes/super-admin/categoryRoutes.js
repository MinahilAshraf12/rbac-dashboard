const express = require('express');
const router = express.Router();
const {
  getCategories,
  getSimpleCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus
} = require('../controllers/categoryController');
const { protect, hasPermission } = require('../middleware/auth');

router.use(protect); // All routes are protected

// Simple list for dropdowns (must come before /:id)
router.get('/simple', getSimpleCategories);

// Base routes
router
  .route('/')
  .get(getCategories)
  .post(hasPermission('categories', 'create'), createCategory);

// Specific action routes (must come BEFORE /:id routes)
router.put('/:id/toggle-status', hasPermission('categories', 'update'), toggleCategoryStatus);

// Generic /:id routes (must come LAST)
router
  .route('/:id')
  .get(hasPermission('categories', 'read'), getCategory)
  .put(hasPermission('categories', 'update'), updateCategory)
  .delete(hasPermission('categories', 'delete'), deleteCategory);

module.exports = router;