const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const DB = {
  exams:      '21463a0b4e7c802ebea5c74d09c69b8e',
  tasks:      '34163a0b4e7c81a5a8aefb94b96a6b36',
  workoutLog: '02a675ed9078420ea9c40957663dd472',
  studied:    '21e63a0b4e7c80d2ab1fea8e6950bb29',
  entries:    '21463a0b4e7c81e7b160ddbe50469d9d',
};

async function nQuery(dbId, filter, sorts) {
  const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...(filter ? { filter } : {}), ...(sorts ? { sorts } : {}) }),
  });
  return r.json();
}

async function nCreate(dbId, properties, children) {
  const r = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties,
      ...(children ? { children } : {}),
    }),
  });
  return r.json();
}

function g(page, key, type) {
  const p = page.properties?.[key];
  if (!p) return null;
  if (type === 'title')     return p.title?.[0]?.plain_text ?? null;
  if (type === 'select')    return p.select?.name ?? null;
  if (type === 'status')    return p.status?.name ?? null;
  if (type === 'date')      return p.date?.start ?? null;
  if (type === 'text')      return p.rich_text?.[0]?.plain_text ?? null;
  if (type === 'checkbox')  return p.checkbox ?? false;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Verify this is a legitimate cron call
  const auth = req.headers['authorization'];
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch all data in parallel
    const [examsData, tasksData, studiedData, workoutData] = await Promise.all([
      nQuery(DB.exams,
        { property: 'Date', date: { on_or_after: todayStr } },
        [{ property: 'Date', direction: 'ascending' }]
      ),
      nQuery(DB.tasks,
        { property: 'Done', checkbox: { equals: false } }
      ),
      nQuery(DB.studied,
        { property: 'Done', date: { on_or_after: weekAgo } }
      ),
      nQuery(DB.workoutLog,
        { property: 'Date', date: { on_or_after: weekAgo } },
        [{ property: 'Date', direction: 'descending' }]
      ),
    ]);

    // Process exams
    const exams = (examsData.results || []).map(p => {
      const date = g(p, 'Date', 'date');
      const daysAway = date ? Math.ceil((new Date(date) - today) / (1000 * 60 * 60 * 24)) : null;
      return { name: g(p, 'Name', 'title'), date, daysAway };
    }).filter(e => e.date && e.daysAway >= 0);

    // Process tasks
    const tasks = (tasksData.results || []).slice(0, 8).map(p => ({
      name: g(p, 'Name', 'title'),
      due: g(p, 'Due', 'date'),
    })).filter(t => t.name);

    // Count pomos per subject this week
    const subjectPomos = {};
    (studiedData.results || []).forEach(p => {
      const subj = g(p, 'Subject', 'status') || g(p, 'Name', 'title');
      if (subj) subjectPomos[subj] = (subjectPomos[subj] || 0) + 1;
    });

    // Recent workouts
    const recentWorkouts = (workoutData.results || []).slice(0, 5).map(p => ({
      date: g(p, 'Date', 'date'),
      name: g(p, 'Name', 'title'),
    })).filter(w => w.date);

    // Build context for Claude
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const context = `Today is ${dayName}, ${dateStr}. It's exam period — no classes.

UPCOMING EXAMS:
${exams.length ? exams.map(e => `- ${e.name}: ${e.date} (${e.daysAway} days away)`).join('\n') : 'None'}

PENDING TASKS:
${tasks.length ? tasks.map(t => `- ${t.name}${t.due ? ` (due ${t.due})` : ''}`).join('\n') : 'None'}

STUDY THIS WEEK (pomos logged per subject):
${Object.keys(subjectPomos).length ? Object.entries(subjectPomos).map(([s, n]) => `- ${s}: ${n} pomos`).join('\n') : 'None yet'}

RECENT WORKOUTS:
${recentWorkouts.length ? recentWorkouts.map(w => `- ${w.date}: ${w.name}`).join('\n') : 'None this week'}

FIXED ANCHORS:
- 7:00–7:30 morning routine
- Cook + eat lunch: 90 min (non-negotiable)
- Gym: 60 min, right after lunch
- Wind down last 30–40 min of day
- Sleep by 23:00

PREFERENCES:
- Deep focus in afternoon (14:00–18:00), peak energy zone
- Lighter review / flashcards in evening
- 50-min study blocks, 10-min breaks
- Prioritise subjects with closest exams
- If an exam is within 3 days it dominates the day`;

    const systemPrompt = `You are a daily planner for a medical student in exam period. Create a realistic time-blocked day plan.

Return ONLY valid JSON, no markdown, no explanation:
{
  "priorities": [
    "Subject — one line reason",
    "Subject — one line reason",
    "Task or activity — one line reason"
  ],
  "schedule": [
    {"time": "7:00 – 7:30", "activity": "Morning routine", "energy": "—"},
    {"time": "7:30 – 8:20", "activity": "Subject — Focus Block 1", "energy": "Deep"}
  ],
  "notes": [
    "Note explaining the reasoning for today's plan",
    "Note about what to watch out for"
  ],
  "buffer": "~30 minutes reserved across the day"
}

Energy values: "Deep", "Medium", "Light", "Movement", or "—".
Be specific with study block subject names. Make the schedule realistic and complete from 7:00 to 23:00.`;

    // Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: context }],
      }),
    });

    const claudeData = await claudeRes.json();
    const plan = JSON.parse(claudeData.content[0].text);

    // Build Notion blocks
    const blocks = [];

    // Priorities
    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: "Today's Top 3 Priorities" } }] },
    });
    plan.priorities.forEach(p => {
      const [bold, rest] = p.split(' — ');
      blocks.push({
        object: 'block', type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [
            { type: 'text', text: { content: bold }, annotations: { bold: true } },
            ...(rest ? [{ type: 'text', text: { content: ' — ' + rest } }] : []),
          ],
        },
      });
    });

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // Schedule as table
    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: 'Time-Blocked Schedule' } }] },
    });
    blocks.push({
      object: 'block', type: 'table',
      table: {
        table_width: 3,
        has_column_header: true,
        has_row_header: false,
        children: [
          {
            object: 'block', type: 'table_row',
            table_row: {
              cells: [
                [{ type: 'text', text: { content: 'Time' },     annotations: { bold: true } }],
                [{ type: 'text', text: { content: 'Activity' }, annotations: { bold: true } }],
                [{ type: 'text', text: { content: 'Energy' },   annotations: { bold: true } }],
              ],
            },
          },
          ...plan.schedule.map(row => ({
            object: 'block', type: 'table_row',
            table_row: {
              cells: [
                [{ type: 'text', text: { content: row.time } }],
                [{ type: 'text', text: { content: row.activity } }],
                [{ type: 'text', text: { content: row.energy } }],
              ],
            },
          })),
        ],
      },
    });

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // Buffer + Notes
    blocks.push({
      object: 'block', type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: 'Buffer Time: ' }, annotations: { bold: true } },
          { type: 'text', text: { content: plan.buffer } },
        ],
      },
    });
    blocks.push({
      object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: 'Notes' } }] },
    });
    plan.notes.forEach(note => {
      blocks.push({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: note } }] },
      });
    });

    // Create the Notion page
    const title = `Morning Plan — ${dayName}, ${dateStr}`;
    const page = await nCreate(DB.entries, {
      Name: { title: [{ text: { content: title } }] },
    }, blocks);

    res.status(200).json({ ok: true, title, pageId: page.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
