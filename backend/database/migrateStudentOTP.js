/**
 * Non-destructive migration for student OTP verification.
 * Adds email column to students_master and creates student_otp_verification table.
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

async function migrateStudentOTP() {
  console.log('Starting student OTP migration...');

  const pool = new Pool(config);

  try {
    await pool.query('BEGIN');

    await pool.query(`
      ALTER TABLE students_master
      ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_students_master_email_unique
      ON students_master(email)
      WHERE email IS NOT NULL;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_otp_verification (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TIMESTAMPTZ NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_password_reset_otp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TIMESTAMPTZ NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_student_otp_email ON student_otp_verification(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_student_otp_verified ON student_otp_verification(verified)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_student_password_reset_otp_email ON student_password_reset_otp(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_student_password_reset_otp_verified ON student_password_reset_otp(verified)');

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
          WHERE tgname = 'update_student_otp_verification_updated_at'
        ) THEN
          CREATE TRIGGER update_student_otp_verification_updated_at
          BEFORE UPDATE ON student_otp_verification
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'update_student_password_reset_otp_updated_at'
        ) THEN
          CREATE TRIGGER update_student_password_reset_otp_updated_at
          BEFORE UPDATE ON student_password_reset_otp
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END
      $$;
    `);

    await pool.query('COMMIT');
    console.log('Student OTP migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Student OTP migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateStudentOTP();
