// middleware/security.js - Enhanced security middleware
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

// Create rate limiter based on tenant
const createTenantRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Include tenant in rate limit key
      return `${req.ip}:${req.tenant?._id || 'no-tenant'}`;
    }
  });
};

// Security headers with dynamic CSP based on tenant
const securityHeaders = (req, res, next) => {
  // Basic security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "https://api.stripe.com"],
        frameSrc: ["'self'", "https://js.stripe.com"]
      }
    }
  })(req, res, next);
};

// Sanitize MongoDB queries
const sanitizeInput = mongoSanitize({
  replaceWith: '_'
});

// CORS configuration based on tenant
const configureCORS = (req, res, next) => {
  const origin = req.get('origin');
  
  // Allow all origins in development
  if (process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    // Production CORS based on tenant
    const allowedOrigins = [
      'https://i-expense.ikftech.com',
      'https://admin.i-expense.ikftech.com'
    ];

    if (req.tenant) {
      allowedOrigins.push(`https://${req.tenant.slug}.i-expense.ikftech.com`);
      if (req.tenant.customDomain && req.tenant.domainVerified) {
        allowedOrigins.push(`https://${req.tenant.customDomain}`);
      }
    }

    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  }

  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

module.exports = {
  createTenantRateLimit,
  securityHeaders,
  sanitizeInput,
  configureCORS
};