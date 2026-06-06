const Topic = require('../models/Topic');
const Subject = require('../models/Subject');

// @desc    Get topics (optionally filtered by subjectId)
// @route   GET /api/topics?subjectId=xxx
// @access  Private
const getTopics = async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.subjectId) query.subjectId = req.query.subjectId;

    const topics = await Topic.find(query).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, count: topics.length, topics });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get single topic
// @route   GET /api/topics/:id
// @access  Private
const getTopic = async (req, res) => {
  try {
    const topic = await Topic.findOne({ _id: req.params.id, userId: req.user.id });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    res.json({ success: true, topic });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Create new topic
// @route   POST /api/topics
// @access  Private
const createTopic = async (req, res) => {
  const { subjectId, name, difficulty, estimatedTime, notes, status } = req.body;  // ← add status
  try {
    const subject = await Subject.findOne({ _id: subjectId, userId: req.user.id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const topicCount = await Topic.countDocuments({ subjectId });

    const topic = await Topic.create({
      subjectId,
      userId:        req.user.id,
      name,
      difficulty:    difficulty    || 'Medium',
      estimatedTime: estimatedTime || 1,
      status:        status        || 'not-started',   // ← add this
      notes:         notes         || '',
      order:         topicCount,
    });

    await Subject.findByIdAndUpdate(subjectId, { $inc: { totalTopics: 1 } });

    res.status(201).json({ success: true, topic });
  } catch (error) {
     console.error("createTopic ERROR:", error); 
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update topic (handles status changes & subject count sync)
// @route   PUT /api/topics/:id
// @access  Private
const updateTopic = async (req, res) => {
  try {
    const topic = await Topic.findOne({ _id: req.params.id, userId: req.user.id });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const wasCompleted = topic.status === 'completed';
    const willBeCompleted = req.body.status === 'completed';

    // Set completedAt timestamp when first marking as done
    const updateData = { ...req.body };
    if (!wasCompleted && willBeCompleted) {
      updateData.completedAt = new Date();
    } else if (wasCompleted && req.body.status && req.body.status !== 'completed') {
      updateData.completedAt = null;
    }

    const updatedTopic = await Topic.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Sync subject completed topics count
    if (!wasCompleted && willBeCompleted) {
      await Subject.findByIdAndUpdate(topic.subjectId, { $inc: { completedTopics: 1 } });
    } else if (wasCompleted && req.body.status && req.body.status !== 'completed') {
      await Subject.findByIdAndUpdate(topic.subjectId, { $inc: { completedTopics: -1 } });
    }

    res.json({ success: true, topic: updatedTopic });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete topic
// @route   DELETE /api/topics/:id
// @access  Private
const deleteTopic = async (req, res) => {
  try {
    const topic = await Topic.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    // Sync subject counts
    const countUpdate = { $inc: { totalTopics: -1 } };
    if (topic.status === 'completed') countUpdate.$inc.completedTopics = -1;
    await Subject.findByIdAndUpdate(topic.subjectId, countUpdate);

    res.json({ success: true, message: 'Topic deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getTopics, getTopic, createTopic, updateTopic, deleteTopic };
