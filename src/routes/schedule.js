const express = require('express');
const router = express.Router();
const { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem, markCompleted } = require('../controllers/scheduleController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getSchedule).post(createScheduleItem);
router.route('/:id').put(updateScheduleItem).delete(deleteScheduleItem);
router.put('/:id/complete', markCompleted);

module.exports = router;
