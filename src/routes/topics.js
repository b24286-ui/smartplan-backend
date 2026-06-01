const express = require('express');
const router = express.Router();
const { getTopics, getTopic, createTopic, updateTopic, deleteTopic } = require('../controllers/topicController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getTopics).post(createTopic);
router.route('/:id').get(getTopic).put(updateTopic).delete(deleteTopic);

module.exports = router;
