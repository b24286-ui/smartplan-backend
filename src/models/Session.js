const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  type: {
    type: String,
    enum: ['focus', 'review', 'quiz'],
    default: 'focus'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 0     // actual minutes completed
  },
  plannedDuration: {
    type: Number,
    default: 25    // planned minutes (pomodoro)
  },
  completed: {
    type: Boolean,
    default: false
  },
  xpEarned: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
