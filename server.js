const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();

// ====================================================================
// MIDDLEWARE
// ====================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files for file uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const createUploadsDir = async () => {
  try {
    await fs.access(path.join(__dirname, 'uploads'));
  } catch {
    await fs.mkdir(path.join(__dirname, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(__dirname, 'uploads/expenses'), { recursive: true });
  }
};

// ====================================================================
// FILE UPLOAD CONFIGURATION
// ====================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads/expenses'));
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);
    cb(null, `${baseName}-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt|xlsx|xls/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images, PDFs, and document files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter
});

// ====================================================================
// DATABASE CONNECTION
// ====================================================================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_dashboard');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// ====================================================================
// MONGOOSE MODELS
// ====================================================================

// User Model
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  avatar: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Role Model
const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a role name'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      enum: ['users', 'roles', 'categories','expenses', 'permissions', 'dashboard', 'settings']
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'manage']
    }]
  }],
  isSystemRole: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const Role = mongoose.model('Role', roleSchema);

// Category Model
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a category name'],
    trim: true
  },
  slug: {
    type: String,
    unique: true,
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
  }
}, {
  timestamps: true
});

// Generate slug from name before saving
categorySchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isNew) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ +/g, '-');
    
    // Ensure slug is unique
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existingCategory = await this.constructor.findOne({ 
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

const Category = mongoose.model('Category', categorySchema);

// Enhanced Expense Model
const expenseSchema = new mongoose.Schema({
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
    required: [true, 'Please add total amount'],
    min: [0, 'Amount cannot be negative']
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
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate total amount
// Expense Schema Hook
// Always keep totalAmount in sync with payments
expenseSchema.pre('save', function (next) {
  if (Array.isArray(this.payments)) {
    const total = this.payments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    this.totalAmount = Number(total.toFixed(2)); // force overwrite on every save
  } else {
    this.totalAmount = 0;
  }
  next();
});







const Expense = mongoose.model('Expense', expenseSchema);

// ====================================================================
// MIDDLEWARE FUNCTIONS
// ====================================================================

// Generate JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

// Protect routes middleware
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    req.user = await User.findById(decoded.id).populate('role');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

// Check if user has permission for specific resource and action
const hasPermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - no role assigned'
      });
    }

    const userPermissions = req.user.role.permissions;
    
    const hasPermission = userPermissions.some(permission => 
      permission.resource === resource && 
      (permission.actions.includes(action) || permission.actions.includes('manage'))
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied - insufficient permissions for ${resource}:${action}`
      });
    }

    next();
  };
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);

  const options = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    token,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      avatar: user.avatar
    }
  });
};

// ====================================================================
// AUTH ROUTES
// ====================================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password').populate('role');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.get('/api/auth/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('role');
    
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        avatar: user.avatar,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.get('/api/auth/logout', async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
});

// ====================================================================
// USER ROUTES
// ====================================================================

