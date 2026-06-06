const Schedule = require('../models/Schedule');

// ── Helper: minutes between two "HH:MM" strings ──────────────────────────────
function calcDuration(startTime, endTime) {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins : 60;
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get schedule items (filter by date or week)
// @route   GET /api/schedule?date=YYYY-MM-DD  OR  ?week=YYYY-MM-DD
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getSchedule = async (req, res) => {
  try {
    const query = { userId: req.user.id };

    if (req.query.date) {
      const date    = new Date(req.query.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: date, $lt: nextDay };
    } else if (req.query.week) {
      const weekStart = new Date(req.query.week);
      const weekEnd   = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      query.date = { $gte: weekStart, $lt: weekEnd };
    }

    const schedule = await Schedule.find(query)
      .populate('subjectId', 'name color icon colorIdx')
      .populate('topicId',   'name status')
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, count: schedule.length, schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a single schedule item
// @route   POST /api/schedule
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const createScheduleItem = async (req, res) => {
  const { subjectId, topicId, date, startTime, endTime, duration, type } = req.body;
  try {
    const scheduleItem = await Schedule.create({
      userId:    req.user.id,
      subjectId,
      topicId:   topicId || null,
      date:      new Date(date),
      startTime,
      endTime:   endTime  || null,
      duration:  duration || calcDuration(startTime, endTime),
      type:      type     || 'focus',
      status:    'pending',
    });

    const populated = await Schedule.findById(scheduleItem._id)
      .populate('subjectId', 'name color icon colorIdx')
      .populate('topicId',   'name status');

    res.status(201).json({ success: true, scheduleItem: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update schedule item (status, times, sessionId, etc.)
// @route   PUT /api/schedule/:id
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
// In smartplan-backend/src/controllers/scheduleController.js
// Find the updateScheduleItem function and add date to the whitelist:

const updateScheduleItem = async (req, res) => {
  try {
    const { status, startTime, endTime, sessionId, type, date } = req.body;
    const updates = {};

    if (status    !== undefined) updates.status    = status;
    if (startTime !== undefined) updates.startTime = startTime;
    if (endTime   !== undefined) updates.endTime   = endTime;
    if (sessionId !== undefined) updates.sessionId = sessionId;
    if (type      !== undefined) updates.type      = type;
    if (date      !== undefined) updates.date      = new Date(date); // ← ADD THIS LINE

    const s = startTime || undefined;
    const e = endTime   || undefined;
    if (s && e) updates.duration = calcDuration(s, e);

    const scheduleItem = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updates,
      { new: true, runValidators: true }
    )
      .populate('subjectId', 'name color icon colorIdx')
      .populate('topicId',   'name status');

    if (!scheduleItem)
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    res.json({ success: true, scheduleItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// @desc    Delete schedule item
// @route   DELETE /api/schedule/:id
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const deleteScheduleItem = async (req, res) => {
  try {
    const scheduleItem = await Schedule.findOneAndDelete({
      _id:    req.params.id,
      userId: req.user.id,
    });
    if (!scheduleItem) {
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    }
    res.json({ success: true, message: 'Schedule item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mark schedule item as completed + link session
// @route   PUT /api/schedule/:id/complete
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const markCompleted = async (req, res) => {
  try {
    // FIX: was `completed: true` — model now uses `status` string, not a boolean
    const scheduleItem = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status: 'completed', sessionId: req.body.sessionId || null },
      { new: true }
    )
      .populate('subjectId', 'name color icon colorIdx')
      .populate('topicId',   'name status');

    if (!scheduleItem) {
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    }
    res.json({ success: true, scheduleItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Bulk-create sessions (used by AI Schedule Generator)
// @route   POST /api/schedule/bulk
// @access  Private
// NOTE:    Register this route BEFORE /:id routes in routes/schedule.js
// ─────────────────────────────────────────────────────────────────────────────
const bulkCreate = async (req, res) => {
  try {
    const { sessions } = req.body;

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ success: false, message: 'sessions array is required' });
    }

    const docs = sessions.map((s) => ({
      userId:    req.user.id,
      subjectId: s.subjectId,
      topicId:   s.topicId   || null,
      date:      new Date(s.date),       // convert "YYYY-MM-DD" string → Date
      startTime: s.startTime,
      endTime:   s.endTime,
      duration:  calcDuration(s.startTime, s.endTime),
      type:      'focus',                // AI always generates focus sessions
      status:    'pending',
    }));

    const created = await Schedule.insertMany(docs);

    // Re-fetch with population so response has subjectId/topicId as full objects
    const populated = await Schedule.find({
      _id: { $in: created.map((c) => c._id) },
    })
      .populate('subjectId', 'name color icon colorIdx')
      .populate('topicId',   'name status')
      .sort({ date: 1, startTime: 1 });

    res.status(201).json({
      success:  true,
      count:    populated.length,
      schedule: populated,
    });
  } catch (err) {
    console.error('bulkCreate error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getSchedule,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  markCompleted,
  bulkCreate,           // ← added
};