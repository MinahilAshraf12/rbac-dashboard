const express = require('express');
const router = express.Router();
const {
  getCategories,
  getSimpleCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { protect, hasPermission } = require('../middleware/auth');

router.use(protect); // All routes are protected

router.get('/simple', getSimpleCategories); // Simple list for dropdowns

router
  .route('/')
  .get(getCategories)
  .post(hasPermission('categories', 'create'), createCategory);

router
  .route('/:id')
  .get(hasPermission('categories', 'read'), getCategory)
  .put(hasPermission('categories', 'update'), updateCategory)
  .delete(hasPermission('categories', 'delete'), deleteCategory);

module.exports = router;