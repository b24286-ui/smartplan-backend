const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Subject name is required'],
    trim: true
  },
  color: {
    type: String,
    default: '#5150b1'
  },
  icon: {
    type: String,
    default: '📚'
  },
  description: {
    type: String,
    default: ''
  },
  totalTopics: {
    type: Number,
    default: 0
  },
  completedTopics: {
    type: Number,
    default: 0
  },
  totalStudyTime: {
    type: Number,
    default: 0   // in minutes
  }
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
