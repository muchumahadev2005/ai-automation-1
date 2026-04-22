/**
 * Role Authorization Middleware
 * Checks if user has required role to access resource
 */

const ApiError = require('../utils/ApiError');

/**
 * Authorize based on role
 * @param  {...string} allowedRoles - Roles allowed to access
 * @returns {Function} Middleware function
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Access denied. Required role: ${allowedRoles.join(' or ')}`));
    }

    next();
  };
};

/**
 * Teacher only middleware
 */
const teacherOnly = authorize('TEACHER');

/**
 * Admin only middleware
 */
const adminOnly = authorize('ADMIN');

/**
 * Student only middleware
 */
const studentOnly = authorize('STUDENT');

/**
 * Check if student profile is completed
 */
const profileCompleted = (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (req.user.role === 'STUDENT' && !req.user.profileCompleted) {
    return next(ApiError.forbidden('Please complete your profile first'));
  }

  next();
};

module.exports = {
  authorize,
  teacherOnly,
  adminOnly,
  studentOnly,
  profileCompleted,
};
