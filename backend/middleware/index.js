/**
 * Middleware Index
 * Export all middleware from a single entry point
 */

const { authenticate, optionalAuth, generateTokens, refreshAccessToken } = require('./auth.middleware');
const { authorize, teacherOnly, adminOnly, studentOnly, profileCompleted } = require('./role.middleware');
const { errorHandler, notFoundHandler } = require('./error.middleware');
const { 
  handleValidation,
  registerRules,
  loginRules,
  forgotPasswordSendOtpRules,
  forgotPasswordVerifyRules,
  completeProfileRules,
  adminUpdateStudentRules,
  teacherInviteRules,
  teacherInviteCompleteRules,
  createExamRules,
  updateExamRules,
  createQuestionRules,
  submitAnswerRules,
  submitExamRules,
  uuidParam,
  paginationRules,
} = require('./validation.middleware');
const { uploadSyllabus, uploadCsv, uploadFile, deleteFile } = require('./upload.middleware');
const { apiLimiter, authLimiter, aiLimiter } = require('./rateLimit.middleware');

module.exports = {
  // Auth
  authenticate,
  optionalAuth,
  generateTokens,
  refreshAccessToken,

  // Role
  authorize,
  teacherOnly,
  adminOnly,
  studentOnly,
  profileCompleted,

  // Error
  errorHandler,
  notFoundHandler,

  // Validation
  handleValidation,
  registerRules,
  loginRules,
  forgotPasswordSendOtpRules,
  forgotPasswordVerifyRules,
  completeProfileRules,
  adminUpdateStudentRules,
  teacherInviteRules,
  teacherInviteCompleteRules,
  createExamRules,
  updateExamRules,
  createQuestionRules,
  submitAnswerRules,
  submitExamRules,
  uuidParam,
  paginationRules,

  // Upload
  uploadSyllabus,
  uploadCsv,
  uploadFile,
  deleteFile,

  // Rate Limiting
  apiLimiter,
  authLimiter,
  aiLimiter,
};
