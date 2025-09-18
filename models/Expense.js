const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // MULTI-TENANT FIELD (ADD THIS FIRST)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Expense must belong to a tenant']
  },
  
  // EXISTING FIELDS
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  date: {
    type: Date,
    required: [true, 'Please add expense date'],
    default: Date.now
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Please select a category']
  },
  totalAmount: {
    type: Number,
    min: [0, 'Amount cannot be negative'],
    default: 0
  },
  payments: [{
    user: {
      type: String,
      required: [true, 'Please add user name'],
      trim: true
    },
    amount: {
      type: Number,
      required: [true, 'Please add payment amount'],
      min: [0, 'Amount cannot be negative']
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    subCategory: {
      type: String,
      trim: true,
      default: ''
    },
    file: {
      filename: String,
      originalName: String,
      path: String,
      size: Number,
      mimetype: String
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // ADDITIONAL MULTI-TENANT FIELDS
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  metadata: {
    source: {
      type: String,
      enum: ['manual', 'import', 'api', 'mobile'],
      default: 'manual'
    },
    location: {
      address: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    exchangeRate: {
      type: Number,
      default: 1
    }
  }
}, {
  timestamps: true
});

// Compound indexes for tenant isolation and performance
expenseSchema.index({ tenantId: 1, date: -1 });
expenseSchema.index({ tenantId: 1, category: 1 });
expenseSchema.index({ tenantId: 1, status: 1 });
expenseSchema.index({ tenantId: 1, createdBy: 1 });
expenseSchema.index({ tenantId: 1, createdAt: -1 });

// Text index for search functionality
expenseSchema.index({ 
  tenantId: 1,
  title: 'text', 
  description: 'text',
  'payments.user': 'text'
});

// Pre-save middleware to calculate total amount
expenseSchema.pre('save', function (next) {
  if (Array.isArray(this.payments)) {
    const total = this.payments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    this.totalAmount = Number(total.toFixed(2));
  } else {
    this.totalAmount = 0;
  }
  next();
});

// Post-save middleware to update tenant expense count
expenseSchema.post('save', async function(doc, next) {
  if (doc.isNew) {
    try {
      const Tenant = mongoose.model('Tenant');
      await Tenant.updateUsage(doc.tenantId, 'expense', 1);
    } catch (error) {
      console.error('Error updating tenant expense count:', error);
    }
  }
  next();
});

// Post-remove middleware to decrease tenant expense count
expenseSchema.post('remove', async function(doc, next) {
  try {
    const Tenant = mongoose.model('Tenant');
    await Tenant.updateUsage(doc.tenantId, 'expense', -1);
  } catch (error) {
    console.error('Error updating tenant expense count:', error);
  }
  next();
});

// Static method to find expenses by tenant
expenseSchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenantId };
  
  // Add filters from options
  if (options.category) query.category = options.category;
  if (options.status) query.status = options.status;
  if (options.createdBy) query.createdBy = options.createdBy;
  if (options.dateRange) {
    query.date = {};
    if (options.dateRange.start) query.date.$gte = new Date(options.dateRange.start);
    if (options.dateRange.end) query.date.$lte = new Date(options.dateRange.end);
  }
  
  return this.find(query)
    .populate('category', 'name slug')
    .populate('createdBy', 'name email')
    .populate('payments.category', 'name')
    .sort(options.sort || { date: -1, createdAt: -1 });
};

// Static method to get expense statistics by tenant
expenseSchema.statics.getStatsByTenant = async function(tenantId, dateRange = {}) {
  const matchStage = { tenantId: new mongoose.Types.ObjectId(tenantId) };
  
  if (dateRange.start || dateRange.end) {
    matchStage.date = {};
    if (dateRange.start) matchStage.date.$gte = new Date(dateRange.start);
    if (dateRange.end) matchStage.date.$lte = new Date(dateRange.end);
  }
  
  const [totalStats, categoryStats, statusStats, monthlyStats] = await Promise.all([
    // Total statistics
    this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          avgAmount: { $avg: '$totalAmount' }
        }
      }
    ]),
    
    // Category-wise statistics
    this.aggregate([
      { $match: matchStage },
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
          totalAmount: { $sum: '$totalAmount' },
          avgAmount: { $avg: '$totalAmount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]),
    
    // Status-wise statistics
    this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]),
    
    // Monthly trend
    this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ])
  ]);
  
  return {
    total: totalStats[0] || { totalExpenses: 0, totalAmount: 0, avgAmount: 0 },
    byCategory: categoryStats,
    byStatus: statusStats,
    monthly: monthlyStats
  };
};

// Static method to search expenses by tenant
expenseSchema.statics.searchByTenant = function(tenantId, searchTerm, options = {}) {
  const query = {
    tenantId,
    $text: { $search: searchTerm }
  };
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .populate('category', 'name slug')
    .populate('createdBy', 'name email')
    .sort({ score: { $meta: 'textScore' } })
    .limit(options.limit || 20);
};

// Instance method to check if expense can be edited by user
expenseSchema.methods.canEditBy = function(userId, userTenantRole) {
  // Tenant admins can edit any expense
  if (userTenantRole === 'tenant_admin') {
    return true;
  }
  
  // Creators can edit their own expenses if not completed
  if (this.createdBy.toString() === userId.toString() && this.status !== 'completed') {
    return true;
  }
  
  return false;
};

// Instance method to add approval
expenseSchema.methods.approve = function(userId) {
  this.status = 'completed';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  // Clear any rejection data
  this.rejectedBy = undefined;
  this.rejectedAt = undefined;
  this.rejectionReason = undefined;
  return this.save();
};

// Instance method to reject expense
expenseSchema.methods.reject = function(userId, reason) {
  this.status = 'cancelled';
  this.rejectedBy = userId;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  // Clear any approval data
  this.approvedBy = undefined;
  this.approvedAt = undefined;
  return this.save();
};

module.exports = mongoose.model('Expense', expenseSchema);