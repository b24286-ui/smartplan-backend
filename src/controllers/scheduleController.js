const Schedule = require('../models/Schedule');

// @desc    Get schedule items (filter by date or week)
// @route   GET /api/schedule?date=YYYY-MM-DD  OR  ?week=YYYY-MM-DD
// @access  Private
const getSchedule = async (req, res) => {
  try {
    const query = { userId: req.user.id };

    if (req.query.date) {
      const date = new Date(req.query.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = { $gte: date, $lt: nextDay };
    } else if (req.query.week) {
      const weekStart = new Date(req.query.week);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      query.date = { $gte: weekStart, $lt: weekEnd };
    }

    const schedule = await Schedule.find(query)
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name status')
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, count: schedule.length, schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Create schedule item
// @route   POST /api/schedule
// @access  Private
const createScheduleItem = async (req, res) => {
  const { subjectId, topicId, date, startTime, endTime, duration, type } = req.body;
  try {
    const scheduleItem = await Schedule.create({
      userId: req.user.id,
      subjectId,
      topicId: topicId || null,
      date: new Date(date),
      startTime,
      endTime: endTime || null,
      duration: duration || 60,
      type: type || 'focus'
    });

    const populated = await Schedule.findById(scheduleItem._id)
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name status');

    res.status(201).json({ success: true, scheduleItem: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update schedule item
// @route   PUT /api/schedule/:id
// @access  Private
const updateScheduleItem = async (req, res) => {
  try {
    const scheduleItem = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    )
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name status');

    if (!scheduleItem) {
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    }
    res.json({ success: true, scheduleItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete schedule item
// @route   DELETE /api/schedule/:id
// @access  Private
const deleteScheduleItem = async (req, res) => {
  try {
    const scheduleItem = await Schedule.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!scheduleItem) {
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    }
    res.json({ success: true, message: 'Schedule item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Mark schedule item as completed (link to a session)
// @route   PUT /api/schedule/:id/complete
// @access  Private
const markCompleted = async (req, res) => {
  try {
    const scheduleItem = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { completed: true, sessionId: req.body.sessionId || null },
      { new: true }
    );
    if (!scheduleItem) {
      return res.status(404).json({ success: false, message: 'Schedule item not found' });
    }
    res.json({ success: true, scheduleItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getSchedule, createScheduleItem, updateScheduleItem, deleteScheduleItem, markCompleted };
