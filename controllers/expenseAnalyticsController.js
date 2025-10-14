const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const ActivityService = require('../services/activityService');

// @desc    Get expense analytics by time period
// @route   GET /api/expenses/analytics
// @access  Private
const getExpenseAnalytics = async (req, res) => {
  try {
    const { period = 'week', category, user, startDate, endDate } = req.query;
    const tenantId = req.user.tenantId;
    
    // ✅ Convert tenantId to ObjectId for aggregation (SAME AS getDashboardStats)
    const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId) 
      ? new mongoose.Types.ObjectId(tenantId) 
      : tenantId;
    
    console.log('📊 Getting analytics for tenant:', tenantId);
    console.log('📊 TenantObjectId:', tenantObjectId);
    
    // Calculate date ranges based on period
    const now = new Date();
    let start, end;
    
    switch (period) {
      case 'week':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        end = now;
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        end = now;
        break;
      case '6months':
        start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        end = now;
        break;
      case 'year':
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        end = now;
        break;
      case 'custom':
        start = startDate ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);
        end = endDate ? new Date(endDate) : now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        end = now;
    }

    console.log('📅 Date ranges:', {
      start: start.toISOString(),
      end: end.toISOString()
    });

    // ✅ Build match query WITH TENANT FILTER using ObjectId
    const matchQuery = {
      tenantId: tenantObjectId, // ✅ Use ObjectId instead of string
      date: { $gte: start, $lte: end }
    };

    if (category) matchQuery.category = new mongoose.Types.ObjectId(category);
    if (user) matchQuery['payments.user'] = { $regex: user, $options: 'i' };

    console.log('🔍 Match query:', matchQuery);

    // Get total expenses and amount
    const totalStats = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalCount: { $sum: 1 },
          avgAmount: { $avg: '$totalAmount' }
        }
      }
    ]);

    console.log('📈 Total stats:', totalStats);

    // Get expenses by category
    const expensesByCategory = await Expense.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$categoryInfo._id',
          name: { $first: '$categoryInfo.name' },
          totalAmount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$totalAmount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    console.log('📊 Expenses by category:', expensesByCategory.length);

    // Get daily/weekly trend data
    let groupByFormat;
    switch (period) {
      case 'week':
        groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
        break;
      case 'month':
        groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
        break;
      case '6months':
        groupByFormat = { $dateToString: { format: '%Y-%m', date: '$date' } };
        break;
      case 'year':
        groupByFormat = { $dateToString: { format: '%Y-%m', date: '$date' } };
        break;
      default:
        groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
    }

    const trendData = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: groupByFormat,
          totalAmount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('📈 Trend data:', trendData.length);

    // Get top spenders
    const topSpenders = await Expense.aggregate([
      { $match: matchQuery },
      { $unwind: '$payments' },
      {
        $group: {
          _id: '$payments.user',
          totalSpent: { $sum: '$payments.amount' },
          expenseCount: { $sum: 1 },
          avgExpense: { $avg: '$payments.amount' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    console.log('👥 Top spenders:', topSpenders.length);

    // Get expenses by status
    const expensesByStatus = await Expense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    console.log('📋 Expenses by status:', expensesByStatus);

    // Get comparison with previous period
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const prevEnd = start;

    console.log('📅 Previous period:', {
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString()
    });

    // ✅ Previous period query WITH TENANT FILTER using ObjectId
    const previousPeriodStats = await Expense.aggregate([
      { 
        $match: { 
          tenantId: tenantObjectId, // ✅ Use ObjectId instead of string
          date: { $gte: prevStart, $lt: prevEnd },
          ...(category && { category: new mongoose.Types.ObjectId(category) }),
          ...(user && { 'payments.user': { $regex: user, $options: 'i' } })
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalCount: { $sum: 1 }
        }
      }
    ]);

    console.log('📊 Previous period stats:', previousPeriodStats);

    // Calculate percentage changes
    const currentTotal = totalStats[0]?.totalAmount || 0;
    const currentCount = totalStats[0]?.totalCount || 0;
    const prevTotal = previousPeriodStats[0]?.totalAmount || 0;
    const prevCount = previousPeriodStats[0]?.totalCount || 0;

    const amountChange = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal * 100) : 0;
    const countChange = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;

    const result = {
      period,
      dateRange: { start, end },
      summary: {
        totalAmount: currentTotal,
        totalCount: currentCount,
        avgAmount: totalStats[0]?.avgAmount || 0,
        amountChange: Number(amountChange.toFixed(2)),
        countChange: Number(countChange.toFixed(2))
      },
      expensesByCategory,
      trendData,
      topSpenders,
      expensesByStatus,
      previousPeriod: {
        totalAmount: prevTotal,
        totalCount: prevCount,
        dateRange: { start: prevStart, end: prevEnd }
      }
    };

    console.log('✅ Final analytics result:', {
      totalAmount: result.summary.totalAmount,
      totalCount: result.summary.totalCount,
      categoriesCount: result.expensesByCategory.length,
      trendDataCount: result.trendData.length
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get recent activity with real activities from ActivityService
// @route   GET /api/expenses/recent-activity
// @access  Private
const getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const tenantId = req.user.tenantId;
    
    console.log('🔔 Getting recent activity for tenant:', tenantId);
    
    // ✅ Pass tenantId to ActivityService
    const activities = await ActivityService.getRecentActivities(limit, null, tenantId);

    console.log('✅ Activities found:', activities.length);

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('❌ Recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get dashboard stats for home page
// @route   GET /api/expenses/dashboard-stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    // ✅ Convert tenantId to ObjectId for aggregation
    const tenantId = req.user.tenantId;
    const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId) 
      ? new mongoose.Types.ObjectId(tenantId) 
      : tenantId;
    
    console.log('📊 Getting dashboard stats for tenant:', tenantId);
    console.log('📊 TenantId type:', typeof tenantId);
    console.log('📊 TenantObjectId:', tenantObjectId);
    
    const now = new Date();
    const thisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    console.log('📅 Date ranges:', {
      thisWeek: thisWeek.toISOString(),
      thisMonth: thisMonth.toISOString(),
      thisYear: thisYear.toISOString()
    });

    // ✅ First, let's check what expenses exist
    const allExpenses = await Expense.find({ tenantId }).limit(2);
    console.log('📦 Sample expenses found:', allExpenses.length);
    if (allExpenses.length > 0) {
      console.log('📦 First expense tenantId:', allExpenses[0].tenantId);
      console.log('📦 First expense tenantId type:', typeof allExpenses[0].tenantId);
      console.log('📦 First expense totalAmount:', allExpenses[0].totalAmount);
    }

    // ✅ Use tenantObjectId for aggregation
    const [weeklyStats, monthlyStats, yearlyStats, allTimeStats] = await Promise.all([
      Expense.aggregate([
        { 
          $match: { 
            tenantId: tenantObjectId,
            createdAt: { $gte: thisWeek }
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { 
          $match: { 
            tenantId: tenantObjectId,
            createdAt: { $gte: thisMonth }
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { 
          $match: { 
            tenantId: tenantObjectId,
            createdAt: { $gte: thisYear }
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { tenantId: tenantObjectId } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ])
    ]);

    console.log('📊 Query results:', {
      weekly: weeklyStats,
      monthly: monthlyStats,
      yearly: yearlyStats,
      allTime: allTimeStats
    });

    const pendingExpenses = await Expense.countDocuments({ 
      tenantId,
      status: 'pending' 
    });

    const topCategory = await Expense.aggregate([
      { 
        $match: { 
          tenantId: tenantObjectId,
          createdAt: { $gte: thisMonth }
        } 
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$categoryInfo.name',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 1 }
    ]);

    const result = {
      weekly: {
        total: weeklyStats[0]?.total || 0,
        count: weeklyStats[0]?.count || 0
      },
      monthly: {
        total: monthlyStats[0]?.total || 0,
        count: monthlyStats[0]?.count || 0
      },
      yearly: {
        total: yearlyStats[0]?.total || 0,
        count: yearlyStats[0]?.count || 0
      },
      allTime: {
        total: allTimeStats[0]?.total || 0,
        count: allTimeStats[0]?.count || 0
      },
      pending: pendingExpenses,
      topCategory: topCategory[0] || null
    };

    console.log('✅ Final result:', result);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  getExpenseAnalytics,
  getRecentActivity,
  getDashboardStats
};