const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Topic name is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['not-started', 'in-progress', 'completed'],
    default: 'not-started'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  estimatedTime: {
    type: Number,
    default: 60   // in minutes
  },
  actualTime: {
    type: Number,
    default: 0    // in minutes (accumulated)
  },
  notes: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  completedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Topic', topicSchema);
