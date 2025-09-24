// controllers/super-admin/analyticsController.js
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Expense = require('../../models/Expense');
const Activity = require('../../models/Activity');
const SubscriptionPlan = require('../../models/SubscriptionPlan');
const mongoose = require('mongoose');

// @desc    Get system dashboard analytics
// @route   GET /api/super-admin/analytics/dashboard
// @access  Super Admin only
const getDashboardAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get basic counts
    const [
      totalTenants,
      activeTenants,
      totalUsers,
      activeUsers,
      totalExpenses,
      newTenantsThisMonth,
      newUsersThisMonth
    ] = await Promise.all([
      Tenant.countDocuments({ isActive: true }),
      Tenant.countDocuments({ status: 'active', isActive: true }),
      User.countDocuments({}),
      User.countDocuments({ isActive: true }),
      Expense.countDocuments({}),
      Tenant.countDocuments({ 
        createdAt: { $gte: thirtyDaysAgo },
        isActive: true
      }),
      User.countDocuments({ 
        createdAt: { $gte: thirtyDaysAgo },
        isActive: true
      })
    ]);

    // Get revenue analytics (mock for now - replace with actual payment data)
    const revenueByPlan = await Tenant.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'subscriptionplans',
          localField: 'plan',
          foreignField: 'slug',
          as: 'planDetails'
        }
      },
      { $unwind: { path: '$planDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 },
          monthlyRevenue: { 
            $sum: { 
              $cond: [
                { $ne: ['$planDetails', null] },
                '$planDetails.price.monthly',
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get growth trends
    const tenantGrowth = await Tenant.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get tenant status distribution
    const tenantsByStatus = await Tenant.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get top tenants by usage
    const topTenants = await Tenant.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'users'
        }
      },
      {
        $lookup: {
          from: 'expenses',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'expenses'
        }
      },
      {
        $addFields: {
          userCount: { $size: '$users' },
          expenseCount: { $size: '$expenses' },
          totalAmount: { $sum: '$expenses.totalAmount' }
        }
      },
      {
        $project: {
          name: 1,
          slug: 1,
          plan: 1,
          status: 1,
          userCount: 1,
          expenseCount: 1,
          totalAmount: 1,
          createdAt: 1
        }
      },
      { $sort: { expenseCount: -1 } },
      { $limit: 10 }
    ]);

    // Calculate growth rates
    const weeklyGrowthRate = newTenantsThisMonth > 0 
      ? ((newTenantsThisMonth * 7) / 30) / (totalTenants - newTenantsThisMonth) * 100
      : 0;

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalTenants,
          activeTenants,
          totalUsers,
          activeUsers,
          totalExpenses,
          newTenantsThisMonth,
          newUsersThisMonth,
          weeklyGrowthRate: Math.round(weeklyGrowthRate * 100) / 100
        },
        revenue: {
          byPlan: revenueByPlan,
          totalMonthlyRevenue: revenueByPlan.reduce((sum, plan) => sum + plan.monthlyRevenue, 0),
          estimatedYearlyRevenue: revenueByPlan.reduce((sum, plan) => sum + (plan.monthlyRevenue * 12), 0)
        },
        growth: {
          tenantGrowth,
          tenantsByStatus
        },
        topTenants
      }
    });

  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get detailed system analytics
