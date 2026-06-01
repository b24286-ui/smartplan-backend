const express = require('express');
const router = express.Router();
const { getQuizzes, getQuiz, createQuiz, submitQuiz, deleteQuiz } = require('../controllers/quizController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getQuizzes).post(createQuiz);
router.route('/:id').get(getQuiz).delete(deleteQuiz);
router.post('/:id/submit', submitQuiz);

module.exports = router;
