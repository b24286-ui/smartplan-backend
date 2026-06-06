const Subject  = require('../models/Subject');
const Topic    = require('../models/Topic');
const Schedule = require('../models/Schedule');

// ═══════════════════════════════════════════════════════════════════════════
// TIME UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
const SLOT_MINS = 30;

function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function toTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD DAY GRID
// ═══════════════════════════════════════════════════════════════════════════
function buildDayGrid(studyStart, studyEnd, lunchTime, lunchDuration, leisureTime, leisureDuration) {
  const sMin = toMins(studyStart);
  const eMin = toMins(studyEnd);
  const lS   = toMins(lunchTime);
  const lE   = lS + lunchDuration;
  const rS   = toMins(leisureTime);
  const rE   = rS + leisureDuration;
  const grid = [];
  for (let t = sMin; t < eMin; t += SLOT_MINS) {
    const blocked = (t >= lS && t < lE) || (t >= rS && t < rE);
    grid.push({ start: t, end: t + SLOT_MINS, available: !blocked });
  }
  return grid;
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEDY SCORING
// ═══════════════════════════════════════════════════════════════════════════
const HARD_KW   = ['dsa','algorithm','algo','math','physic','circuit','verilog',
                   'calculus','signal','electromagn','statistic','discrete','crypto'];
const MEDIUM_KW = ['network','database','operating','os','theory','compiler',
                   'architecture','analog','digital'];

function getCogLoad(name) {
  const n = name.toLowerCase();
  if (HARD_KW.some(k   => n.includes(k))) return 3;
  if (MEDIUM_KW.some(k => n.includes(k))) return 2;
  return 1;
}
function getPriority(name) {
  const n = name.toLowerCase();
  if (HARD_KW.some(k   => n.includes(k))) return 5;
  if (MEDIUM_KW.some(k => n.includes(k))) return 3;
  return 2;
}
function calcScore(name) {
  return getPriority(name) * getCogLoad(name);
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEDY INTERVAL PACKER
// ═══════════════════════════════════════════════════════════════════════════
function findWindow(grid, sessionMins, preferPeak, peakStart, peakEnd) {
  const slotsNeeded = Math.ceil(sessionMins / SLOT_MINS);
  for (const mustBePeak of [true, false]) {
    for (let i = 0; i <= grid.length - slotsNeeded; i++) {
      const hour = grid[i].start / 60;
      if (mustBePeak && preferPeak && !(hour >= peakStart && hour < peakEnd)) continue;
      const block = grid.slice(i, i + slotsNeeded);
      if (block.every(s => s.available)) return i;
    }
  }
  return -1;
}

function occupyWindow(grid, idx, sessionMins) {
  const slotsNeeded = Math.ceil(sessionMins / SLOT_MINS);
  const bufferSlots = Math.max(1, Math.ceil(slotsNeeded * 0.2));
  const totalOccupy = slotsNeeded + bufferSlots;
  for (let i = idx; i < Math.min(grid.length, idx + totalOccupy); i++) {
    grid[i].available = false;
  }
  return {
    startTime: toTime(grid[idx].start),
    endTime:   toTime(grid[idx].start + sessionMins),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OLLAMA HELPER (used for reschedule)
// ═══════════════════════════════════════════════════════════════════════════
async function askOllama(prompt, numPredict = 80) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.choices?.[0]?.message?.content || '').trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// @route POST /api/ai/schedule
// ═══════════════════════════════════════════════════════════════════════════
const generateSchedule = async (req, res) => {
  const {
    startDate,
    weeks           = 1,
    selectedDays    = [0,1,2,3,4],
    studyStart      = '08:00',
    studyEnd        = '21:00',
    lunchTime       = '13:00',
    lunchDuration   = 60,
    leisureTime     = '18:00',
    leisureDuration = 120,
    sessionLength   = 60,
    energyPeak      = 'morning',
    bufferPercent   = 20,
  } = req.body;

  try {
    const subjects = await Subject.find({ userId: req.user.id }).lean();
    if (!subjects.length)
      return res.status(400).json({ success: false, message: 'No subjects found. Add subjects first.' });

    const subjectsWithTopics = await Promise.all(
      subjects.map(async (s) => {
        const topics = await Topic.find({ $or: [{ subjectId: s._id }, { subject: s._id }] }).lean();
        return { ...s, topics };
      })
    );

    const sorted = [...subjectsWithTopics].sort((a, b) => calcScore(b.name) - calcScore(a.name));

    const pairs = [];
    for (const subj of sorted) {
      if (subj.topics.length > 0) {
        subj.topics.forEach(t => pairs.push({
          subjectId: String(subj._id), subjectName: subj.name,
          topicId:   String(t._id),   topicName:   t.name,
          cogLoad:   getCogLoad(subj.name),
        }));
      } else {
        pairs.push({
          subjectId: String(subj._id), subjectName: subj.name,
          topicId:   null,             topicName:   null,
          cogLoad:   getCogLoad(subj.name),
        });
      }
    }

    const peakMap      = { morning: [6,12], afternoon: [12,17], evening: [17,22] };
    const [pS, pE]     = peakMap[energyPeak] || [6,12];
    const jsTargetDays = selectedDays.map(d => (d + 1) % 7);
    const base         = new Date(startDate + 'T00:00:00');
    const sessions     = [];
    let   pairIdx      = 0;

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(base);
        date.setDate(base.getDate() + w * 7 + d);
        if (!jsTargetDays.includes(date.getDay())) continue;

        const dateStr     = date.toISOString().split('T')[0];
        const grid        = buildDayGrid(studyStart, studyEnd, lunchTime, lunchDuration, leisureTime, leisureDuration);
        const totalSlots  = grid.filter(s => s.available).length;
        const slotPerSess = Math.ceil(sessionLength / SLOT_MINS);
        const rawCapacity = Math.floor(totalSlots / (slotPerSess * 1.2));
        const maxSessions = Math.max(1, Math.floor(rawCapacity * (1 - bufferPercent / 100)));

        let placed = 0;
        while (placed < maxSessions) {
          const pair       = pairs[pairIdx % pairs.length];
          const preferPeak = pair.cogLoad >= 2;
          const winIdx     = findWindow(grid, sessionLength, preferPeak, pS, pE);
          if (winIdx === -1) break;
          const { startTime, endTime } = occupyWindow(grid, winIdx, sessionLength);
          sessions.push({
            date: dateStr, startTime, endTime,
            subjectId: pair.subjectId, topicId:     pair.topicId,
            subjectName: pair.subjectName, topicName: pair.topicName,
            sessionType: 'study',
          });
          pairIdx++;
          placed++;
        }
      }
    }

    console.log(`✓ Generated ${sessions.length} sessions via CSP engine`);
    res.json({ success: true, count: sessions.length, sessions });

  } catch (err) {
    console.error('generateSchedule error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// @route POST /api/ai/reschedule
// ═══════════════════════════════════════════════════════════════════════════
const rescheduleSession = async (req, res) => {
  const {
    sessionId,
    energyPeak      = 'morning',
    studyStart      = '08:00',
    studyEnd        = '21:00',
    lunchTime       = '13:00',
    lunchDuration   = 60,
    leisureTime     = '18:00',
    leisureDuration = 120,
  } = req.body;

  try {
    const missed = await Schedule.findOne({ _id: sessionId, userId: req.user.id })
      .populate('subjectId', 'name')
      .populate('topicId',   'name')
      .lean();
    if (!missed)
      return res.status(404).json({ success: false, message: 'Session not found' });

    const subjectName = missed.subjectId?.name || 'Study';
    const topicName   = missed.topicId?.name   || null;
    const duration    = missed.duration || 60;
    const cogLoad     = getCogLoad(subjectName);
    const cogLabel    = cogLoad === 3 ? 'High-Intensity' : cogLoad === 2 ? 'Medium-Focus' : 'Light-Review';

    const today    = new Date(); today.setUTCHours(0,0,0,0);
    const nextWeek = new Date(today); nextWeek.setDate(today.getUTCDate() + 7);

    const upcoming = await Schedule.find({
      userId: req.user.id,
      date:   { $gte: today, $lt: nextWeek },
      status: { $ne: 'completed' },
      _id:    { $ne: sessionId },
    })
      .populate('subjectId', 'name')
      .sort({ date: 1, startTime: 1 })
      .lean();

    const byDay = {};
    upcoming.forEach(s => {
      const d = new Date(s.date).toISOString().split('T')[0];
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push({ startMins: toMins(s.startTime), endMins: toMins(s.endTime), name: s.subjectId?.name || '' });
    });

    const peakMap  = { morning: [6,12], afternoon: [12,17], evening: [17,22] };
    const [pS, pE] = peakMap[energyPeak] || [6,12];

    const candidates = [];
    for (let d = 0; d < 7; d++) {
      const date             = new Date(today);
      date.setDate(today.getDate() + d);
      const dateStr          = date.toISOString().split('T')[0];
      const dayName          = date.toLocaleDateString('en-US', { weekday: 'long' });
      const grid             = buildDayGrid(studyStart, studyEnd, lunchTime, lunchDuration, leisureTime, leisureDuration);
      const existingSessions = byDay[dateStr] || [];

      existingSessions.forEach(s => {
        grid.forEach(slot => {
          if (slot.start >= s.startMins && slot.end <= s.endMins) slot.available = false;
        });
      });

      const winIdx = findWindow(grid, duration, true, pS, pE);
      if (winIdx === -1) continue;

      const startMins  = grid[winIdx].start;
      const isPeak     = (startMins / 60) >= pS && (startMins / 60) < pE;
      const dayLoad    = existingSessions.length;
      const totalScore = (isPeak ? 40 : 0) + Math.max(0, 30 - dayLoad * 10) + Math.max(0, 7 - d) * 5;
      const context    = dayLoad > 0 ? `${dayLoad} other session(s) including ${existingSessions[0].name}` : 'no other sessions';

      candidates.push({
        date: dateStr, dayName,
        startTime: toTime(startMins), endTime: toTime(startMins + duration),
        score: totalScore, isPeak, context, dayLoad, daysFromNow: d,
      });

      if (candidates.length >= 3) break;
    }

    if (!candidates.length)
      return res.status(200).json({ success: true, count: 0, slots: [] });

    candidates.sort((a, b) => b.score - a.score);

    const labels           = ['A','B','C'];
    const slotDescriptions = candidates.map((c, i) =>
      `Slot ${labels[i]}: ${c.dayName} ${c.date} at ${c.startTime}-${c.endTime} (${c.isPeak ? 'peak energy window' : 'off-peak'}, ${c.context}, ${c.daysFromNow === 0 ? 'today' : c.daysFromNow + ' days from now'})`
    ).join('\n');

    const aiPrompt = `A student missed a ${duration}-minute ${cogLabel} session on "${subjectName}${topicName ? ' - ' + topicName : ''}".

Candidate reschedule slots:
${slotDescriptions}

Which single slot best minimizes cognitive fatigue and preserves study momentum?
Reply with ONLY the letter (A, B, or C), a dash, then one short sentence explaining why.
Example: "A - Morning peak hours align with the session's high cognitive demand."`;

    console.log('Asking Ollama to rank slots...');
    const aiReply      = await askOllama(aiPrompt, 80);
    console.log('Ollama reply:', aiReply);

    const match        = aiReply.match(/\b([A-C])\b/i);
    const chosenLetter = match ? match[1].toUpperCase() : 'A';
    const chosenIdx    = labels.indexOf(chosenLetter);
    const reason       = aiReply.replace(/^[A-C]\s*[-]\s*/i, '').trim() || 'Best available slot based on energy and schedule.';

    const slots = candidates.map((c, i) => ({
      date: c.date, startTime: c.startTime, endTime: c.endTime,
      score: i === chosenIdx ? 100 : c.score,
      tags: [
        c.isPeak           ? 'Peak hours' : 'Off-peak',
        c.daysFromNow <= 1 ? 'Within 24h' : `In ${c.daysFromNow} days`,
        c.dayLoad === 0    ? 'Light day'  : `${c.dayLoad} sessions`,
      ],
      reason: i === chosenIdx ? reason : `${c.dayName} ${c.startTime} - available slot`,
    }));

    if (chosenIdx > 0) {
      const chosen = slots.splice(chosenIdx, 1)[0];
      slots.unshift(chosen);
    }

    console.log(`✓ Reschedule: AI chose slot ${chosenLetter}`);
    res.json({ success: true, count: slots.length, slots });

  } catch (err) {
    console.error('rescheduleSession error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// OPENROUTER QUIZ HELPER — one question at a time
// ═══════════════════════════════════════════════════════════════════════════
async function generateSingleQuestion(topicName, subjectName, difficulty, index) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [
        {
          role: 'user',
          content: `Output only this JSON object, no other text:
{"question":"Q?","options":["A. opt","B. opt","C. opt","D. opt"],"answer":"A","explanation":"reason"}

Rules:
- exactly 4 options starting with A. B. C. D.
- answer is one of: A, B, C, or D
- no markdown, no extra keys, no repeated keys

Now create one ${difficulty} question about ${topicName} (${subjectName}):`
        }
      ],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`API error: ${data.error.message}`);

  const raw   = data.choices?.[0]?.message?.content || '';
  console.log(`Q${index} raw:`, raw);
  const clean = raw.replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`Q${index}: no JSON object found`);

  let parsed;
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    const fixed = clean.slice(start, end + 1)
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    parsed = JSON.parse(fixed);
  }
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════════════
// @route POST /api/ai/quiz
// ═══════════════════════════════════════════════════════════════════════════
const generateQuiz = async (req, res) => {
  try {
    const { subjectName, topicName, difficulty = 'medium', count = 5 } = req.body;

    if (!subjectName || !topicName) {
      return res.status(400).json({ success: false, message: 'subjectName and topicName are required' });
    }

    console.log(`Generating quiz: ${count} ${difficulty} questions on "${topicName}"...`);

    const questions = [];
    for (let i = 0; i < count; i++) {
      try {
        const q = await generateSingleQuestion(topicName, subjectName, difficulty, i + 1);
        if (q.question && Array.isArray(q.options) && q.options.length === 4 && q.answer && q.explanation) {
          questions.push(q);
          console.log(`  ✓ Q${i + 1} generated`);
        } else {
          console.warn(`  ✗ Q${i + 1} invalid shape, skipping`);
        }
      } catch (qErr) {
        console.warn(`  ✗ Q${i + 1} failed: ${qErr.message}, skipping`);
      }
    }

    if (questions.length === 0) {
      return res.status(500).json({ success: false, message: 'Failed to generate any questions. Try again.' });
    }

    console.log(`✓ Quiz generated: ${questions.length}/${count} questions`);
    res.json({ success: true, questions });

  } catch (err) {
    console.error('generateQuiz error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate quiz', error: err.message });
  }
};

  const generatePostSessionQuiz = async (req, res) => {
    const { subject, topic, studiedText } = req.body;

    if (!subject || !studiedText) {
      return res.status(400).json({ success: false, message: "subject and studiedText are required" });
    }

    const questions = [];
    const errors = [];

    for (let i = 0; i < 4; i++) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: "openrouter/auto",
            messages: [
              {
                role: "user",
                content: `You are a JSON API. Output only valid JSON, nothing else.

  Create 1 quiz question based on what a student studied.
  Subject: ${subject}. Topic: ${topic || "General"}.
  Student studied: "${studiedText}"

  Output ONLY this JSON with no extra text:
  {"question":"short question?","options":["A. opt1","B. opt2","C. opt3","D. opt4"],"correctIndex":0,"explanation":"short reason"}`,
              },
            ],
          }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const raw = data.choices?.[0]?.message?.content || "";
        const clean = raw.replace(/```json|```/gi, "").trim();
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error(`Q${i + 1}: no JSON found`);

        let parsed;
        try {
          parsed = JSON.parse(clean.slice(start, end + 1));
        } catch {
          const fixed = clean
            .slice(start, end + 1)
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");
          parsed = JSON.parse(fixed);
        }

        if (
          parsed.question &&
          Array.isArray(parsed.options) &&
          parsed.options.length === 4 &&
          parsed.correctIndex !== undefined
        ) {
          if (!parsed.explanation) parsed.explanation = "Review your notes for more details.";
          questions.push(parsed);
        }
      } catch (e) {
        console.warn(`PostSessionQuiz Q${i + 1} failed:`, e.message);
        errors.push(e.message);
      }
    }

    if (questions.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate questions",
        errors,
      });
    }

    res.json({ success: true, questions });
  };

  module.exports = { generateSchedule, rescheduleSession, generateQuiz, generatePostSessionQuiz };