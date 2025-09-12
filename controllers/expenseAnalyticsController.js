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

    // Build match query
    const matchQuery = {
      date: { $gte: start, $lte: end }
    };

    if (category) matchQuery.category = new mongoose.Types.ObjectId(category);
    if (user) matchQuery['payments.user'] = { $regex: user, $options: 'i' };

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

    // Get comparison with previous period
    const prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const prevEnd = start;

    const previousPeriodStats = await Expense.aggregate([
      { 
        $match: { 
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

    // Calculate percentage changes
    const currentTotal = totalStats[0]?.totalAmount || 0;
    const currentCount = totalStats[0]?.totalCount || 0;
    const prevTotal = previousPeriodStats[0]?.totalAmount || 0;
    const prevCount = previousPeriodStats[0]?.totalCount || 0;

    const amountChange = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal * 100) : 0;
    const countChange = prevCount > 0 ? ((currentCount - prevCount) / prevCount * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
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
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get recent activity with real activities from ActivityService
// @route   GET /api/expenses/recent-activity
// @access  Private
const getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Use ActivityService instead of creating fake data
    const activities = await ActivityService.getRecentActivities(limit);

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// Helper function to get relative time
const getRelativeTime = (date) => {
  const now = new Date();
  const diffInMs = now - new Date(date);
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return new Date(date).toLocaleDateString();
};

// @desc    Get dashboard stats for home page
// @route   GET /api/expenses/dashboard-stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const thisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    // Get various time period stats
    const [weeklyStats, monthlyStats, yearlyStats] = await Promise.all([
      Expense.aggregate([
        { $match: { date: { $gte: thisWeek } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: thisYear } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ])
    ]);

    // Get pending expenses
    const pendingExpenses = await Expense.countDocuments({ status: 'pending' });

    // Get top category this month
    const topCategory = await Expense.aggregate([
      { $match: { date: { $gte: thisMonth } } },
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

    res.status(200).json({
      success: true,
      data: {
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
        pending: pendingExpenses,
        topCategory: topCategory[0] || null
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
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