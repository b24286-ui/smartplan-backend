const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String }],
  correctAnswer: { type: Number, required: true }, // index of correct option
  explanation: { type: String, default: '' }
});

const attemptSchema = new mongoose.Schema({
  answers: [Number],                               // array of chosen option indices
  score: { type: Number, default: 0 },             // percentage 0-100
  completedAt: { type: Date, default: Date.now },
  timeSpent: { type: Number, default: 0 }          // seconds
});

const quizSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true
  },
  questions: [questionSchema],
  attempts: [attemptSchema]
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
