/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting request frequency
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sendError } = require('../utils/response');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 minutes default
  max: config.rateLimit.maxRequests, // 100 requests default
  message: {
    success: false,
    status: 429,
    message: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendError(res, 429, options.message.message);
  },
});

/**
 * Stricter rate limiter for auth routes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    success: false,
    status: 429,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendError(res, 429, options.message.message);
  },
});

/**
 * Rate limiter for AI generation (expensive operation)
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: {
    success: false,
    status: 429,
    message: 'AI generation limit reached, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    sendError(res, 429, options.message.message);
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
};
