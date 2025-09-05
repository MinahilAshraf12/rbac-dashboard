const fs = require('fs').promises;
const path = require('path');

const createDirectories = async () => {
  const directories = [
    'uploads',
    'uploads/expenses',
    'config',
    'controllers',
    'middleware', 
    'models',
    'routes',
    'utils',
    'scripts'
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`Error creating directory ${dir}:`, error.message);
      }
    }
  }
};

const createEnvFile = async () => {
  const envContent = `# Database Configuration
MONGODB_URI=mongodb://localhost:27017/admin_dashboard

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=30d

# Server Configuration
NODE_ENV=development
PORT=5000

# File Upload Configuration (Optional)
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpeg,jpg,png,pdf,doc,docx,txt,xlsx,xls`;

  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envExists = await fs.access(envPath).then(() => true).catch(() => false);
    
    if (!envExists) {
      await fs.writeFile(envPath, envContent);
      console.log('✓ Created .env file');
    } else {
      console.log('✓ .env file already exists');
    }
  } catch (error) {
    console.error('Error creating .env file:', error.message);
  }
};

const main = async () => {
  console.log('🚀 Setting up project structure...\n');
  
  await createDirectories();
  await createEnvFile();
  
  console.log('\n✅ Setup complete!');
  console.log('\nNext steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Update .env file with your configurations');
  console.log('3. Start MongoDB service');
  console.log('4. Run: npm run dev');
  console.log('5. Seed database: visit http://localhost:5000/api/seed');
};

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createDirectories, createEnvFile };