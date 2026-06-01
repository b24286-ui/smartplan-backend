const Quiz = require('../models/Quiz');
const User = require('../models/User');

// @desc    Get all quizzes
// @route   GET /api/quiz?subjectId=xxx&topicId=yyy
// @access  Private
const getQuizzes = async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.subjectId) query.subjectId = req.query.subjectId;
    if (req.query.topicId) query.topicId = req.query.topicId;

    const quizzes = await Quiz.find(query)
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name')
      .sort({ createdAt: -1 });

    // Add best score to each quiz summary
    const quizzesWithStats = quizzes.map(q => {
      const qObj = q.toObject();
      const attempts = q.attempts || [];
      qObj.attemptCount = attempts.length;
      qObj.bestScore = attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null;
      return qObj;
    });

    res.json({ success: true, count: quizzes.length, quizzes: quizzesWithStats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get single quiz
// @route   GET /api/quiz/:id
// @access  Private
const getQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user.id })
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name');

    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, quiz });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Create new quiz
// @route   POST /api/quiz
// @access  Private
const createQuiz = async (req, res) => {
  const { subjectId, topicId, title, questions } = req.body;
  try {
    if (!questions || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Quiz must have at least one question' });
    }

    const quiz = await Quiz.create({
      userId: req.user.id,
      subjectId,
      topicId: topicId || null,
      title,
      questions
    });

    res.status(201).json({ success: true, quiz });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Submit a quiz attempt
// @route   POST /api/quiz/:id/submit
// @access  Private
const submitQuiz = async (req, res) => {
  const { answers, timeSpent } = req.body;
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    // Grade the answers
    let correct = 0;
    const results = quiz.questions.map((q, index) => {
      const userAnswer = answers[index] ?? -1;
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      return {
        question: q.question,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation
      };
    });

    const score = Math.round((correct / quiz.questions.length) * 100);

    // Save attempt
    quiz.attempts.push({
      answers,
      score,
      completedAt: new Date(),
      timeSpent: timeSpent || 0
    });
    await quiz.save();

    // Award XP based on score
    let xpEarned = 0;
    if (score >= 80) xpEarned = 30;
    else if (score >= 60) xpEarned = 15;
    else if (score >= 40) xpEarned = 5;

    if (xpEarned > 0) {
      await User.findByIdAndUpdate(req.user.id, { $inc: { xp: xpEarned } });
    }

    res.json({
      success: true,
      score,
      correct,
      total: quiz.questions.length,
      xpEarned,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete quiz
// @route   DELETE /api/quiz/:id
// @access  Private
const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, message: 'Quiz deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getQuizzes, getQuiz, createQuiz, submitQuiz, deleteQuiz };
