const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // MULTI-TENANT FIELD (ADD THIS FIRST)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Category must belong to a tenant']
  },
  
  // EXISTING FIELDS
  name: {
    type: String,
    required: [true, 'Please add a category name'],
    trim: true
  },
  slug: {
    type: String,
    lowercase: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // ADDITIONAL MULTI-TENANT FIELDS
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
  },
  icon: {
    type: String,
    default: 'Folder'
  },
  budget: {
    monthly: {
      type: Number,
      min: 0,
      default: null
    },
    yearly: {
      type: Number,
      min: 0,
      default: null
    }
  },
  isSystemCategory: {
    type: Boolean,
    default: false // System categories are created during tenant setup
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  metadata: {
    expenseCount: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  }
}, {
  timestamps: true
});

// Compound indexes for tenant isolation and performance
categorySchema.index({ tenantId: 1, slug: 1 }, { unique: true, sparse: true });
categorySchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });
categorySchema.index({ tenantId: 1, parentCategory: 1 });
categorySchema.index({ tenantId: 1, createdBy: 1 });

// Generate slug from name before saving (within tenant scope)
categorySchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isNew) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ +/g, '-');
    
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existingCategory = await this.constructor.findOne({ 
        tenantId: this.tenantId,
        slug: slug, 
        _id: { $ne: this._id } 
      });
      
      if (!existingCategory) {
        break;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Pre-save validation for parent category
categorySchema.pre('save', async function(next) {
  if (this.parentCategory) {
    const parent = await this.constructor.findOne({
      _id: this.parentCategory,
      tenantId: this.tenantId
    });
    
    if (!parent) {
      return next(new Error('Parent category must belong to the same tenant'));
    }
    
    // Prevent circular references
    if (parent.parentCategory && parent.parentCategory.toString() === this._id.toString()) {
      return next(new Error('Cannot create circular category references'));
    }
  }
  next();
});

// Static method to find categories by tenant
categorySchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenantId };
  
  if (options.isActive !== undefined) {
    query.isActive = options.isActive;
  }
  
  if (options.parentCategory !== undefined) {
    query.parentCategory = options.parentCategory;
  }
  
  return this.find(query)
    .populate('createdBy', 'name email')
    .populate('parentCategory', 'name')
    .sort(options.sort || { sortOrder: 1, createdAt: -1 });
};

// Static method to get category tree by tenant
categorySchema.statics.getCategoryTree = async function(tenantId) {
  const categories = await this.find({ 
    tenantId, 
    isActive: true 
  }).sort({ sortOrder: 1, name: 1 });
  
  // Build tree structure
  const categoryMap = new Map();
  const rootCategories = [];
  
  // First pass: create map of all categories
  categories.forEach(category => {
    categoryMap.set(category._id.toString(), {
      ...category.toObject(),
      children: []
    });
  });
  
  // Second pass: build tree
  categories.forEach(category => {
    const categoryObj = categoryMap.get(category._id.toString());
    
    if (category.parentCategory) {
      const parent = categoryMap.get(category.parentCategory.toString());
      if (parent) {
        parent.children.push(categoryObj);
      }
    } else {
      rootCategories.push(categoryObj);
    }
  });
  
  return rootCategories;
};

