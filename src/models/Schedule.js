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
    type: String,   // "HH:MM" 24-hour format e.g. "09:30"
    required: true
  },
  endTime: {
    type: String    // "HH:MM" 24-hour format
  },
  duration: {
    type: Number,
    default: 60     // minutes — auto-calculated in pre-save if startTime + endTime present
  },
  type: {
    type: String,
    enum: ['focus', 'review', 'quiz'],
    default: 'focus'
  },
  // ── Replaces the old `completed: Boolean` ──────────────────────────────────
  // Gives us pending / completed / skipped instead of just true/false,
  // which is what normalizeSession() and toggleStatus() in the frontend expect.
  status: {
    type: String,
    enum: ['pending', 'completed', 'skipped'],
    default: 'pending'
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    default: null   // linked when a FocusPage session is finished
  }
}, { timestamps: true });

// ── Auto-calculate duration (minutes) before every save ───────────────────────
scheduleSchema.pre('save', function (next) {
  if (this.startTime && this.endTime) {
    const [sh, sm] = this.startTime.split(':').map(Number);
    const [eh, em] = this.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) this.duration = mins;
  }
  next();
});

// ── Always populate subjectId + topicId on find queries ──────────────────────
scheduleSchema.pre(/^find/, function (next) {
  this.populate('subjectId', 'name colorIdx')
      .populate('topicId',   'name');
  next();
});

module.exports = mongoose.model('Schedule', scheduleSchema);