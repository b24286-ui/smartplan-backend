const express = require('express');
const router = express.Router();
const { getSessions, startSession, endSession, getSummary } = require('../controllers/sessionController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', getSessions);
router.post('/start', startSession);
router.get('/summary', getSummary);
router.put('/:id/end', endSession);

module.exports = router;
