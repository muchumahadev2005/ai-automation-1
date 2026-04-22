/**
 * Attempt Controller
 * Handles exam attempts for students
 */

const Attempt = require('../models/Attempt');
const Answer = require('../models/Answer');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const User = require('../models/User');
const { sendSuccess, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { automationService } = require('../services');
const { shuffleArray, getClientIp } = require('../utils/helpers');

// Helper to compute exam time window and remaining time
const getExamTimeInfo = (exam) => {
  if (!exam || !exam.published_at || !exam.duration_minutes) {
    return {
      isExpired: false,
      remainingSeconds: null,
    };
  }

  const publishedAt = new Date(exam.published_at);
  const duration = exam.duration_minutes;
  const endTime = new Date(publishedAt.getTime() + duration * 60 * 1000);
  const now = new Date();

  const remainingMs = endTime.getTime() - now.getTime();

  return {
    isExpired: remainingMs <= 0,
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
  };
};

/**
 * Get available exams for student
 * GET /api/student/exams
 */
const getAvailableExams = catchAsync(async (req, res) => {
  const { branch, year } = req.user;

  if (!branch || !year) {
    throw ApiError.badRequest('Please complete your profile first');
  }

  const exams = await Exam.findAvailableForStudent(branch, year, req.user.id);

  // Format response
  const formattedExams = exams.map(exam => ({
    id: exam.id,
    title: exam.title,
    description: exam.description,
    branch: exam.branch,
    year: exam.year,
    durationMinutes: exam.duration_minutes,
    totalQuestions: exam.total_questions,
    status: exam.status,
    creatorName: exam.creator_name,
    attemptId: exam.attempt_id,
    attemptStatus: exam.attempt_status,
    canStart: !exam.attempt_id && exam.status === 'PUBLISHED',
    createdAt: exam.created_at,
  }));

  sendSuccess(res, HttpStatus.OK, 'Available exams retrieved', { exams: formattedExams });
});

/**
 * Start an exam attempt
 * POST /api/student/exams/:examId/start
 */
const startExam = catchAsync(async (req, res) => {
  const { examId } = req.params;
  const studentId = req.user.id;

  // Check if exam exists
  const exam = await Exam.findById(examId);
  if (!exam) {
    throw ApiError.notFound('Exam not found');
  }

  // Check if exam is published
  if (exam.status !== 'PUBLISHED' && exam.status !== 'ACTIVE') {
    throw ApiError.badRequest('Exam is not available');
  }

  // Check global exam time window (from published_at)
  const { isExpired: examExpired, remainingSeconds: examRemainingSeconds } = getExamTimeInfo(exam);
  if (examExpired) {
    throw ApiError.forbidden('Exam time is over. You can no longer take this test.');
  }

  // Check if student matches exam branch/year
  if (exam.branch !== req.user.branch || exam.year !== req.user.year) {
    throw ApiError.forbidden('This exam is not available for your branch/year');
  }

  // Check if already attempted
  const existingAttempt = await Attempt.findByExamAndStudent(examId, studentId);
  if (existingAttempt) {
    if (existingAttempt.status === 'SUBMITTED') {
      throw ApiError.conflict('You have already completed this exam');
    }
    
    // Return existing in-progress attempt
    const remainingTime = await Attempt.getRemainingTime(existingAttempt.id);
    if (remainingTime <= 0) {
      // Auto-submit expired attempt
      const scoreData = await Answer.calculateScore(existingAttempt.id);
      await Attempt.submit(existingAttempt.id, scoreData.score, scoreData.totalMarks);
      throw ApiError.badRequest('Your exam time has expired. Exam has been auto-submitted.');
    }

    // Get questions
    let questions = await Question.findByExam(examId, false);
    if (exam.randomize_questions) {
      questions = shuffleArray(questions);
    }

    return sendSuccess(res, HttpStatus.OK, 'Continuing existing attempt', {
      attempt: {
        id: existingAttempt.id,
        startedAt: existingAttempt.started_at,
        remainingSeconds: remainingTime,
        remainingTimeInSeconds: examRemainingSeconds,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        durationMinutes: exam.duration_minutes,
        totalQuestions: exam.total_questions,
      },
      questions,
    });
  }

  // Create new attempt
  const attempt = await Attempt.create({
    examId,
    studentId,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent'),
  });

  // Get questions
  let questions = await Question.findByExam(examId, false);
  if (exam.randomize_questions) {
    questions = shuffleArray(questions);
  }

  // Update exam status to ACTIVE if it's the first attempt
  if (exam.status === 'PUBLISHED') {
    await Exam.updateStatus(examId, 'ACTIVE');
  }

  logger.info('Exam started', { attemptId: attempt.id, studentId, examId });

  sendSuccess(res, HttpStatus.CREATED, 'Exam started', {
    attempt: {
      id: attempt.id,
      startedAt: attempt.started_at,
      remainingSeconds: exam.duration_minutes * 60,
      remainingTimeInSeconds: examRemainingSeconds,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.duration_minutes,
      totalQuestions: exam.total_questions,
    },
    questions,
  });
});

/**
 * Save answer during exam
 * POST /api/student/attempts/:attemptId/answer
 */
const saveAnswer = catchAsync(async (req, res) => {
  const { attemptId } = req.params;
  const { questionId, selectedOption } = req.body;

  // Verify attempt belongs to student
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.student_id !== req.user.id) {
    throw ApiError.notFound('Attempt not found');
  }

  if (attempt.status === 'SUBMITTED') {
    throw ApiError.badRequest('Exam has already been submitted');
  }

  // Check if attempt is still valid (within time limit)
  const isValid = await Attempt.isValid(attemptId);
  if (!isValid) {
    throw ApiError.badRequest('Exam time has expired');
  }

  // Check global exam time window based on exam.published_at and duration
  const examForTimeCheck = await Exam.findById(attempt.exam_id);
  const { isExpired: examExpired, remainingSeconds: examRemainingSeconds } = getExamTimeInfo(examForTimeCheck);
  if (examExpired) {
    throw ApiError.forbidden('Exam time is over. You can no longer take this test.');
  }

  // Save answer
  const answer = await Answer.upsert({
    attemptId,
    questionId,
    selectedOption,
  });

  // Fire-and-forget: send answer to n8n for evaluation
  try {
    // Get full question text
    const question = await Question.findById(questionId);

    await automationService.sendAnswerForEvaluation({
      question: question ? question.question_text : null,
      options: question
        ? [
            question.option_a,
            question.option_b,
            question.option_c,
            question.option_d,
          ]
        : [],
      studentAnswer: selectedOption,
      email: req.user.email,
    });
  } catch (error) {
    // Log but do not block student flow
    logger.error('Failed to send answer for evaluation', {
      message: error.message,
      attemptId,
      questionId,
    });
  }

  sendSuccess(res, HttpStatus.OK, 'Answer saved', {
    answer,
    remainingTimeInSeconds: examRemainingSeconds,
  });
});

