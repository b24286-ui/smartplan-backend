const { generateQuiz } = require("../controllers/aiController");
const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { generateSchedule, rescheduleSession } = require('../controllers/aiController');

router.post('/schedule',   protect, generateSchedule);
router.post('/reschedule', protect, rescheduleSession);
router.post("/quiz", protect, generateQuiz);

module.exports = router;