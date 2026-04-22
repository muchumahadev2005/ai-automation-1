/**
 * Controllers Index
 * Export all controllers from a single entry point
 */

const authController = require('./auth.controller');
const examController = require('./exam.controller');
const questionController = require('./question.controller');
const attemptController = require('./attempt.controller');
const resultController = require('./result.controller');
const adminController = require('./admin.controller');
const teacherController = require('./teacher.controller');

module.exports = {
  authController,
  examController,
  questionController,
  attemptController,
  resultController,
  adminController,
  teacherController,
};
