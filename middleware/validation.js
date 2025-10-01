// middleware/validation.js - Enhanced validation middleware
const { body, validationResult, param, query } = require('express-validator');

// Common validation rules
const validateTenantSlug = [
  param('slug')
    .isLength({ min: 3, max: 30 })
    .withMessage('Slug must be between 3 and 30 characters')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens')
    .custom(async (slug) => {
      const reservedSlugs = [
        'www', 'admin', 'api', 'mail', 'ftp', 'support', 'help',
        'blog', 'news', 'app', 'portal', 'dashboard', 'login',
        'signup', 'register', 'pricing', 'about', 'contact'
      ];
      
      if (reservedSlugs.includes(slug.toLowerCase())) {
        throw new Error('This subdomain is reserved');
      }
      return true;
    })
];

const validateUserInvite = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('roleId')
    .isMongoId()
    .withMessage('Valid role ID is required'),
  body('tenantRole')
    .optional()
    .isIn(['user', 'manager', 'tenant_admin'])
    .withMessage('Invalid tenant role')
];

const validateTenantSetup = [
  body('tenantName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2 and 100 characters'),
  body('slug')
    .isLength({ min: 3, max: 30 })
    .withMessage('Subdomain must be between 3 and 30 characters')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain can only contain lowercase letters, numbers, and hyphens'),
  body('ownerName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters'),
  body('ownerEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('ownerPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('plan')
    .optional()
    .isIn(['free', 'basic', 'premium', 'enterprise'])
    .withMessage('Invalid plan selected')
];

const validateCustomDomain = [
  body('customDomain')
    .trim()
    .matches(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .withMessage('Please provide a valid domain name')
    .custom((domain) => {
      // Don't allow subdomains of our main domain
      if (domain.includes('i-expense.ikftech.com')) {
        throw new Error('Cannot use subdomains of i-expense.ikftech.com as custom domain');
      }
      return true;
    })
];

const validateExpenseQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

module.exports = {
  validateTenantSlug,
  validateUserInvite,
  validateTenantSetup,
  validateCustomDomain,
  validateExpenseQuery,
  handleValidationErrors
};