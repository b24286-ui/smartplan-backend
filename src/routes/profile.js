const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, updatePreferences, getStats } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getProfile).put(updateProfile);
router.put('/preferences', updatePreferences);
router.get('/stats', getStats);

module.exports = router;
