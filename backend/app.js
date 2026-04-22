/**
 * Express Application Configuration
 * Sets up middleware, routes, and error handling
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler, apiLimiter } = require('./middleware');
const logger = require('./utils/logger');

// Create Express app
const app = express();

// ===========================================
// Security Middleware
// ===========================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ===========================================
// Request Parsing
// ===========================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
// Logging
// ===========================================

// HTTP request logging
const morganFormat = config.nodeEnv === 'development' ? 'dev' : 'combined';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.http(message.trim()),
  },
}));

// ===========================================
// Static Files
// ===========================================

// Serve uploaded files (protected in production)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===========================================
// Rate Limiting
// ===========================================

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// ===========================================
// API Routes
// ===========================================

// Mount all routes under /api
app.use('/api', routes);

// ===========================================
// Root Route
// ===========================================

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Exam Automation API',
    version: '1.0.0',
    documentation: '/api/health',
  });
});

// ===========================================
// Error Handling
// ===========================================

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;
