/**
 * Auth Controller
 * Handles user authentication and registration
 */

const bcrypt = require('bcrypt');
const User = require('../models/User');
const { generateTokens, refreshAccessToken } = require('../middleware/auth.middleware');
const { sendSuccess, sendError, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = catchAsync(async (req, res) => {
  const { name, email, password, role, branch, year, registerNumber, employeeId } = req.body;

  // Default role to STUDENT for public registration while
  // still allowing explicit TEACHER creation via internal tools.
  const userRole = role || 'STUDENT';

  if (!name || !email || !password) {
    throw ApiError.badRequest('Name, email and password are required');
  }

  // Check if email exists
  if (await User.emailExists(email)) {
    throw ApiError.conflict('Email already registered');
  }

  // Check register number for students
  if (userRole === 'STUDENT' && registerNumber) {
    if (await User.registerNumberExists(registerNumber)) {
      throw ApiError.conflict('Register number already exists');
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user (students will have branch/register_number, teachers may not)
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: userRole,
    branch: userRole === 'STUDENT' ? branch : null,
    year: userRole === 'STUDENT' ? year : null,
    registerNumber: userRole === 'STUDENT' ? registerNumber : null,
    employeeId: userRole === 'TEACHER' ? employeeId : null,
  });

  // Generate tokens
  const tokens = generateTokens(user);

  logger.info('New user registered', { email, role });

  sendSuccess(res, HttpStatus.CREATED, 'Registration successful', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
    },
    ...tokens,
  });
});

/**
 * Login user
 * POST /api/auth/login
 */
const login = catchAsync(async (req, res) => {
  const { email, password, role } = req.body;

  // Find user by email
  const user = await User.findByEmail(email);

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // If a role is provided (e.g. from separate student/teacher forms),
  // ensure that the account's role matches what the client expects.
  // This prevents logging in a TEACHER account via the student form
  // (or vice versa) and keeps the UX consistent.
  if (role && user.role !== role) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.is_active) {
    throw ApiError.unauthorized('Account is deactivated');
  }

  // Check password
  if (!user.password) {
    throw ApiError.unauthorized('Please login with Google');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);

  if (!isValidPassword) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Generate tokens
  const tokens = generateTokens(user);

  logger.info('User logged in', { email, role: user.role });

  sendSuccess(res, HttpStatus.OK, 'Login successful', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
    },
    ...tokens,
  });
});

/**
 * Google OAuth login/register
 * POST /api/auth/google
 */
const googleAuth = catchAsync(async (req, res) => {
  const { googleId, email, name } = req.body;

  if (!googleId || !email) {
    throw ApiError.badRequest('Google ID and email are required');
  }

  // Check if user exists with Google ID
  let user = await User.findByGoogleId(googleId);

  if (!user) {
    // Check if email exists
    user = await User.findByEmail(email);

    if (user) {
      // Link Google ID to existing account
      await User.update(user.id, { googleId });
    } else {
      // Create new student account
      user = await User.create({
        name,
        email,
        googleId,
        role: 'STUDENT',
      });

      logger.info('New student registered via Google', { email });
    }
  }

  if (!user.is_active) {
    throw ApiError.unauthorized('Account is deactivated');
  }

  // Generate tokens
  const tokens = generateTokens(user);

  sendSuccess(res, HttpStatus.OK, 'Login successful', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
    },
    ...tokens,
  });
});

/**
 * Complete student profile
 * PUT /api/auth/complete-profile
 */
const completeProfile = catchAsync(async (req, res) => {
  const { name, branch, year, registerNumber } = req.body;

  // Check register number
  const currentUser = await User.findById(req.user.id);
  
  if (registerNumber !== currentUser.register_number) {
    if (await User.registerNumberExists(registerNumber)) {
      throw ApiError.conflict('Register number already exists');
    }
  }

  // Update profile
  const user = await User.completeProfile(req.user.id, {
    name,
    branch,
    year,
    registerNumber,
  });

  logger.info('Student profile completed', { userId: req.user.id });

  sendSuccess(res, HttpStatus.OK, 'Profile completed successfully', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
    },
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh-token
 */
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw ApiError.badRequest('Refresh token is required');
  }

  const { accessToken } = await refreshAccessToken(token);

  sendSuccess(res, HttpStatus.OK, 'Token refreshed', { accessToken });
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  sendSuccess(res, HttpStatus.OK, 'Profile retrieved', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      employeeId: user.employee_id,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
      createdAt: user.created_at,
    },
  });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
