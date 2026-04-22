/**
 * Validation Middleware
 * Request validation using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Handle validation errors
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));

    const error = ApiError.badRequest('Validation failed');
    error.errors = formattedErrors;
    return next(error);
  }

  next();
};

// ============================================
// Auth Validation Rules
// ============================================

const registerRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['TEACHER', 'STUDENT']).withMessage('Role must be TEACHER or STUDENT'),
  body('branch')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Branch must be less than 50 characters'),
  body('year')
    .optional()
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('registerNumber')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Register number must be less than 50 characters'),
  body('employeeId')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Employee ID must be less than 50 characters'),
];

const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const forgotPasswordSendOtpRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
];

const forgotPasswordVerifyRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
    .isNumeric().withMessage('OTP must contain only digits'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword')
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

const completeProfileRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('branch')
    .trim()
    .notEmpty().withMessage('Branch is required')
    .isIn(['CSD', 'CSE', 'AIDS', 'IT', 'ECE', 'EEE']).withMessage('Invalid branch'),
  body('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('registerNumber')
    .trim()
    .notEmpty().withMessage('Register number is required')
    .isLength({ max: 50 }).withMessage('Register number must be less than 50 characters'),
];

const adminUpdateStudentRules = [
  body('registrationNumber')
    .optional()
    .trim()
    .notEmpty().withMessage('Registration number cannot be empty')
    .isLength({ max: 50 }).withMessage('Registration number must be less than 50 characters'),
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: 100 }).withMessage('Name must be less than 100 characters'),
  body('branch')
    .optional()
    .trim()
    .notEmpty().withMessage('Branch cannot be empty')
    .isLength({ max: 50 }).withMessage('Branch must be less than 50 characters'),
  body('department')
    .optional()
    .trim()
    .notEmpty().withMessage('Department cannot be empty')
    .isLength({ max: 100 }).withMessage('Department must be less than 100 characters'),
];

const teacherInviteRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Teacher name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Teacher name must be 2-100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Teacher email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
];

const teacherInviteCompleteRules = [
  body('token')
    .trim()
    .notEmpty().withMessage('Invitation token is required')
    .isLength({ min: 16 }).withMessage('Invalid invitation token'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword')
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

// ============================================
// Exam Validation Rules
// ============================================

const createExamRules = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('branch')
    .trim()
    .notEmpty().withMessage('Branch is required')
    .isIn(['CSD', 'CSE', 'AIDS', 'IT', 'ECE', 'EEE']).withMessage('Invalid branch'),
  body('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('durationMinutes')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1, max: 300 }).withMessage('Duration must be 1-300 minutes'),
  body('passPercentage')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Pass percentage must be 0-100'),
  body('randomizeQuestions')
    .optional()
    .isBoolean().withMessage('Randomize must be a boolean'),
];

const updateExamRules = [
  param('examId')
    .isUUID().withMessage('Invalid exam ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters'),
  body('description')
    .optional()
    .trim(),
  body('branch')
    .optional()
    .trim()
    .isIn(['CSD', 'CSE', 'AIDS', 'IT', 'ECE', 'EEE']).withMessage('Invalid branch'),
  body('year')
    .optional()
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('durationMinutes')
    .optional()
    .isInt({ min: 1, max: 300 }).withMessage('Duration must be 1-300 minutes'),
];

// ============================================
// Question Validation Rules
// ============================================

const createQuestionRules = [
  body('examId')
    .notEmpty().withMessage('Exam ID is required')
    .isUUID().withMessage('Invalid exam ID'),
  body('questionText')
    .trim()
    .notEmpty().withMessage('Question text is required')
    .isLength({ max: 2000 }).withMessage('Question must be less than 2000 characters'),
  body('optionA')
    .trim()
    .notEmpty().withMessage('Option A is required')
    .isLength({ max: 500 }).withMessage('Option must be less than 500 characters'),
  body('optionB')
    .trim()
    .notEmpty().withMessage('Option B is required')
    .isLength({ max: 500 }).withMessage('Option must be less than 500 characters'),
  body('optionC')
    .trim()
    .notEmpty().withMessage('Option C is required')
    .isLength({ max: 500 }).withMessage('Option must be less than 500 characters'),
  body('optionD')
    .trim()
    .notEmpty().withMessage('Option D is required')
    .isLength({ max: 500 }).withMessage('Option must be less than 500 characters'),
  body('correctOption')
    .trim()
    .notEmpty().withMessage('Correct option is required')
    .isIn(['A', 'B', 'C', 'D']).withMessage('Correct option must be A, B, C, or D'),
  body('marks')
    .optional()
    .isInt({ min: 1 }).withMessage('Marks must be at least 1'),
];

// ============================================
// Attempt/Answer Validation Rules
// ============================================

const submitAnswerRules = [
  body('attemptId')
    .notEmpty().withMessage('Attempt ID is required')
    .isUUID().withMessage('Invalid attempt ID'),
  body('questionId')
    .notEmpty().withMessage('Question ID is required')
    .isUUID().withMessage('Invalid question ID'),
  body('selectedOption')
    .trim()
    .notEmpty().withMessage('Selected option is required')
    .isIn(['A', 'B', 'C', 'D']).withMessage('Option must be A, B, C, or D'),
];

const submitExamRules = [
  param('attemptId')
    .isUUID().withMessage('Invalid attempt ID'),
  body('answers')
    .isArray().withMessage('Answers must be an array'),
  body('answers.*.questionId')
    .isUUID().withMessage('Invalid question ID'),
  body('answers.*.selectedOption')
    .isIn(['A', 'B', 'C', 'D']).withMessage('Option must be A, B, C, or D'),
];

// ============================================
// Common Validation Rules
// ============================================

const uuidParam = (paramName) => [
  param(paramName)
    .isUUID().withMessage(`Invalid ${paramName}`),
];

const paginationRules = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

module.exports = {
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
};
