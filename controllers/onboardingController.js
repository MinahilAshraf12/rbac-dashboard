// controllers/onboardingController.js - COMPLETE VERSION
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Role = require('../models/Role');
const TenantService = require('../services/tenantService');
const ActivityService = require('../services/activityService');
const { sendTokenResponse } = require('../middleware/auth');

// @desc    Check invite code validity
// @route   GET /api/onboarding/check-invite/:code
// @access  Public
const checkInviteCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Invite code is required'
      });
    }

    // Decode the invite code
    let decodedData;
    try {
      decodedData = Buffer.from(code, 'base64').toString('utf-8');
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite code format'
      });
    }

    const [userId] = decodedData.split(':');
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite code'
      });
    }

    // Find the invited user
    const user = await User.findById(userId)
      .populate('tenantId', 'name slug fullDomain')
      .populate('role', 'name')
      .populate('invitedBy', 'name email');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invite not found'
      });
    }

    if (user.acceptedInviteAt) {
      return res.status(400).json({
        success: false,
        message: 'Invite has already been accepted'
      });
    }

    // Check if invite is still valid (7 days)
    const inviteAge = new Date() - new Date(user.invitedAt);
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (inviteAge > maxAge) {
      return res.status(400).json({
        success: false,
        message: 'Invite has expired'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          name: user.name,
          email: user.email,
          role: user.role.name
        },
        tenant: {
          name: user.tenantId.name,
          slug: user.tenantId.slug,
          domain: user.tenantId.fullDomain
        },
        invitedBy: {
          name: user.invitedBy.name,
          email: user.invitedBy.email
        }
      }
    });
  } catch (error) {
    console.error('Check invite code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Accept invitation and set password
// @route   POST /api/onboarding/accept-invite
// @access  Public
const acceptInvite = async (req, res) => {
  try {
    const { code, password } = req.body;

    if (!code || !password) {
      return res.status(400).json({
        success: false,
        message: 'Invite code and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Decode the invite code
    let decodedData;
    try {
      decodedData = Buffer.from(code, 'base64').toString('utf-8');
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite code format'
      });
    }

    const [userId, tempPassword] = decodedData.split(':');
    
    if (!userId || !tempPassword) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite code'
      });
    }

    // Find and verify user
    const user = await User.findById(userId)
      .populate('role')
      .populate('tenantId');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invite not found'
      });
    }

    if (user.acceptedInviteAt) {
      return res.status(400).json({
        success: false,
        message: 'Invite has already been accepted'
      });
    }

    // Verify temp password matches
    const isValidTempPassword = await user.matchPassword(tempPassword);
    if (!isValidTempPassword) {
      return res.status(400).json({
        success: false,
        message: 'Invalid invite code'
      });
    }

    // Update user with new password and activate account
    user.password = password;
    user.isActive = true;
    user.acceptedInviteAt = new Date();
    await user.save();

    // Log activity
    await ActivityService.logActivity({
      type: 'user_invite_accepted',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      tenantId: user.tenantId._id,
      performedBy: user._id,
      metadata: {
        acceptedAt: new Date(),
        firstLogin: true
      }
    });

    // Send token response to log them in immediately
    sendTokenResponse(user, 200, res);

  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Setup new tenant account (public signup)
// @route   POST /api/onboarding/setup-account
// @access  Public
const setupTenantAccount = async (req, res) => {
  try {
    const {
      tenantName,
      slug,
      ownerName,
      ownerEmail,
      ownerPassword,
      plan = 'free'
    } = req.body;

    // Validate required fields
    if (!tenantName || !slug || !ownerName || !ownerEmail || !ownerPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (ownerPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain can only contain lowercase letters, numbers, and hyphens'
      });
    }

    if (slug.length < 3 || slug.length > 30) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain must be between 3 and 30 characters'
      });
    }

    // Check reserved subdomains
    const reservedSlugs = [
      'www', 'admin', 'api', 'mail', 'ftp', 'support', 'help',
      'blog', 'news', 'app', 'portal', 'dashboard', 'login',
      'signup', 'register', 'pricing', 'about', 'contact'
    ];

    if (reservedSlugs.includes(slug.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'This subdomain is reserved'
      });
    }

    // Create tenant using TenantService
    const result = await TenantService.createTenant({
      name: tenantName,
      slug,
      ownerName,
      ownerEmail,
      ownerPassword,
      plan,
      source: 'signup'
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        tenant: {
          id: result.tenant._id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          plan: result.tenant.plan,
          domain: result.tenant.fullDomain
        },
        owner: {
          id: result.owner._id,
          name: result.owner.name,
          email: result.owner.email
        },
        loginUrl: result.loginUrl,
        setupComplete: true
      }
    });

  } catch (error) {
    console.error('Setup tenant account error:', error);
    
    if (error.message.includes('already taken') || error.message.includes('already registered')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Complete onboarding process
// @route   POST /api/onboarding/complete-onboarding
// @access  Private
const completeOnboarding = async (req, res) => {
  try {
    const { preferences, additionalInfo } = req.body;

    // Update user preferences if provided
    if (preferences && req.user) {
      await User.findByIdAndUpdate(req.user.id, {
        preferences: { ...req.user.preferences, ...preferences }
      });
    }

    // Update tenant metadata if additional info provided
    if (additionalInfo && req.tenant) {
      await Tenant.findByIdAndUpdate(req.tenant._id, {
        'metadata.industry': additionalInfo.industry,
        'metadata.companySize': additionalInfo.companySize,
        'metadata.notes': additionalInfo.notes
      });
    }

    // Log onboarding completion
    await ActivityService.logActivity({
      type: 'onboarding_completed',
      entityId: req.tenant._id,
      entityType: 'Tenant',
      entityName: req.tenant.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      metadata: {
        completedAt: new Date(),
        preferences,
        additionalInfo
      }
    });

    res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      data: {
        redirectUrl: '/dashboard',
        setupComplete: true
      }
    });

  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Resend invitation
// @route   POST /api/onboarding/resend-invite
// @access  Private (Tenant Admin)
const resendInvite = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Find the invited user
    const user = await User.findOne({
      _id: userId,
      tenantId: req.tenant._id,
      acceptedInviteAt: { $exists: false }
    }).populate('role', 'name');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pending invitation not found'
      });
    }

    // Generate new temporary password
    const tempPassword = Math.random().toString(36).substring(2, 15);
    
    // Update user with new temp password
    user.password = tempPassword;
    user.invitedAt = new Date(); // Reset invitation date
    await user.save();

    // Generate new invite code
    const inviteCode = Buffer.from(`${user._id}:${tempPassword}`).toString('base64');

    // Log activity
    await ActivityService.logActivity({
      type: 'user_invite_resent',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      metadata: {
        resentAt: new Date(),
        originalInviteDate: user.invitedAt
      }
    });

    res.status(200).json({
      success: true,
      message: 'Invitation resent successfully',
      data: {
        inviteCode,
        inviteUrl: `https://${req.tenant.fullDomain}/accept-invite?code=${inviteCode}`,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role.name
        }
      }
    });

  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Cancel pending invitation