const logout = catchAsync(async (req, res) => {
  // In a real implementation, you might blacklist the token
  // For now, just return success (client should delete token)
  sendSuccess(res, HttpStatus.OK, 'Logged out successfully');
});

/**
 * Send OTP to student email for verification
 * POST /api/auth/student/send-otp
 */
const sendStudentOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  const db = require('../config/database');
  const { mailService } = require('../services');

  // Check if email exists in students_master
  const studentResult = await db.query(
    'SELECT id, email FROM students_master WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (studentResult.rows.length === 0) {
    throw ApiError.notFound('Email not found in student registry. Contact your admin.');
  }

  // Check if user already exists
  if (await User.emailExists(email)) {
    throw ApiError.conflict('Account already exists for this email. Please login instead.');
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing OTP for this email
  await db.query('DELETE FROM student_otp_verification WHERE email = $1', [email]);

  // Store OTP in database
  await db.query(
    `INSERT INTO student_otp_verification (email, otp, expires_at, attempts, max_attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, otp, expiresAt, 0, 5]
  );

  // Send OTP via email
  const mailResult = await mailService.sendOTPEmail({
    to: email,
    otp,
    expiresIn: 10,
  });

  if (!mailResult.delivered) {
    logger.warn('OTP email delivery failed but OTP stored', { email });
  }

  logger.info('Student OTP sent', { email, delivered: mailResult.delivered });

  sendSuccess(res, HttpStatus.OK, 'OTP sent to your email. Valid for 10 minutes.', {
    email,
    expiresIn: 600, // 10 minutes in seconds
  });
});

/**
 * Verify OTP and register student account
 * POST /api/auth/student/verify-otp-and-register
 */
const verifyStudentOTPAndRegister = catchAsync(async (req, res) => {
  const { email, otp, password, name, confirmPassword } = req.body;

  if (!email || !otp || !password || !name) {
    throw ApiError.badRequest('Email, OTP, password, and name are required');
  }

  if (password !== confirmPassword) {
    throw ApiError.badRequest('Passwords do not match');
  }

  if (password.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters');
  }

  const db = require('../config/database');

  // Get OTP record from database
  const otpResult = await db.query(
    `SELECT * FROM student_otp_verification 
     WHERE email = $1 AND verified = FALSE`,
    [email]
  );

  if (otpResult.rows.length === 0) {
    throw ApiError.notFound('No pending OTP found for this email');
  }

  const otpRecord = otpResult.rows[0];

  // Check if OTP expired
  if (new Date() > new Date(otpRecord.expires_at)) {
    throw ApiError.badRequest('OTP has expired. Please request a new one.');
  }

  // Check if max attempts exceeded
  if (otpRecord.attempts >= otpRecord.max_attempts) {
    throw ApiError.badRequest('Too many failed attempts. Please request a new OTP.');
  }

  // Verify OTP
  if (otpRecord.otp !== otp.toString()) {
    // Increment attempts
    await db.query(
      'UPDATE student_otp_verification SET attempts = attempts + 1 WHERE id = $1',
      [otpRecord.id]
    );
    throw ApiError.badRequest('Invalid OTP');
  }

  // Get student details from students_master
  const studentResult = await db.query(
    `SELECT id, registration_number, name as student_name, branch, department, email 
     FROM students_master WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (studentResult.rows.length === 0) {
    throw ApiError.notFound('Student record not found');
  }

  const student = studentResult.rows[0];

  // Check if user already exists
  if (await User.emailExists(email)) {
    throw ApiError.conflict('Account already created for this email');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user account
  const user = await User.create({
    name: name || student.student_name,
    email,
    password: hashedPassword,
    role: 'STUDENT',
    branch: student.branch,
    registerNumber: student.registration_number,
  });

  // Mark OTP as verified
  await db.query(
    'UPDATE student_otp_verification SET verified = TRUE, updated_at = NOW() WHERE id = $1',
    [otpRecord.id]
  );

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user);

  logger.info('Student account created via OTP verification', { userId: user.id, email });

  sendSuccess(res, HttpStatus.CREATED, 'Account created successfully', {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      year: user.year,
      registerNumber: user.register_number,
      profileCompleted: user.profile_completed || (!!user.branch && !!user.year),
    },
  });
});

