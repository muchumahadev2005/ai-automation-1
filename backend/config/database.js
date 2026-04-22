/**
 * PostgreSQL Database Configuration
 * Handles connection pooling, queries, and transactions
 */

const { Pool } = require('pg');
require('dotenv').config();

const logger = require('../utils/logger');

// ===========================================
// Create PostgreSQL Pool
// ===========================================

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Pool settings
  max: 20, // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ===========================================
// Test Connection
// ===========================================

pool.connect()
  .then(client => {
    logger.info("✅ PostgreSQL database connected successfully");
    client.release();
  })
  .catch(err => {
    logger.error("❌ PostgreSQL connection error:", err);
  });

// ===========================================
// Pool Events
// ===========================================

pool.on('connect', () => {
  logger.info('New database client connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  process.exit(1);
});

// ===========================================
// Query Helper
// ===========================================

const query = async (text, params) => {
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug(`Query executed in ${duration}ms`);

    return result;

  } catch (error) {

    logger.error('Database query error:', {
      query: text,
      error: error.message
    });

    throw error;
  }
};

// ===========================================
// Get Client (For Transactions)
// ===========================================

const getClient = async () => {
  const client = await pool.connect();
  return client;
};

// ===========================================
// Transaction Helper
// ===========================================

const transaction = async (callback) => {

  const client = await pool.connect();

  try {

    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');

    return result;

  } catch (error) {

    await client.query('ROLLBACK');

    logger.error('Transaction failed:', error);

    throw error;

  } finally {

    client.release();

  }
};

// ===========================================
// Export
// ===========================================

module.exports = {
  pool,
  query,
  getClient,
  transaction
};