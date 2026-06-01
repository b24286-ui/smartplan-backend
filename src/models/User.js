const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  avatar: {
    type: String,
    default: '🎓'
  },
  grade: {
    type: String,
    default: ''
  },
  college: {
  type: String,
  default: ''
},
course: {
  type: String,
  default: ''
},
year: {
  type: String,
  default: ''
},
  // Gamification
  xp: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },
  streak: {
    type: Number,
    default: 0
  },
  lastStudiedAt: {
    type: Date,
    default: null
  },
  totalStudyTime: {
    type: Number,
    default: 0  // in minutes
  },
  // App preferences
  preferences: {
    dailyGoal: { type: Number, default: 60 },        // minutes per day
    focusDuration: { type: Number, default: 25 },     // pomodoro minutes
    breakDuration: { type: Number, default: 5 },      // break minutes
    notifications: { type: Boolean, default: true },
    theme: { type: String, default: 'light' }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
