const Subject = require('../models/Subject');
const Topic   = require('../models/Topic');

const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// Add minutes to "HH:MM" string → "HH:MM"
function addMins(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const total  = h * 60 + m + mins;
  const hh     = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm     = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// "HH:MM" → total minutes from midnight
function toMins(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// @desc    Generate AI study schedule
// @route   POST /api/ai/schedule
// @access  Private
const generateSchedule = async (req, res) => {
  const {
    startDate,
    weeks         = 1,
    selectedDays  = [0,1,2,3,4],
    // advanced
    studyStart    = '08:00',
    studyEnd      = '21:00',
    lunchTime     = '13:00',
    lunchDuration = 60,
    leisureTime   = '18:00',
    leisureDuration = 120,
    sessionLength = 60,
    energyPeak    = 'morning',
    bufferPercent = 20,
  } = req.body;

  try {
    // 1. Fetch subjects
    const subjects = await Subject.find({ userId: req.user.id }).lean();
    if (!subjects.length) {
      return res.status(400).json({ success: false, message: 'No subjects found. Please add subjects first.' });
    }

    // 2. Fetch topics
    const subjectsWithTopics = await Promise.all(
      subjects.map(async (subj) => {
        const topics = await Topic.find({
          $or: [{ subjectId: subj._id }, { subject: subj._id }],
        }).lean();
        return { ...subj, topics };
      })
    );

    // 3. Calculate available session slots per day
    const lunchEnd   = addMins(lunchTime,   lunchDuration);
    const leisureEnd = addMins(leisureTime, leisureDuration);
    const breakMins  = 30; // gap between sessions

    // Work out peak window label
    const peakWindows = {
      morning:   '06:00–12:00',
      afternoon: '12:00–17:00',
      evening:   '17:00–22:00',
    };
    const peakWindow = peakWindows[energyPeak] || peakWindows.morning;

    // Estimate how many sessions fit per day
    const dayMins      = toMins(studyEnd) - toMins(studyStart);
    const blockedMins  = lunchDuration + leisureDuration;
    const availMins    = dayMins - blockedMins;
    const slotMins     = sessionLength + breakMins;
    const rawSlots     = Math.floor(availMins / slotMins);
    const sessionsPerDay = Math.max(1, Math.floor(rawSlots * (1 - bufferPercent / 100)));

    // 4. Build subjects list for prompt
    const dayNames     = selectedDays.map((i) => DAY_NAMES[i]);
    const subjectsList = subjectsWithTopics
      .map((s) => {
        const topicsBlock = s.topics.length > 0
          ? s.topics.map((t) => `    - "${t.name}" (topicId: "${t._id}")`).join('\n')
          : '    - (no topics — set topicId: null, topicName: null)';
        return `Subject: "${s.name}" (subjectId: "${s._id}")\nTopics:\n${topicsBlock}`;
      })
      .join('\n\n');

    // 5. Build rich prompt
    const prompt = `You are an expert study planner. Return ONLY a valid JSON array, nothing else.

=== SCHEDULE PARAMETERS ===
Start date: ${startDate}
Total weeks: ${weeks}
Study days: ${dayNames.join(', ')}
Sessions per day: ${sessionsPerDay} (respecting buffer of ${bufferPercent}%)

=== DAILY TIME CONSTRAINTS ===
Study window: ${studyStart} to ${studyEnd}
Session length: ${sessionLength} minutes each
Break between sessions: ${breakMins} minutes
Lunch break: ${lunchTime} to ${lunchEnd} — NO sessions during this window
Leisure/personal time: ${leisureTime} to ${leisureEnd} — NO sessions during this window

=== SCHEDULING INTELLIGENCE ===
1. ENERGY PEAK: The student's cognitive peak is ${energyPeak} (${peakWindow}).
   → Schedule the most complex/technical subjects (DSA, algorithms, mathematics, circuits, physics) FIRST during peak hours.
   → Schedule lighter review subjects (communication, theory, reading) outside peak hours.

2. DEEP WORK BLOCKS: Each session is ${sessionLength} minutes — this is a focused, uninterrupted block.
   → Never schedule two completely unrelated subjects back-to-back if avoidable (e.g., don't go from physics to communication).
   → Group related subjects on the same day when possible.

3. BLOCKED WINDOWS: Strictly do NOT place any session between ${lunchTime}–${lunchEnd} (lunch) or ${leisureTime}–${leisureEnd} (leisure).
   → If a session would overlap a blocked window, skip it and place the next session after the window ends.

4. BUFFER RULE: Only schedule ${sessionsPerDay} sessions per day (${bufferPercent}% of available slots kept empty for overflow/unexpected tasks).

5. TOPIC ROTATION: Rotate evenly through all subjects and their topics across the week.

=== SUBJECTS & TOPICS (use EXACT IDs) ===
${subjectsList}

=== OUTPUT FORMAT ===
Each item in the JSON array must have EXACTLY these keys:
{"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","subjectId":"exact_id","topicId":"exact_id_or_null","subjectName":"string","topicName":"string_or_null","sessionType":"study"}

RULES:
- endTime = startTime + ${sessionLength} minutes exactly
- Session times must respect the study window (${studyStart}–${studyEnd})
- Session times must skip lunch (${lunchTime}–${lunchEnd}) and leisure (${leisureTime}–${leisureEnd})
- Use ONLY the exact MongoDB IDs provided above
- Return ONLY the raw JSON array starting with [ and ending with ]`;

    // 6. Call Groq API
    console.log(`Generating schedule: ${sessionsPerDay} sessions/day, ${sessionLength}min each, peak=${energyPeak}`);

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens:  8000,
        messages: [
          {
            role:    'system',
            content: 'You are a precise JSON generator. You output ONLY valid JSON arrays with no markdown, no explanation, no preamble. Every response starts with [ and ends with ].',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Groq error:', JSON.stringify(aiData));
      throw new Error(aiData.error?.message || 'Groq API request failed');
    }

    // 7. Parse response
    const rawText = aiData.choices?.[0]?.message?.content || '';
    console.log('Groq response (first 200 chars):', rawText.slice(0, 200));

    const cleaned  = rawText.replace(/```json|```/g, '').trim();
    const arrStart = cleaned.indexOf('[');
    let   arrEnd   = cleaned.lastIndexOf(']');

    if (arrStart === -1) throw new Error('AI did not return a JSON array');

    // Salvage truncated response
    if (arrEnd === -1 || arrEnd < arrStart) {
      console.warn('Response truncated — salvaging complete sessions...');
      const lastGoodItem = cleaned.lastIndexOf('},');
      if (lastGoodItem === -1) throw new Error('Response too truncated to use');
      const salvaged = cleaned.slice(arrStart, lastGoodItem + 1) + ']';
      arrEnd = salvaged.lastIndexOf(']');
      const sessions = JSON.parse(salvaged);
      console.log(`✓ Salvaged ${sessions.length} sessions`);
      return res.json({ success: true, count: sessions.length, sessions });
    }

    const sessions = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(sessions) || sessions.length === 0) throw new Error('AI returned empty schedule');

    console.log(`✓ Generated ${sessions.length} sessions`);
    res.json({ success: true, count: sessions.length, sessions });

  } catch (err) {
    console.error('generateSchedule error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to generate schedule' });
  }
};

module.exports = { generateSchedule };