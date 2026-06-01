const Session = require('../models/Session');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const Quiz = require('../models/Quiz');
const User = require('../models/User');

// @desc    Get analytics overview
// @route   GET /api/analytics/overview
// @access  Private
const getOverview = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    const [totalSessions, totalSubjects, totalTopics, completedTopics, totalQuizzes] =
      await Promise.all([
        Session.countDocuments({ userId: req.user.id, completed: true }),
        Subject.countDocuments({ userId: req.user.id }),
        Topic.countDocuments({ userId: req.user.id }),
        Topic.countDocuments({ userId: req.user.id, status: 'completed' }),
        Quiz.countDocuments({ userId: req.user.id })
      ]);

    // This week's study time
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekSessions = await Session.find({
      userId: req.user.id,
      completed: true,
      startTime: { $gte: weekStart }
    });
    const weeklyStudyTime = weekSessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    // Today's study time
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySessions = await Session.find({
      userId: req.user.id,
      completed: true,
      startTime: { $gte: todayStart }
    });
    const todayStudyTime = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0);

    res.json({
      success: true,
      overview: {
        xp: user.xp,
        level: user.level,
        streak: user.streak,
        totalStudyTime: user.totalStudyTime,
        todayStudyTime,
        weeklyStudyTime,
        dailyGoal: user.preferences?.dailyGoal || 60,
        dailyProgress: Math.min(100, Math.round((todayStudyTime / (user.preferences?.dailyGoal || 60)) * 100)),
        totalSessions,
        totalSubjects,
        totalTopics,
        completedTopics,
        topicProgress: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
        totalQuizzes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get study time by period (daily breakdown)
// @route   GET /api/analytics/study-time?period=week|month|year
// @access  Private
const getStudyTime = async (req, res) => {
  try {
    const period = req.query.period || 'week';
    const now = new Date();
    let startDate;
    let dateFormat;

    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      dateFormat = '%Y-%m-%d';
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      dateFormat = '%Y-%m-%d';
    } else {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 12);
      dateFormat = '%Y-%m';
    }

    const studyTime = await Session.aggregate([
      {
        $match: {
          userId: req.user._id,
          completed: true,
          startTime: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$startTime' } },
          totalTime: { $sum: '$duration' },
          sessions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, period, studyTime });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get per-subject time breakdown
// @route   GET /api/analytics/subjects
// @access  Private
const getSubjectBreakdown = async (req, res) => {
  try {
    const subjects = await Subject.find({ userId: req.user.id });

    const breakdown = await Promise.all(subjects.map(async (subject) => {
      const [sessions, topicCount, completedCount] = await Promise.all([
        Session.find({ userId: req.user.id, subjectId: subject._id, completed: true }),
        Topic.countDocuments({ subjectId: subject._id }),
        Topic.countDocuments({ subjectId: subject._id, status: 'completed' })
      ]);

      const totalTime = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);

      return {
        subjectId: subject._id,
        name: subject.name,
        color: subject.color,
        icon: subject.icon,
        totalTime,
        sessions: sessions.length,
        topics: topicCount,
        completedTopics: completedCount,
        progress: topicCount > 0 ? Math.round((completedCount / topicCount) * 100) : 0
      };
    }));

    // Sort by total study time desc
    breakdown.sort((a, b) => b.totalTime - a.totalTime);

    res.json({ success: true, breakdown });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get streak + 30-day daily activity
// @route   GET /api/analytics/streak
// @access  Private
const getStreak = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('streak lastStudiedAt xp level');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyData = await Session.aggregate([
      {
        $match: {
          userId: req.user._id,
          completed: true,
          startTime: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } },
          totalTime: { $sum: '$duration' },
          sessions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      streak: user.streak,
      lastStudiedAt: user.lastStudiedAt,
      xp: user.xp,
      level: user.level,
      dailyData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getOverview, getStudyTime, getSubjectBreakdown, getStreak };
