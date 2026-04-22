/**
 * Non-destructive migration for syllabus library support.
 * Creates enum, table, indexes, and update trigger if missing.
 */

const { Pool } = require('pg');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'exam_automation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function migrateSyllabusLibrary() {
  console.log('🔧 Starting syllabus library migration...');

  const pool = new Pool(config);

  try {
    await pool.query('BEGIN');

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'syllabus_upload_status') THEN
          CREATE TYPE syllabus_upload_status AS ENUM ('UPLOADED', 'PROCESSING', 'READY');
        END IF;
      END
      $$;
    `);

    // Add extracted_text column if missing
    await pool.query(`
      ALTER TABLE IF EXISTS syllabus_library
      ADD COLUMN IF NOT EXISTS extracted_text TEXT;
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_branch ON syllabus_library(branch)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_department ON syllabus_library(department)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_year ON syllabus_library(year)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_status ON syllabus_library(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_uploaded_by ON syllabus_library(uploaded_by)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_syllabus_created_at ON syllabus_library(created_at DESC)');

    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'update_syllabus_library_updated_at'
        ) THEN
          CREATE TRIGGER update_syllabus_library_updated_at
          BEFORE UPDATE ON syllabus_library
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END
      $$;
    `);

    await pool.query('COMMIT');

    console.log('✅ Syllabus library migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Syllabus library migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateSyllabusLibrary();
