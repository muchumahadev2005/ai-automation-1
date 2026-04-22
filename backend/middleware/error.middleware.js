/**
 * Global Error Handler Middleware
 * Catches and formats all errors in a consistent way
 */

const config = require('../config');
const logger = require('../utils/logger');
const { sendError } = require('../utils/response');
const ApiError = require('../utils/ApiError');

/**
 * Convert various error types to ApiError
 */
const convertError = (err) => {
  // Already an ApiError
  if (err instanceof ApiError) {
    return err;
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        return ApiError.conflict('A record with this value already exists');
      case '23503': // Foreign key violation
        return ApiError.badRequest('Referenced record does not exist');
      case '23502': // Not null violation
        return ApiError.badRequest('Required field is missing');
      case '22P02': // Invalid text representation
        return ApiError.badRequest('Invalid input format');
      case '42P01': // Undefined table
        return ApiError.internal('Database table not found');
      default:
        break;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token has expired');
  }

  // Validation errors (express-validator)
  if (err.errors && Array.isArray(err.errors)) {
    return ApiError.badRequest('Validation failed');
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest('File too large');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest('Unexpected file field');
  }

  // Syntax errors (JSON parsing)
  if (err instanceof SyntaxError && err.status === 400) {
    return ApiError.badRequest('Invalid JSON');
  }

  // Default to internal server error
  return ApiError.internal(err.message || 'Internal Server Error');
};

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Convert error to ApiError
  const apiError = convertError(err);

  // Log error
  if (apiError.statusCode >= 500) {
    logger.error('Server Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.warn('Client Error:', {
      message: apiError.message,
      statusCode: apiError.statusCode,
      path: req.path,
      method: req.method,
    });
  }

  // Send error response
  const response = {
    success: false,
    status: apiError.statusCode,
    message: apiError.message,
  };

  // Include stack trace in development
  if (config.nodeEnv === 'development') {
    response.stack = err.stack;
    response.originalError = err.message;
  }

  // Include validation errors if present
  if (err.errors && Array.isArray(err.errors)) {
    response.errors = err.errors;
  }

  return res.status(apiError.statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`);
  next(error);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
