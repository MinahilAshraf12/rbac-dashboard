const mongoose = require('mongoose');
require('dotenv').config();

async function fixAllIndexes() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
    
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found');
      process.exit(1);
    }
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database:', mongoose.connection.name, '\n');
    
    const db = mongoose.connection.db;
    
    // ==================== FIX CATEGORIES ====================
    console.log('📁 Fixing categories collection...');
    const categories = db.collection('categories');
    
    // List current indexes
    const catIndexes = await categories.indexes();
    console.log('  Current indexes:', catIndexes.map(i => i.name).join(', '));
    
    // Drop the problematic index
    try {
      await categories.dropIndex('tenantId_1_slug_1');
      console.log('  ✅ Dropped tenantId_1_slug_1 index');
    } catch (err) {
      console.log('  ℹ️  tenantId_1_slug_1 not found');
    }
    
    // Create new sparse index
    await categories.createIndex(
      { tenantId: 1, slug: 1 }, 
      { unique: true, sparse: true }  // SPARSE allows multiple nulls
    );
    console.log('  ✅ Created sparse compound index (tenantId + slug)');
    
    // ==================== VERIFY ====================
    console.log('\n📊 Verifying...');
    const catCount = await categories.countDocuments();
    console.log(`  Categories: ${catCount} documents`);
    
    const newIndexes = await categories.indexes();
    const slugIndex = newIndexes.find(i => i.name === 'tenantId_1_slug_1');
    console.log('  Slug index sparse:', slugIndex?.sparse || false);
    
    await mongoose.disconnect();
    console.log('\n✅ Index fixed successfully!');
    console.log('💡 Restart backend and try creating tenant again.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

fixAllIndexes();