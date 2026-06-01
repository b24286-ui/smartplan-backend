const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const Session = require('../models/Session');

// @desc    Get all subjects for logged in user
// @route   GET /api/subjects
// @access  Private
const getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, count: subjects.length, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
const getSubject = async (req, res) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, userId: req.user.id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }
    res.json({ success: true, subject });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Create new subject
// @route   POST /api/subjects
// @access  Private
const createSubject = async (req, res) => {
  const { name, color, icon, description } = req.body;
  try {
    const subject = await Subject.create({
      userId: req.user.id,
      name,
      color: color || '#5150b1',
      icon: icon || '📚',
      description: description || ''
    });
    res.status(201).json({ success: true, subject });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private
const updateSubject = async (req, res) => {
  try {
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }
    res.json({ success: true, subject });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Delete subject (and all its topics/sessions)
// @route   DELETE /api/subjects/:id
// @access  Private
const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }
    // Cascade delete related data
    await Topic.deleteMany({ subjectId: req.params.id });
    res.json({ success: true, message: 'Subject and all related data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = { getSubjects, getSubject, createSubject, updateSubject, deleteSubject };
