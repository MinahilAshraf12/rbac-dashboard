const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const ActivityService = require('../services/activityService');
const { deleteFiles, deleteFile } = require('../utils/fileUtils');


// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const status = req.query.status || '';
    const user = req.query.user || '';
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) query.category = category;
    if (status) query.status = status;
    if (user) query['payments.user'] = { $regex: user, $options: 'i' };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(query)
      .populate('category', 'name slug')
      .populate('createdBy', 'name email')
      .populate('payments.category', 'name')
      .sort({ date: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(query);

    res.status(200).json({
      success: true,
      count: expenses.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get expense statistics
// @route   GET /api/expenses/statistics
// @access  Private
const getExpenseStatistics = async (req, res) => {
  try {
    const totalExpenses = await Expense.countDocuments();
    const totalAmountResult = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const expensesByCategory = await Expense.aggregate([
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
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const expensesByStatus = await Expense.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const monthlyExpenses = await Expense.countDocuments({
      date: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const topUsers = await Expense.aggregate([
      { $unwind: '$payments' },
      {
        $group: {
          _id: '$payments.user',
          totalSpent: { $sum: '$payments.amount' },
          expenseCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalExpenses,
        totalAmount: totalAmountResult.length > 0 ? totalAmountResult[0].total : 0,
        monthlyExpenses,
        expensesByCategory,
        expensesByStatus,
        topUsers
      }
    });
  } catch (error) {
    console.error('Get expense statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get expense users list
// @route   GET /api/expenses/users
// @access  Private
const getExpenseUsers = async (req, res) => {
  try {
    const users = await Expense.aggregate([
      { $unwind: '$payments' },
      { $group: { _id: '$payments.user' } },
      { $sort: { _id: 1 } }
    ]);

    const userNames = users.map(user => user._id);

    res.status(200).json({
      success: true,
      data: userNames
    });
  } catch (error) {
    console.error('Get expense users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get expense summary
// @route   GET /api/expenses/summary
// @access  Private
const getExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    let groupByFormat;
    switch (groupBy) {
      case 'day':
        groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$date' } };
        break;
      case 'week':
        groupByFormat = { $dateToString: { format: '%Y-W%V', date: '$date' } };
        break;
      case 'year':
        groupByFormat = { $dateToString: { format: '%Y', date: '$date' } };
        break;
      default:
        groupByFormat = { $dateToString: { format: '%Y-%m', date: '$date' } };
    }

    const summary = await Expense.aggregate([
      { $match: matchStage },
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

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get expense summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
const getExpense = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID format'
      });
    }

    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name slug description')
      .populate('createdBy', 'name email')
      .populate('payments.category', 'name slug');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.status(200).json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      category, 
      totalAmount, 
      date, 
      status, 
      payments 
    } = req.body;

    // ADD THIS: Get tenantId from request (set by tenant middleware)
    const tenantId = req.tenant?._id;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    // Validate category exists
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category selected'
      });
    }

    const expense = await Expense.create({
      title,
      description,
      category,
      totalAmount,
      date: date || new Date(),
      status: status || 'pending',
      payments: payments || [],
      tenantId,  // ADD THIS
      createdBy: req.user.id
    });

    const populatedExpense = await Expense.findById(expense._id)
      .populate('category', 'name')
      .populate('createdBy', 'name email');

    // Log activity
    await ActivityService.logActivity({
      type: 'expense_created',
      entityId: expense._id,
      entityType: 'Expense',
      entityName: expense.title,
      performedBy: req.user.id,
      newData: {
        title,
        category: categoryDoc.name,
        totalAmount,
        status,
        date
      }
    });

    res.status(201).json({
      success: true,
      data: populatedExpense
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      category, 
      totalAmount, 
      date, 
      status, 
      payments 
    } = req.body;

    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Store old data for activity log
    const oldData = {
      title: expense.title,
      description: expense.description,
      category: expense.category?.name,
      totalAmount: expense.totalAmount,
      date: expense.date,
      status: expense.status
    };

    // Validate new category if provided
    let newCategoryDoc;
    if (category && category !== expense.category._id.toString()) {
      newCategoryDoc = await Category.findById(category);
      if (!newCategoryDoc) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category selected'
        });
      }
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(totalAmount !== undefined && { totalAmount }),
        ...(date && { date }),
        ...(status && { status }),
        ...(payments && { payments })
      },
      { new: true, runValidators: true }
    ).populate('category', 'name').populate('createdBy', 'name email');

    // Log activity with changes
    const newData = {
      title: updatedExpense.title,
      description: updatedExpense.description,
      category: updatedExpense.category?.name,
      totalAmount: updatedExpense.totalAmount,
      date: updatedExpense.date,
      status: updatedExpense.status
    };

    const changes = [];
    if (oldData.title !== newData.title) changes.push(`Title: ${oldData.title} → ${newData.title}`);
    if (oldData.category !== newData.category) changes.push(`Category: ${oldData.category} → ${newData.category}`);
    if (oldData.totalAmount !== newData.totalAmount) changes.push(`Amount: $${oldData.totalAmount} → $${newData.totalAmount}`);
    if (oldData.status !== newData.status) changes.push(`Status: ${oldData.status} → ${newData.status}`);

    await ActivityService.logActivity({
      type: 'expense_updated',
      entityId: expense._id,
      entityType: 'Expense',
      entityName: updatedExpense.title,
      performedBy: req.user.id,
      oldData,
      newData,
      changes
    });

    res.status(200).json({
      success: true,
      data: updatedExpense
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Store expense data for activity log before deletion
    const expenseData = {
      title: expense.title,
      category: expense.category?.name,
      totalAmount: expense.totalAmount,
      status: expense.status,
      date: expense.date
    };

    await Expense.findByIdAndDelete(req.params.id);

    // Log activity
    await ActivityService.logActivity({
      type: 'expense_deleted',
      entityId: expense._id,
      entityType: 'Expense',
      entityName: expense.title,
      performedBy: req.user.id,
      oldData: expenseData
    });

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Download file
// @route   GET /api/expenses/:id/files/:paymentIndex
// @access  Private
const downloadFile = async (req, res) => {
  try {
    const { id, paymentIndex } = req.params;
    const { download } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID format'
      });
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const paymentIdx = parseInt(paymentIndex);
    if (isNaN(paymentIdx) || paymentIdx < 0 || paymentIdx >= expense.payments.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment index'
      });
    }

    const payment = expense.payments[paymentIdx];
    if (!payment.file || !payment.file.path) {
      return res.status(404).json({
        success: false,
        message: 'File not found for this payment'
      });
    }

    // Check if file exists on disk
    try {
      await fs.access(payment.file.path);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Set headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', payment.file.mimetype || 'application/octet-stream');

    const filename = payment.file.originalName || payment.file.filename;
    
    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // For downloads, allow some caching
      res.setHeader('Cache-Control', 'private, max-age=3600');
    } else {
      // For inline viewing, prevent caching to always show latest file
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      if (payment.file.mimetype?.startsWith('image/') || payment.file.mimetype === 'application/pdf') {
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
    }

    // Add ETag based on file modification time and size for better cache control
    const stats = await fs.stat(payment.file.path);
    const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.sendFile(path.resolve(payment.file.path));
    
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get file info
// @route   GET /api/expenses/:id/files/:paymentIndex/info
// @access  Private
const getFileInfo = async (req, res) => {
  try {
    const { id, paymentIndex } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID format'
      });
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const paymentIdx = parseInt(paymentIndex);
    if (isNaN(paymentIdx) || paymentIdx < 0 || paymentIdx >= expense.payments.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment index'
      });
    }

    const payment = expense.payments[paymentIdx];
    if (!payment.file) {
      return res.status(404).json({
        success: false,
        message: 'No file found for this payment'
      });
    }

    const exists = await fs.access(payment.file.path).then(() => true).catch(() => false);

    res.json({
      success: true,
      file: {
        filename: payment.file.filename,
        originalName: payment.file.originalName,
        size: payment.file.size,
        mimetype: payment.file.mimetype,
        uploadedBy: payment.user,
        exists
      }
    });
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Repair total amount (debug route)
// @route   GET /api/expenses/:id/repair-total
// @access  Private
const repairTotal = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const manualTotal = expense.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    expense.totalAmount = Number(manualTotal.toFixed(2));
    await expense.save();

    res.json({
      success: true,
      repaired: true,
      expenseId: expense._id,
      totalAmount: expense.totalAmount,
      paymentsCount: expense.payments.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStatistics,
  getExpenseUsers,
  getExpenseSummary,
  downloadFile,
  getFileInfo,
  repairTotal
};