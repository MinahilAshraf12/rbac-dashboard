const express = require('express');
const router = express.Router();
const {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/roleController');
const { protect, hasPermission } = require('../middleware/auth');

router.use(protect); // All routes are protected

router
  .route('/')
  .get(hasPermission('roles', 'read'), getRoles)
  .post(hasPermission('roles', 'create'), createRole);

router
  .route('/:id')
  .get(hasPermission('roles', 'read'), getRole)
  .put(hasPermission('roles', 'update'), updateRole)
  .delete(hasPermission('roles', 'delete'), deleteRole);

module.exports = router;