/**
 * Result Controller
 * Handles result viewing for students and teachers
 */

const Attempt = require('../models/Attempt');
const Answer = require('../models/Answer');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const { sendSuccess, HttpStatus } = require('../utils/response');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

/**
 * Get student's all results
 * GET /api/student/results
 */
const getStudentResults = catchAsync(async (req, res) => {
  const attempts = await Attempt.findByStudent(req.user.id);

  // Format results
  const results = attempts
    .filter(a => a.status === 'SUBMITTED')
    .map(attempt => ({
      attemptId: attempt.id,
      examId: attempt.exam_id,
      examTitle: attempt.exam_title,
      branch: attempt.branch,
      year: attempt.year,
      score: attempt.score,
      totalMarks: attempt.total_marks,
      percentage: parseFloat(attempt.percentage),
      passed: parseFloat(attempt.percentage) >= attempt.pass_percentage,
      passPercentage: attempt.pass_percentage,
      creatorName: attempt.creator_name,
      submittedAt: attempt.submitted_at,
    }));

  sendSuccess(res, HttpStatus.OK, 'Results retrieved', { results });
});

/**
 * Get specific result with answers
 * GET /api/student/results/:attemptId
 */
const getResultDetails = catchAsync(async (req, res) => {
  const { attemptId } = req.params;

  const attempt = await Attempt.findById(attemptId);
  
  if (!attempt) {
    throw ApiError.notFound('Result not found');
  }

  // Student can only see their own results
  if (req.user.role === 'STUDENT' && attempt.student_id !== req.user.id) {
    throw ApiError.forbidden('You can only view your own results');
  }

  // Teacher can only see results for their own exams
  if (req.user.role === 'TEACHER') {
    const isOwner = await Exam.isOwner(attempt.exam_id, req.user.id);
    if (!isOwner) {
      throw ApiError.forbidden('You can only view results for your own exams');
    }
  }

  if (attempt.status !== 'SUBMITTED') {
    throw ApiError.badRequest('Exam has not been submitted yet');
  }

  // Get answers with question details
  const answers = await Answer.findByAttempt(attemptId);
  const exam = await Exam.findById(attempt.exam_id);

  // Format answer details
  const answerDetails = answers.map(a => ({
    questionId: a.question_id,
    questionText: a.question_text,
    optionA: a.option_a,
    optionB: a.option_b,
    optionC: a.option_c,
    optionD: a.option_d,
    selectedOption: a.selected_option,
    correctOption: a.correct_option,
    isCorrect: a.is_correct,
    marks: a.marks,
    explanation: a.explanation,
  }));

  sendSuccess(res, HttpStatus.OK, 'Result details retrieved', {
    result: {
      attemptId: attempt.id,
      examId: attempt.exam_id,
      examTitle: attempt.exam_title,
      studentName: attempt.student_name,
      studentEmail: attempt.student_email,
      score: attempt.score,
      totalMarks: attempt.total_marks,
      percentage: parseFloat(attempt.percentage),
      passed: parseFloat(attempt.percentage) >= exam.pass_percentage,
      passPercentage: exam.pass_percentage,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
    },
    answers: answerDetails,
  });
});

/**
 * Get all results for an exam (Teacher)
 * GET /api/teacher/exams/:examId/results
 */
const getExamResults = catchAsync(async (req, res) => {
  const { examId } = req.params;

  // Check ownership
  const isOwner = await Exam.isOwner(examId, req.user.id);
  if (!isOwner) {
    throw ApiError.forbidden('You can only view results for your own exams');
  }

  const exam = await Exam.findById(examId);
  const attempts = await Attempt.findByExam(examId);
  const statistics = await Exam.getStatistics(examId);

  // Format results
  const results = attempts
    .filter(a => a.status === 'SUBMITTED')
    .map(attempt => ({
      attemptId: attempt.id,
      studentId: attempt.student_id,
      studentName: attempt.student_name,
      studentEmail: attempt.student_email,
      registerNumber: attempt.register_number,
      score: attempt.score,
      totalMarks: attempt.total_marks,
      percentage: parseFloat(attempt.percentage),
      passed: parseFloat(attempt.percentage) >= exam.pass_percentage,
      submittedAt: attempt.submitted_at,
    }));

  sendSuccess(res, HttpStatus.OK, 'Exam results retrieved', {
    exam: {
      id: exam.id,
      title: exam.title,
      branch: exam.branch,
      year: exam.year,
      totalQuestions: exam.total_questions,
      passPercentage: exam.pass_percentage,
    },
    statistics: {
      totalAttempts: parseInt(statistics.total_attempts, 10),
      completedAttempts: parseInt(statistics.completed_attempts, 10),
      averageScore: parseFloat(statistics.average_score) || 0,
      highestScore: parseFloat(statistics.highest_score) || 0,
      lowestScore: parseFloat(statistics.lowest_score) || 0,
      passedCount: parseInt(statistics.passed_count, 10),
      passRate: statistics.completed_attempts > 0 
        ? ((statistics.passed_count / statistics.completed_attempts) * 100).toFixed(2)
        : 0,
    },
    results,
  });
});

/**
 * Get all results for teacher (all exams)
 * GET /api/teacher/results
 */
const getTeacherAllResults = catchAsync(async (req, res) => {
  const exams = await Exam.findByTeacher(req.user.id);

  const examResults = [];

  for (const exam of exams) {
    const statistics = await Exam.getStatistics(exam.id);
    
    examResults.push({
      examId: exam.id,
      title: exam.title,
      branch: exam.branch,
      year: exam.year,
      status: exam.status,
      totalAttempts: parseInt(statistics.total_attempts, 10),
      completedAttempts: parseInt(statistics.completed_attempts, 10),
      averageScore: parseFloat(statistics.average_score) || 0,
      passedCount: parseInt(statistics.passed_count, 10),
      createdAt: exam.created_at,
    });
  }

  sendSuccess(res, HttpStatus.OK, 'Teacher results retrieved', { exams: examResults });
});

module.exports = {
  getStudentResults,
  getResultDetails,
  getExamResults,
  getTeacherAllResults,
};
