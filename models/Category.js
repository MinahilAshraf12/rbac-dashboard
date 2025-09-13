const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a category name'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true // Add index for faster lookups
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true // Index for status filtering
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true // Index for hierarchy queries
  },
  sortOrder: {
    type: Number,
    default: 0,
    index: true // Index for sorting
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index for user-based queries
  }
}, {
  timestamps: true,
  // Compound indexes for common query patterns
  indexes: [
    { name: 'text', description: 'text' }, // Text search index
    { sortOrder: 1, createdAt: -1 }, // Compound index for sorting
    { isActive: 1, sortOrder: 1 }, // Status + sort order
    { createdBy: 1, isActive: 1 }, // User + status filtering
  ]
});

// Optimize the slug generation to be more efficient
categorySchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isNew) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ +/g, '-')
      .substring(0, 50); // Limit slug length
    
    let slug = baseSlug;
    let counter = 1;
    
    // Use lean() for faster queries during slug generation
    while (true) {
      const existingCategory = await this.constructor.findOne({ 
        slug: slug, 
        _id: { $ne: this._id } 
      }).lean().select('_id');
      
      if (!existingCategory) {
        break;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
      
      // Prevent infinite loops
      if (counter > 100) {
        slug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }
    
    this.slug = slug;
  }
  next();
});

// Add static methods for optimized queries
categorySchema.statics.findActiveCategories = function(options = {}) {
  const { page = 1, limit = 10, search = '', parentCategory = null } = options;
  
  const query = { isActive: true };
  
  if (search) {
    query.$text = { $search: search };
  }
  
  if (parentCategory !== null) {
    query.parentCategory = parentCategory;
  }
  
  return this.find(query)
    .populate('createdBy', 'name')
    .sort({ sortOrder: 1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean(); // Return plain objects for better performance
};

categorySchema.statics.findWithPagination = function(options = {}) {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    status = '', 
    sortBy = { sortOrder: 1, createdAt: -1 } 
  } = options;
  
  const query = {};
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (status) {
    query.isActive = status === 'active';
  }
  
  // Use aggregation for better performance with pagination
  return this.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy',
        pipeline: [{ $project: { name: 1, email: 1 } }]
      }
    },
    { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
    { $sort: sortBy },
    {
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ],
        totalCount: [{ $count: 'count' }]
      }
    }
  ]);
};

// Instance method for safe toggle
categorySchema.methods.toggleStatus = function() {
  this.isActive = !this.isActive;
  return this.save();
};

// Virtual for full hierarchy path
categorySchema.virtual('fullPath').get(function() {
  // This would need to be populated in queries that need the full path
  return this.name;
});

// Optimize JSON output
categorySchema.methods.toJSON = function() {
  const category = this.toObject({ virtuals: true });
  
  // Remove unnecessary fields for API responses
  delete category.__v;
  
  // For list views, remove heavy fields
  if (this.$locals && this.$locals.listView) {
    delete category.updatedAt;
    if (category.description && category.description.length > 100) {
      category.description = category.description.substring(0, 100) + '...';
    }
  }
  
  return category;
};

// Add validation for parent category to prevent circular references
categorySchema.pre('save', async function(next) {
  if (this.parentCategory && this.parentCategory.toString() === this._id.toString()) {
    return next(new Error('Category cannot be its own parent'));
  }
  
  // Check for circular reference in hierarchy
  if (this.parentCategory && this.isModified('parentCategory')) {
    let currentParent = this.parentCategory;
    const visited = new Set();
    
    while (currentParent && !visited.has(currentParent.toString())) {
      visited.add(currentParent.toString());
      
      if (currentParent.toString() === this._id.toString()) {
        return next(new Error('Circular reference detected in category hierarchy'));
      }
      
      const parentDoc = await this.constructor.findById(currentParent).lean().select('parentCategory');
      currentParent = parentDoc?.parentCategory;
      
      // Prevent infinite loops
      if (visited.size > 10) break;
    }
  }
  
  next();
});

// Create indexes after model compilation
categorySchema.index({ name: 'text', description: 'text' });
categorySchema.index({ sortOrder: 1, createdAt: -1 });
categorySchema.index({ isActive: 1, sortOrder: 1 });
categorySchema.index({ createdBy: 1, isActive: 1 });

module.exports = mongoose.model('Category', categorySchema);