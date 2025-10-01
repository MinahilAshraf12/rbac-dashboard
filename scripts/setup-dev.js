// scripts/setup-dev.js
const mongoose = require('mongoose');
const { seedDatabase } = require('../controllers/seedController');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_dashboard'
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Error: ${error.message}`);
    process.exit(1);
  }
};

// Setup development environment
const setupDevelopment = async () => {
  try {
    console.log('🚀 Setting up development environment...');
    
    // Connect to database
    await connectDB();
    
    // Mock request and response objects for seedController
    const mockReq = {};
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Response Status: ${code}`);
          console.log('Response Data:', JSON.stringify(data, null, 2));
          return data;
        }
      })
    };
    
    // Run seeding
    await seedDatabase(mockReq, mockRes);
    
    console.log('\n✅ Development environment setup complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Start your backend: npm run dev');
    console.log('2. Start your frontend: npm start');
    console.log('3. Visit: http://localhost:3000');
    console.log('4. Login with: admin@demo.com / admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
};

// Run setup if called directly
if (require.main === module) {
  setupDevelopment();
}

module.exports = { setupDevelopment };