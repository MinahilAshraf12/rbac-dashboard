const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');
const { protect, hasPermission } = require('../middleware/auth');
const { checkSubscriptionLimits } = require('../middleware/subscription');

router.use(protect); // All routes are protected

router
  .route('/')
  .get(hasPermission('users', 'read'), getUsers)
  .post(
    hasPermission('users', 'create'),
    checkSubscriptionLimits('users'), // ADD subscription check
    createUser
  );

router
  .route('/:id')
  .get(hasPermission('users', 'read'), getUser)
  .put(hasPermission('users', 'update'), updateUser)
  .delete(hasPermission('users', 'delete'), deleteUser);

module.exports = router;