// @route   DELETE /api/onboarding/cancel-invite/:userId
// @access  Private (Tenant Admin)
const cancelInvite = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find and delete the pending invitation
    const user = await User.findOneAndDelete({
      _id: userId,
      tenantId: req.tenant._id,
      acceptedInviteAt: { $exists: false }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pending invitation not found'
      });
    }

    // Log activity
    await ActivityService.logActivity({
      type: 'user_invite_cancelled',
      entityId: user._id,
      entityType: 'User',
      entityName: user.name,
      tenantId: req.tenant._id,
      performedBy: req.user.id,
      metadata: {
        cancelledAt: new Date(),
        originalInviteDate: user.invitedAt
      }
    });

    res.status(200).json({
      success: true,
      message: 'Invitation cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get pending invitations for tenant
// @route   GET /api/onboarding/pending-invites
// @access  Private (Tenant Admin)
const getPendingInvites = async (req, res) => {
  try {
    const pendingInvites = await User.find({
      tenantId: req.tenant._id,
      acceptedInviteAt: { $exists: false },
      isActive: false
    })
    .populate('role', 'name')
    .populate('invitedBy', 'name email')
    .sort({ invitedAt: -1 });

    const invitesWithStatus = pendingInvites.map(invite => {
      const inviteAge = new Date() - new Date(invite.invitedAt);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      const isExpired = inviteAge > maxAge;
      const daysLeft = isExpired ? 0 : Math.ceil((maxAge - inviteAge) / (1000 * 60 * 60 * 24));

      return {
        id: invite._id,
        name: invite.name,
        email: invite.email,
        role: invite.role.name,
        tenantRole: invite.tenantRole,
        invitedBy: invite.invitedBy.name,
        invitedAt: invite.invitedAt,
        isExpired,
        daysLeft,
        status: isExpired ? 'expired' : 'pending'
      };
    });

    res.status(200).json({
      success: true,
      count: invitesWithStatus.length,
      data: invitesWithStatus
    });

  } catch (error) {
    console.error('Get pending invites error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Validate tenant setup data
// @route   POST /api/onboarding/validate-setup
// @access  Public
const validateTenantSetup = async (req, res) => {
  try {
    const { tenantName, slug, ownerEmail } = req.body;
    const errors = [];

    // Validate tenant name
    if (!tenantName || tenantName.trim().length < 2) {
      errors.push({
        field: 'tenantName',
        message: 'Organization name must be at least 2 characters long'
      });
    }

    // Validate slug
    if (!slug) {
      errors.push({
        field: 'slug',
        message: 'Subdomain is required'
      });
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      errors.push({
        field: 'slug',
        message: 'Subdomain can only contain lowercase letters, numbers, and hyphens'
      });
    } else if (slug.length < 3 || slug.length > 30) {
      errors.push({
        field: 'slug',
        message: 'Subdomain must be between 3 and 30 characters'
      });
    } else {
      // Check if slug is available
      const existingTenant = await Tenant.findOne({ slug: slug.toLowerCase() });
      if (existingTenant) {
        errors.push({
          field: 'slug',
          message: 'This subdomain is already taken'
        });
      }

      // Check reserved slugs
      const reservedSlugs = [
        'www', 'admin', 'api', 'mail', 'ftp', 'support', 'help',
        'blog', 'news', 'app', 'portal', 'dashboard', 'login',
        'signup', 'register', 'pricing', 'about', 'contact'
      ];
      if (reservedSlugs.includes(slug.toLowerCase())) {
        errors.push({
          field: 'slug',
          message: 'This subdomain is reserved'
        });
      }
    }

    // Validate email
    if (ownerEmail) {
      const existingUser = await User.findOne({ email: ownerEmail.toLowerCase() });
      if (existingUser) {
        errors.push({
          field: 'ownerEmail',
          message: 'This email is already registered'
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors found',
        errors
      });
    }

    res.status(200).json({
      success: true,
      message: 'All fields are valid',
      data: {
        tenantName: tenantName.trim(),
        slug: slug.toLowerCase(),
        domain: `${slug.toLowerCase()}.i-expense.ikftech.com`
      }
    });

  } catch (error) {
    console.error('Validate tenant setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = {
  checkInviteCode,
  acceptInvite,
  setupTenantAccount,
  completeOnboarding,
  resendInvite,
  cancelInvite,
  getPendingInvites,
  validateTenantSetup
};