app.get('/api/users', protect, hasPermission('users', 'read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (status !== '') query.isActive = status === 'active';

    const users = await User.find(query)
      .populate('role')
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.get('/api/users/:id', protect, hasPermission('users', 'read'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('role').select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.post('/api/users', protect, hasPermission('users', 'create'), async (req, res) => {
  try {
    const { name, email, password, roleId, isActive } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected'
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: roleId,
      isActive: isActive !== undefined ? isActive : true
    });

    const populatedUser = await User.findById(user._id).populate('role').select('-password');

    res.status(201).json({
      success: true,
      data: populatedUser
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
});

app.put('/api/users/:id', protect, hasPermission('users', 'update'), async (req, res) => {
  try {
    const { name, email, roleId, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken'
        });
      }
    }

    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role selected'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(roleId && { role: roleId }),
        ...(isActive !== undefined && { isActive })
      },
      { new: true, runValidators: true }
    ).populate('role').select('-password');

    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.delete('/api/users/:id', protect, hasPermission('users', 'delete'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// ====================================================================
// ROLE ROUTES
// ====================================================================

app.get('/api/roles', protect, hasPermission('roles', 'read'), async (req, res) => {
  try {
    const roles = await Role.find().sort({ priority: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.get('/api/roles/:id', protect, hasPermission('roles', 'read'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    res.status(200).json({
      success: true,
      data: role
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.post('/api/roles', protect, hasPermission('roles', 'create'), async (req, res) => {
  try {
    const { name, description, permissions, priority, isSystemRole } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name and description are required'
      });
    }

    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists'
      });
    }

    if (permissions && Array.isArray(permissions)) {
      const validResources = ['users', 'roles', 'categories','expenses', 'permissions', 'dashboard', 'settings'];
      const validActions = ['create', 'read', 'update', 'delete', 'manage'];
      
      for (const permission of permissions) {
        if (!validResources.includes(permission.resource)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource: ${permission.resource}`
          });
        }
        
        for (const action of permission.actions) {
          if (!validActions.includes(action)) {
            return res.status(400).json({
              success: false,
              message: `Invalid action: ${action}`
            });
          }
        }
      }
    }

    const role = await Role.create({
      name: name.trim(),
      description: description.trim(),
      permissions: permissions || [],
      priority: priority || 0,
      isSystemRole: isSystemRole || false
    });

    res.status(201).json({
      success: true,
      data: role
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
});

app.put('/api/roles/:id', protect, hasPermission('roles', 'update'), async (req, res) => {
  try {
    const { name, description, permissions, priority } = req.body;

    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify system roles'
      });
    }

    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ name, _id: { $ne: req.params.id } });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role name is already taken'
        });
      }
    }

    if (permissions && Array.isArray(permissions)) {
      const validResources = ['users', 'roles', 'categories', 'expenses', 'permissions', 'dashboard', 'settings'];
      const validActions = ['create', 'read', 'update', 'delete', 'manage'];
      
      for (const permission of permissions) {
        if (!validResources.includes(permission.resource)) {
          return res.status(400).json({
            success: false,
            message: `Invalid resource: ${permission.resource}`
          });
        }
        
        for (const action of permission.actions) {
          if (!validActions.includes(action)) {
            return res.status(400).json({
              success: false,
              message: `Invalid action: ${action}`
            });
          }
        }
      }
    }

    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.trim() }),
        ...(description && { description: description.trim() }),
        ...(permissions && { permissions }),
        ...(priority !== undefined && { priority })
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedRole
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.delete('/api/roles/:id', protect, hasPermission('roles', 'delete'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system roles'
      });
    }

    const usersWithRole = await User.countDocuments({ role: req.params.id });
    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. It is assigned to ${usersWithRole} user(s). Please reassign users before deleting.`
      });
    }

    await Role.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// ====================================================================
// ====================================================================
// ENHANCED EXPENSE ROUTES - FIXED VERSION
// ====================================================================

app.get('/api/expenses', protect, async (req, res) => {
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
});

app.get('/api/expenses/statistics', protect, async (req, res) => {
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
});

app.get('/api/expenses/users', protect, async (req, res) => {
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
});

app.get('/api/expenses/summary', protect, async (req, res) => {
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
});

app.get('/api/expenses/:id', protect, async (req, res) => {
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
});

// Replace your existing POST /api/expenses route with this enhanced debug version

// app.post('/api/expenses', protect, upload.array('files', 10), async (req, res) => {
//   try {
//     const { title, description, date, category, payments } = req.body;

//     console.log('=== ENHANCED CREATE EXPENSE DEBUG ===');
//     console.log('1. Raw request data:');
//     console.log('   - title:', title);
//     console.log('   - description:', description);
//     console.log('   - date:', date);
//     console.log('   - category:', category);
//     console.log('   - payments (raw):', payments);
//     console.log('   - files count:', req.files?.length || 0);
//     console.log('   - files details:', req.files?.map(f => ({ 
//       fieldname: f.fieldname, 
//       originalname: f.originalname,
//       filename: f.filename 
//     })));

//     let parsedPayments;
//     try {
//       parsedPayments = typeof payments === 'string' ? JSON.parse(payments) : payments;
//       console.log('2. Parsed payments:', JSON.stringify(parsedPayments, null, 2));
//     } catch (parseError) {
//       console.error('2. Payment parsing error:', parseError);
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid payments data format: ' + parseError.message
//       });
//     }

//     if (!title || !category || !parsedPayments || parsedPayments.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Title, category, and at least one payment are required'
//       });
//     }

//     // Verify category exists
//     const categoryExists = await Category.findById(category);
//     console.log('3. Category verification:', categoryExists ? 'EXISTS' : 'NOT FOUND');
//     if (!categoryExists) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid category selected'
//       });
//     }

//     // Process files
//     const files = req.files || [];
//     const fileMap = {};
//     files.forEach((file, index) => {
//       const fieldName = file.fieldname || `payment_${index}`;
//       const fileInfo = {
//         filename: file.filename,
//         originalName: file.originalname,
//         path: file.path,
//         size: file.size,
//         mimetype: file.mimetype
//       };
//       fileMap[fieldName] = fileInfo;
//       fileMap[`payment_${index}`] = fileInfo;
//       fileMap[`files_${index}`] = fileInfo;
//       fileMap[`file_${index}`] = fileInfo;
//     });

//     console.log('4. File mapping created:', Object.keys(fileMap));

//     const processedPayments = [];
//     let totalAmount = 0;

//     for (let i = 0; i < parsedPayments.length; i++) {
//       const payment = parsedPayments[i];
      
//       console.log(`5.${i}. Processing payment ${i}:`, payment);

//       if (!payment.user || !payment.amount || parseFloat(payment.amount) <= 0) {
//         return res.status(400).json({
//           success: false,
//           message: `Payment ${i + 1}: User name and valid amount are required`
//         });
//       }

//       const processedPayment = {
//         user: payment.user.trim(),
//         amount: parseFloat(payment.amount),
//         subCategory: payment.subCategory || '', // CRITICAL: Ensure this is preserved
//         category: payment.category || category
//       };

//       console.log(`5.${i}. Initial processed payment:`, processedPayment);

//       // File attachment logic
//       const possibleKeys = [`payment_${i}`, `files_${i}`, `file_${i}`, `files[${i}]`, 'files'];
//       let fileAttached = false;

//       for (const key of possibleKeys) {
//         if (fileMap[key]) {
//           processedPayment.file = fileMap[key];
//           console.log(`5.${i}. File attached via key '${key}':`, processedPayment.file);
//           fileAttached = true;
//           break;
//         }
//       }

//       if (!fileAttached && files[i]) {
//         processedPayment.file = {
//           filename: files[i].filename,
//           originalName: files[i].originalname,
//           path: files[i].path,
//           size: files[i].size,
//           mimetype: files[i].mimetype
//         };
//         console.log(`5.${i}. File attached by direct index:`, processedPayment.file);
//       }

//       console.log(`5.${i}. FINAL processed payment:`, JSON.stringify(processedPayment, null, 2));

//       processedPayments.push(processedPayment);
//       totalAmount += processedPayment.amount;
//     }

//     console.log('6. All processed payments before save:', JSON.stringify(processedPayments, null, 2));

//     // Create the expense object
//     const expenseData = {
//       title: title.trim(),
//       description: description?.trim() || '',
//       date: date ? new Date(date) : new Date(),
//       category,
//       payments: processedPayments,
//       totalAmount,
//       createdBy: req.user.id
//     };

//     console.log('7. Final expense data before save:', JSON.stringify(expenseData, null, 2));

//     // Save to database
//     const expense = await Expense.create(expenseData);
//     console.log('8. Created expense ID:', expense._id);
//     console.log('9. Raw saved expense:', JSON.stringify(expense.toObject(), null, 2));

//     // Verify what was actually saved by fetching it back
//     const verifyExpense = await Expense.findById(expense._id).lean();
//     console.log('10. VERIFICATION - Raw from DB:', JSON.stringify(verifyExpense, null, 2));
//     console.log('11. VERIFICATION - Payments from DB:', verifyExpense.payments.map((p, i) => ({
//       index: i,
//       user: p.user,
//       amount: p.amount,
//       subCategory: p.subCategory,
//       hasSubCategory: p.hasOwnProperty('subCategory'),
//       subCategoryValue: p.subCategory,
//       subCategoryType: typeof p.subCategory,
//       hasFile: !!p.file,
//       fileKeys: p.file ? Object.keys(p.file) : null
//     })));

//     // Populate for response
//     const populatedExpense = await Expense.findById(expense._id)
//       .populate('category', 'name slug')
//       .populate('createdBy', 'name email')
//       .populate('payments.category', 'name');

//     console.log('12. Final populated response payments:', populatedExpense.payments.map(p => ({
//       user: p.user,
//       amount: p.amount,
//       subCategory: p.subCategory,
//       hasFile: !!p.file
//     })));

//     res.status(201).json({
//       success: true,
//       data: populatedExpense,
//       debug: {
//         originalPayments: parsedPayments,
//         processedPayments: processedPayments,
//         savedPayments: verifyExpense.payments,
//         filesProcessed: files.length
//       }
//     });
//   } catch (error) {
//     console.error('Create expense error:', error);
    
//     // Clean up uploaded files on error
//     if (req.files) {
//       req.files.forEach(async (file) => {
//         try {
//           await fs.unlink(file.path);
//         } catch (unlinkError) {
//           console.error('Error deleting uploaded file:', unlinkError);
//         }
//       });
//     }

//     if (error.name === 'ValidationError') {
//       console.error('Validation error details:', error.errors);
//       const message = Object.values(error.errors).map(val => val.message);
//       return res.status(400).json({
//         success: false,
//         message: message.join(', '),
//         validationErrors: error.errors
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: 'Server Error: ' + error.message,
//       error: error.stack
//     });
//   }
// });





// Also add this direct database inspection route
app.get('/api/expenses/:id/raw', protect, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).lean();
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Raw database inspection
    console.log('=== RAW DATABASE INSPECTION ===');
    console.log('Expense ID:', expense._id);
    console.log('Full document:', JSON.stringify(expense, null, 2));
    console.log('Payments array:', expense.payments);
    console.log('Payment details:');
    expense.payments.forEach((payment, index) => {
      console.log(`Payment ${index}:`, {
        user: payment.user,
        amount: payment.amount,
        subCategory: payment.subCategory,
        subCategoryExists: payment.hasOwnProperty('subCategory'),
        subCategoryValue: payment.subCategory,
        subCategoryType: typeof payment.subCategory,
        allKeys: Object.keys(payment),
        file: payment.file ? {
          exists: true,
          keys: Object.keys(payment.file),
          filename: payment.file.filename,
          originalName: payment.file.originalName
        } : null
      });
    });

    res.json({
      success: true,
      expense: expense,
      paymentAnalysis: expense.payments.map((payment, index) => ({
        index,
        user: payment.user,
        amount: payment.amount,
        subCategory: payment.subCategory,
        subCategoryExists: payment.hasOwnProperty('subCategory'),
        hasFile: !!payment.file,
        allFields: Object.keys(payment)
      }))
    });
  } catch (error) {
    console.error('Raw inspection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Replace your existing POST /api/expenses route with this fixed version:
app.post('/api/expenses', protect, upload.any(), async (req, res) => {
  try {
    const { title, description, date, category, payments } = req.body;

    console.log('=== CREATE EXPENSE DEBUG ===');
    console.log('Request data:', { title, description, date, category });
    console.log('Files received:', req.files?.length || 0);
    console.log('Files details:', req.files?.map(f => ({ 
      fieldname: f.fieldname, 
      originalname: f.originalname,
      filename: f.filename 
    })));

    let parsedPayments;
    try {
      parsedPayments = typeof payments === 'string' ? JSON.parse(payments) : payments;
      console.log('Parsed payments:', JSON.stringify(parsedPayments, null, 2));
    } catch (parseError) {
      console.error('Payment parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid payments data format: ' + parseError.message
      });
    }

    if (!title || !category || !parsedPayments || parsedPayments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, and at least one payment are required'
      });
    }

    // Verify category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category selected'
      });
    }

    // Create file map from received files
    const files = req.files || [];
    const fileMap = {};
    
    files.forEach((file) => {
      console.log(`Mapping file: ${file.fieldname} -> ${file.originalname}`);
      fileMap[file.fieldname] = {
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      };
    });

    console.log('File mapping created:', Object.keys(fileMap));

    const processedPayments = [];
    let totalAmount = 0;

    for (let i = 0; i < parsedPayments.length; i++) {
      const payment = parsedPayments[i];
      
      console.log(`Processing payment ${i}:`, payment);

      if (!payment.user || !payment.amount || parseFloat(payment.amount) <= 0) {
        // Clean up any uploaded files before returning error
        files.forEach(async (file) => {
          try { await fs.unlink(file.path); } catch {}
        });
        return res.status(400).json({
          success: false,
          message: `Payment ${i + 1}: User name and valid amount are required`
        });
      }

      const processedPayment = {
        user: payment.user.trim(),
        amount: parseFloat(payment.amount),
        subCategory: payment.subCategory || '',
        category: payment.category || category
      };

      // Check for file using the payment_X pattern
      const paymentFileKey = `payment_${i}`;
      if (fileMap[paymentFileKey]) {
        processedPayment.file = fileMap[paymentFileKey];
        console.log(`File attached to payment ${i}:`, processedPayment.file.originalName);
      }

      console.log(`Final processed payment ${i}:`, processedPayment);
      processedPayments.push(processedPayment);
      totalAmount += processedPayment.amount;
    }

    // Create expense
    const expenseData = {
      title: title.trim(),
      description: description?.trim() || '',
      date: date ? new Date(date) : new Date(),
      category,
      payments: processedPayments,
      totalAmount,
      createdBy: req.user.id
    };

    console.log('Creating expense with payments:', processedPayments.map(p => ({
      user: p.user,
      amount: p.amount,
      subCategory: p.subCategory,
      hasFile: !!p.file
    })));

    const expense = await Expense.create(expenseData);

    // Populate for response
    const populatedExpense = await Expense.findById(expense._id)
      .populate('category', 'name slug')
      .populate('createdBy', 'name email')
      .populate('payments.category', 'name');

    res.status(201).json({
      success: true,
      data: populatedExpense
    });
  } catch (error) {
    console.error('Create expense error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      });
    }

    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error: ' + error.message
    });
  }
});

// Replace your existing PUT /api/expenses/:id route with this fixed version:

// Replace your existing PUT /api/expenses/:id route in server.js with this fixed version:

// Replace your existing PUT /api/expenses/:id route in server.js with this fixed version:


// Replace your existing PUT /api/expenses/:id route in server.js with this CORRECTED version:

app.put('/api/expenses/:id', protect, upload.any(), async (req, res) => {
  try {
    console.log('=== EXPENSE UPDATE DEBUG (FINAL FIX) ===');
    console.log('Expense ID:', req.params.id);
    console.log('Files received:', req.files?.length || 0);
    console.log('Raw payments:', req.body.payments);

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: 'Expense not found' 
      });
    }

    let { title, description, date, category, status, payments } = req.body;

    // Parse payments
    if (typeof payments === 'string') {
      try {
        payments = JSON.parse(payments);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payments data format: ' + parseError.message
        });
      }
    }
    if (!Array.isArray(payments)) payments = [];

    // Update basic expense fields
    if (title) expense.title = title.trim();
    if (description !== undefined) expense.description = description.trim();
    if (date) expense.date = new Date(date);
    if (category) expense.category = category;
    if (status) expense.status = status;

    // Create file map for new uploads
    const newFiles = req.files || [];
    const fileMap = {};
    
    newFiles.forEach((file) => {
      fileMap[file.fieldname] = {
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      };
    });

    console.log('New files mapped:', Object.keys(fileMap));

    // CRITICAL FIX: Process payments with complete file replacement logic
    if (payments.length > 0) {
      const processedPayments = [];

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        
        console.log(`\nProcessing payment ${i}:`, {
          user: payment.user,
          amount: payment.amount,
          fileAction: payment.fileAction,
          hasNewFile: payment.hasNewFile
        });

        if (!payment.user || !payment.amount || parseFloat(payment.amount) <= 0) {
          newFiles.forEach(async (file) => {
            try { await fs.unlink(file.path); } catch {}
          });
          return res.status(400).json({
            success: false,
            message: `Payment ${i + 1}: User name and valid amount are required`
          });
        }

        const processedPayment = {
          user: payment.user.trim(),
          amount: parseFloat(payment.amount),
          subCategory: payment.subCategory || '',
          category: payment.category || category
        };

        // THE CORE FIX - Proper file handling logic
        const paymentFileKey = `payment_${i}`;
        const hasNewFile = fileMap[paymentFileKey];
        const hasExistingFile = expense.payments[i]?.file;
        
        console.log(`File status for payment ${i}:`, {
          hasNewFile: !!hasNewFile,
          hasExistingFile: !!hasExistingFile,
          fileAction: payment.fileAction,
          newFileKey: paymentFileKey
        });

        if (hasNewFile) {
          // NEW FILE UPLOADED - Delete old file and use new one
          console.log(`🆕 REPLACING with NEW FILE: ${hasNewFile.originalName}`);
          
          // Delete old file if exists
          if (hasExistingFile?.path) {
            try {
              await fs.unlink(hasExistingFile.path);
              console.log(`🗑️ DELETED OLD FILE: ${hasExistingFile.path}`);
            } catch (error) {
              console.log(`⚠️ Could not delete old file: ${error.message}`);
            }
          }
          
          // Set NEW file data
          processedPayment.file = {
            filename: hasNewFile.filename,
            originalName: hasNewFile.originalName,
            path: hasNewFile.path,
            size: hasNewFile.size,
            mimetype: hasNewFile.mimetype
          };
          
        } else if (payment.fileAction === 'remove') {
          // USER EXPLICITLY REMOVED FILE
          console.log(`🗑️ USER REMOVED FILE`);
          
          if (hasExistingFile?.path) {
            try {
              await fs.unlink(hasExistingFile.path);
              console.log(`🗑️ DELETED REMOVED FILE: ${hasExistingFile.path}`);
            } catch (error) {
              console.log(`⚠️ Could not delete removed file: ${error.message}`);
            }
          }
          // Don't set file property (undefined = no file)
          
        } else if (hasExistingFile && payment.fileAction !== 'remove') {
          // KEEP EXISTING FILE (no new file, no removal)
          console.log(`📎 KEEPING EXISTING FILE: ${hasExistingFile.originalName}`);
          processedPayment.file = {
            filename: hasExistingFile.filename,
            originalName: hasExistingFile.originalName,
            path: hasExistingFile.path,
            size: hasExistingFile.size,
            mimetype: hasExistingFile.mimetype
          };
        } else {
          // NO FILE AT ALL
          console.log(`❌ NO FILE for payment ${i}`);
          // Don't set file property
        }

        console.log(`✅ Final payment ${i} file status:`, {
          hasFile: !!processedPayment.file,
          fileName: processedPayment.file?.originalName || 'None'
        });

        processedPayments.push(processedPayment);
      }

      console.log('\n=== FINAL PROCESSING RESULT ===');
      processedPayments.forEach((p, i) => {
        console.log(`Payment ${i}: ${p.user} - $${p.amount} - File: ${p.file ? `✅ ${p.file.originalName}` : '❌ None'}`);
      });

      // CRITICAL: Replace entire payments array
      expense.payments = processedPayments;
    } else {
      // No payments - clean up all existing files
      if (expense.payments) {
        for (const payment of expense.payments) {
          if (payment.file?.path) {
            try {
              await fs.unlink(payment.file.path);
              console.log(`🗑️ CLEANED UP FILE: ${payment.file.path}`);
            } catch (error) {
              console.error('Error cleaning up file:', error);
            }
          }
        }
      }
      expense.payments = [];
    }

    // Save the expense - this will trigger the pre-save hook for totalAmount calculation
    await expense.save();
    console.log('\n✅ EXPENSE SAVED SUCCESSFULLY');

    // Return the updated expense with population
    const updatedExpense = await Expense.findById(expense._id)
      .populate('category', 'name slug')
      .populate('createdBy', 'name email')
      .populate('payments.category', 'name');

    // Final verification log
    console.log('\n=== FINAL VERIFICATION ===');
    updatedExpense.payments.forEach((p, i) => {
      console.log(`Saved Payment ${i}: ${p.user} - File: ${p.file ? `✅ ${p.file.originalName} (${p.file.path})` : '❌ None'}`);
    });

    res.json({ 
      success: true, 
      data: updatedExpense,
      message: 'Expense updated successfully'
    });

  } catch (err) {
    console.error('❌ UPDATE ERROR:', err);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch {}
      });
    }

    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: message.join(', ')
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server Error: ' + err.message 
    });
  }
});

