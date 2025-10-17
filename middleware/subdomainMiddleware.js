// middleware/subdomainMiddleware.js

/**
 * Extract tenant slug from subdomain
 */
const extractTenantFromSubdomain = (req, res, next) => {
  try {
    // Get hostname from various sources
    const hostname = req.get('x-forwarded-host') || 
                     req.get('host') || 
                     req.hostname;
    
    console.log('🌐 Subdomain Middleware - Hostname:', hostname);
    
    // Development - Skip subdomain detection for localhost
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      console.log('🔧 Development mode - Skipping subdomain extraction');
      return next();
    }

    // Render backend - Skip for .onrender.com
    if (hostname.includes('.onrender.com')) {
      console.log('🔧 Render backend - Skipping subdomain extraction');
      return next();
    }

    // Production - Extract subdomain from i-expense.ikftech.com
    if (hostname.endsWith('.i-expense.ikftech.com')) {
      const subdomain = hostname.replace('.i-expense.ikftech.com', '');
      
      // Skip reserved subdomains
      const reserved = ['www', 'api', 'admin', 'cdn', 'mail', 'ftp'];
      if (reserved.includes(subdomain)) {
        console.log('⚠️ Reserved subdomain:', subdomain);
        return next();
      }
      
      console.log('✅ Tenant slug from subdomain:', subdomain);
      
      // Attach to request
      req.tenantSlug = subdomain;
      req.isSubdomainRequest = true;
    }
    
    next();
  } catch (error) {
    console.error('❌ Subdomain extraction error:', error);
    next();
  }
};

module.exports = { extractTenantFromSubdomain };