/**
 * Submit exam
 * POST /api/student/attempts/:attemptId/submit
 */
const submitExam = catchAsync(async (req, res) => {
  const { attemptId } = req.params;
  const { answers } = req.body;

  // Verify attempt belongs to student
  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.student_id !== req.user.id) {
    throw ApiError.notFound('Attempt not found');
  }

  if (attempt.status === 'SUBMITTED') {
    throw ApiError.badRequest('Exam has already been submitted');
  }

  // Save any pending answers
  if (answers && answers.length > 0) {
    await Answer.saveMany(attemptId, answers);
  }

  // Calculate score
  const scoreData = await Answer.calculateScore(attemptId);

  // Submit attempt
  const submittedAttempt = await Attempt.submit(attemptId, scoreData.score, scoreData.totalMarks);

  // Get exam details
  const exam = await Exam.findById(attempt.exam_id);
  const student = await User.findById(req.user.id);

  // Determine pass/fail
  const passed = scoreData.percentage >= exam.pass_percentage;

  // Send result to n8n webhook
  automationService.sendResultToWebhook({
    studentName: student.name,
    studentEmail: student.email,
    registerNumber: student.register_number,
    examTitle: exam.title,
    examBranch: exam.branch,
    examYear: exam.year,
    score: scoreData.score,
    totalMarks: scoreData.totalMarks,
    percentage: scoreData.percentage,
    passed,
    submittedAt: submittedAttempt.submitted_at,
    attemptId: attempt.id,
  });

  logger.info('Exam submitted', { attemptId, score: scoreData.percentage });

  sendSuccess(res, HttpStatus.OK, 'Exam submitted successfully', {
    result: {
      attemptId: submittedAttempt.id,
      score: scoreData.score,
      totalMarks: scoreData.totalMarks,
      percentage: scoreData.percentage,
      correctAnswers: scoreData.correctAnswers,
      totalQuestions: scoreData.totalQuestions,
      passed,
      passPercentage: exam.pass_percentage,
      submittedAt: submittedAttempt.submitted_at,
    },
  });
});

/**
 * Get attempt details (for resuming or viewing)
 * GET /api/student/attempts/:attemptId
 */
const getAttempt = catchAsync(async (req, res) => {
  const { attemptId } = req.params;

  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.student_id !== req.user.id) {
    throw ApiError.notFound('Attempt not found');
  }

  // Get answered questions
  const answers = await Answer.findByAttempt(attemptId);

  // Calculate remaining time
  const remainingSeconds = attempt.status === 'IN_PROGRESS' 
    ? await Attempt.getRemainingTime(attemptId)
    : 0;

  sendSuccess(res, HttpStatus.OK, 'Attempt retrieved', {
    attempt: {
      id: attempt.id,
      examTitle: attempt.exam_title,
      status: attempt.status,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      score: attempt.score,
      totalMarks: attempt.total_marks,
      percentage: attempt.percentage,
      remainingSeconds,
    },
    answers: attempt.status === 'IN_PROGRESS' 
      ? answers.map(a => ({ questionId: a.question_id, selectedOption: a.selected_option }))
      : answers,
  });
});

/**
 * Get remaining time for attempt
 * GET /api/student/attempts/:attemptId/time
 */
const getRemainingTime = catchAsync(async (req, res) => {
  const { attemptId } = req.params;

  const attempt = await Attempt.findById(attemptId);
  if (!attempt || attempt.student_id !== req.user.id) {
    throw ApiError.notFound('Attempt not found');
  }

  if (attempt.status === 'SUBMITTED') {
    return sendSuccess(res, HttpStatus.OK, 'Time retrieved', { remainingSeconds: 0 });
  }

  const remainingSeconds = await Attempt.getRemainingTime(attemptId);

  sendSuccess(res, HttpStatus.OK, 'Time retrieved', { remainingSeconds });
});

module.exports = {
  getAvailableExams,
  startExam,
  saveAnswer,
  submitExam,
  getAttempt,
  getRemainingTime,
};