/**
 * Resend OTP to student email
 * POST /api/auth/student/resend-otp
 */
const resendStudentOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  const db = require('../config/database');
  const { mailService } = require('../services');

  // Check if email exists in students_master
  const studentResult = await db.query(
    'SELECT id, email FROM students_master WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (studentResult.rows.length === 0) {
    throw ApiError.notFound('Email not found in student registry');
  }

  // Check for existing pending OTP
  const otpResult = await db.query(
    `SELECT attempts, max_attempts FROM student_otp_verification 
     WHERE email = $1 AND verified = FALSE`,
    [email]
  );

  if (otpResult.rows.length > 0) {
    const otpRecord = otpResult.rows[0];
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      throw ApiError.tooManyRequests('Too many failed attempts. Please try again later.');
    }
  }

  // Generate new OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Delete old OTP and insert new one
  await db.query('DELETE FROM student_otp_verification WHERE email = $1', [email]);
  await db.query(
    `INSERT INTO student_otp_verification (email, otp, expires_at, attempts, max_attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, otp, expiresAt, 0, 5]
  );

  // Send OTP
  await mailService.sendOTPEmail({
    to: email,
    otp,
    expiresIn: 10,
  });

  logger.info('Student OTP resent', { email });

  sendSuccess(res, HttpStatus.OK, 'OTP resent to your email', {
    email,
    expiresIn: 600,
  });
});

/**
 * Send OTP for student forgot password flow
 * POST /api/auth/student/forgot-password/send-otp
 */
const sendStudentForgotPasswordOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findByEmail(normalizedEmail);

  // Always return a generic response to avoid account enumeration.
  if (!user || user.role !== 'STUDENT' || !user.is_active) {
    return sendSuccess(
      res,
      HttpStatus.OK,
      'If an account exists for this email, an OTP has been sent.',
      { email: normalizedEmail, expiresIn: 600 }
    );
  }

  const db = require('../config/database');
  const { mailService } = require('../services');

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.query('DELETE FROM student_password_reset_otp WHERE email = $1', [normalizedEmail]);
  await db.query(
    `INSERT INTO student_password_reset_otp (email, otp, expires_at, attempts, max_attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [normalizedEmail, otp, expiresAt, 0, 5]
  );

  const mailResult = await mailService.sendOTPEmail({
    to: normalizedEmail,
    otp,
    expiresIn: 10,
  });

  if (!mailResult.delivered) {
    logger.warn('Student forgot password OTP email delivery failed', { email: normalizedEmail });
  }

  logger.info('Student forgot password OTP sent', {
    email: normalizedEmail,
    delivered: mailResult.delivered,
  });

  sendSuccess(
    res,
    HttpStatus.OK,
    'If an account exists for this email, an OTP has been sent.',
    { email: normalizedEmail, expiresIn: 600 }
  );
});

/**
 * Verify student forgot password OTP and reset password
 * POST /api/auth/student/forgot-password/verify-otp-and-reset
 */