// @route   GET /api/super-admin/analytics/system
// @access  Super Admin only
const getSystemAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // System performance metrics
    const [
      systemActivities,
      planDistribution,
      userEngagement,
      expenseMetrics
    ] = await Promise.all([
      // Activity distribution
      Activity.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Plan distribution with revenue
      Tenant.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'subscriptionplans',
            localField: 'plan',
            foreignField: 'slug',
            as: 'planDetails'
          }
        },
        { $unwind: { path: '$planDetails', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$plan',
            tenantCount: { $sum: 1 },
            monthlyRevenue: { 
              $sum: { 
                $cond: [
                  { $ne: ['$planDetails', null] },
                  '$planDetails.price.monthly',
                  0
                ]
              }
            },
            yearlyRevenue: { 
              $sum: { 
                $cond: [
                  { $ne: ['$planDetails', null] },
                  '$planDetails.price.yearly',
                  0
                ]
              }
            }
          }
        },
        { $sort: { tenantCount: -1 } }
      ]),

      // User engagement metrics
      User.aggregate([
        {
          $match: {
            lastLogin: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$lastLogin' }
            },
            activeUsers: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Expense metrics by tenant
      Expense.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            expenseCount: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            avgAmount: { $avg: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Feature usage analytics
    const featureUsage = await Tenant.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$settings.features' },
      {
        $group: {
          _id: '$settings.features',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        dateRange: { start: startDate, end: now },
        systemActivities,
        planDistribution,
        userEngagement,
        expenseMetrics,
        featureUsage
      }
    });

  } catch (error) {
    console.error('Get system analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get tenant analytics
// @route   GET /api/super-admin/analytics/tenants
// @access  Super Admin only
const getTenantAnalytics = async (req, res) => {
  try {
    const { 
      period = '30d',
      metric = 'users',
      limit = 20
    } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    let sortField;
    let pipeline = [
      { $match: { isActive: true } }
    ];

    // Add tenant data with user and expense counts
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'users'
        }
      },
      {
        $lookup: {
          from: 'expenses',
          localField: '_id',
          foreignField: 'tenantId',
          as: 'expenses'
        }
      },
      {
        $addFields: {
          userCount: { $size: '$users' },
          activeUserCount: {
            $size: {
              $filter: {
                input: '$users',
                as: 'user',
                cond: { $eq: ['$user.isActive', true] }
              }
            }
          },
          expenseCount: { $size: '$expenses' },
          totalExpenseAmount: { $sum: '$expenses.totalAmount' },
          avgExpenseAmount: { $avg: '$expenses.totalAmount' },
          recentExpenseCount: {
            $size: {
              $filter: {
                input: '$expenses',
                as: 'expense',
                cond: { $gte: ['$expense.createdAt', startDate] }
              }
            }
          }
        }
      }
    );

    // Determine sort field based on metric
    switch (metric) {
      case 'users':
        sortField = { activeUserCount: -1 };
        break;
      case 'expenses':
        sortField = { expenseCount: -1 };
        break;
      case 'revenue':
        sortField = { totalExpenseAmount: -1 };
        break;
      case 'activity':
        sortField = { recentExpenseCount: -1 };
        break;
      default:
        sortField = { userCount: -1 };
    }

    pipeline.push(
      {
        $project: {
          name: 1,
          slug: 1,
          plan: 1,
          status: 1,
          createdAt: 1,
          userCount: 1,
          activeUserCount: 1,
          expenseCount: 1,
          totalExpenseAmount: 1,
          avgExpenseAmount: 1,
          recentExpenseCount: 1,
          customDomain: 1,
          domainVerified: 1,
          'usage.storageUsed': 1,
          'settings.storageLimit': 1
        }
      },
      { $sort: sortField },
      { $limit: parseInt(limit) }
    );

    const tenantAnalytics = await Tenant.aggregate(pipeline);

    res.status(200).json({
      success: true,
      data: {
        period,
        metric,
        tenants: tenantAnalytics
      }
    });

  } catch (error) {
    console.error('Get tenant analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get revenue analytics
// @route   GET /api/super-admin/analytics/revenue
// @access  Super Admin only
const getRevenueAnalytics = async (req, res) => {
  try {
    const { period = '12m' } = req.query;

    // Get subscription plans for revenue calculation
    const subscriptionPlans = await SubscriptionPlan.find({ isActive: true });
    const planMap = subscriptionPlans.reduce((map, plan) => {
      map[plan.slug] = plan;
      return map;
    }, {});

    // Get current revenue by plan
    const currentRevenue = await Tenant.aggregate([
      { $match: { isActive: true, status: { $in: ['active', 'trial'] } } },
      {
        $group: {
          _id: '$plan',
          tenantCount: { $sum: 1 },
          // We'll calculate revenue based on plan prices
        }
      }
    ]);

    // Calculate actual revenue
    const revenueByPlan = currentRevenue.map(item => {
      const plan = planMap[item._id];
      const monthlyRevenue = plan ? (plan.price.monthly * item.tenantCount) : 0;
      const yearlyRevenue = plan ? (plan.price.yearly * item.tenantCount) : 0;
      
      return {
        plan: item._id,
        tenantCount: item.tenantCount,
        monthlyRevenue,
        yearlyRevenue,
        planDetails: plan
      };
    });

    // Calculate totals
    const totalMonthlyRevenue = revenueByPlan.reduce((sum, item) => sum + item.monthlyRevenue, 0);
    const totalYearlyRevenue = revenueByPlan.reduce((sum, item) => sum + item.yearlyRevenue, 0);

    // Get historical growth (mock data for now - replace with actual subscription history)
    const now = new Date();
    const monthsBack = period === '12m' ? 12 : 6;
    const revenueHistory = [];
    
    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      
      // This is mock data - in reality, you'd query subscription history
      const mockRevenue = totalMonthlyRevenue * (0.7 + (Math.random() * 0.6));
      revenueHistory.push({
        month: monthStr,
        revenue: Math.round(mockRevenue),
        tenants: Math.floor(mockRevenue / 50) // Average revenue per tenant
      });
    }

    // Revenue projections
    const avgGrowthRate = 0.15; // 15% monthly growth assumption
    const projectedRevenue = [];
    let currentProjection = totalMonthlyRevenue;
    
    for (let i = 1; i <= 6; i++) {
      currentProjection *= (1 + avgGrowthRate);
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      projectedRevenue.push({
        month: futureDate.toISOString().slice(0, 7),
        projectedRevenue: Math.round(currentProjection)
      });
    }

    res.status(200).json({
      success: true,
      data: {
        current: {
          totalMonthlyRevenue,
          totalYearlyRevenue,
          revenueByPlan
        },
        history: revenueHistory,
        projections: projectedRevenue,
        metrics: {
          avgRevenuePerTenant: Math.round(totalMonthlyRevenue / (currentRevenue.reduce((sum, item) => sum + item.tenantCount, 0) || 1)),
          totalActiveTenants: currentRevenue.reduce((sum, item) => sum + item.tenantCount, 0)
        }
      }
    });

  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get user engagement analytics
// @route   GET /api/super-admin/analytics/engagement
// @access  Super Admin only
const getEngagementAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      dailyActiveUsers,
      userRetention,
      tenantEngagement,
      featureUsageStats
    ] = await Promise.all([
      // Daily active users
      User.aggregate([
        {
          $match: {
            lastLogin: { $gte: startDate },
            isActive: true
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$lastLogin' }
            },
            users: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // User retention by tenant
      User.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'tenants',
            localField: 'tenantId',
            foreignField: '_id',
            as: 'tenant'
          }
        },
        { $unwind: '$tenant' },
        {
          $group: {
            _id: '$tenantId',
            tenantName: { $first: '$tenant.name' },
            tenantSlug: { $first: '$tenant.slug' },
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: {
                $cond: [
                  { $gte: ['$lastLogin', startDate] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $addFields: {
            engagementRate: {
              $round: [
                {
                  $multiply: [
                    { $divide: ['$activeUsers', '$totalUsers'] },
                    100
                  ]
                },
                2
              ]
            }
          }
        },
        { $sort: { engagementRate: -1 } },
        { $limit: 20 }
      ]),

      // Tenant engagement metrics
      Activity.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $lookup: {
            from: 'tenants',
            localField: 'tenantId',
            foreignField: '_id',
            as: 'tenant'
          }
        },
        { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$tenantId',
            tenantName: { $first: '$tenant.name' },
            activityCount: { $sum: 1 },
            uniqueUsers: { $addToSet: '$performedBy' }
          }
        },
        {
          $addFields: {
            uniqueUserCount: { $size: '$uniqueUsers' }
          }
        },
        {
          $project: {
            tenantName: 1,
            activityCount: 1,
            uniqueUserCount: 1
          }
        },
        { $sort: { activityCount: -1 } },
        { $limit: 20 }
      ]),

      // Feature usage statistics
      Activity.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        dateRange: { start: startDate, end: now },
        dailyActiveUsers,
        userRetention,
        tenantEngagement,
        featureUsageStats,
        summary: {
          totalDailyActiveUsers: dailyActiveUsers.reduce((sum, day) => sum + day.users, 0),
          avgEngagementRate: Math.round(
            (userRetention.reduce((sum, tenant) => sum + tenant.engagementRate, 0) / userRetention.length || 0) * 100
          ) / 100,
          mostActiveFeature: featureUsageStats[0]?.type || 'none',
          totalActivities: featureUsageStats.reduce((sum, feature) => sum + feature.count, 0)
        }
      }
    });

  } catch (error) {
    console.error('Get engagement analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Export analytics data
// @route   GET /api/super-admin/analytics/export
// @access  Super Admin only
const exportAnalytics = async (req, res) => {
  try {
    const { type = 'tenants', format = 'csv' } = req.query;

    let data = [];
    let filename = '';

    switch (type) {
      case 'tenants':
        data = await Tenant.aggregate([
          { $match: { isActive: true } },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: 'tenantId',
              as: 'users'
            }
          },
          {
            $lookup: {
              from: 'expenses',
              localField: '_id',
              foreignField: 'tenantId',
              as: 'expenses'
            }
          },
          {
            $project: {
              name: 1,
              slug: 1,
              plan: 1,
              status: 1,
              createdAt: 1,
              userCount: { $size: '$users' },
              expenseCount: { $size: '$expenses' },
              totalExpenseAmount: { $sum: '$expenses.totalAmount' }
            }
          }
        ]);
        filename = `tenants_export_${new Date().toISOString().split('T')[0]}.${format}`;
        break;

      case 'revenue':
        const plans = await SubscriptionPlan.find({ isActive: true });
        data = await Tenant.aggregate([
          { $match: { isActive: true } },
          {
            $group: {
              _id: '$plan',
              tenantCount: { $sum: 1 }
            }
          }
        ]);
        filename = `revenue_export_${new Date().toISOString().split('T')[0]}.${format}`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid export type'
        });
    }

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = Object.keys(data[0] || {}).join(',');
      const csvRows = data.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' ? `"${value}"` : value
        ).join(',')
      );
      const csvContent = [csvHeaders, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json({
        success: true,
        exportDate: new Date().toISOString(),
        type,
        count: data.length,
        data
      });
    }

  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getDashboardAnalytics,
  getSystemAnalytics,
  getTenantAnalytics,
  getRevenueAnalytics,
  getEngagementAnalytics,
  exportAnalytics
};