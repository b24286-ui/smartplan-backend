const User = require('../models/User');
const Session = require('../models/Session');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const Quiz = require('../models/Quiz');

// @desc    Get user profile
// @route   GET /api/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update profile (name, grade, avatar)
// @route   PUT /api/profile
// @access  Private
const updateProfile = async (req, res) => {
  const { name, grade, avatar, college, course, year } = req.body;  // ← ADD 3 fields
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, grade, avatar, college, course, year },               // ← ADD 3 fields
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update app preferences
// @route   PUT /api/profile/preferences
// @access  Private
const updatePreferences = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { preferences: { ...req.body } },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get full user stats (for profile screen)
// @route   GET /api/profile/stats
// @access  Private
const getStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    const [subjectCount, totalSessions, topicCount, completedTopics, quizCount] =
      await Promise.all([
        Subject.countDocuments({ userId: req.user.id }),
        Session.countDocuments({ userId: req.user.id, completed: true }),
        Topic.countDocuments({ userId: req.user.id }),
        Topic.countDocuments({ userId: req.user.id, status: 'completed' }),
        Quiz.countDocuments({ userId: req.user.id })
      ]);

    // Find best subject (most study time)
    const subjectTimes = await Session.aggregate([
      { $match: { userId: req.user._id, completed: true } },
      { $group: { _id: '$subjectId', totalTime: { $sum: '$duration' } } },
      { $sort: { totalTime: -1 } },
      { $limit: 1 }
    ]);

    let bestSubject = null;
    if (subjectTimes.length > 0 && subjectTimes[0]._id) {
      const subject = await Subject.findById(subjectTimes[0]._id);
      if (subject) {
        bestSubject = {
          name: subject.name,
          icon: subject.icon,
          color: subject.color,
          time: subjectTimes[0].totalTime
        };
      }
    }

    // Average quiz score
    const quizzes = await Quiz.find({ userId: req.user.id });
    let avgQuizScore = null;
    const allAttempts = quizzes.flatMap(q => q.attempts);
    if (allAttempts.length > 0) {
      avgQuizScore = Math.round(allAttempts.reduce((acc, a) => acc + a.score, 0) / allAttempts.length);
    }

    res.json({
      success: true,
      stats: {
        xp: user.xp,
        level: user.level,
        streak: user.streak,
        totalStudyTime: user.totalStudyTime,
        totalSessions,
        subjectCount,
        topicCount,
        completedTopics,
        topicProgress: topicCount > 0 ? Math.round((completedTopics / topicCount) * 100) : 0,
        quizCount,
        avgQuizScore,
        bestSubject,
        memberSince: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getProfile, updateProfile, updatePreferences, getStats };
