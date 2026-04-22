/**
 * Teacher Controller
 * Handles prompt-based question generation and subject retrieval
 */

const axios = require('axios');
const db = require('../config/database');
const { sendSuccess, sendError, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { automationService } = require('../services');

/**
 * Get subjects for a department and year
 * GET /api/teacher/subjects?department=CSE&year=1-1
 */
const getSubjects = catchAsync(async (req, res) => {
  const { department, year } = req.query;

  if (!department || !year) {
    throw ApiError.badRequest('Department and year are required');
  }

  const result = await db.query(
    `SELECT DISTINCT subject FROM syllabus_library 
     WHERE department = $1 AND year = $2 
     ORDER BY subject ASC`,
    [department, year]
  );

  const subjects = result.rows.map((row) => row.subject);

  sendSuccess(res, HttpStatus.OK, 'Subjects retrieved successfully', subjects);
});

/**
 * Generate questions from prompt (without file)
 * POST /api/teacher/generate-questions-from-prompt
 */
const generateQuestionsFromPrompt = catchAsync(async (req, res) => {
  const { department, year, subject, questionType, difficulty, numberOfQuestions, prompt, additionalInstructions } = req.body;

  // Validate required fields
  if (!department || !year || !subject || !questionType || !difficulty || !numberOfQuestions || !prompt) {
    throw ApiError.badRequest('All required fields must be provided: department, year, subject, questionType, difficulty, numberOfQuestions, prompt');
  }

  const questionCount = Math.max(1, Math.min(Math.floor(numberOfQuestions), 30));
  const optionLetters = ['A', 'B', 'C', 'D'];
  
  const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const mapRawQuestion = (rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== 'object') {
      return null;
    }

    const questionText = normalizeText(rawQuestion.questionText ?? rawQuestion.question_text ?? rawQuestion.question);
    if (!questionText) {
      return null;
    }

    // For descriptive/long answer questions, options might not be present
    if (questionType === 'Descriptive' || questionType === 'Long Answer' || questionType === 'Viva Questions') {
      return {
        question_text: questionText,
        option_a: null,
        option_b: null,
        option_c: null,
        option_d: null,
        correct_option: null,
        marks: Number(rawQuestion.marks) > 0 ? Number(rawQuestion.marks) : 1,
      };
    }

    // For MCQ, require 4 options
    if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length !== 4) {
      return null;
    }

    if (rawQuestion.options.some((option) => typeof option !== 'string')) {
      return null;
    }

    const options = rawQuestion.options.map((option) => normalizeText(option));
    if (options.some((option) => !option)) {
      return null;
    }

    const correctOption = normalizeText(rawQuestion.correctOption).toUpperCase();
    if (!optionLetters.includes(correctOption)) {
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

  // Build the prompt for n8n
  const fullPrompt = `${prompt}${additionalInstructions ? '\nAdditional instructions: ' + additionalInstructions : ''}`;

  const maxAttempts = 3;
  const generatedQuestions = [];
  let attemptsUsed = 0;
  let lastAutomationResponse = null;

  while (generatedQuestions.length < questionCount && attemptsUsed < maxAttempts) {
    const remainingCount = questionCount - generatedQuestions.length;
    const batchCount = Math.min(20, Math.max(remainingCount, 5));

    const n8nPayload = {
      prompt: fullPrompt,
      count: batchCount,
      department,
      year,
      subject,
      questionType,
      difficulty,
      type: 'prompt-based',
    };

    let body;
    try {
      const n8nResponse = await axios.post(
        'http://localhost:5678/webhook/generate-questions-from-prompt',
        n8nPayload,
        { timeout: 120000 }
      );
      body = n8nResponse?.data;
      lastAutomationResponse = body;
    } catch (error) {
      logger.error('n8n prompt-based question generation error', {
        message: error.message,
        code: error.code,
        attempt: attemptsUsed + 1,
      });
      throw ApiError.internal('Failed to generate questions. Please try again.');
    }

    if (!Array.isArray(body?.questions)) {
      attemptsUsed += 1;
      continue;
    }

    for (const rawQuestion of body.questions) {
      if (generatedQuestions.length >= questionCount) break;

      const mappedQuestion = mapRawQuestion(rawQuestion);
      if (mappedQuestion) {
        generatedQuestions.push(mappedQuestion);
      }
    }

    attemptsUsed += 1;
  }

  if (generatedQuestions.length === 0) {
    logger.error('Prompt-based question generation returned no valid questions', {
      department,
      year,
      subject,
      prompt,
      attemptsUsed,
    });
    throw ApiError.internal('Failed to generate questions. Please try again with a different prompt.');
  }

  logger.info('Questions generated from prompt', {
    department,
    year,
    subject,
    requested: questionCount,
    generated: generatedQuestions.length,
    attemptsUsed,
  });

  const successMessage = generatedQuestions.length < questionCount
    ? `Generated ${generatedQuestions.length} questions out of ${questionCount} requested`
    : `Generated ${generatedQuestions.length} questions`;

  sendSuccess(res, HttpStatus.CREATED, successMessage, {
    questions: generatedQuestions,
    requested: questionCount,
    generated: generatedQuestions.length,
  });
});

module.exports = {
  getSubjects,
  generateQuestionsFromPrompt,
};
