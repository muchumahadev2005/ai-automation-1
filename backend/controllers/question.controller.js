/**
 * Question Controller
 * Handles question CRUD operations
 */

const Question = require('../models/Question');
const Exam = require('../models/Exam');
const { sendSuccess, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Create a new question
 * POST /api/questions
 */
const createQuestion = catchAsync(async (req, res) => {
  const { examId, questionText, optionA, optionB, optionC, optionD, correctOption, marks, explanation } = req.body;

  // Check exam ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only add questions to your own exams');
  }

  // Check if exam is editable
  const exam = await Exam.findById(examId);
  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot add questions to a published exam');
  }

  const question = await Question.create({
    examId,
    questionText,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    marks,
    explanation,
  });

  logger.info('Question created', { questionId: question.id, examId });

  sendSuccess(res, HttpStatus.CREATED, 'Question created successfully', { question });
});

/**
 * Create multiple questions
 * POST /api/questions/bulk
 */
const createBulkQuestions = catchAsync(async (req, res) => {
  const { examId, questions } = req.body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw ApiError.badRequest('Questions array is required');
  }

  // Check exam ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only add questions to your own exams');
  }

  // Check if exam is editable
  const exam = await Exam.findById(examId);
  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot add questions to a published exam');
  }

  const createdQuestions = await Question.createBulk(examId, questions);

  logger.info('Bulk questions created', { examId, count: createdQuestions.length });

  sendSuccess(res, HttpStatus.CREATED, `${createdQuestions.length} questions created`, {
    questions: createdQuestions,
  });
});

/**
 * Get question by ID
 * GET /api/questions/:questionId
 */
const getQuestionById = catchAsync(async (req, res) => {
  const { questionId } = req.params;

  const question = await Question.findById(questionId);

  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  // Check if user has access to this question
  const exam = await Exam.findById(question.exam_id);
  if (exam.created_by !== req.user.id) {
    throw ApiError.forbidden('You do not have access to this question');
  }

  sendSuccess(res, HttpStatus.OK, 'Question retrieved', { question });
});

/**
 * Get all questions for an exam
 * GET /api/questions/exam/:examId
 */
const getExamQuestions = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check if exam exists and user has access
  const exam = await Exam.findById(examId);
  if (!exam) {
    throw ApiError.notFound('Exam not found');
  }

  // Teachers see answers, students don't (during exam)
  const includeAnswers = req.user.role === 'TEACHER';
  const questions = await Question.findByExam(examId, includeAnswers);

  sendSuccess(res, HttpStatus.OK, 'Questions retrieved', { questions });
});

/**
 * Update question
 * PUT /api/questions/:questionId
 */
const updateQuestion = catchAsync(async (req, res) => {
  const { questionId } = req.params;

  const question = await Question.findById(questionId);

  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  // Check exam ownership
  const isOwner = await Exam.isOwner(question.exam_id, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only update questions in your own exams');
  }

  // Check if exam is editable
  const exam = await Exam.findById(question.exam_id);
  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot update questions in a published exam');
  }

  const updatedQuestion = await Question.update(questionId, req.body);

  logger.info('Question updated', { questionId });

  sendSuccess(res, HttpStatus.OK, 'Question updated successfully', { question: updatedQuestion });
});

/**
 * Delete question
 * DELETE /api/questions/:questionId
 */
const deleteQuestion = catchAsync(async (req, res) => {
  const { questionId } = req.params;

  const question = await Question.findById(questionId);

  if (!question) {
    throw ApiError.notFound('Question not found');
  }

  // Check exam ownership
  const isOwner = await Exam.isOwner(question.exam_id, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only delete questions from your own exams');
  }

  // Check if exam is editable
  const exam = await Exam.findById(question.exam_id);
  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot delete questions from a published exam');
  }

  await Question.delete(questionId);

  logger.info('Question deleted', { questionId });

  sendSuccess(res, HttpStatus.OK, 'Question deleted successfully');
});

/**
 * Delete all questions for an exam
 * DELETE /api/questions/exam/:examId
 */
const deleteExamQuestions = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check exam ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only delete questions from your own exams');
  }

  // Check if exam is editable
  const exam = await Exam.findById(examId);
  if (exam.status !== 'DRAFT') {
    throw ApiError.badRequest('Cannot delete questions from a published exam');
  }

  const deletedCount = await Question.deleteByExam(examId);

  logger.info('All exam questions deleted', { examId, count: deletedCount });

  sendSuccess(res, HttpStatus.OK, `${deletedCount} questions deleted`);
});

module.exports = {
  createQuestion,
  createBulkQuestions,
  getQuestionById,
  getExamQuestions,
  updateQuestion,
  deleteQuestion,
  deleteExamQuestions,
};