// Static method to create default categories for new tenant
categorySchema.statics.createDefaultCategories = async function(tenantId, createdBy) {
  const defaultCategories = [
    {
      name: 'Food & Dining',
      slug: 'food-dining', // ADD THIS
      description: 'Restaurant meals, groceries, and dining expenses',
      color: '#EF4444',
      icon: 'UtensilsCrossed',
      sortOrder: 1
    },
    {
      name: 'Transportation',
      slug: 'transportation', // ADD THIS
      description: 'Travel, fuel, parking, and transport expenses',
      color: '#F97316',
      icon: 'Car',
      sortOrder: 2
    },
    {
      name: 'Office Supplies',
      slug: 'office-supplies', // ADD THIS
      description: 'Stationery, equipment, and office-related expenses',
      color: '#EAB308',
      icon: 'Building2',
      sortOrder: 3
    },
    {
      name: 'Technology',
      slug: 'technology', // ADD THIS
      description: 'Software, hardware, and IT-related expenses',
      color: '#22C55E',
      icon: 'Laptop',
      sortOrder: 4
    },
    {
      name: 'Utilities',
      slug: 'utilities', // ADD THIS
      description: 'Electricity, internet, phone, and utility bills',
      color: '#3B82F6',
      icon: 'Zap',
      sortOrder: 5
    },
    {
      name: 'Healthcare',
      slug: 'healthcare', // ADD THIS
      description: 'Medical, dental, and health-related expenses',
      color: '#8B5CF6',
      icon: 'Heart',
      sortOrder: 6
    },
    {
      name: 'Entertainment',
      slug: 'entertainment', // ADD THIS
      description: 'Team events, recreation, and entertainment expenses',
      color: '#EC4899',
      icon: 'Music',
      sortOrder: 7
    },
    {
      name: 'Education & Training',
      slug: 'education-training', // ADD THIS
      description: 'Courses, workshops, and educational expenses',
      color: '#14B8A6',
      icon: 'GraduationCap',
      sortOrder: 8
    }
  ];
  
  const categories = defaultCategories.map(cat => ({
    ...cat,
    tenantId,
    createdBy,
    isSystemCategory: true
  }));
  
  return await this.insertMany(categories);
};

// Static method to get category statistics
categorySchema.statics.getStatsByTenant = async function(tenantId, dateRange = {}) {
  const Expense = mongoose.model('Expense');
  
  const matchStage = { 
    tenantId: new mongoose.Types.ObjectId(tenantId),
    category: { $exists: true }
  };
  
  if (dateRange.start || dateRange.end) {
    matchStage.date = {};
    if (dateRange.start) matchStage.date.$gte = new Date(dateRange.start);
    if (dateRange.end) matchStage.date.$lte = new Date(dateRange.end);
  }
  
  const stats = await Expense.aggregate([
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
        _id: '$category',
        name: { $first: '$categoryInfo.name' },
        color: { $first: '$categoryInfo.color' },
        icon: { $first: '$categoryInfo.icon' },
        expenseCount: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        avgAmount: { $avg: '$totalAmount' }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
  
  return stats;
};

// Instance method to update usage statistics
categorySchema.methods.updateUsage = async function(expenseAmount) {
  this.metadata.expenseCount += 1;
  this.metadata.totalAmount += expenseAmount;
  this.metadata.lastUsed = new Date();
  return this.save();
};

// Instance method to check budget status
categorySchema.methods.getBudgetStatus = function(currentSpending, period = 'monthly') {
  const budgetLimit = this.budget[period];
  
  if (!budgetLimit) {
    return { status: 'no_budget', percentage: 0 };
  }
  
  const percentage = (currentSpending / budgetLimit) * 100;
  
  let status = 'under_budget';
  if (percentage >= 100) status = 'over_budget';
  else if (percentage >= 80) status = 'near_budget';
  else if (percentage >= 50) status = 'moderate';
  
  return {
    status,
    percentage: Math.round(percentage),
    spent: currentSpending,
    budget: budgetLimit,
    remaining: Math.max(0, budgetLimit - currentSpending)
  };
};

// Instance method to check if category has child categories
categorySchema.methods.hasChildren = async function() {
  const childCount = await this.constructor.countDocuments({
    tenantId: this.tenantId,
    parentCategory: this._id
  });
  return childCount > 0;
};

// Instance method to get all descendant categories
categorySchema.methods.getDescendants = async function() {
  const descendants = [];
  const queue = [this._id];
  
  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = await this.constructor.find({
      tenantId: this.tenantId,
      parentCategory: currentId
    });
    
    for (const child of children) {
      descendants.push(child);
      queue.push(child._id);
    }
  }
  
  return descendants;
};

module.exports = mongoose.model('Category', categorySchema);