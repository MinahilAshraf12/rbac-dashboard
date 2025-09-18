const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxlength: [100, 'Organization name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    required: [true, 'Subdomain slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    minlength: [3, 'Slug must be at least 3 characters'],
    maxlength: [30, 'Slug cannot exceed 30 characters']
  },
  customDomain: {
    type: String,
    default: null,
    trim: true,
    lowercase: true,
    sparse: true, // Allows multiple null values
    match: [/^[a-z0-9.-]+$/, 'Invalid domain format']
  },
  domainVerified: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'cancelled', 'trial'],
    default: 'trial'
  },
  trialEndDate: {
    type: Date,
    default: function() {
      // 14 days trial period
      return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }
  },
  settings: {
    maxUsers: {
      type: Number,
      default: 5
    },
    maxExpenses: {
      type: Number,
      default: 100
    },
    storageLimit: {
      type: Number,
      default: 1024 // MB
    },
    features: [{
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
        'integrations'
      ]
    }],
    branding: {
      logo: String,
      primaryColor: {
        type: String,
        default: '#3B82F6'
      },
      companyName: String
    },
    emailSettings: {
      fromName: String,
      fromEmail: String,
      smtpEnabled: {
        type: Boolean,
        default: false
      }
    }
  },
  subscription: {
    planId: String,
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    status: {
      type: String,
      enum: ['active', 'cancelled', 'past_due', 'unpaid', 'trialing'],
      default: 'trialing'
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    trialStart: Date,
    trialEnd: Date,
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    }
  },
  billing: {
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    companyName: String,
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    },
    taxId: String,
    paymentMethod: {
      type: String,
      enum: ['card', 'bank_transfer', 'invoice'],
      default: 'card'
    }
  },
  usage: {
    currentUsers: {
      type: Number,
      default: 0
    },
    currentExpenses: {
      type: Number,
      default: 0
    },
    storageUsed: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    industry: String,
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-1000', '1000+']
    },
    source: {
      type: String,
      enum: ['organic', 'referral', 'advertising', 'partnership'],
      default: 'organic'
    },
    notes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
tenantSchema.index({ slug: 1 });
tenantSchema.index({ customDomain: 1 });
tenantSchema.index({ status: 1 });
tenantSchema.index({ plan: 1 });
tenantSchema.index({ owner: 1 });
tenantSchema.index({ createdAt: -1 });

// Virtual for full domain
tenantSchema.virtual('fullDomain').get(function() {
  if (this.customDomain && this.domainVerified) {
    return this.customDomain;
  }
  return `${this.slug}.i-expense.ikftech.com`;
});

// Virtual for trial status
tenantSchema.virtual('isTrialExpired').get(function() {
  return this.trialEndDate && new Date() > this.trialEndDate;
});

// Virtual for subscription status
tenantSchema.virtual('isSubscriptionActive').get(function() {
  return this.subscription.status === 'active' || 
         (this.subscription.status === 'trialing' && !this.isTrialExpired);
});

// Pre-save middleware to generate slug
tenantSchema.pre('save', async function(next) {
  if (this.isModified('name') && !this.slug) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/ +/g, '-')
      .substring(0, 30);
    
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existingTenant = await this.constructor.findOne({ 
        slug: slug, 
        _id: { $ne: this._id } 
      });
      
      if (!existingTenant) {
        break;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Instance method to check feature availability
tenantSchema.methods.hasFeature = function(featureName) {
  return this.settings.features.includes(featureName);
};

// Instance method to check usage limits
tenantSchema.methods.canAddUser = function() {
  return this.usage.currentUsers < this.settings.maxUsers;
};

tenantSchema.methods.canAddExpense = function() {
  if (this.settings.maxExpenses === -1) return true; // Unlimited
  return this.usage.currentExpenses < this.settings.maxExpenses;
};

tenantSchema.methods.hasStorageSpace = function(additionalMB = 0) {
  return (this.usage.storageUsed + additionalMB) <= this.settings.storageLimit;
};

// Static method to find tenant by domain
tenantSchema.statics.findByDomain = async function(domain) {
  // First check custom domain
  let tenant = await this.findOne({ 
    customDomain: domain, 
    domainVerified: true, 
    isActive: true 
  });
  
  if (tenant) return tenant;
  
  // Then check subdomain
  if (domain.includes('i-expense.ikftech.com')) {
    const slug = domain.split('.')[0];
    tenant = await this.findOne({ 
      slug: slug, 
      isActive: true 
    });
  }
  
  return tenant;
};

// Static method to update usage statistics
tenantSchema.statics.updateUsage = async function(tenantId, type, increment = 1) {
  const updateField = `usage.current${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  
  await this.findByIdAndUpdate(
    tenantId,
    { 
      $inc: { [updateField]: increment },
      'usage.lastUpdated': new Date()
    }
  );
};

module.exports = mongoose.model('Tenant', tenantSchema);