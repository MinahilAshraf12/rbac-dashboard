// controllers/publicController.js - COMPLETE VERSION
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const ActivityService = require('../services/activityService');

// @desc    Get public subscription plans
// @route   GET /api/public/plans
// @access  Public
const getPublicPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.getActivePlans();
    
    // Remove sensitive information and add public-friendly data
    const publicPlans = plans.map(plan => ({
      id: plan._id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      features: plan.features,
      limits: plan.formattedLimits,
      availableFeatures: plan.availableFeatures,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
      metadata: {
        color: plan.metadata.color,
        badge: plan.metadata.badge,
        ctaText: plan.metadata.ctaText
      },
      yearlySavings: plan.yearlySavings,
      trial: {
        enabled: plan.trial.enabled,
        days: plan.trial.days
      }
    }));

    res.status(200).json({
      success: true,
      count: publicPlans.length,
      data: publicPlans
    });
  } catch (error) {
    console.error('Get public plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single public plan
// @route   GET /api/public/plans/:slug
// @access  Public
const getPublicPlan = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const plan = await SubscriptionPlan.findOne({ 
      slug: slug.toLowerCase(), 
      isActive: true 
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Get plan statistics (number of tenants using this plan)
    const tenantCount = await Tenant.countDocuments({ 
      plan: plan.slug, 
      isActive: true 
    });

    const publicPlan = {
      id: plan._id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      features: plan.features,
      limits: plan.formattedLimits,
      availableFeatures: plan.availableFeatures,
      isPopular: plan.isPopular,
      metadata: plan.metadata,
      yearlySavings: plan.yearlySavings,
      trial: plan.trial,
      stats: {
        tenantCount,
        popularity: tenantCount > 0 ? 'popular' : 'new'
      }
    };

    res.status(200).json({
      success: true,
      data: publicPlan
    });
  } catch (error) {
    console.error('Get public plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Register new tenant (redirect to onboarding)
// @route   POST /api/public/register
// @access  Public
const registerTenant = async (req, res) => {
  try {
    // This endpoint redirects to the proper onboarding flow
    return res.status(301).json({
      success: true,
      message: 'Please use the onboarding endpoint for account creation',
      redirectTo: '/api/onboarding/setup-account',
      endpoints: {
        setup_account: 'POST /api/onboarding/setup-account',
        validate_setup: 'POST /api/onboarding/validate-setup',
        check_domain: 'GET /api/public/check-domain/:slug'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Check domain availability
// @route   GET /api/public/check-domain/:slug
// @access  Public
const checkDomainAvailability = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Subdomain is required'
      });
    }

    const cleanSlug = slug.toLowerCase().trim();

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Subdomain can only contain lowercase letters, numbers, and hyphens',
        suggestions: [
          cleanSlug.replace(/[^a-z0-9-]/g, ''),
          cleanSlug.replace(/[^a-z0-9-]/g, '') + '123',
          'my' + cleanSlug.replace(/[^a-z0-9-]/g, '')
        ].filter(s => s.length >= 3 && s.length <= 30)
      });
    }

    if (cleanSlug.length < 3 || cleanSlug.length > 30) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'Subdomain must be between 3 and 30 characters',
        suggestions: cleanSlug.length < 3 ? [
          cleanSlug + '123',
          cleanSlug + 'corp',
          'my' + cleanSlug
        ] : [
          cleanSlug.substring(0, 25),
          cleanSlug.substring(0, 20) + '123',
          cleanSlug.substring(0, 15) + 'co'
        ]
      });
    }

    // Check reserved subdomains
    const reservedSlugs = [
      'www', 'admin', 'api', 'mail', 'ftp', 'support', 'help',
      'blog', 'news', 'app', 'portal', 'dashboard', 'login',
      'signup', 'register', 'pricing', 'about', 'contact',
      'docs', 'status', 'billing', 'payments', 'webhooks'
    ];

    if (reservedSlugs.includes(cleanSlug)) {
      return res.status(400).json({
        success: false,
        available: false,
        message: 'This subdomain is reserved',
        suggestions: [
          cleanSlug + 'co',
          cleanSlug + 'corp',
          'my' + cleanSlug,
          cleanSlug + '2024'
        ]
      });
    }

    // Check if slug is already taken
    const existingTenant = await Tenant.findOne({ slug: cleanSlug });

    if (existingTenant) {
      // Generate suggestions
      const suggestions = [];
      for (let i = 1; i <= 5; i++) {
        const suggestion = `${cleanSlug}${i}`;
        const exists = await Tenant.findOne({ slug: suggestion });
        if (!exists && suggestion.length <= 30) {
          suggestions.push(suggestion);
        }
      }

      // Add more creative suggestions
      const creativeSuggestions = [
        `my${cleanSlug}`,
        `${cleanSlug}co`,
        `${cleanSlug}hq`,
        `${cleanSlug}app`
      ].filter(s => s.length <= 30);

      for (const suggestion of creativeSuggestions) {
        if (suggestions.length < 5) {
          const exists = await Tenant.findOne({ slug: suggestion });
          if (!exists) {
            suggestions.push(suggestion);
          }
        }
      }

      return res.status(400).json({
        success: false,
        available: false,
        slug: cleanSlug,
        message: 'Subdomain is already taken',
        suggestions: suggestions.slice(0, 5)
      });
    }

    res.status(200).json({
      success: true,
      available: true,
      slug: cleanSlug,
      domain: `${cleanSlug}.i-expense.ikftech.com`,
      message: 'Subdomain is available',
      preview: {
        loginUrl: `https://${cleanSlug}.i-expense.ikftech.com/login`,
        dashboardUrl: `https://${cleanSlug}.i-expense.ikftech.com/dashboard`
      }
    });

  } catch (error) {
    console.error('Check domain availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get public tenant info (for login page branding)
// @route   GET /api/public/tenant/:slug
// @access  Public
const getPublicTenantInfo = async (req, res) => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ 
      slug: slug.toLowerCase(),
      isActive: true 
    });  // Remove .select() to get all fields including createdAt

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    if (tenant.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Organization account is suspended',
        code: 'TENANT_SUSPENDED'
      });
    }

    if (tenant.status === 'cancelled') {
      return res.status(410).json({
        success: false,
        message: 'Organization account has been cancelled',
        code: 'TENANT_CANCELLED'
      });
    }

    // Check trial status - with null check
    const isTrialExpired = tenant.trialEndDate && new Date() > tenant.trialEndDate;
    if (tenant.status === 'trial' && isTrialExpired) {
      return res.status(402).json({
        success: false,
        message: 'Organization trial has expired',
        code: 'TRIAL_EXPIRED',
        data: {
          trialEndDate: tenant.trialEndDate,
          upgradeRequired: true
        }
      });
    }

    // Get basic statistics (public info only)
    const userCount = await User.countDocuments({
      tenantId: tenant._id,
      isActive: true
    });

    res.status(200).json({
      success: true,
      data: {
        name: tenant.name,
        slug: tenant.slug,
        domain: `${tenant.slug}.i-expense.ikftech.com`,
        plan: tenant.plan,
        status: tenant.status,
        branding: tenant.settings?.branding || {
          logo: null,
          primaryColor: '#3B82F6',
          companyName: tenant.name
        },
        stats: {
          teamSize: userCount > 0 ? `${userCount}+ team members` : 'Growing team',
          established: tenant.createdAt ? tenant.createdAt.getFullYear() : new Date().getFullYear()
        },
        trialInfo: tenant.status === 'trial' ? {
          isTrialExpired: isTrialExpired,
          daysLeft: tenant.trialEndDate ? 
            Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / (1000 * 60 * 60 * 24))) : 0
        } : null,
        // Add settings and usage for frontend
        settings: tenant.settings,
        usage: tenant.usage
      }
    });

  } catch (error) {
    console.error('Get public tenant info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get platform statistics (public)
// @route   GET /api/public/stats
// @access  Public
const getPlatformStats = async (req, res) => {
  try {
    // Get public statistics (no sensitive data)
    const [
      totalTenants,
      totalUsers,
      activeTeams
    ] = await Promise.all([
      Tenant.countDocuments({ isActive: true, status: { $in: ['active', 'trial'] } }),
      User.countDocuments({ isActive: true }),
      Tenant.countDocuments({ 
        isActive: true, 
        status: 'active',
        'usage.currentUsers': { $gte: 2 }
      })
    ]);

    // Round numbers for public display
    const roundedStats = {
      organizations: Math.floor(totalTenants / 10) * 10 + '+',
      users: Math.floor(totalUsers / 100) * 100 + '+',
      activeTeams: Math.floor(activeTeams / 5) * 5 + '+'
    };

    res.status(200).json({
      success: true,
      data: {
        stats: roundedStats,
        features: {
          totalFeatures: 25,
          supportedCurrencies: 3,
          apiIntegrations: 10,
          securityCompliance: ['SOC2', 'GDPR', 'CCPA']
        },
        uptime: '99.9%',
        support: '24/7'
      }
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Search public tenants (for directory/marketplace)
// @route   GET /api/public/search-tenants
// @access  Public
const searchPublicTenants = async (req, res) => {
  try {
    const { 
      query = '', 
      industry = '', 
      plan = '', 
      page = 1, 
      limit = 20 
    } = req.query;

    // Only show tenants that have opted into public directory
    const searchQuery = {
      isActive: true,
      status: { $in: ['active', 'trial'] },
      'settings.publicProfile': true  // Assuming this field exists
    };

    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { 'metadata.industry': { $regex: query, $options: 'i' } }
      ];
    }

    if (industry) {
      searchQuery['metadata.industry'] = industry;
    }

    if (plan) {
      searchQuery.plan = plan;
    }

    const tenants = await Tenant.find(searchQuery)
      .select('name slug metadata.industry plan createdAt settings.branding')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Tenant.countDocuments(searchQuery);

    const publicTenants = tenants.map(tenant => ({
      name: tenant.name,
      slug: tenant.slug,
      domain: `${tenant.slug}.i-expense.ikftech.com`,
      industry: tenant.metadata?.industry || 'Business',
      plan: tenant.plan,
      established: tenant.createdAt.getFullYear(),
      branding: {
        logo: tenant.settings?.branding?.logo,
        primaryColor: tenant.settings?.branding?.primaryColor || '#3B82F6'
      }
    }));

    res.status(200).json({
      success: true,
      count: publicTenants.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
        hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      },
      data: publicTenants
    });

  } catch (error) {
    console.error('Search public tenants error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get pricing calculator
// @route   POST /api/public/calculate-pricing
// @access  Public
const calculatePricing = async (req, res) => {
  try {
    const { 
      users = 5, 
      expenses = 100, 
      storage = 1, 
      features = [],
      billing = 'monthly'
    } = req.body;

    // Get all plans
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ 'price.monthly': 1 });

    // Find suitable plans
    const suitablePlans = plans.filter(plan => {
      const userLimit = plan.limits.users === -1 || plan.limits.users >= users;
      const expenseLimit = plan.limits.expenses === -1 || plan.limits.expenses >= expenses;
      const storageLimit = plan.limits.storage === -1 || plan.limits.storage >= storage * 1024; // Convert GB to MB
      
      const hasRequiredFeatures = features.every(feature => 
        plan.availableFeatures.includes(feature)
      );

      return userLimit && expenseLimit && storageLimit && hasRequiredFeatures;
    });

    // Calculate costs
    const recommendations = suitablePlans.map(plan => {
      const monthlyPrice = plan.price.monthly;
      const yearlyPrice = plan.price.yearly;
      const actualYearlyPrice = billing === 'yearly' ? yearlyPrice : monthlyPrice * 12;
      const savings = (monthlyPrice * 12) - yearlyPrice;
      const savingsPercentage = savings > 0 ? Math.round((savings / (monthlyPrice * 12)) * 100) : 0;

      return {
        plan: {
          id: plan._id,
          name: plan.name,
          slug: plan.slug,
          isPopular: plan.isPopular
        },
        pricing: {
          monthly: monthlyPrice,
          yearly: yearlyPrice,
          actualPrice: billing === 'yearly' ? yearlyPrice : monthlyPrice,
          billingCycle: billing,
          savings: billing === 'yearly' ? savings : 0,
          savingsPercentage: billing === 'yearly' ? savingsPercentage : 0
        },
        limits: {
          users: plan.limits.users === -1 ? 'Unlimited' : plan.limits.users,
          expenses: plan.limits.expenses === -1 ? 'Unlimited' : plan.limits.expenses,
          storage: plan.limits.storage === -1 ? 'Unlimited' : `${Math.floor(plan.limits.storage / 1024)} GB`
        },
        features: plan.availableFeatures,
        recommended: plan.isPopular || (suitablePlans.length > 1 && suitablePlans[1] === plan)
      };
    });

    // Add cost per user/expense analysis
    const analysis = recommendations.map(rec => ({
      ...rec,
      costAnalysis: {
        pricePerUser: rec.pricing.actualPrice / Math.max(users, 1),
        pricePerExpense: rec.pricing.actualPrice / Math.max(expenses, 1),
        efficiency: rec.limits.users === 'Unlimited' ? 'enterprise' : 
                   users / (typeof rec.limits.users === 'number' ? rec.limits.users : users) > 0.8 ? 'optimal' : 'generous'
      }
    }));

    res.status(200).json({
      success: true,
      requirements: {
        users,
        expenses,
        storage: `${storage} GB`,
        features,
        billing
      },
      recommendations: analysis,
      summary: {
        cheapestOption: analysis.reduce((min, current) => 
          current.pricing.actualPrice < min.pricing.actualPrice ? current : min
        ),
        recommendedOption: analysis.find(r => r.recommended) || analysis[0],
        totalPlansAvailable: plans.length,
        suitablePlansFound: suitablePlans.length
      }
    });

  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get public feature comparison
// @route   GET /api/public/compare-plans
// @access  Public
const comparePlans = async (req, res) => {
  try {
    const { plans: requestedPlans } = req.query;
    
    let planSlugs;
    if (requestedPlans) {
      planSlugs = requestedPlans.split(',').map(slug => slug.trim());
    } else {
      // Default to all plans if none specified
      planSlugs = [];
    }

    let query = { isActive: true };
    if (planSlugs.length > 0) {
      query.slug = { $in: planSlugs };
    }

    const plans = await SubscriptionPlan.find(query).sort({ 'price.monthly': 1 });

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No plans found for comparison'
      });
    }

    // Create comprehensive comparison
    const comparison = {
      plans: plans.map(plan => ({
        id: plan._id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        pricing: {
          monthly: plan.price.monthly,
          yearly: plan.price.yearly,
          yearlySavings: plan.yearlySavings
        },
        limits: plan.formattedLimits,
        features: plan.features,
        availableFeatures: plan.availableFeatures,
        isPopular: plan.isPopular,
        metadata: plan.metadata
      })),
      featureMatrix: {}
    };

    // Build feature matrix
    const allFeatures = [...new Set(plans.flatMap(p => p.availableFeatures))];
    allFeatures.forEach(feature => {
      comparison.featureMatrix[feature] = {};
      plans.forEach(plan => {
        comparison.featureMatrix[feature][plan.slug] = plan.availableFeatures.includes(feature);
      });
    });

    // Add limit comparisons
    const limitTypes = ['users', 'expenses', 'storage'];
    limitTypes.forEach(limitType => {
      comparison.featureMatrix[`${limitType}_limit`] = {};
      plans.forEach(plan => {
        const limit = plan.limits[limitType];
        comparison.featureMatrix[`${limitType}_limit`][plan.slug] = 
          limit === -1 ? 'Unlimited' : limit.toString();
      });
    });

    res.status(200).json({
      success: true,
      comparison,
      summary: {
        planCount: plans.length,
        priceRange: {
          min: Math.min(...plans.map(p => p.price.monthly)),
          max: Math.max(...plans.map(p => p.price.monthly))
        },
        mostPopular: plans.find(p => p.isPopular)?.name || plans[0]?.name,
        bestValue: plans.reduce((best, current) => 
          (current.price.yearly / 12) < (best.price.yearly / 12) ? current : best
        )?.name
      }
    });

  } catch (error) {
    console.error('Compare plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getPublicPlans,
  getPublicPlan,
  registerTenant,
  checkDomainAvailability,
  getPublicTenantInfo,
  getPlatformStats,
  searchPublicTenants,
  calculatePricing,
  comparePlans
};