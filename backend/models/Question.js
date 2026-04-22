/**
 * Question Model
 * Handles all database operations for questions table
 */

const db = require('../config/database');

const Question = {
  /**
   * Create a new question
   * @param {Object} questionData - Question data
   * @returns {Promise<Object>} Created question
   */
  async create(questionData) {
    const { examId, questionText, optionA, optionB, optionC, optionD, correctOption, marks, explanation } = questionData;

    const result = await db.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [examId, questionText, optionA, optionB, optionC, optionD, correctOption, marks || 1, explanation || null]
    );

    return result.rows[0];
  },

  /**
   * Create multiple questions (bulk insert)
   * @param {string} examId - Exam UUID
   * @param {Array} questions - Array of question objects
   * @returns {Promise<Array>} Created questions
   */
  async createBulk(examId, questions) {
    if (!questions || questions.length === 0) {
      return [];
    }

    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const q of questions) {
      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
      );
      values.push(
        examId,
        q.questionText || q.question_text,
        q.optionA || q.option_a,
        q.optionB || q.option_b,
        q.optionC || q.option_c,
        q.optionD || q.option_d,
        q.correctOption || q.correct_option,
        q.marks || 1
      );
      paramIndex += 8;
    }

    const result = await db.query(
      `INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );

    return result.rows;
  },

  /**
   * Find question by ID
   * @param {string} id - Question UUID
   * @returns {Promise<Object|null>} Question or null
   */
  async findById(id) {
    const result = await db.query(
      'SELECT * FROM questions WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  },

  /**
   * Get all questions for an exam
   * @param {string} examId - Exam UUID
   * @param {boolean} includeAnswer - Include correct answer
   * @returns {Promise<Array>} List of questions
   */
  async findByExam(examId, includeAnswer = false) {
    const columns = includeAnswer
      ? '*'
      : 'id, exam_id, question_text, option_a, option_b, option_c, option_d, marks, created_at';

    const result = await db.query(
      `SELECT ${columns} FROM questions WHERE exam_id = $1 ORDER BY created_at`,
      [examId]
    );

    return result.rows;
  },

  /**
   * Update question
   * @param {string} id - Question UUID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated question
   */
  async update(id, updateData) {
    const { questionText, optionA, optionB, optionC, optionD, correctOption, marks, explanation } = updateData;

    const result = await db.query(
      `UPDATE questions 
       SET question_text = COALESCE($1, question_text),
           option_a = COALESCE($2, option_a),
           option_b = COALESCE($3, option_b),
           option_c = COALESCE($4, option_c),
           option_d = COALESCE($5, option_d),
           correct_option = COALESCE($6, correct_option),
           marks = COALESCE($7, marks),
           explanation = COALESCE($8, explanation)
       WHERE id = $9
       RETURNING *`,
      [questionText, optionA, optionB, optionC, optionD, correctOption, marks, explanation, id]
    );

    return result.rows[0];
  },

  /**
   * Delete question
   * @param {string} id - Question UUID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id) {
    const result = await db.query(
      'DELETE FROM questions WHERE id = $1 RETURNING id',
      [id]
    );

    return result.rowCount > 0;
  },

  /**
   * Delete all questions for an exam
   * @param {string} examId - Exam UUID
   * @returns {Promise<number>} Number of deleted questions
   */
  async deleteByExam(examId) {
    const result = await db.query(
      'DELETE FROM questions WHERE exam_id = $1',
      [examId]
    );

    return result.rowCount;
  },

  /**
   * Get question count for an exam
   * @param {string} examId - Exam UUID
   * @returns {Promise<number>} Question count
   */
  async countByExam(examId) {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM questions WHERE exam_id = $1',
      [examId]
    );

    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Question;
