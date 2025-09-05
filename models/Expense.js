const mongoose = require('mongoose');

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

module.exports = mongoose.model('Expense', expenseSchema);