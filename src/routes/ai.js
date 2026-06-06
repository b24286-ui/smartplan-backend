const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { generateSchedule, rescheduleSession, generateQuiz, generatePostSessionQuiz } = require('../controllers/aiController');

router.post('/schedule',          protect, generateSchedule);
router.post('/reschedule',        protect, rescheduleSession);
router.post('/quiz',              protect, generateQuiz);
router.post('/post-session-quiz', protect, generatePostSessionQuiz);

module.exports = router;