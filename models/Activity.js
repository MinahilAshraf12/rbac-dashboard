// models/Activity.js
const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'user_created', 'user_updated', 'user_deleted',
      'role_created', 'role_updated', 'role_deleted', 
      'category_created', 'category_updated', 'category_deleted',
      'expense_created', 'expense_updated', 'expense_deleted'
    ]
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['User', 'Role', 'Category', 'Expense']
  },
  entityName: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    oldData: mongoose.Schema.Types.Mixed,
    newData: mongoose.Schema.Types.Mixed,
    changes: [String]
  },
  isRead: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true
});

// Indexes for better performance
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ performedBy: 1 });
ActivitySchema.index({ entityType: 1 });
ActivitySchema.index({ isRead: 1 });

module.exports = mongoose.model('Activity', ActivitySchema);