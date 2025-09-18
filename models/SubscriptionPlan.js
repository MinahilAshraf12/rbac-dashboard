const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: [true, 'Plan slug is required'],
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Plan description is required'],
    trim: true
  },
  price: {
    monthly: {
      type: Number,
      required: [true, 'Monthly price is required'],
      min: [0, 'Price cannot be negative']
    },
    yearly: {
      type: Number,
      required: [true, 'Yearly price is required'],
      min: [0, 'Price cannot be negative']
    }
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  stripeProductId: {
    type: String,
    required: true
  },
  stripePriceIds: {
    monthly: {
      type: String,
      required: true
    },
    yearly: {
      type: String,
      required: true
    }
  },
  features: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    included: {
      type: Boolean,
      default: true
    }
  }],
  limits: {
    users: {
      type: Number,
      required: [true, 'User limit is required'],
      min: [-1, 'User limit must be -1 (unlimited) or positive number']
    },
    expenses: {
      type: Number,
      required: [true, 'Expense limit is required'],
      min: [-1, 'Expense limit must be -1 (unlimited) or positive number']
    },
    storage: {
      type: Number,
      required: [true, 'Storage limit is required (in MB)'],
      min: [0, 'Storage limit cannot be negative']
    },
    categories: {
      type: Number,
      default: -1 // unlimited
    },
    apiCalls: {
      type: Number,
      default: -1 // unlimited
    },
    fileUploadSize: {
      type: Number,
      default: 10 // MB
    }
  },
  availableFeatures: [{
    type: String,
    enum: [
      'advanced_analytics',
      'custom_categories',
      'file_uploads',
      'api_access',
      'custom_domain',
      'priority_support',
      'data_export',
      'audit_logs',
      'integrations',
      'bulk_import',
      'custom_reports',
      'mobile_app',
      'sso',
      'white_label'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  trial: {
    enabled: {
      type: Boolean,
      default: true
    },
    days: {
      type: Number,
      default: 14
    }
  },
  metadata: {
    color: {
      type: String,
      default: '#3B82F6'
    },
    badge: String,
    ctaText: {
      type: String,
      default: 'Get Started'
    },
    targetAudience: String
  }
}, {
  timestamps: true
});

// Indexes
subscriptionPlanSchema.index({ slug: 1 });
subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

// Virtual for yearly savings percentage
subscriptionPlanSchema.virtual('yearlySavings').get(function() {
  const monthlyTotal = this.price.monthly * 12;
  const yearlySavings = monthlyTotal - this.price.yearly;
  return Math.round((yearlySavings / monthlyTotal) * 100);
});

// Virtual for formatted limits
subscriptionPlanSchema.virtual('formattedLimits').get(function() {
  return {
    users: this.limits.users === -1 ? 'Unlimited' : this.limits.users.toLocaleString(),
    expenses: this.limits.expenses === -1 ? 'Unlimited' : this.limits.expenses.toLocaleString(),
    storage: this.limits.storage === -1 ? 'Unlimited' : `${this.limits.storage} GB`,
    categories: this.limits.categories === -1 ? 'Unlimited' : this.limits.categories.toLocaleString()
  };
});

// Pre-save middleware to generate slug
subscriptionPlanSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ +/g, '-');
  }
  next();
});

// Static method to get active plans
subscriptionPlanSchema.statics.getActivePlans = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
};

// Static method to get plan by stripe price id
subscriptionPlanSchema.statics.findByStripePriceId = function(priceId) {
  return this.findOne({
    $or: [
      { 'stripePriceIds.monthly': priceId },
      { 'stripePriceIds.yearly': priceId }
    ]
  });
};

// Instance method to check if plan has feature
subscriptionPlanSchema.methods.hasFeature = function(featureName) {
  return this.availableFeatures.includes(featureName);
};

// Instance method to get price for interval
subscriptionPlanSchema.methods.getPriceForInterval = function(interval) {
  return interval === 'yearly' ? this.price.yearly : this.price.monthly;
};

// Instance method to get stripe price id for interval
subscriptionPlanSchema.methods.getStripePriceId = function(interval) {
  return interval === 'yearly' ? this.stripePriceIds.yearly : this.stripePriceIds.monthly;
};

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);