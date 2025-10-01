const Category = require('../models/Category');
const Expense = require('../models/Expense');
const ActivityService = require('../services/activityService');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';

    // Build query with tenant context
    const query = {};
    
    // Add tenant filter if tenant exists
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (status !== '') {
      query.isActive = status === 'active';
    }

    const categories = await Category.find(query)
      .populate('createdBy', 'name email')
      .populate('parentCategory', 'name')
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Category.countDocuments(query);

    res.status(200).json({
      success: true,
      count: categories.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get simple categories list (for dropdowns)
// @route   GET /api/categories/simple
// @access  Private
const getSimpleCategories = async (req, res) => {
  try {
    const query = { isActive: true };
    
    // Add tenant filter if tenant exists
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    const categories = await Category.find(query)
      .select('_id name slug description')
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get simple categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Private
const getCategory = async (req, res) => {
  try {
    const query = { _id: req.params.id };
    
    // Add tenant filter if tenant exists
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    const category = await Category.findOne(query)
      .populate('createdBy', 'name email')
      .populate('parentCategory', 'name');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.status(200).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private
const createCategory = async (req, res) => {
  try {
    const { name, description, parentCategory, sortOrder, isActive } = req.body;

    // Build query with tenant context for checking existing category
    const existingQuery = { name };
    if (req.tenant) {
      existingQuery.tenantId = req.tenant._id;
    }

    const existingCategory = await Category.findOne(existingQuery);
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    // Prepare category data
    const categoryData = {
      name,
      description,
      parentCategory: parentCategory || null,
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id
    };

    // Add tenant context if available
    if (req.tenant) {
      categoryData.tenantId = req.tenant._id;
    }

    const category = await Category.create(categoryData);

    const populatedCategory = await Category.findById(category._id)
      .populate('createdBy', 'name email')
      .populate('parentCategory', 'name');

    // Log activity
    await ActivityService.logActivity({
      type: 'category_created',
      entityId: category._id,
      entityType: 'Category',
      entityName: category.name,
      tenantId: req.tenant?._id,
      performedBy: req.user.id,
      newData: { name, description, parentCategory, sortOrder, isActive }
    });

    res.status(201).json({
      success: true,
      data: populatedCategory
    });
  } catch (error) {
    console.error('Create category error:', error);
    
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

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
const updateCategory = async (req, res) => {
  try {
    const { name, description, parentCategory, sortOrder, isActive } = req.body;

    // Build query with tenant context
    const query = { _id: req.params.id };
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    const category = await Category.findOne(query).populate('parentCategory', 'name');
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Store old data for activity log
    const oldData = {
      name: category.name,
      description: category.description,
      parentCategory: category.parentCategory?.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive
    };

    if (name && name !== category.name) {
      const existingQuery = { name };
      if (req.tenant) {
        existingQuery.tenantId = req.tenant._id;
      }
      const existingCategory = await Category.findOne(existingQuery);
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category name is already taken'
        });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(parentCategory !== undefined && { parentCategory: parentCategory || null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive })
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email').populate('parentCategory', 'name');

    // Log activity with changes
    const newData = {
      name: updatedCategory.name,
      description: updatedCategory.description,
      parentCategory: updatedCategory.parentCategory?.name,
      sortOrder: updatedCategory.sortOrder,
      isActive: updatedCategory.isActive
    };

    const changes = [];
    if (oldData.name !== newData.name) changes.push(`Name: ${oldData.name} → ${newData.name}`);
    if (oldData.description !== newData.description) changes.push(`Description updated`);
    if (oldData.parentCategory !== newData.parentCategory) changes.push(`Parent: ${oldData.parentCategory || 'None'} → ${newData.parentCategory || 'None'}`);
    if (oldData.sortOrder !== newData.sortOrder) changes.push(`Sort order: ${oldData.sortOrder} → ${newData.sortOrder}`);
    if (oldData.isActive !== newData.isActive) changes.push(`Status: ${oldData.isActive ? 'Active' : 'Inactive'} → ${newData.isActive ? 'Active' : 'Inactive'}`);

    await ActivityService.logActivity({
      type: 'category_updated',
      entityId: category._id,
      entityType: 'Category',
      entityName: updatedCategory.name,
      tenantId: req.tenant?._id,
      performedBy: req.user.id,
      oldData,
      newData,
      changes
    });

    res.status(200).json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private
const deleteCategory = async (req, res) => {
  try {
    // Build query with tenant context
    const query = { _id: req.params.id };
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    const category = await Category.findOne(query);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check for child categories
    const childQuery = { parentCategory: req.params.id };
    if (req.tenant) {
      childQuery.tenantId = req.tenant._id;
    }
    const childCategories = await Category.countDocuments(childQuery);
    
    if (childCategories > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with child categories'
      });
    }

    // Check for expenses using this category
    const expenseQuery = {
      $or: [
        { category: req.params.id },
        { 'payments.category': req.params.id }
      ]
    };
    if (req.tenant) {
      expenseQuery.tenantId = req.tenant._id;
    }
    const expensesUsingCategory = await Expense.countDocuments(expenseQuery);

    if (expensesUsingCategory > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It is used in ${expensesUsingCategory} expense(s).`
      });
    }

    // Store category data for activity log before deletion
    const categoryData = {
      name: category.name,
      description: category.description,
      isActive: category.isActive
    };

    await Category.findByIdAndDelete(req.params.id);

    // Log activity
    await ActivityService.logActivity({
      type: 'category_deleted',
      entityId: category._id,
      entityType: 'Category',
      entityName: category.name,
      tenantId: req.tenant?._id,
      performedBy: req.user.id,
      oldData: categoryData
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Toggle category status
// @route   PUT /api/categories/:id/toggle-status
// @access  Private
const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Build query with tenant context
    const query = { _id: id };
    if (req.tenant) {
      query.tenantId = req.tenant._id;
    }

    const category = await Category.findOne(query);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Store old status for activity log
    const oldStatus = category.isActive;

    // Toggle the isActive status
    category.isActive = !category.isActive;
    category.updatedAt = new Date();
    
    // Save the updated category
    await category.save();

    // Log activity
    await ActivityService.logActivity({
      type: 'category_status_changed',
      entityId: category._id,
      entityType: 'Category',
      entityName: category.name,
      tenantId: req.tenant?._id,
      performedBy: req.user.id,
      oldData: { isActive: oldStatus },
      newData: { isActive: category.isActive },
      changes: [`Status: ${oldStatus ? 'Active' : 'Inactive'} → ${category.isActive ? 'Active' : 'Inactive'}`]
    });

    res.status(200).json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        _id: category._id,
        name: category.name,
        isActive: category.isActive,
        updatedAt: category.updatedAt
      }
    });

  } catch (error) {
    console.error('Toggle category status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle category status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  getCategories,
  getSimpleCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus
};