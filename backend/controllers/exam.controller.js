/**
 * Exam Controller
 * Handles exam CRUD operations for teachers
 */

const axios = require('axios');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const { sendSuccess, sendError, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ollamaService, pdfService, automationService } = require('../services');
const { deleteFile } = require('../middleware/upload.middleware');

/**
 * Create a new exam
 * POST /api/exams
 */
const createExam = catchAsync(async (req, res) => {
  const { title, description, branch, year, durationMinutes, passPercentage, randomizeQuestions } = req.body;

  const exam = await Exam.create({
    title,
    description,
    branch,
    year,
    durationMinutes,
    passPercentage,
    randomizeQuestions,
    createdBy: req.user.id,
  });

  logger.info('Exam created', { examId: exam.id, teacherId: req.user.id });

  sendSuccess(res, HttpStatus.CREATED, 'Exam created successfully', { exam });
});

/**
 * Get all exams for teacher
 * GET /api/exams
 */
const getTeacherExams = catchAsync(async (req, res) => {
  const exams = await Exam.findByTeacher(req.user.id);

  sendSuccess(res, HttpStatus.OK, 'Exams retrieved', { exams });
});

/**
 * Get exam by ID
 * GET /api/exams/:examId
 */
const getExamById = catchAsync(async (req, res) => {
  const { examId } = req.params;

  const exam = await Exam.findById(examId);

  if (!exam) {
    throw ApiError.notFound('Exam not found');
  }

  // Teachers can only see their own exams
  if (req.user.role === 'TEACHER' && exam.created_by !== req.user.id) {
    throw ApiError.forbidden('You do not have access to this exam');
  }

  // Get questions
  const includeAnswers = req.user.role === 'TEACHER';
  const questions = await Question.findByExam(examId, includeAnswers);

  sendSuccess(res, HttpStatus.OK, 'Exam retrieved', { 
    exam,
    questions,
  });
});

/**
 * Update exam
 * PUT /api/exams/:examId
 */
const updateExam = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only update your own exams');
  }

  // Check if exam is still editable
  const exam = await Exam.findById(examId);
  if (exam.status === 'ACTIVE' || exam.status === 'CLOSED') {
    throw ApiError.badRequest('Cannot update an active or closed exam');
  }

  const updatedExam = await Exam.update(examId, req.body);

  logger.info('Exam updated', { examId });

  sendSuccess(res, HttpStatus.OK, 'Exam updated successfully', { exam: updatedExam });
});

/**
 * Delete exam
 * DELETE /api/exams/:examId
 */
const deleteExam = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only delete your own exams');
  }

  // Check if exam can be deleted
  const exam = await Exam.findById(examId);
  if (exam.status === 'ACTIVE') {
    throw ApiError.badRequest('Cannot delete an active exam');
  }

  // Delete syllabus file if exists
  if (exam.syllabus_path) {
    deleteFile(exam.syllabus_path);
  }

  await Exam.delete(examId);

  logger.info('Exam deleted', { examId });

  sendSuccess(res, HttpStatus.OK, 'Exam deleted successfully');
});

/**
 * Publish exam
 * POST /api/exams/:examId/publish
 */
const publishExam = catchAsync(async (req, res) => {
  const { examId } = req.params;
  const { durationMinutes } = req.body;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only publish your own exams');
  }

  const exam = await Exam.findById(examId);

  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Exam is already published');
  }

  // Check if exam has questions
  const questionCount = await Question.countByExam(examId);
  if (questionCount === 0) {
    throw ApiError.badRequest('Exam must have at least one question to be published');
  }

  const now = new Date();

  const updatedExam = await Exam.update(examId, {
    status: 'PUBLISHED',
    durationMinutes: durationMinutes || exam.duration_minutes,
    publishedAt: exam.published_at || now,
  });

  // Notify via n8n
  automationService.sendExamPublishedNotification({
    title: exam.title,
    branch: exam.branch,
    year: exam.year,
    durationMinutes: exam.duration_minutes,
    totalQuestions: questionCount,
    teacherName: req.user.name,
    teacherEmail: req.user.email,
  });

  logger.info('Exam published', { examId });

  sendSuccess(res, HttpStatus.OK, 'Exam published successfully', { exam: updatedExam });
});

