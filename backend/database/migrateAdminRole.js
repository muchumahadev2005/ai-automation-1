/**
 * Non-destructive migration to add ADMIN role to existing databases
 * and ensure a default admin account exists.
 */

const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'exam_automation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function migrateAdminRole() {
  console.log('🔧 Starting ADMIN role migration...');

  const pool = new Pool(config);

  try {
    const enumValuesResult = await pool.query(
      `SELECT enumlabel
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'user_role'`
    );

    const enumValues = new Set(enumValuesResult.rows.map((row) => row.enumlabel));

    if (!enumValues.has('ADMIN')) {
      await pool.query("ALTER TYPE user_role ADD VALUE 'ADMIN'");
      console.log('✅ Added ADMIN to user_role enum');
    } else {
      console.log('ℹ️ ADMIN already exists in user_role enum');
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminName = process.env.ADMIN_NAME || 'Platform Admin';
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await pool.query(
      `INSERT INTO users (name, email, password, role, profile_completed, is_active)
       VALUES ($1, $2, $3, 'ADMIN', true, true)
       ON CONFLICT (email)
       DO UPDATE
       SET name = EXCLUDED.name,
           password = EXCLUDED.password,
           role = EXCLUDED.role,
           profile_completed = EXCLUDED.profile_completed,
           is_active = true,
           updated_at = CURRENT_TIMESTAMP`,
      [adminName, adminEmail, passwordHash]
    );

    console.log(`✅ Admin account ready: ${adminEmail} / ${adminPassword}`);
    console.log('🎉 ADMIN migration completed successfully');
  } catch (error) {
    console.error('❌ ADMIN migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrateAdminRole();
