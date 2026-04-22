/**
 * Attempt Model
 * Handles all database operations for attempts table
 */

const db = require('../config/database');

const Attempt = {
  /**
   * Create a new attempt
   * @param {Object} attemptData - Attempt data
   * @returns {Promise<Object>} Created attempt
   */
  async create(attemptData) {
    const { examId, studentId, ipAddress, userAgent } = attemptData;

    // Get total marks for the exam
    const marksResult = await db.query(
      'SELECT COALESCE(SUM(marks), 0) as total_marks FROM questions WHERE exam_id = $1',
      [examId]
    );
    const totalMarks = parseInt(marksResult.rows[0].total_marks, 10);

    const result = await db.query(
      `INSERT INTO attempts (exam_id, student_id, total_marks, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [examId, studentId, totalMarks, ipAddress || null, userAgent || null]
    );

    return result.rows[0];
  },

  /**
   * Find attempt by ID
   * @param {string} id - Attempt UUID
   * @returns {Promise<Object|null>} Attempt or null
   */
  async findById(id) {
    const result = await db.query(
      `SELECT a.*, e.title as exam_title, e.duration_minutes, e.pass_percentage,
              u.name as student_name, u.email as student_email
       FROM attempts a
       JOIN exams e ON a.exam_id = e.id
       JOIN users u ON a.student_id = u.id
       WHERE a.id = $1`,
      [id]
    );

    return result.rows[0] || null;
  },

  /**
   * Find attempt by exam and student
   * @param {string} examId - Exam UUID
   * @param {string} studentId - Student UUID
   * @returns {Promise<Object|null>} Attempt or null
   */
  async findByExamAndStudent(examId, studentId) {
    const result = await db.query(
      `SELECT a.*, e.title as exam_title, e.duration_minutes
       FROM attempts a
       JOIN exams e ON a.exam_id = e.id
       WHERE a.exam_id = $1 AND a.student_id = $2`,
      [examId, studentId]
    );

    return result.rows[0] || null;
  },

  /**
   * Get all attempts by student
   * @param {string} studentId - Student UUID
   * @returns {Promise<Array>} List of attempts
   */
  async findByStudent(studentId) {
    const result = await db.query(
      `SELECT a.*, e.title as exam_title, e.branch, e.year, e.pass_percentage,
              u.name as creator_name
       FROM attempts a
       JOIN exams e ON a.exam_id = e.id
       JOIN users u ON e.created_by = u.id
       WHERE a.student_id = $1
       ORDER BY a.created_at DESC`,
      [studentId]
    );

    return result.rows;
  },

  /**
   * Get all attempts for an exam
   * @param {string} examId - Exam UUID
   * @returns {Promise<Array>} List of attempts
   */
  async findByExam(examId) {
    const result = await db.query(
      `SELECT a.*, u.name as student_name, u.email as student_email, u.register_number
       FROM attempts a
       JOIN users u ON a.student_id = u.id
       WHERE a.exam_id = $1
       ORDER BY a.submitted_at DESC NULLS LAST`,
      [examId]
    );

    return result.rows;
  },

  /**
   * Submit attempt
   * @param {string} id - Attempt UUID
   * @param {number} score - Total score
   * @param {number} totalMarks - Total possible marks
   * @returns {Promise<Object>} Updated attempt
   */
  async submit(id, score, totalMarks) {
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

    const result = await db.query(
      `UPDATE attempts 
       SET status = 'SUBMITTED', 
           submitted_at = CURRENT_TIMESTAMP,
           score = $1,
           percentage = $2
       WHERE id = $3
       RETURNING *`,
      [score, percentage.toFixed(2), id]
    );

    return result.rows[0];
  },

  /**
   * Check if student has already attempted exam
   * @param {string} examId - Exam UUID
   * @param {string} studentId - Student UUID
   * @returns {Promise<boolean>} True if already attempted
   */
  async hasAttempted(examId, studentId) {
    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM attempts WHERE exam_id = $1 AND student_id = $2)',
      [examId, studentId]
    );

    return result.rows[0].exists;
  },

  /**
   * Check if attempt is still valid (within time limit)
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<boolean>} True if valid
   */
  async isValid(attemptId) {
    const result = await db.query(
      `SELECT a.*, e.duration_minutes
       FROM attempts a
       JOIN exams e ON a.exam_id = e.id
       WHERE a.id = $1 AND a.status = 'IN_PROGRESS'`,
      [attemptId]
    );

    if (!result.rows[0]) {
      return false;
    }

    const attempt = result.rows[0];
    const startedAt = new Date(attempt.started_at);
    const now = new Date();
    const elapsedMinutes = (now - startedAt) / (1000 * 60);

    return elapsedMinutes <= attempt.duration_minutes;
  },

  /**
   * Get remaining time for attempt
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<number>} Remaining seconds
   */
  async getRemainingTime(attemptId) {
    const result = await db.query(
      `SELECT a.started_at, e.duration_minutes
       FROM attempts a
       JOIN exams e ON a.exam_id = e.id
       WHERE a.id = $1`,
      [attemptId]
    );

    if (!result.rows[0]) {
      return 0;
    }

    const { started_at, duration_minutes } = result.rows[0];
    const startedAt = new Date(started_at);
    const now = new Date();
    const elapsedSeconds = (now - startedAt) / 1000;
    const totalSeconds = duration_minutes * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

    return Math.floor(remainingSeconds);
  },
};

module.exports = Attempt;
