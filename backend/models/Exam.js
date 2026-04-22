/**
 * Exam Model
 * Handles all database operations for exams table
 */

const db = require('../config/database');

const Exam = {
  /**
   * Create a new exam
   * @param {Object} examData - Exam data
   * @returns {Promise<Object>} Created exam
   */
  async create(examData) {
    const {
      title,
      description,
      branch,
      year,
      durationMinutes,
      passPercentage,
      randomizeQuestions,
      createdBy,
    } = examData;

    const result = await db.query(
      `INSERT INTO exams (title, description, branch, year, duration_minutes, pass_percentage, randomize_questions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, description || null, branch, year, durationMinutes, passPercentage || 40, randomizeQuestions || false, createdBy]
    );

    return result.rows[0];
  },

  /**
   * Find exam by ID
   * @param {string} id - Exam UUID
   * @returns {Promise<Object|null>} Exam or null
   */
  async findById(id) {
    const result = await db.query(
      `SELECT e.*, u.name as creator_name
       FROM exams e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  },

  /**
   * Get all exams by teacher
   * @param {string} teacherId - Teacher UUID
   * @returns {Promise<Array>} List of exams
   */
  async findByTeacher(teacherId) {
    const result = await db.query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM attempts a WHERE a.exam_id = e.id) as attempt_count
       FROM exams e
       WHERE e.created_by = $1
       ORDER BY e.created_at DESC`,
      [teacherId]
    );

    return result.rows;
  },

  /**
   * Get available exams for student (matching branch and year)
   * @param {string} branch - Student branch
   * @param {number} year - Student year
   * @param {string} studentId - Student UUID (to check if already attempted)
   * @returns {Promise<Array>} List of available exams
   */
  async findAvailableForStudent(branch, year, studentId) {
    const result = await db.query(
      `SELECT e.*, 
              u.name as creator_name,
              (SELECT a.id FROM attempts a WHERE a.exam_id = e.id AND a.student_id = $3) as attempt_id,
              (SELECT a.status FROM attempts a WHERE a.exam_id = e.id AND a.student_id = $3) as attempt_status
       FROM exams e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.branch = $1 
         AND e.year = $2 
         AND e.status IN ('PUBLISHED', 'ACTIVE')
       ORDER BY e.created_at DESC`,
      [branch, year, studentId]
    );

    return result.rows;
  },

  /**
   * Update exam
   * @param {string} id - Exam UUID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated exam
   */
  async update(id, updateData) {
    const allowedFields = [
      'title', 'description', 'branch', 'year', 'duration_minutes',
      'pass_percentage', 'randomize_questions', 'status', 'syllabus_path',
      'published_at', 'start_time', 'end_time'
    ];
    
    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Map camelCase to snake_case
    const fieldMap = {
      durationMinutes: 'duration_minutes',
      passPercentage: 'pass_percentage',
      randomizeQuestions: 'randomize_questions',
      syllabusPath: 'syllabus_path',
      publishedAt: 'published_at',
      startTime: 'start_time',
      endTime: 'end_time',
    };

    for (const [key, value] of Object.entries(updateData)) {
      const dbField = fieldMap[key] || key;
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
      `UPDATE exams SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  },

  /**
   * Update exam status
   * @param {string} id - Exam UUID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated exam
   */
  async updateStatus(id, status) {
    const result = await db.query(
      `UPDATE exams SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    return result.rows[0];
  },

  /**
   * Delete exam
   * @param {string} id - Exam UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id) {
    const result = await db.query(
      'DELETE FROM exams WHERE id = $1 RETURNING id',
      [id]
    );

    return result.rowCount > 0;
  },

  /**
   * Check if user is exam owner
   * @param {string} examId - Exam UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} True if owner
   */
  async isOwner(examId, userId) {
    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1 AND created_by = $2)',
      [examId, userId]
    );

    return result.rows[0].exists;
  },

  /**
   * Get exam statistics
   * @param {string} examId - Exam UUID
   * @returns {Promise<Object>} Exam statistics
   */
  async getStatistics(examId) {
    const result = await db.query(
      `SELECT 
         COUNT(a.id) as total_attempts,
         COUNT(CASE WHEN a.status = 'SUBMITTED' THEN 1 END) as completed_attempts,
         AVG(CASE WHEN a.status = 'SUBMITTED' THEN a.percentage END) as average_score,
         MAX(CASE WHEN a.status = 'SUBMITTED' THEN a.percentage END) as highest_score,
         MIN(CASE WHEN a.status = 'SUBMITTED' THEN a.percentage END) as lowest_score,
         COUNT(CASE WHEN a.status = 'SUBMITTED' AND a.percentage >= e.pass_percentage THEN 1 END) as passed_count
       FROM exams e
       LEFT JOIN attempts a ON a.exam_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [examId]
    );

    return result.rows[0] || {
      total_attempts: 0,
      completed_attempts: 0,
      average_score: 0,
      highest_score: 0,
      lowest_score: 0,
      passed_count: 0,
    };
  },
};

module.exports = Exam;