/**
 * Upload syllabus and generate questions
 * POST /api/exams/:examId/syllabus
 */
const uploadSyllabus = catchAsync(async (req, res) => {
  const { examId } = req.params;
  const { questionCount = 10 } = req.body;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only upload syllabus to your own exams');
  }

  if (!req.file) {
    throw ApiError.badRequest('Please upload a syllabus file');
  }

  const exam = await Exam.findById(examId);
  if (exam.status !== 'DRAFT') {
    deleteFile(req.file.path);
    throw ApiError.badRequest('Cannot modify a published exam');
  }

  // Delete old syllabus if exists
  if (exam.syllabus_path) {
    deleteFile(exam.syllabus_path);
  }

  // Update exam with syllabus path
  await Exam.update(examId, { syllabusPath: req.file.path });

  logger.info('Syllabus uploaded', { examId, filePath: req.file.path });

  sendSuccess(res, HttpStatus.OK, 'Syllabus uploaded successfully', {
    syllabusPath: req.file.path,
    message: 'Use /api/exams/:examId/generate-questions to generate questions',
  });
});

/**
 * Generate questions from syllabus using AI
 * POST /api/exams/:examId/generate-questions
 */
const generateQuestions = catchAsync(async (req, res) => {
  const { examId } = req.params;
  const { questionCount = 10, count, questionType, difficulty } = req.body;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only generate questions for your own exams');
  }

  const exam = await Exam.findById(examId);

  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot add questions to a published exam');
  }

  if (!exam.syllabus_path) {
    throw ApiError.badRequest('Please upload a syllabus first');
  }

  // Extract text from syllabus
  const syllabusContent = await pdfService.extractText(exam.syllabus_path);

  if (!syllabusContent || syllabusContent.length < 50) {
    throw ApiError.badRequest('Syllabus content is too short or could not be extracted');
  }

  const requestedCountRaw = count ?? questionCount ?? 10;
  const requestedCount = Number(requestedCountRaw);
  const finalCount = Number.isFinite(requestedCount)
    ? Math.max(1, Math.min(Math.floor(requestedCount), 30))
    : 10;

  const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const optionLetters = ['A', 'B', 'C', 'D'];

  const getQuestionText = (question) =>
    normalizeText(question?.questionText ?? question?.question_text ?? question?.question);

  const toQuestionKeyFromText = (questionText) => {
    const text = normalizeText(questionText).toLowerCase();
    return text || null;
  };

  const toQuestionKey = (question) =>
    toQuestionKeyFromText(question.question_text ?? question.questionText ?? question.question);

  const logSkippedQuestion = (reason, payload) => {
    console.warn('[QuestionGeneration] Skipping invalid question', {
      reason,
      questionText: getQuestionText(payload),
    });
  };

  const mapRawQuestion = (rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== 'object') {
      logSkippedQuestion('question must be an object', rawQuestion);
      return null;
    }

    const questionText = getQuestionText(rawQuestion);
    if (!questionText) {
      logSkippedQuestion('questionText is required', rawQuestion);
      return null;
    }

    if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length !== 4) {
      logSkippedQuestion('exactly 4 options are required', rawQuestion);
      return null;
    }

    if (rawQuestion.options.some((option) => typeof option !== 'string')) {
      logSkippedQuestion('all options must be strings', rawQuestion);
      return null;
    }

    const options = rawQuestion.options.map((option) => normalizeText(option));
    if (options.some((option) => !option)) {
      logSkippedQuestion('all 4 options must be non-empty', rawQuestion);
      return null;
    }

    const correctOption = normalizeText(rawQuestion.correctOption).toUpperCase();

    if (!optionLetters.includes(correctOption)) {
      logSkippedQuestion('correctOption must be A, B, C, or D', rawQuestion);
      return null;
    }

    return {
      question_text: questionText,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_option: correctOption,
      marks: Number(rawQuestion.marks) > 0 ? Number(rawQuestion.marks) : 1,
    };
  };

  const existingQuestions = await Question.findByExam(examId, true);
  const seenKeys = new Set(existingQuestions.map(toQuestionKey).filter(Boolean));

  const maxAttempts = 4;
  const uniqueQuestions = [];
  let attemptsUsed = 0;
  let lastAutomationResponse = null;

  while (uniqueQuestions.length < finalCount && attemptsUsed < maxAttempts) {
    const remainingCount = finalCount - uniqueQuestions.length;
    const batchCount = Math.min(30, Math.max(remainingCount, 5));

    const n8nPayload = {
      syllabus: syllabusContent,
      count: batchCount,
      questionType,
      difficulty,
      avoidQuestions: Array.from(seenKeys).slice(-100),
    };

    let body;
    try {
      const n8nResponse = await axios.post(
        'http://localhost:5678/webhook/generate-questions',
        n8nPayload,
        {
          timeout: 120000,
        }
      );

      body = n8nResponse?.data;
      lastAutomationResponse = body;
    } catch (error) {
      logger.error('n8n question generation webhook error', {
        message: error.message,
        code: error.code,
        attempt: attemptsUsed + 1,
      });
      throw ApiError.internal('Failed to generate questions via automation service.');
    }

    if (!Array.isArray(body?.questions)) {
      console.warn('[QuestionGeneration] Invalid n8n response format: questions must be an array', {
        examId,
        responseType: typeof body,
      });
      attemptsUsed += 1;
      continue;
    }

    const generatedQuestions = body.questions;

    for (const rawQuestion of generatedQuestions) {
      if (uniqueQuestions.length >= finalCount) {
        break;
      }

      const mappedQuestion = mapRawQuestion(rawQuestion);
      if (!mappedQuestion) {
        continue;
      }

      const questionKey = toQuestionKey(mappedQuestion);
      if (!questionKey || seenKeys.has(questionKey)) {
        continue;
      }

      seenKeys.add(questionKey);
      uniqueQuestions.push(mappedQuestion);
    }

    attemptsUsed += 1;
  }

  if (uniqueQuestions.length === 0) {
    logger.error('Question generation returned no valid unique questions', {
      examId,
      requested: finalCount,
      attemptsUsed,
      rawWebhookResponse: lastAutomationResponse,
    });
    throw ApiError.internal('Failed to generate valid questions from n8n response. Ensure response.data.questions is a valid array of questions.');
  }

  const savedQuestions = await Question.createBulk(examId, uniqueQuestions);

  logger.info('Questions generated via n8n', {
    examId,
    requested: finalCount,
    generated: savedQuestions.length,
    attemptsUsed,
  });

  const successMessage = savedQuestions.length < finalCount
    ? `Generated ${savedQuestions.length} unique questions out of ${finalCount} requested`
    : `Generated ${savedQuestions.length} questions`;

  sendSuccess(res, HttpStatus.CREATED, successMessage, {
    questions: savedQuestions,
    requested: finalCount,
    generated: savedQuestions.length,
    attemptsUsed,
    automationResponse: lastAutomationResponse,
  });
});

/**
 * Get exam statistics
 * GET /api/exams/:examId/statistics
 */
const getExamStatistics = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only view statistics for your own exams');
  }

  const statistics = await Exam.getStatistics(examId);

  sendSuccess(res, HttpStatus.OK, 'Statistics retrieved', { statistics });
});

module.exports = {
  createExam,
  getTeacherExams,
  getExamById,
  updateExam,
  deleteExam,
  publishExam,
  uploadSyllabus,
  generateQuestions,
  getExamStatistics,
};