const verifyStudentForgotPasswordOTPAndReset = catchAsync(async (req, res) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (!email || !otp || !password || !confirmPassword) {
    throw ApiError.badRequest('Email, OTP, password, and confirm password are required');
  }

  if (password !== confirmPassword) {
    throw ApiError.badRequest('Passwords do not match');
  }

  if (password.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findByEmail(normalizedEmail);

  // Do not allow password reset for non-existing or non-student accounts.
  if (!user || user.role !== 'STUDENT' || !user.is_active) {
    throw ApiError.badRequest('Invalid reset request');
  }

  const db = require('../config/database');

  const otpResult = await db.query(
    `SELECT * FROM student_password_reset_otp
     WHERE email = $1 AND verified = FALSE`,
    [normalizedEmail]
  );

  if (otpResult.rows.length === 0) {
    throw ApiError.badRequest('No pending OTP found for this email');
  }

  const otpRecord = otpResult.rows[0];

  if (new Date() > new Date(otpRecord.expires_at)) {
    throw ApiError.badRequest('OTP has expired. Please request a new one.');
  }

  if (otpRecord.attempts >= otpRecord.max_attempts) {
    throw ApiError.badRequest('Too many failed attempts. Please request a new OTP.');
  }

  if (otpRecord.otp !== otp.toString()) {
    await db.query(
      'UPDATE student_password_reset_otp SET attempts = attempts + 1 WHERE id = $1',
      [otpRecord.id]
    );
    throw ApiError.badRequest('Invalid OTP');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const updatedUser = await User.updatePasswordByEmail(normalizedEmail, hashedPassword);

  if (!updatedUser) {
    throw ApiError.internal('Failed to reset password');
  }

  await db.query(
    'UPDATE student_password_reset_otp SET verified = TRUE, updated_at = NOW() WHERE id = $1',
    [otpRecord.id]
  );

  logger.info('Student password reset completed', { userId: updatedUser.id, email: normalizedEmail });

  sendSuccess(res, HttpStatus.OK, 'Password reset successful. Please login with your new password.');
});

/**
 * Resend OTP for student forgot password flow
 * POST /api/auth/student/forgot-password/resend-otp
 */
const resendStudentForgotPasswordOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findByEmail(normalizedEmail);

  // Always return generic success to avoid account enumeration.
  if (!user || user.role !== 'STUDENT' || !user.is_active) {
    return sendSuccess(
      res,
      HttpStatus.OK,
      'If an account exists for this email, a new OTP has been sent.',
      { email: normalizedEmail, expiresIn: 600 }
    );
  }

  const db = require('../config/database');
  const { mailService } = require('../services');

  const otpResult = await db.query(
    `SELECT attempts, max_attempts FROM student_password_reset_otp
     WHERE email = $1 AND verified = FALSE`,
    [normalizedEmail]
  );

  if (otpResult.rows.length > 0) {
    const otpRecord = otpResult.rows[0];
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      throw ApiError.tooManyRequests('Too many failed attempts. Please try again later.');
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.query('DELETE FROM student_password_reset_otp WHERE email = $1', [normalizedEmail]);
  await db.query(
    `INSERT INTO student_password_reset_otp (email, otp, expires_at, attempts, max_attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [normalizedEmail, otp, expiresAt, 0, 5]
  );

  const mailResult = await mailService.sendOTPEmail({
    to: normalizedEmail,
    otp,
    expiresIn: 10,
  });

  if (!mailResult.delivered) {
    logger.warn('Student forgot password OTP resend delivery failed', { email: normalizedEmail });
  }

  logger.info('Student forgot password OTP resent', {
    email: normalizedEmail,
    delivered: mailResult.delivered,
  });

  sendSuccess(
    res,
    HttpStatus.OK,
    'If an account exists for this email, a new OTP has been sent.',
    { email: normalizedEmail, expiresIn: 600 }
  );
});

module.exports = {
  register,
  login,
  googleAuth,
  completeProfile,
  refreshToken,
  getMe,
  logout,
  sendStudentOTP,
  verifyStudentOTPAndRegister,
  resendStudentOTP,
  sendStudentForgotPasswordOTP,
  verifyStudentForgotPasswordOTPAndReset,
  resendStudentForgotPasswordOTP,
};
