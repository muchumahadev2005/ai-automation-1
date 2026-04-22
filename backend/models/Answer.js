/**
 * Answer Model
 * Handles all database operations for answers table
 */

const db = require('../config/database');

const Answer = {
  /**
   * Create or update an answer
   * @param {Object} answerData - Answer data
   * @returns {Promise<Object>} Created/updated answer
   */
  async upsert(answerData) {
    const { attemptId, questionId, selectedOption } = answerData;

    // Get correct answer
    const questionResult = await db.query(
      'SELECT correct_option, marks FROM questions WHERE id = $1',
      [questionId]
    );

    if (!questionResult.rows[0]) {
      throw new Error('Question not found');
    }

    const { correct_option, marks } = questionResult.rows[0];
    const isCorrect = selectedOption === correct_option;

    const result = await db.query(
      `INSERT INTO answers (attempt_id, question_id, selected_option, is_correct)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attempt_id, question_id) 
       DO UPDATE SET selected_option = $3, is_correct = $4
       RETURNING *`,
      [attemptId, questionId, selectedOption, isCorrect]
    );

    return { ...result.rows[0], marks };
  },

  /**
   * Save multiple answers at once
   * @param {string} attemptId - Attempt UUID
   * @param {Array} answers - Array of {questionId, selectedOption}
   * @returns {Promise<Array>} Saved answers
   */
  async saveMany(attemptId, answers) {
    const results = [];

    for (const answer of answers) {
      const result = await this.upsert({
        attemptId,
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
      });
      results.push(result);
    }

    return results;
  },

  /**
   * Get all answers for an attempt
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<Array>} List of answers
   */
  async findByAttempt(attemptId) {
    const result = await db.query(
      `SELECT a.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, 
              q.correct_option, q.marks, q.explanation
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.attempt_id = $1
       ORDER BY q.created_at`,
      [attemptId]
    );

    return result.rows;
  },

  /**
   * Get answer for specific question in attempt
   * @param {string} attemptId - Attempt UUID
   * @param {string} questionId - Question UUID
   * @returns {Promise<Object|null>} Answer or null
   */
  async findByAttemptAndQuestion(attemptId, questionId) {
    const result = await db.query(
      'SELECT * FROM answers WHERE attempt_id = $1 AND question_id = $2',
      [attemptId, questionId]
    );

    return result.rows[0] || null;
  },

  /**
   * Calculate score for an attempt
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<Object>} Score details
   */
  async calculateScore(attemptId) {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total_questions,
         COUNT(CASE WHEN a.is_correct THEN 1 END) as correct_answers,
         SUM(CASE WHEN a.is_correct THEN q.marks ELSE 0 END) as score,
         SUM(q.marks) as total_marks
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.attempt_id = $1`,
      [attemptId]
    );

    const data = result.rows[0];
    const score = parseInt(data.score, 10) || 0;
    const totalMarks = parseInt(data.total_marks, 10) || 0;
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

    return {
      totalQuestions: parseInt(data.total_questions, 10) || 0,
      correctAnswers: parseInt(data.correct_answers, 10) || 0,
      score,
      totalMarks,
      percentage: parseFloat(percentage.toFixed(2)),
    };
  },

  /**
   * Get answered question IDs for an attempt
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<Array>} List of question IDs
   */
  async getAnsweredQuestionIds(attemptId) {
    const result = await db.query(
      'SELECT question_id FROM answers WHERE attempt_id = $1',
      [attemptId]
    );

    return result.rows.map(row => row.question_id);
  },

  /**
   * Count answered questions for an attempt
   * @param {string} attemptId - Attempt UUID
   * @returns {Promise<number>} Count of answered questions
   */
  async countByAttempt(attemptId) {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM answers WHERE attempt_id = $1',
      [attemptId]
    );

    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = Answer;
