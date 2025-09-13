// migrations/createCategoryIndexes.js
// Run this script to create optimal indexes for your existing database

const mongoose = require('mongoose');
require('dotenv').config();

const createCategoryIndexes = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const categoriesCollection = db.collection('categories');

    console.log('Creating indexes for categories collection...');

    // Drop existing indexes (except _id) to recreate them optimally
    try {
      const existingIndexes = await categoriesCollection.indexes();
      console.log('Existing indexes:', existingIndexes.map(idx => idx.name));
      
      // Drop all indexes except _id_
      for (const index of existingIndexes) {
        if (index.name !== '_id_') {
          try {
            await categoriesCollection.dropIndex(index.name);
            console.log(`Dropped index: ${index.name}`);
          } catch (err) {
            console.log(`Could not drop index ${index.name}:`, err.message);
          }
        }
      }
    } catch (error) {
      console.log('No existing indexes to drop');
    }

    // Create optimized indexes
    const indexes = [
      // Basic field indexes
      { key: { slug: 1 }, name: 'slug_1', unique: true },
      { key: { isActive: 1 }, name: 'isActive_1' },
      { key: { sortOrder: 1 }, name: 'sortOrder_1' },
      { key: { createdBy: 1 }, name: 'createdBy_1' },
      { key: { parentCategory: 1 }, name: 'parentCategory_1' },
      { key: { createdAt: -1 }, name: 'createdAt_-1' },
      
      // Compound indexes for common query patterns
      { key: { sortOrder: 1, createdAt: -1 }, name: 'sortOrder_1_createdAt_-1' },
      { key: { isActive: 1, sortOrder: 1 }, name: 'isActive_1_sortOrder_1' },
      { key: { createdBy: 1, isActive: 1 }, name: 'createdBy_1_isActive_1' },
      
      // Text search index
      { 
        key: { name: 'text', description: 'text', slug: 'text' }, 
        name: 'text_search_index',
        weights: { name: 10, slug: 5, description: 1 }
      }
    ];

    // Create indexes one by one
    for (const indexSpec of indexes) {
      try {
        const options = { 
          name: indexSpec.name,
          background: true, // Create in background to avoid blocking
          ...indexSpec
        };
        delete options.key;
        
        await categoriesCollection.createIndex(indexSpec.key, options);
        console.log(`✓ Created index: ${indexSpec.name}`);
      } catch (error) {
        console.error(`✗ Failed to create index ${indexSpec.name}:`, error.message);
      }
    }

    // Verify indexes
    const finalIndexes = await categoriesCollection.indexes();
    console.log('\nFinal indexes created:');
    finalIndexes.forEach(idx => {
      console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Test query performance
    console.log('\nTesting query performance...');
    
    const testQueries = [
      { isActive: true },
      { name: { $regex: 'test', $options: 'i' } },
      { isActive: true, sortOrder: { $gte: 0 } },
      { $text: { $search: 'category' } }
    ];

    for (const query of testQueries) {
      try {
        const start = Date.now();
        const result = await categoriesCollection.find(query).limit(10).toArray();
        const end = Date.now();
        console.log(`Query ${JSON.stringify(query)}: ${end - start}ms (${result.length} results)`);
      } catch (error) {
        console.log(`Query ${JSON.stringify(query)}: Error - ${error.message}`);
      }
    }

    console.log('\nIndex creation completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
createCategoryIndexes();