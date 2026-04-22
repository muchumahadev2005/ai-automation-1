/**
 * Database Initialization Script
 * Runs the schema SQL to set up the database
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'exam_automation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function initDatabase() {
  console.log('🚀 Starting database initialization...');
  console.log(`📦 Connecting to database: ${config.database}@${config.host}:${config.port}`);

  const pool = new Pool(config);

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Schema file loaded successfully');

    // Execute schema
    await pool.query(schema);

    console.log('✅ Database schema created successfully!');
    console.log('');
    console.log('📋 Created tables:');
    console.log('   - users');
    console.log('   - system_settings');
    console.log('   - students_master');
    console.log('   - teacher_invitations');
    console.log('   - exams');
    console.log('   - syllabus_library');
    console.log('   - questions');
    console.log('   - attempts');
    console.log('   - answers');
    console.log('');
    console.log('🔧 Created indexes and triggers');
    console.log('');
    console.log('🎉 Database initialization complete!');

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
