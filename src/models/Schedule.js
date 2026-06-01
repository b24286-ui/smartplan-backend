const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,   // "HH:MM" format e.g. "09:30"
    required: true
  },
  endTime: {
    type: String    // "HH:MM" format
  },
  duration: {
    type: Number,
    default: 60     // minutes
  },
  type: {
    type: String,
    enum: ['focus', 'review', 'quiz'],
    default: 'focus'
  },
  completed: {
    type: Boolean,
    default: false
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    default: null   // linked when completed
  }
}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
