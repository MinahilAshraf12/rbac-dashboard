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

    const query = {};

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
    const categories = await Category.find({ isActive: true })
      .select('_id name slug description')
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
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
    const category = await Category.findById(req.params.id)
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

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    const category = await Category.create({
      name,
      description,
      parentCategory: parentCategory || null,
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id
    });

    const populatedCategory = await Category.findById(category._id)
      .populate('createdBy', 'name email')
      .populate('parentCategory', 'name');

    // Log activity
    await ActivityService.logActivity({
      type: 'category_created',
      entityId: category._id,
      entityType: 'Category',
      entityName: category.name,
      performedBy: req.user.id,
      newData: { name, description, parentCategory, sortOrder, isActive }
    });

    res.status(201).json({
      success: true,
      data: populatedCategory
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

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
const updateCategory = async (req, res) => {
  try {
    const { name, description, parentCategory, sortOrder, isActive } = req.body;

    const category = await Category.findById(req.params.id).populate('parentCategory', 'name');
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
      const existingCategory = await Category.findOne({ name });
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
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const childCategories = await Category.countDocuments({ parentCategory: req.params.id });
    if (childCategories > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with child categories'
      });
    }

    const expensesUsingCategory = await Expense.countDocuments({
      $or: [
        { category: req.params.id },
        { 'payments.category': req.params.id }
      ]
    });

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
      performedBy: req.user.id,
      oldData: categoryData
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the category
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Toggle the isActive status
    category.isActive = !category.isActive;
    category.updatedAt = new Date();
    
    // Save the updated category
    await category.save();

    res.status(200).json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: category
    });

  } catch (error) {
    console.error('Toggle category status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle category status',
      error: error.message
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