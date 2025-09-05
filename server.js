require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/database');
const { createUploadsDir } = require('./utils/fileUtils');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const seedRoutes = require('./routes/seedRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Routes with validation
if (authRoutes && typeof authRoutes === 'function') {
  app.use('/api/auth', authRoutes);
} else {
  console.error('Auth routes not loaded properly');
}

if (userRoutes && typeof userRoutes === 'function') {
  app.use('/api/users', userRoutes);
} else {
  console.error('User routes not loaded properly');
}

if (roleRoutes && typeof roleRoutes === 'function') {
  app.use('/api/roles', roleRoutes);
} else {
  console.error('Role routes not loaded properly');
}

if (categoryRoutes && typeof categoryRoutes === 'function') {
  app.use('/api/categories', categoryRoutes);
} else {
  console.error('Category routes not loaded properly');
}

if (expenseRoutes && typeof expenseRoutes === 'function') {
  app.use('/api/expenses', expenseRoutes);
} else {
  console.error('Expense routes not loaded properly');
}

if (seedRoutes && typeof seedRoutes === 'function') {
  app.use('/api', seedRoutes);
} else {
  console.error('Seed routes not loaded properly');
}

// Error handling middleware (must be last)
if (errorHandler && typeof errorHandler === 'function') {
  app.use(errorHandler);
}

if (notFoundHandler && typeof notFoundHandler === 'function') {
  app.use(notFoundHandler);
}

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await createUploadsDir();
    await connectDB();
    
    app.listen(PORT, () => {
      console.log('\nMERN Admin Dashboard Backend');
      console.log('============================');
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('MongoDB Connected');
      console.log('File uploads enabled');
      console.log('\nServer ready for connections!');
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