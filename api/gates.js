/* App gates for the phone's Shortcuts automations. Read-only: never writes to Notion.

     GET /api/gates?g=insta   Instagram         sleep logged (from 05:00), protein 60 g by 14:00, 120 g by 20:00
     GET /api/gates?g=yt      YouTube + manga   today's study floor all ticked
     GET /api/gates?g=games   games             a swim or gym session logged after the day's deadline
     GET /api/gates           all three, as JSON (for checking by hand)

   With ?g= the answer is plain text: the word "open" when the apps may open,
   otherwise the message to show ("🍗 42/60 g protein · 😴 log last night's sleep").
   Not empty: Shortcuts' "has any value" is true for an empty download, so the phone
   tests "is not open". Any error answers "open" as well: a broken check must never
   lock the phone.

   Where each fact comes from (the same rows GRIND writes):
     sleep    AppConfig "sleep_log"        {date: hours}, keyed by the morning's date
     protein  AppConfig "protein_log"      {date: {foodId: portions, __x:[{g}]}}
     floor    AppConfig "widget_snapshot"  today's tasks; r:'floor', d:1 when ticked.
              The snapshot is refreshed whenever GRIND is open, so a snapshot from an
              earlier day means "open GRIND" — the floor stays locked until it is.
     training Swim Practices / Workout Log, any row dated today                      */

const TZ = "Europe/Budapest";
const DB = {
  appConfig: "37163a0b4e7c8150ad25da796d5f474e",
  swim: "3db63a0b-4e7c-81e5-aee2-e16fc36d7893",
  workout: "02a675ed9078420ea9c40957663dd472",
};

// Copied from PROTEIN_FOODS in index.html (grams per portion). Change both together.
const FOOD_G = {
  egg: 7, lentil: 15, soy: 25, milk: 9, beans: 15, gpork: 27, rice: 11, tompasta: 33,
  oats: 31, chickenw: 70, chicken: 35, pork: 27, tuna: 25, shake: 25, turo: 30,
  taska: 9, yogurt: 15,
};

const SLEEP_FROM = "05:00";
const PROTEIN_STEPS = [["14:00", 60], ["20:00", 120]];
// Training deadline per weekday, the pool-mornings week (POOL_MORNINGS_ONLY):
// club Mon/Fri 06:15, solo swims Tue/Wed/Sat/Sun mornings, Thursday gym 14:00.
// null = no training gate that day.
const TRAIN_DEADLINE = {
  Mon: "10:00", Tue: "20:00", Wed: "12:00", Thu: "20:00",   // Tue/Thu club 18:30-19:30 (26 Nov 2026)
  Fri: "18:00", Sat: "12:00", Sun: "12:00",   // Fri gym Pull 15:00
};

export function nowParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow: p.weekday };
}

export function proteinGrams(day) {
  let n = 0;
  for (const [k, v] of Object.entries(day || {})) {
    if (k === "__x") (v || []).forEach((x) => (n += Number(x.g) || 0));
    else if (FOOD_G[k]) n += FOOD_G[k] * (Number(v) || 0);
  }
  return n;
}

// Pure: facts in, locked reasons per group out.
export function evaluate(f, now) {
  const out = { insta: [], yt: [], games: [] };
  const { date, time, dow } = now;

  if (time >= SLEEP_FROM && !(Number((f.sleep || {})[date]) > 0))
    out.insta.push("😴 log last night's sleep");

  const g = proteinGrams((f.protein || {})[date]);
  let need = 0;
  PROTEIN_STEPS.forEach(([t, n]) => { if (time >= t) need = n; });
  if (need && g < need) out.insta.push(`🍗 ${g}/${need} g protein`);

  const snap = f.snapshot;
  if (!snap || snap.date !== date) out.yt.push("📚 open GRIND to update today's floor");
  else {
    const left = (snap.tasks || []).filter((t) => t.r === "floor" && !t.d);
    if (left.length) out.yt.push(`📚 floor: ${left.map((t) => t.t).join(", ")}`);
  }

  const dl = TRAIN_DEADLINE[dow];
  if (dl && time >= dl && !f.trainedToday) out.games.push("🏊 log today's swim or workout");

  return out;
}

async function notion(path, body) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`notion ${r.status}`);
  return r.json();
}

const text = (p) => ((p && p.rich_text) || []).map((x) => x.plain_text || "").join("");

export async function loadFacts(date, q = notion) {
  const onDay = { property: "Date", date: { equals: date } };
  const [ac, sw, wo] = await Promise.all([
    q(`/databases/${DB.appConfig}/query`, { page_size: 100 }),
    q(`/databases/${DB.swim}/query`, { page_size: 1, filter: onDay }),
    q(`/databases/${DB.workout}/query`, { page_size: 1, filter: onDay }),
  ]);
  const row = (k) => {
    const rows = (ac.results || [])
      .filter((p) => ((p.properties.Key.title || [])[0] || {}).plain_text === k)
      .sort((a, b) => (b.last_edited_time || "").localeCompare(a.last_edited_time || ""));
    if (!rows.length) return null;
    try { return JSON.parse(text(rows[0].properties.Value)); } catch (_) { return null; }
  };
  return {
    sleep: await withWatchSleep(row("sleep_log") || {}, date),
    protein: row("protein_log") || {},
    snapshot: row("widget_snapshot"),
    trainedToday: (sw.results || []).length > 0 || (wo.results || []).length > 0,
  };
}

// If last night's sleep is not logged by hand, the watch's figure counts (via
// intervals.icu). Any failure here just means "not logged" — it never opens the gate.
async function withWatchSleep(sleep, date) {
  if (Number(sleep[date]) > 0) return sleep;
  try {
    const key = process.env.INTERVALS_API_KEY;
    if (!key) return sleep;
    const r = await fetch("https://intervals.icu/api/v1/athlete/i818191/wellness/" + date, {
      headers: { Authorization: "Basic " + Buffer.from("API_KEY:" + key).toString("base64") },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return sleep;
    const w = await r.json();
    if (w && w.sleepSecs > 0) return { ...sleep, [date]: Math.round(w.sleepSecs / 360) / 10 };
  } catch (_) {}
  return sleep;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const g = (req.query && req.query.g) || "";
  try {
    const now = nowParts();
    const out = evaluate(await loadFacts(now.date), now);
    if (!g) return res.status(200).json({ now, locked: out });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send((out[g] || []).join(" · ") || "open");
  } catch (e) {
    if (!g) return res.status(200).json({ error: e.message });
    return res.status(200).send("open");
  }
}
