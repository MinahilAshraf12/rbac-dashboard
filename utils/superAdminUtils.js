const SuperAdmin = require('../models/SuperAdmin');

const createDefaultSuperAdmin = async () => {
  try {
    const existingAdmin = await SuperAdmin.findOne({ email: 'admin@i-expense.ikftech.com' });
    
    if (!existingAdmin) {
      const superAdmin = await SuperAdmin.create({
        name: 'System Administrator',
        email: 'admin@i-expense.ikftech.com',
        password: 'SuperAdmin123!',
        permissions: [
          'manage_tenants',
          'manage_subscriptions', 
          'manage_plans',
          'view_analytics',
          'manage_system_settings',
          'manage_super_admins',
          'view_billing',
          'manage_domains',
          'access_support',
          'manage_integrations'
        ]
      });
      
      console.log('✅ Default Super Admin created');
      return superAdmin;
    }
    
    return existingAdmin;
  } catch (error) {
    console.error('❌ Error creating super admin:', error);
    return null;
  }
};

module.exports = { createDefaultSuperAdmin };