app.delete('/api/expenses/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense ID format'
      });
    }

    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.createdBy.toString() !== req.user.id && !req.user.role.permissions.some(p => p.resource === 'expenses' && p.actions.includes('manage'))) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this expense'
      });
    }

    if (expense.payments) {
      for (const payment of expense.payments) {
        if (payment.file && payment.file.path) {
          try {
            await fs.unlink(payment.file.path);
          } catch (error) {
            console.error('Error deleting file:', error);
          }
        }
      }
    }

    await Expense.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Replace your existing file download route with this improved version:

// Replace your current file serving route with this fixed version

// Replace your existing file serving route in server.js with this updated version:

app.get('/api/expenses/:id/files/:paymentIndex', protect, async (req, res) => {
  try {
    const { id, paymentIndex } = req.params;
    const { download } = req.query;

    console.log(`File request: expense ${id}, payment ${paymentIndex}, download: ${download}`);

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
      console.error(`File not found on disk: ${payment.file.path}`);
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    console.log(`Serving file: ${payment.file.originalName} (${payment.file.path})`);

    // CRITICAL FIX: Add cache-busting headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    // FIXED: Disable caching completely for file updates
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Add ETag based on file modification time to force refresh
    const stats = await fs.stat(payment.file.path);
    const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
    res.setHeader('ETag', etag);

    // Set content type
    res.setHeader('Content-Type', payment.file.mimetype || 'application/octet-stream');

    // Set appropriate content disposition based on file type and request
    const filename = payment.file.originalName || payment.file.filename;
    
    if (download === 'true') {
      // Force download when explicitly requested
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else if (payment.file.mimetype?.startsWith('image/')) {
      // Allow inline display for images (this enables preview)
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    } else if (payment.file.mimetype === 'application/pdf') {
      // Allow inline display for PDFs
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    } else {
      // Force download for other file types
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    // Send the file with proper headers
    res.sendFile(path.resolve(payment.file.path));
    
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

// Add a route to get file info without downloading
app.get('/api/expenses/:id/files/:paymentIndex/info', protect, async (req, res) => {
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

    res.json({
      success: true,
      file: {
        filename: payment.file.filename,
        originalName: payment.file.originalName,
        size: payment.file.size,
        mimetype: payment.file.mimetype,
        uploadedBy: payment.user,
        exists: await fs.access(payment.file.path).then(() => true).catch(() => false)
      }
    });
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});


// ðŸ”§ GET version - force recalc and update totalAmount
app.get('/api/expenses/:id/repair-total', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    // Manual recalc
    const manualTotal = expense.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Update DB
    expense.totalAmount = Number(manualTotal.toFixed(2));
    await expense.save();

    res.json({
      success: true,
      repaired: true,
      expenseId: expense._id,
      dbTotal: expense.totalAmount,
      manualTotal,
      match: expense.totalAmount === manualTotal,
      payments: expense.payments.map(p => ({
        user: p.user,
        amount: p.amount,
        type: typeof p.amount
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ====================================================================
// CATEGORY ROUTES
// ====================================================================

app.get('/api/categories', protect, async (req, res) => {
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
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

app.get('/api/categories/simple', protect, async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
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
});

app.get('/api/categories/:id', protect, hasPermission('categories', 'read'), async (req, res) => {
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
});

app.post('/api/categories', protect, hasPermission('categories', 'create'), async (req, res) => {
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
});

app.put('/api/categories/:id', protect, hasPermission('categories', 'update'), async (req, res) => {
  try {
    const { name, description, parentCategory, sortOrder, isActive } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

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
});

app.delete('/api/categories/:id', protect, hasPermission('categories', 'delete'), async (req, res) => {
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

    await Category.findByIdAndDelete(req.params.id);

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
});

// ====================================================================
// SEED DATABASE
// ====================================================================

const seedDatabase = async () => {
  try {
    console.log('Starting database seeding...');

    await User.deleteMany({});
    await Role.deleteMany({});
    await Category.deleteMany({});
    await Expense.deleteMany({});

    const roles = [
      {
        name: 'Administrator',
        description: 'Full system access with all permissions',
        permissions: [
          { resource: 'users', actions: ['manage'] },
          { resource: 'roles', actions: ['manage'] },
          { resource: 'categories', actions: ['manage'] },
          { resource: 'expenses', actions: ['manage'] },
          { resource: 'permissions', actions: ['manage'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'settings', actions: ['manage'] }
        ],
        isSystemRole: true,
        priority: 100
      },
      {
        name: 'Admin', 
        description: 'Administrative access with most permissions',
        permissions: [
          { resource: 'users', actions: ['create', 'read', 'update'] },
          { resource: 'roles', actions: ['read'] },
          { resource: 'categories', actions: ['manage'] },
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'permissions', actions: ['read'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'settings', actions: ['read', 'update'] }
        ],
        isSystemRole: true,
        priority: 80
      },
      {
        name: 'Editor',
        description: 'Content management and editing permissions',
        permissions: [
          { resource: 'categories', actions: ['create', 'read', 'update'] },
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'dashboard', actions: ['read'] },
          { resource: 'users', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 60
      },
      {
        name: 'User',
        description: 'Basic user with expense management permissions',
        permissions: [
          { resource: 'expenses', actions: ['create', 'read', 'update'] },
          { resource: 'categories', actions: ['read'] },
          { resource: 'dashboard', actions: ['read'] }
        ],
        isSystemRole: true,
        priority: 40
      }
    ];

    const createdRoles = await Role.insertMany(roles);
    console.log('Roles seeded successfully');

    const adminRole = createdRoles.find(role => role.name === 'Administrator');
    const editorRole = createdRoles.find(role => role.name === 'Editor');
    const userRole = createdRoles.find(role => role.name === 'User');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const users = [
      {
        name: 'System Administrator',
        email: 'admin@example.com',
        password: hashedPassword,
        role: adminRole._id,
        isActive: true
      },
      {
        name: 'John Editor',
        email: 'editor@example.com',
        password: hashedPassword,
        role: editorRole._id,
        isActive: true
      },
      {
        name: 'Jane User',
        email: 'user@example.com',
        password: hashedPassword,
        role: userRole._id,
        isActive: true
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log('Users seeded successfully');

    const adminUser = createdUsers.find(user => user.email === 'admin@example.com');

    const categories = [
      {
        name: 'Food & Dining',
        description: 'Restaurant meals, groceries, and dining expenses',
        isActive: true,
        sortOrder: 1,
        createdBy: adminUser._id
      },
      {
        name: 'Transportation',
        description: 'Travel, fuel, parking, and transport expenses',
        isActive: true,
        sortOrder: 2,
        createdBy: adminUser._id
      },
      {
        name: 'Office Supplies',
        description: 'Stationery, equipment, and office-related expenses',
        isActive: true,
        sortOrder: 3,
        createdBy: adminUser._id
      },
      {
        name: 'Technology',
        description: 'Software, hardware, and IT-related expenses',
        isActive: true,
        sortOrder: 4,
        createdBy: adminUser._id
      },
      {
        name: 'Entertainment',
        description: 'Team events, recreation, and entertainment expenses',
        isActive: true,
        sortOrder: 5,
        createdBy: adminUser._id
      },
      {
        name: 'Utilities',
        description: 'Electricity, internet, phone, and utility bills',
        isActive: true,
        sortOrder: 6,
        createdBy: adminUser._id
      },
      {
        name: 'Healthcare',
        description: 'Medical, dental, and health-related expenses',
        isActive: true,
        sortOrder: 7,
        createdBy: adminUser._id
      },
      {
        name: 'Education & Training',
        description: 'Courses, workshops, and educational expenses',
        isActive: true,
        sortOrder: 8,
        createdBy: adminUser._id
      }
    ];

    const createdCategories = await Category.insertMany(categories);
    console.log('Categories seeded successfully');

    const sampleExpenses = [
      {
        title: 'Team Lunch Meeting',
        description: 'Monthly team lunch at downtown restaurant',
        date: new Date('2024-01-15'),
        category: createdCategories.find(c => c.name === 'Food & Dining')._id,
        payments: [
          { 
            user: 'John Doe', 
            amount: 45.50,
            subCategory: 'Restaurant',
            category: createdCategories.find(c => c.name === 'Food & Dining')._id
          },
          { 
            user: 'Jane Smith', 
            amount: 38.75,
            subCategory: 'Restaurant',
            category: createdCategories.find(c => c.name === 'Food & Dining')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Office WiFi Setup',
        description: 'Internet installation and router setup',
        date: new Date('2024-01-10'),
        category: createdCategories.find(c => c.name === 'Technology')._id,
        payments: [
          { 
            user: 'Tech Support', 
            amount: 250.00,
            subCategory: 'Network Setup',
            category: createdCategories.find(c => c.name === 'Technology')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Quarterly Office Supplies',
        description: 'Bulk purchase of pens, papers, and office materials',
        date: new Date('2024-01-08'),
        category: createdCategories.find(c => c.name === 'Office Supplies')._id,
        payments: [
          { 
            user: 'Sarah Wilson', 
            amount: 156.89,
            subCategory: 'Stationery',
            category: createdCategories.find(c => c.name === 'Office Supplies')._id
          }
        ],
        createdBy: createdUsers.find(u => u.role.toString() === editorRole._id.toString())?._id || adminUser._id,
        status: 'pending'
      },
      {
        title: 'Client Transportation',
        description: 'Uber rides for client meetings',
        date: new Date('2024-01-12'),
        category: createdCategories.find(c => c.name === 'Transportation')._id,
        payments: [
          { 
            user: 'Mike Johnson', 
            amount: 32.50,
            subCategory: 'Rideshare',
            category: createdCategories.find(c => c.name === 'Transportation')._id
          },
          { 
            user: 'David Brown', 
            amount: 28.75,
            subCategory: 'Rideshare',
            category: createdCategories.find(c => c.name === 'Transportation')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Monthly Internet Bill',
        description: 'Office internet service payment',
        date: new Date('2024-01-01'),
        category: createdCategories.find(c => c.name === 'Utilities')._id,
        payments: [
          { 
            user: 'Admin Office', 
            amount: 89.99,
            subCategory: 'Internet',
            category: createdCategories.find(c => c.name === 'Utilities')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'completed'
      },
      {
        title: 'Training Workshop',
        description: 'Professional development workshop for team',
        date: new Date('2024-01-20'),
        category: createdCategories.find(c => c.name === 'Education & Training')._id,
        payments: [
          { 
            user: 'Emily Davis', 
            amount: 299.00,
            subCategory: 'Workshops',
            category: createdCategories.find(c => c.name === 'Education & Training')._id
          }
        ],
        createdBy: adminUser._id,
        status: 'pending'
      }
    ];

    await Expense.insertMany(sampleExpenses);
    console.log('Sample expenses seeded successfully');

    console.log('\nDatabase seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('   Admin: admin@example.com / admin123');
    console.log('   Editor: editor@example.com / admin123');
    console.log('   User: user@example.com / admin123');
    console.log('\nYou can now start the frontend and login!');
    console.log('Sample expenses with categories and sub-categories added!');
    
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// ====================================================================
// SEED ROUTES
// ====================================================================

app.get('/api/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.status(200).json({
      success: true,
      message: 'Database seeded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error seeding database',
      error: error.message
    });
  }
});

app.post('/api/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.status(200).json({
      success: true,
      message: 'Database seeded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error seeding database',
      error: error.message
    });
  }
});

// ====================================================================
// HEALTH CHECK ROUTE
// ====================================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ====================================================================
// ERROR HANDLER MIDDLEWARE
// ====================================================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 10MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files per expense.'
      });
    }
  }
  
  if (err.message === 'Only images, PDFs, and document files are allowed') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

// ====================================================================
// 404 HANDLER
// ====================================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ====================================================================
// SERVER STARTUP
// ====================================================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await createUploadsDir();
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('\nEnhanced MERN Admin Dashboard Backend');
      console.log('==========================================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`MongoDB Connected`);
      console.log(`File uploads enabled`);
      console.log('\nAvailable endpoints:');
      console.log(`   POST /api/auth/login - User login`);
      console.log(`   GET  /api/auth/me - Get current user`);
      console.log(`   GET  /api/expenses - Get all expenses`);
      console.log(`   POST /api/expenses - Create expense with files`);
      console.log(`   GET  /api/expenses/statistics - Expense statistics`);
      console.log(`   GET  /api/categories/simple - Categories dropdown`);
      console.log(`   GET  /api/expenses/users - Expense users list`);
      console.log(`   GET  /api/expenses/:id/files/:paymentIndex - Download files`);
      console.log(`   POST /api/seed - Seed database`);
      console.log(`   GET  /api/health - Health check`);
      console.log('\nNew Features:');
      console.log('   Ã¢â‚¬Â¢ File upload support for expense receipts');
      console.log('   Ã¢â‚¬Â¢ Enhanced expense model with sub-categories');
      console.log('   Ã¢â‚¬Â¢ Improved statistics and reporting');
      console.log('   Ã¢â‚¬Â¢ Better category management');
      console.log('   Ã¢â‚¬Â¢ Date-based expense filtering');
      console.log('\nReady for enhanced frontend connection!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', () => {
  console.log('\nSIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;