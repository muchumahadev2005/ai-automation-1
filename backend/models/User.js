/**
 * User Model
 * Handles all database operations for users table
 */

const db = require('../config/database');

const User = {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async create(userData) {
    const { name, email, password, role, branch, year, registerNumber, employeeId, googleId } = userData;
    
    const result = await db.query(
      `INSERT INTO users (name, email, password, role, branch, year, register_number, employee_id, google_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, role, branch, year, register_number, employee_id, profile_completed, created_at`,
      [name, email, password, role, branch || null, year || null, registerNumber || null, employeeId || null, googleId || null]
    );
    
    return result.rows[0];
  },

  /**
   * Find user by ID
   * @param {string} id - User UUID
   * @returns {Promise<Object|null>} User or null
   */
  async findById(id) {
    const result = await db.query(
      `SELECT id, name, email, role, branch, year, register_number, employee_id, 
              profile_completed, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    
    return result.rows[0] || null;
  },

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User with password or null
   */
  async findByEmail(email) {
    const result = await db.query(
      `SELECT id, name, email, password, role, branch, year, register_number, 
              employee_id, profile_completed, is_active, created_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    
    return result.rows[0] || null;
  },

  /**
   * Find user by Google ID
   * @param {string} googleId - Google OAuth ID
   * @returns {Promise<Object|null>} User or null
   */
  async findByGoogleId(googleId) {
    const result = await db.query(
      `SELECT id, name, email, role, branch, year, register_number, 
              profile_completed, is_active, created_at
       FROM users WHERE google_id = $1`,
      [googleId]
    );
    
    return result.rows[0] || null;
  },

  /**
   * Update user profile
   * @param {string} id - User UUID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user
   */
  async update(id, updateData) {
    const allowedFields = ['name', 'branch', 'year', 'register_number', 'employee_id', 'profile_completed', 'is_active'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
      if (allowedFields.includes(dbField) && value !== undefined) {
        updates.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, email, role, branch, year, register_number, employee_id, profile_completed, is_active`,
      values
    );

    return result.rows[0];
  },

  /**
   * Complete student profile
   * @param {string} id - User UUID
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>} Updated user
   */
  async completeProfile(id, profileData) {
    const { name, branch, year, registerNumber } = profileData;
    
    const result = await db.query(
      `UPDATE users 
       SET name = $1, branch = $2, year = $3, register_number = $4, profile_completed = true
       WHERE id = $5
       RETURNING id, name, email, role, branch, year, register_number, profile_completed`,
      [name, branch, year, registerNumber, id]
    );
    
    return result.rows[0];
  },

  /**
   * Update password by email
   * @param {string} email - User email
   * @param {string} passwordHash - Hashed password
   * @returns {Promise<Object|null>} Updated user or null
   */
  async updatePasswordByEmail(email, passwordHash) {
    const result = await db.query(
      `UPDATE users
       SET password = $1, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(email) = LOWER($2)
       RETURNING id, name, email, role, is_active`,
      [passwordHash, email]
    );

    return result.rows[0] || null;
  },

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @returns {Promise<boolean>} True if exists
   */
  async emailExists(email) {
    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($1))',
      [email]
    );
    
    return result.rows[0].exists;
  },

  /**
   * Check if register number exists
   * @param {string} registerNumber - Register number to check
   * @returns {Promise<boolean>} True if exists
   */
  async registerNumberExists(registerNumber) {
    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM users WHERE register_number = $1)',
      [registerNumber]
    );
    
    return result.rows[0].exists;
  },

  /**
   * Get all students by branch and year
   * @param {string} branch - Branch name
   * @param {number} year - Year
   * @returns {Promise<Array>} List of students
   */
  async getStudentsByBranchAndYear(branch, year) {
    const result = await db.query(
      `SELECT id, name, email, register_number
       FROM users 
       WHERE role = 'STUDENT' AND branch = $1 AND year = $2 AND is_active = true
       ORDER BY name`,
      [branch, year]
    );
    
    return result.rows;
  },
};

module.exports = User;
