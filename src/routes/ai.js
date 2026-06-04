const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { generateSchedule } = require('../controllers/aiController');

router.post('/schedule', protect, generateSchedule);

module.exports = router;