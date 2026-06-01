const Session = require('../models/Session');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');

// XP calculation: 10 XP per 30 minutes studied
const calculateXP = (durationMinutes) => Math.floor(durationMinutes / 30) * 10;

// Level from XP: level up every 500 XP
const calculateLevel = (xp) => Math.floor(xp / 500) + 1;

// @desc    Get sessions list
// @route   GET /api/sessions
// @access  Private
const getSessions = async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.subjectId) query.subjectId = req.query.subjectId;
    if (req.query.topicId) query.topicId = req.query.topicId;
    if (req.query.completed !== undefined) query.completed = req.query.completed === 'true';

    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    const sessions = await Session.find(query)
      .populate('subjectId', 'name color icon')
      .populate('topicId', 'name')
      .sort({ startTime: -1 })
      .limit(limit);

    res.json({ success: true, count: sessions.length, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Start a study session
// @route   POST /api/sessions/start
// @access  Private
const startSession = async (req, res) => {
  const { subjectId, topicId, type, plannedDuration } = req.body;
  try {
    const session = await Session.create({
      userId: req.user.id,
      subjectId: subjectId || null,
      topicId: topicId || null,
      type: type || 'focus',
      startTime: new Date(),
      plannedDuration: plannedDuration || 25,
      completed: false
    });

    // Mark topic as in-progress if provided
    if (topicId) {
      await Topic.findOneAndUpdate(
        { _id: topicId, status: 'not-started' },
        { status: 'in-progress' }
      );
    }

    res.status(201).json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    End a study session (calculates XP, updates streak)
// @route   PUT /api/sessions/:id/end
// @access  Private
const endSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, userId: req.user.id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    if (session.completed) {
      return res.status(400).json({ success: false, message: 'Session already completed' });
    }

    const endTime = new Date();
    const durationMinutes = Math.round((endTime - session.startTime) / 60000);
    const xpFromSession = calculateXP(durationMinutes);

    // Update session
    session.endTime = endTime;
    session.duration = durationMinutes;
    session.xpEarned = xpFromSession;
    session.completed = true;
    session.notes = req.body.notes || '';
    await session.save();

    // Update subject study time
    if (session.subjectId) {
      await Subject.findByIdAndUpdate(session.subjectId, {
        $inc: { totalStudyTime: durationMinutes }
      });
    }

    // Update topic actual time
    if (session.topicId) {
      await Topic.findByIdAndUpdate(session.topicId, {
        $inc: { actualTime: durationMinutes }
      });
    }

    // ── Streak & XP Logic ──────────────────────────────────────────
    const user = await User.findById(req.user.id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const lastStudied = user.lastStudiedAt ? new Date(user.lastStudiedAt) : null;
    let lastStudiedStart = null;
    if (lastStudied) {
      lastStudiedStart = new Date(lastStudied);
      lastStudiedStart.setHours(0, 0, 0, 0);
    }

    const isFirstStudyToday = !lastStudiedStart || lastStudiedStart < todayStart;
    const isConsecutiveDay = lastStudiedStart &&
      (todayStart - lastStudiedStart) === 86400000; // exactly 24h

    let streakBonus = 0;
    let newStreak = user.streak;

    if (isFirstStudyToday) {
      streakBonus = 20; // daily login XP bonus
      newStreak = isConsecutiveDay ? user.streak + 1 : 1;
    }

    const totalXpGained = xpFromSession + streakBonus;
    const newXp = user.xp + totalXpGained;
    const newLevel = calculateLevel(newXp);

    await User.findByIdAndUpdate(req.user.id, {
      $inc: { totalStudyTime: durationMinutes },
      xp: newXp,
      level: newLevel,
      streak: newStreak,
      lastStudiedAt: endTime
    });
    // ───────────────────────────────────────────────────────────────

    const updatedUser = await User.findById(req.user.id).select('-password');

    res.json({
      success: true,
      session,
      xpEarned: totalXpGained,
      streakBonus,
      user: {
        xp: updatedUser.xp,
        level: updatedUser.level,
        streak: updatedUser.streak,
        totalStudyTime: updatedUser.totalStudyTime
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get today's study summary
// @route   GET /api/sessions/summary
// @access  Private
const getSummary = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todaySessions = await Session.find({
      userId: req.user.id,
      completed: true,
      startTime: { $gte: todayStart, $lt: todayEnd }
    }).populate('subjectId', 'name color icon');

    const totalTimeToday = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    res.json({
      success: true,
      summary: {
        todayTime: totalTimeToday,
        sessionsCount: todaySessions.length,
        sessions: todaySessions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getSessions, startSession, endSession, getSummary };
