const express = require('express');
const router = express.Router();
const { getOverview, getStudyTime, getSubjectBreakdown, getStreak } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/overview', getOverview);
router.get('/study-time', getStudyTime);
router.get('/subjects', getSubjectBreakdown);
router.get('/streak', getStreak);

module.exports = router;
