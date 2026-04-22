/**
 * Non-destructive migration for system settings persistence.
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

async function migrateSystemSettings() {
  console.log('🔧 Starting system settings migration...');

  const pool = new Pool(config);

  try {
    await pool.query('BEGIN');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        smtp_host VARCHAR(255) NOT NULL DEFAULT '',
        smtp_port INTEGER NOT NULL DEFAULT 587 CHECK (smtp_port > 0 AND smtp_port <= 65535),
        smtp_user VARCHAR(255) NOT NULL DEFAULT '',
        smtp_password TEXT NOT NULL DEFAULT '',
        gemini_api_key TEXT NOT NULL DEFAULT '',
        ollama_url VARCHAR(500) NOT NULL DEFAULT 'http://localhost:11434',
        default_question_count INTEGER NOT NULL DEFAULT 20 CHECK (default_question_count > 0 AND default_question_count <= 200),
        default_difficulty VARCHAR(20) NOT NULL DEFAULT 'Medium' CHECK (default_difficulty IN ('Easy', 'Medium', 'Hard')),
        email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON system_settings(updated_by)');

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
          WHERE tgname = 'update_system_settings_updated_at'
        ) THEN
          CREATE TRIGGER update_system_settings_updated_at
          BEFORE UPDATE ON system_settings
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END
      $$;
    `);

    await pool.query(`
      INSERT INTO system_settings (
        id,
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        gemini_api_key,
        ollama_url,
        default_question_count,
        default_difficulty,
        email_notifications_enabled,
        updated_by
      )
      VALUES (1, '', 587, '', '', '', 'http://localhost:11434', 20, 'Medium', TRUE, NULL)
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query('COMMIT');

    console.log('✅ System settings migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ System settings migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateSystemSettings();
