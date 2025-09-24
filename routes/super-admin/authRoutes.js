// routes/super-admin/authRoutes.js
const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  logout,
  changePassword,
  updateProfile,
  getDashboardStats
} = require('../../controllers/super-admin/authController');
const { 
  protectSuperAdmin,
  logSuperAdminActivity
} = require('../../middleware/superAdmin');

// Public routes (no auth required)
router.post('/login', login);

// Protected routes (require super admin auth)
router.use(protectSuperAdmin);

router.get('/me', getMe);
router.get('/logout', logSuperAdminActivity('logout'), logout);
router.put('/change-password', logSuperAdminActivity('change_password'), changePassword);
router.put('/profile', logSuperAdminActivity('update_profile'), updateProfile);
router.get('/dashboard', getDashboardStats);

module.exports = router;