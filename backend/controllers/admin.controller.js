/**
 * Admin Controller
 * Handles admin dashboard, student registry, teacher invites, and analytics
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');

const db = require('../config/database');
const config = require('../config');
const User = require('../models/User');
const StudentMaster = require('../models/StudentMaster');
const TeacherInvitation = require('../models/TeacherInvitation');
const SyllabusLibrary = require('../models/SyllabusLibrary');
const SystemSettings = require('../models/SystemSettings');
const { sendSuccess, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { deleteFile } = require('../middleware/upload.middleware');
const { mailService } = require('../services');
const { extractText } = require('../services/pdfService');

const SYLLABUS_STATUSES = ['UPLOADED', 'PROCESSING', 'READY'];
const SETTINGS_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

const normalizeCsvRecord = (record) => {
  const normalized = {};

  for (const [key, value] of Object.entries(record)) {
    normalized[key.trim().toLowerCase()] = String(value || '').trim();
  }

  return {
    registration_number: (normalized.registration_number || '').toUpperCase(),
    name: normalized.name || '',
    branch: (normalized.branch || '').toUpperCase(),
    department: normalized.department || '',
  };
};

const normalizeAcademicYear = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = String(value).trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    const numericYear = parseInt(raw, 10);
    if (numericYear >= 1 && numericYear <= 8) {
      return numericYear;
    }
    return null;
  }

  const map = {
    'first year': 1,
    '1st year': 1,
    'second year': 2,
    '2nd year': 2,
    'third year': 3,
    '3rd year': 3,
    'fourth year': 4,
    '4th year': 4,
    'final year': 4,
  };

  return map[raw] || null;
};

const mapSyllabusRecord = (record) => {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    subject: record.subject,
    branch: record.branch,
    department: record.department,
    year: record.year,
    status: record.status,
    filePath: record.file_path,
    originalFileName: record.original_file_name,
    mimeType: record.mime_type,
    fileSizeBytes: record.file_size_bytes,
    uploadedBy: record.uploaded_by,
    uploadedByName: record.uploaded_by_name || null,
    uploadDate: record.created_at,
    updatedAt: record.updated_at,
  };
};

const parseBooleanLike = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return null;
};

const getSystemSettingsDefaults = () => {
  const rawDifficulty = (process.env.DEFAULT_DIFFICULTY || 'Medium').trim();
  const defaultDifficulty = SETTINGS_DIFFICULTIES.includes(rawDifficulty)
    ? rawDifficulty
    : 'Medium';

  const questionCount = parseInt(process.env.DEFAULT_QUESTION_COUNT, 10);
  const defaultQuestionCount = Number.isFinite(questionCount) && questionCount > 0
    ? Math.min(questionCount, 200)
    : 20;

  return {
    smtpHost: config.smtp.host || '',
    smtpPort: Number(config.smtp.port) || 587,
    smtpUser: config.smtp.user || '',
    smtpPassword: config.smtp.pass || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultQuestionCount,
    defaultDifficulty,
    emailNotifications: parseBooleanLike(process.env.EMAIL_NOTIFICATIONS_ENABLED) ?? true,
  };
};

const mapSystemSettingsRecord = (record) => ({
  smtpHost: record.smtp_host,
  smtpPort: String(record.smtp_port),
  smtpUser: record.smtp_user,
  smtpPassword: record.smtp_password,
  geminiApiKey: record.gemini_api_key,
  ollamaUrl: record.ollama_url,
  defaultQuestionCount: String(record.default_question_count),
  defaultDifficulty: record.default_difficulty,
  emailNotifications: record.email_notifications_enabled,
  updatedAt: record.updated_at,
});

const getDashboardStats = catchAsync(async (req, res) => {
  const [studentCountResult, teacherCountResult, examCountResult, publishedExamResult] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM students_master'),
    db.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'TEACHER' AND is_active = true"),
    db.query('SELECT COUNT(*)::int AS count FROM exams'),
    db.query("SELECT COUNT(*)::int AS count FROM exams WHERE status = 'PUBLISHED'"),
  ]);

  sendSuccess(res, HttpStatus.OK, 'Dashboard stats retrieved', {
    totalStudents: studentCountResult.rows[0].count,
    totalTeachers: teacherCountResult.rows[0].count,
    totalExams: examCountResult.rows[0].count,
    totalPublishedExams: publishedExamResult.rows[0].count,
  });
});

const getStudents = catchAsync(async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const students = await StudentMaster.findAll(search);

  sendSuccess(res, HttpStatus.OK, 'Students retrieved successfully', {
    students,
    total: students.length,
  });
});

const uploadStudentsCsv = catchAsync(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('CSV file is required');
  }

  try {
    const csvContent = fs.readFileSync(req.file.path, 'utf8');

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (!Array.isArray(records) || records.length === 0) {
      throw ApiError.badRequest('CSV file is empty');
    }

    const uniqueRows = new Map();

    records.forEach((record, index) => {
      const row = normalizeCsvRecord(record);
      const lineNo = index + 2;

      if (!row.registration_number || !row.name || !row.branch || !row.department) {
        throw ApiError.badRequest(
          `Invalid CSV format at line ${lineNo}. Required columns: registration_number, name, branch, department`
        );
      }

      uniqueRows.set(row.registration_number, row);
    });

    const result = await StudentMaster.upsertMany(Array.from(uniqueRows.values()));

    logger.info('Student CSV processed', {
      adminId: req.user.id,
      totalProcessed: result.totalProcessed,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
    });

    sendSuccess(res, HttpStatus.OK, 'Student CSV uploaded successfully', result);
  } finally {
    deleteFile(req.file.path);
  }
});

const createStudent = catchAsync(async (req, res) => {
  const { registration_number, name, email, department, branch } = req.body;

  if (!registration_number || !name || !email || !department) {
    throw ApiError.badRequest('Registration number, name, email, and department are required');
  }

  // Check if student with same registration number already exists
  const existingStudent = await db.query(
    'SELECT id FROM students_master WHERE registration_number = $1',
    [registration_number]
  );

  if (existingStudent.rows.length > 0) {
    throw ApiError.badRequest('Student with this registration number already exists');
  }

  // Create student record
  const newStudent = await StudentMaster.create({
    registration_number: registration_number.trim().toUpperCase(),
    name: name.trim(),
    email: email.trim(),
    branch: branch || '',
    department: department.trim(),
  });

  sendSuccess(res, HttpStatus.CREATED, 'Student created successfully', {
    student: newStudent,
  });
});

const updateStudent = catchAsync(async (req, res) => {
  const { studentId } = req.params;

  const existingStudent = await StudentMaster.findById(studentId);
  if (!existingStudent) {
    throw ApiError.notFound('Student record not found');
  }

  const updateData = {
    registrationNumber: req.body.registrationNumber,
    name: req.body.name,
    email: req.body.email,
    branch: req.body.branch,
    department: req.body.department,
  };

  const updatedStudent = await StudentMaster.updateById(studentId, updateData);

  if (!updatedStudent) {
    throw ApiError.internal('Failed to update student record');
  }

  sendSuccess(res, HttpStatus.OK, 'Student updated successfully', { student: updatedStudent });
});

const deleteStudent = catchAsync(async (req, res) => {
  const { studentId } = req.params;

  const deleted = await StudentMaster.deleteById(studentId);
  if (!deleted) {
    throw ApiError.notFound('Student record not found');
  }

  sendSuccess(res, HttpStatus.OK, 'Student deleted successfully');
});

const getSystemSettings = catchAsync(async (req, res) => {
  const defaults = getSystemSettingsDefaults();
  const settings = await SystemSettings.getOrCreate(defaults, req.user.id);

  sendSuccess(res, HttpStatus.OK, 'System settings retrieved successfully', {
    settings: mapSystemSettingsRecord(settings),
  });
});

const updateSystemSettings = catchAsync(async (req, res) => {
  const defaults = getSystemSettingsDefaults();
  await SystemSettings.getOrCreate(defaults, req.user.id);

  const updateData = {};

  if (req.body.smtpHost !== undefined) {
    const smtpHost = String(req.body.smtpHost || '').trim();
    if (smtpHost.length > 255) {
      throw ApiError.badRequest('SMTP host must be at most 255 characters');
    }
    updateData.smtpHost = smtpHost;
  }

  if (req.body.smtpPort !== undefined) {
    const parsedPort = parseInt(String(req.body.smtpPort), 10);
    if (!Number.isFinite(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw ApiError.badRequest('SMTP port must be between 1 and 65535');
    }
    updateData.smtpPort = parsedPort;
  }

  if (req.body.smtpUser !== undefined) {
    const smtpUser = String(req.body.smtpUser || '').trim();
    if (smtpUser.length > 255) {
      throw ApiError.badRequest('SMTP user must be at most 255 characters');
    }
    updateData.smtpUser = smtpUser;
  }

  if (req.body.smtpPassword !== undefined) {
    const smtpPassword = String(req.body.smtpPassword || '').trim();
    if (smtpPassword.length > 4000) {
      throw ApiError.badRequest('SMTP password must be at most 4000 characters');
    }
    updateData.smtpPassword = smtpPassword;
  }

  if (req.body.geminiApiKey !== undefined) {
    const geminiApiKey = String(req.body.geminiApiKey || '').trim();
    if (geminiApiKey.length > 4000) {
      throw ApiError.badRequest('Gemini API key must be at most 4000 characters');
    }
    updateData.geminiApiKey = geminiApiKey;
  }

  if (req.body.ollamaUrl !== undefined) {
    const ollamaUrl = String(req.body.ollamaUrl || '').trim();
    if (!ollamaUrl) {
      throw ApiError.badRequest('Ollama URL cannot be empty');
    }
    if (ollamaUrl.length > 500) {
      throw ApiError.badRequest('Ollama URL must be at most 500 characters');
    }
    updateData.ollamaUrl = ollamaUrl;
  }

  if (req.body.defaultQuestionCount !== undefined) {
    const defaultQuestionCount = parseInt(String(req.body.defaultQuestionCount), 10);
    if (
      !Number.isFinite(defaultQuestionCount) ||
      defaultQuestionCount <= 0 ||
      defaultQuestionCount > 200
    ) {
      throw ApiError.badRequest('Default question count must be between 1 and 200');
    }
    updateData.defaultQuestionCount = defaultQuestionCount;
  }

  if (req.body.defaultDifficulty !== undefined) {
    const defaultDifficulty = String(req.body.defaultDifficulty || '').trim();
    if (!SETTINGS_DIFFICULTIES.includes(defaultDifficulty)) {
      throw ApiError.badRequest('Default difficulty must be Easy, Medium, or Hard');
    }
    updateData.defaultDifficulty = defaultDifficulty;
  }

  if (req.body.emailNotifications !== undefined) {
    const emailNotifications = parseBooleanLike(req.body.emailNotifications);
    if (emailNotifications === null) {
      throw ApiError.badRequest('Email notifications must be true or false');
    }
    updateData.emailNotifications = emailNotifications;
  }

  if (!Object.keys(updateData).length) {
    throw ApiError.badRequest('No valid settings provided');
  }

  const updated = await SystemSettings.update(updateData, req.user.id);
  if (!updated) {
    throw ApiError.internal('Failed to update system settings');
  }

  logger.info('System settings updated by admin', {
    adminId: req.user.id,
    updatedKeys: Object.keys(updateData),
  });

  sendSuccess(res, HttpStatus.OK, 'System settings updated successfully', {
    settings: mapSystemSettingsRecord(updated),
  });
});

const uploadSyllabus = catchAsync(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('Please upload a syllabus file');
  }

  const subject = (req.body.subject || '').toString().trim();
  const branch = (req.body.branch || '').toString().trim().toUpperCase();
  const department = (req.body.department || '').toString().trim();
  const year = normalizeAcademicYear(req.body.year);

  if (!subject || !branch || !department || !year) {
    deleteFile(req.file.path);
    throw ApiError.badRequest('subject, branch, department, and year are required');
  }

  if (subject.length > 255 || branch.length > 50 || department.length > 100) {
    deleteFile(req.file.path);
    throw ApiError.badRequest('Subject, branch, or department exceeds allowed length');
  }

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.pdf', '.doc', '.docx'].includes(ext)) {
    deleteFile(req.file.path);
    throw ApiError.badRequest('Only PDF, DOC, and DOCX files are allowed');
  }

  try {
    const syllabus = await SyllabusLibrary.create({
      subject,
      branch,
      department,
      year,
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      status: 'UPLOADED',
      uploadedBy: req.user.id,
    });

    logger.info('Syllabus uploaded by admin', {
      adminId: req.user.id,
      syllabusId: syllabus.id,
      subject,
      branch,
      year,
    });

    // Extract text from the syllabus file
    let extractedText = '';
    try {
      extractedText = await extractText(req.file.path);
      
      // Log extraction details
      console.log(`[SYLLABUS_EXTRACTION] ID: ${syllabus.id}`);
      console.log(`[SYLLABUS_EXTRACTION] Text Length: ${extractedText.length}`);
      console.log(`[SYLLABUS_EXTRACTION] First 200 chars: ${extractedText.substring(0, 200)}`);
      
      // Save extracted text to database
      const updatedSyllabus = await SyllabusLibrary.updateById(syllabus.id, {
        extracted_text: extractedText,
      });
      
      // Verify it was saved
      const verifiedSyllabus = await SyllabusLibrary.findById(syllabus.id);
      console.log(`[SYLLABUS_VERIFICATION] ID: ${verifiedSyllabus.id}`);
      console.log(`[SYLLABUS_VERIFICATION] Subject: ${verifiedSyllabus.subject}`);
      console.log(`[SYLLABUS_VERIFICATION] Extracted Text Length: ${verifiedSyllabus.extracted_text?.length || 0}`);
      
      // Validate storage
      if (!verifiedSyllabus.extracted_text || verifiedSyllabus.extracted_text.length === 0) {
        throw ApiError.internal('Failed to store extracted syllabus text in database');
      }
    } catch (extractionError) {
      logger.error('Syllabus text extraction error:', extractionError.message);
      // Log but continue - extraction failure shouldn't block upload
      console.error(`[SYLLABUS_EXTRACTION_ERROR] ID: ${syllabus.id} - ${extractionError.message}`);
    }

    sendSuccess(res, HttpStatus.CREATED, 'Syllabus uploaded successfully', {
      syllabus: mapSyllabusRecord(syllabus),
    });
  } catch (error) {
    deleteFile(req.file.path);
    throw error;
  }
});

const getSyllabusLibrary = catchAsync(async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  const branch = (req.query.branch || '').toString().trim().toUpperCase();
  const department = (req.query.department || '').toString().trim();

  const rawYear = req.query.year;
  const year = rawYear !== undefined ? normalizeAcademicYear(rawYear) : null;
  if (rawYear !== undefined && year === null) {
    throw ApiError.badRequest('Year must be between 1 and 8');
  }

  const status = (req.query.status || '').toString().trim().toUpperCase();
  if (status && !SYLLABUS_STATUSES.includes(status)) {
    throw ApiError.badRequest('Invalid syllabus status');
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));

  const [listResult, overview] = await Promise.all([
    SyllabusLibrary.list({
      search: search || null,
      branch: branch || null,
      department: department || null,
      year,
      status: status || null,
      page,
      limit,
    }),
    SyllabusLibrary.getOverviewStats(),
  ]);

  sendSuccess(res, HttpStatus.OK, 'Syllabus library retrieved successfully', {
    syllabi: listResult.items.map(mapSyllabusRecord),
    total: listResult.total,
    page: listResult.page,
    limit: listResult.limit,
    overview,
  });
});

const getSyllabusById = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;

  const syllabus = await SyllabusLibrary.findById(syllabusId);
  if (!syllabus) {
    throw ApiError.notFound('Syllabus not found');
  }

  sendSuccess(res, HttpStatus.OK, 'Syllabus retrieved successfully', {
    syllabus: mapSyllabusRecord(syllabus),
  });
});

const updateSyllabus = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;

  const existing = await SyllabusLibrary.findById(syllabusId);
  if (!existing) {
    if (req.file) {
      deleteFile(req.file.path);
    }
    throw ApiError.notFound('Syllabus not found');
  }

  const updateData = {};

  if (req.body.subject !== undefined) {
    const subject = String(req.body.subject || '').trim();
    if (!subject) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Subject cannot be empty');
    }
    if (subject.length > 255) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Subject must be at most 255 characters');
    }
    updateData.subject = subject;
  }

  if (req.body.branch !== undefined) {
    const branch = String(req.body.branch || '').trim().toUpperCase();
    if (!branch) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Branch cannot be empty');
    }
    if (branch.length > 50) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Branch must be at most 50 characters');
    }
    updateData.branch = branch;
  }

  if (req.body.department !== undefined) {
    const department = String(req.body.department || '').trim();
    if (!department) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Department cannot be empty');
    }
    if (department.length > 100) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Department must be at most 100 characters');
    }
    updateData.department = department;
  }

  if (req.body.year !== undefined) {
    const year = normalizeAcademicYear(req.body.year);
    if (!year) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Year must be between 1 and 8');
    }
    updateData.year = year;
  }

  if (req.body.status !== undefined) {
    const status = String(req.body.status || '').trim().toUpperCase();
    if (!SYLLABUS_STATUSES.includes(status)) {
      if (req.file) {
        deleteFile(req.file.path);
      }
      throw ApiError.badRequest('Invalid syllabus status');
    }
    updateData.status = status;
  }

  if (req.file) {
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      deleteFile(req.file.path);
      throw ApiError.badRequest('Only PDF, DOC, and DOCX files are allowed');
    }

    updateData.filePath = req.file.path;
    updateData.originalFileName = req.file.originalname;
    updateData.mimeType = req.file.mimetype;
    updateData.fileSizeBytes = req.file.size;
  }

  if (Object.keys(updateData).length === 0) {
    if (req.file) {
      deleteFile(req.file.path);
    }
    throw ApiError.badRequest('No valid fields provided for update');
  }

  let updated;

  try {
    updated = await SyllabusLibrary.updateById(syllabusId, updateData);
  } catch (error) {
    if (req.file) {
      deleteFile(req.file.path);
    }
    throw error;
  }

  if (!updated) {
    if (req.file) {
      deleteFile(req.file.path);
    }
    throw ApiError.notFound('Syllabus not found');
  }

  if (req.file && existing.file_path && existing.file_path !== req.file.path) {
    deleteFile(existing.file_path);
  }

  logger.info('Syllabus updated by admin', {
    adminId: req.user.id,
    syllabusId,
    updatedFields: Object.keys(updateData),
  });

  sendSuccess(res, HttpStatus.OK, 'Syllabus updated successfully', {
    syllabus: mapSyllabusRecord(updated),
  });
});

const updateSyllabusStatus = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;
  const status = String(req.body.status || '').trim().toUpperCase();

  if (!SYLLABUS_STATUSES.includes(status)) {
    throw ApiError.badRequest('Invalid syllabus status');
  }

  const updated = await SyllabusLibrary.updateById(syllabusId, { status });

  if (!updated) {
    throw ApiError.notFound('Syllabus not found');
  }

  logger.info('Syllabus status updated by admin', {
    adminId: req.user.id,
    syllabusId,
    status,
  });

  sendSuccess(res, HttpStatus.OK, 'Syllabus status updated successfully', {
    syllabus: mapSyllabusRecord(updated),
  });
});

const deleteSyllabus = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;

  const deleted = await SyllabusLibrary.deleteById(syllabusId);
  if (!deleted) {
    throw ApiError.notFound('Syllabus not found');
  }

  deleteFile(deleted.file_path);

  logger.info('Syllabus deleted by admin', {
    adminId: req.user.id,
    syllabusId,
  });

  sendSuccess(res, HttpStatus.OK, 'Syllabus deleted successfully');
});

const downloadSyllabus = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;

  const syllabus = await SyllabusLibrary.findById(syllabusId);
  if (!syllabus) {
    throw ApiError.notFound('Syllabus not found');
  }

  if (!syllabus.file_path || !fs.existsSync(syllabus.file_path)) {
    throw ApiError.notFound('Syllabus file not found on server');
  }

  res.download(path.resolve(syllabus.file_path), syllabus.original_file_name || undefined);
});

const getSyllabusDebugInfo = catchAsync(async (req, res) => {
  const { syllabusId } = req.params;

  const syllabus = await SyllabusLibrary.findById(syllabusId);

  if (!syllabus) {
    throw ApiError.notFound('Syllabus not found');
  }

  const extractedText = syllabus.extracted_text || '';

  sendSuccess(res, HttpStatus.OK, 'Syllabus debug info', {
    id: syllabus.id,
    subject: syllabus.subject,
    branch: syllabus.branch,
    year: syllabus.year,
    extracted_text_preview: extractedText.substring(0, 1000),
    extracted_text_length: extractedText.length,
  });
});

const getSyllabusOverview = catchAsync(async (req, res) => {
  const overview = await SyllabusLibrary.getOverviewStats();

  sendSuccess(res, HttpStatus.OK, 'Syllabus overview retrieved successfully', overview);
});

const getSyllabusOptions = catchAsync(async (req, res) => {
  const options = await SyllabusLibrary.getFilterOptions();

  sendSuccess(res, HttpStatus.OK, 'Syllabus options retrieved successfully', options);
});

const getRecentActivity = catchAsync(async (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 10, 50));

  const result = await db.query(
    `WITH recent_events AS (
      SELECT
        'SYLLABUS_UPLOADED'::text AS event_type,
        CONCAT(sl.subject, ' syllabus uploaded by ', COALESCE(u.name, 'admin')) AS title,
        sl.created_at AS event_time
      FROM syllabus_library sl
      LEFT JOIN users u ON u.id = sl.uploaded_by

      UNION ALL

      SELECT
        'SYLLABUS_EDITED'::text AS event_type,
        CONCAT(sl.subject, ' syllabus edited') AS title,
        sl.updated_at AS event_time
      FROM syllabus_library sl
      WHERE sl.updated_at > sl.created_at + INTERVAL '5 seconds'

      UNION ALL

      SELECT
        'TEACHER_INVITED'::text AS event_type,
        'Teacher invited' AS title,
        ti.created_at AS event_time
      FROM teacher_invitations ti

      UNION ALL

      SELECT
        'EXAM_PUBLISHED'::text AS event_type,
        'New exam published' AS title,
        COALESCE(e.published_at, e.updated_at, e.created_at) AS event_time
      FROM exams e
      WHERE e.status = 'PUBLISHED'

      UNION ALL

      SELECT
        'STUDENTS_REGISTERED'::text AS event_type,
        'Students registered' AS title,
        u.created_at AS event_time
      FROM users u
      WHERE u.role = 'STUDENT'
    )
    SELECT event_type, title, event_time
    FROM recent_events
    WHERE event_time IS NOT NULL
    ORDER BY event_time DESC
    LIMIT $1`,
    [limit]
  );

  sendSuccess(res, HttpStatus.OK, 'Recent activity retrieved successfully', {
    activity: result.rows,
  });
});

const inviteTeacher = catchAsync(async (req, res) => {
  const { name, email } = req.body;

  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    throw ApiError.conflict('A user with this email already exists');
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresInDays = config?.invites?.teacherInviteExpiresDays || 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invitation = await TeacherInvitation.createOrUpdatePending({
    name,
    email,
    token,
    expiresAt,
    invitedBy: req.user.id,
  });

  const inviteLink = `${config.frontendUrl}/teacher/setup-password?token=${token}`;
  const { delivered } = await mailService.sendTeacherInvite({
    to: email,
    name,
    inviteLink,
    expiresAt,
  });

  logger.info('Teacher invited', {
    adminId: req.user.id,
    teacherEmail: email,
    delivered,
  });

  sendSuccess(res, HttpStatus.CREATED, 'Teacher invitation sent successfully', {
    invitation: {
      id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    },
    inviteLink,
    emailDelivered: delivered,
  });
});

const getTeacherInvitations = catchAsync(async (req, res) => {
  await TeacherInvitation.expireOldInvitations();
  const invitations = await TeacherInvitation.listAll();

  sendSuccess(res, HttpStatus.OK, 'Teacher invitations retrieved successfully', {
    invitations,
  });
});

const getTeacherInviteDetails = catchAsync(async (req, res) => {
  const token = (req.query.token || '').toString().trim();

  if (!token) {
    throw ApiError.badRequest('Invitation token is required');
  }

  await TeacherInvitation.expireOldInvitations();

  const invitation = await TeacherInvitation.findByToken(token);

  if (!invitation) {
    throw ApiError.notFound('Invitation not found');
  }

  if (invitation.status !== 'PENDING') {
    throw ApiError.badRequest(`Invitation is ${invitation.status.toLowerCase()}`);
  }

  sendSuccess(res, HttpStatus.OK, 'Invitation details retrieved', {
    name: invitation.name,
    email: invitation.email,
    expiresAt: invitation.expires_at,
  });
});

const completeTeacherInvite = catchAsync(async (req, res) => {
  const { token, password } = req.body;

  await TeacherInvitation.expireOldInvitations();

  const invitation = await TeacherInvitation.findByToken(token);

  if (!invitation) {
    throw ApiError.badRequest('Invalid invitation token');
  }

  if (invitation.status !== 'PENDING') {
    throw ApiError.badRequest(`Invitation is ${invitation.status.toLowerCase()}`);
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw ApiError.badRequest('Invitation has expired');
  }

  const existingUser = await User.findByEmail(invitation.email);
  if (existingUser) {
    throw ApiError.conflict('Teacher account is already created for this email');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const teacher = await User.create({
    name: invitation.name,
    email: invitation.email,
    password: hashedPassword,
    role: 'TEACHER',
  });

  await TeacherInvitation.markAccepted(invitation.id, teacher.id);

  logger.info('Teacher invitation completed', {
    invitationId: invitation.id,
    teacherId: teacher.id,
  });

  sendSuccess(res, HttpStatus.CREATED, 'Teacher account created successfully', {
    user: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      role: teacher.role,
    },
  });
});

const getAnalytics = catchAsync(async (req, res) => {
  const [
    studentCountResult,
    teacherCountResult,
    examCountResult,
    attemptSummaryResult,
    examsPerBranchResult,
    studentsPerDepartmentResult,
    passFailResult,
  ] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS total_students FROM students_master'),
    db.query("SELECT COUNT(*)::int AS total_teachers FROM users WHERE role = 'TEACHER' AND is_active = true"),
    db.query('SELECT COUNT(*)::int AS total_exams FROM exams'),
    db.query(
      `SELECT COUNT(*)::int AS total_attempts,
              COALESCE(AVG(percentage), 0)::numeric(10,2) AS average_score
       FROM attempts
       WHERE status = 'SUBMITTED'`
    ),
    db.query(
      `SELECT branch, COUNT(*)::int AS count
       FROM exams
       GROUP BY branch
       ORDER BY branch ASC`
    ),
    db.query(
      `SELECT department, COUNT(*)::int AS count
       FROM students_master
       GROUP BY department
       ORDER BY department ASC`
    ),
    db.query(
      `SELECT
          COALESCE(SUM(CASE WHEN a.percentage >= e.pass_percentage THEN 1 ELSE 0 END), 0)::int AS pass_count,
          COALESCE(SUM(CASE WHEN a.percentage < e.pass_percentage THEN 1 ELSE 0 END), 0)::int AS fail_count
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.status = 'SUBMITTED'`
    ),
  ]);

  sendSuccess(res, HttpStatus.OK, 'Platform analytics retrieved successfully', {
    totalRegisteredStudents: studentCountResult.rows[0].total_students,
    totalTeachers: teacherCountResult.rows[0].total_teachers,
    totalExamsCreated: examCountResult.rows[0].total_exams,
    totalAttempts: attemptSummaryResult.rows[0].total_attempts,
    averageScore: Number(attemptSummaryResult.rows[0].average_score),
    examsPerBranch: examsPerBranchResult.rows,
    studentsPerDepartment: studentsPerDepartmentResult.rows,
    passFailRatio: {
      pass: passFailResult.rows[0].pass_count,
      fail: passFailResult.rows[0].fail_count,
    },
  });
});

module.exports = {
  getDashboardStats,
  getStudents,
  uploadStudentsCsv,
  createStudent,
  updateStudent,
  deleteStudent,
  getSystemSettings,
  updateSystemSettings,
  uploadSyllabus,
  getSyllabusLibrary,
  getSyllabusById,
  getSyllabusDebugInfo,
  updateSyllabus,
  updateSyllabusStatus,
  deleteSyllabus,
  downloadSyllabus,
  getSyllabusOverview,
  getSyllabusOptions,
  inviteTeacher,
  getTeacherInvitations,
  getTeacherInviteDetails,
  completeTeacherInvite,
  getAnalytics,
  getRecentActivity,
};
