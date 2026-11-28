// GRIND -> intervals.icu -> Garmin Connect. Planned workouts only.
// The key lives in the INTERVALS_API_KEY env var (set by him in Vercel), never here.
// GET  ?a=ping          -> {ok, name}            (checks the key works)
// GET  ?a=list&from&to  -> GRIND's own planned workouts in that range
// POST {events:[...]}   -> upserts them (external_id must start "grind-")
import FitParser from "fit-file-parser";
const ATHLETE = "i818191";
const BASE = "https://intervals.icu/api/v1/athlete/" + ATHLETE;

function auth() {
  const key = process.env.INTERVALS_API_KEY;
  if (!key) throw new Error("INTERVALS_API_KEY is not set in Vercel");
  return "Basic " + Buffer.from("API_KEY:" + key).toString("base64");
}
async function iv(path, opt = {}) {
  const r = await fetch(BASE + path, {
    ...opt,
    headers: { Authorization: auth(), "Content-Type": "application/json", ...(opt.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error("intervals.icu " + r.status + ": " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Sleep and recovery from the watch, as intervals.icu holds them (Garmin sends them
// with "download wellness data"). The date is the morning you woke up, which is how
// GRIND's sleep_log is keyed too.
export async function wellness(from, to) {
  const rows = await iv("/wellness?oldest=" + from + "&newest=" + to);
  return (rows || []).map(w => ({
    date: w.id,
    sleepH: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
    score: w.sleepScore ?? null,
    hrv: w.hrv ?? null,
    rhr: w.restingHR ?? null,
  }));
}

export function cleanEvent(e) {
  if (!e || typeof e !== "object") throw new Error("bad event");
  if (!/^grind-[\w-]{1,60}$/.test(e.external_id || "")) throw new Error("external_id must start with grind-");
  if (!DAY.test(String(e.date || ""))) throw new Error("bad date");
  if (!["Swim", "WeightTraining"].includes(e.type)) throw new Error("bad type");
  return {
    category: "WORKOUT",
    type: e.type,
    start_date_local: e.date + "T" + (/^\d\d:\d\d$/.test(e.time || "") ? e.time : "06:00") + ":00",
    name: String(e.name || "GRIND").slice(0, 80),
    description: String(e.description || "").slice(0, 4000),
    external_id: e.external_id,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const q = req.query || {};
    if (req.method === "GET" && q.a === "ping") {
      const a = await iv("");
      return res.status(200).json({ ok: true, name: a && a.name ? a.name : null });
    }
    if (req.method === "GET" && q.a === "wellness") {
      if (!DAY.test(q.from || "") || !DAY.test(q.to || "")) throw new Error("from/to needed");
      return res.status(200).json(await wellness(q.from, q.to));
    }
    if (req.method === "GET" && q.a === "acts") {
      if (!DAY.test(q.from || "") || !DAY.test(q.to || "")) throw new Error("from/to needed");
      const acts = await iv("/activities?oldest=" + q.from + "&newest=" + q.to);
      return res.status(200).json((acts || []).map(a => ({
        id: a.id, type: a.type, start: a.start_date_local, name: a.name,
        distance: a.distance, moving: a.moving_time, elapsed: a.elapsed_time,
        pool: a.pool_length || null, lengths: a.lengths || null, source: a.source || null,
      })));
    }
    if (req.method === "GET" && q.a === "file") {
      // The original FIT file as the watch wrote it (gzip), base64 in JSON.
      if (!/^[\w-]{1,40}$/.test(q.id || "")) throw new Error("bad id");
      const r = await fetch("https://intervals.icu/api/v1/activity/" + q.id + "/file", { headers: { Authorization: auth() } });
      if (!r.ok) throw new Error("intervals.icu " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      return res.status(200).json({ ok: true, gz: buf.toString("base64") });
    }
    if (req.method === "GET" && q.a === "swim") {
      if (!/^[\w-]{1,40}$/.test(q.id || "")) throw new Error("bad id");
      return res.status(200).json(await swimSummary(q.id));
    }
    if (req.method === "GET" && q.a === "list") {
      if (!DAY.test(q.from || "") || !DAY.test(q.to || "")) throw new Error("from/to needed");
      const ev = await iv("/events?oldest=" + q.from + "&newest=" + q.to);
      return res.status(200).json((ev || []).filter(e => /^grind-/.test(e.external_id || ""))
        .map(e => ({ id: e.id, date: e.start_date_local, name: e.name, external_id: e.external_id, description: e.description, steps: e.workout_doc ? e.workout_doc.steps : null, distance: e.distance || (e.workout_doc && e.workout_doc.distance) || null, pool: e.pool_length || null })));
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const list = (body.events || []).slice(0, 21).map(cleanEvent);
      if (!list.length) throw new Error("no events");
      const out = await iv("/events/bulk?upsert=true", { method: "POST", body: JSON.stringify(list) });
      // replace: {from,to} — GRIND's own swim workouts in that range that are not in
      // this send are out of date (the week changed) and are deleted. Only grind-swim-*.
      let removed = 0;
      const rp = body.replace || {};
      if (DAY.test(rp.from || "") && DAY.test(rp.to || "")) {
        const keep = new Set(list.map(e => e.external_id));
        const ev = await iv("/events?oldest=" + rp.from + "&newest=" + rp.to);
        for (const e of ev || []) {
          if (/^grind-swim-/.test(e.external_id || "") && !keep.has(e.external_id)) {
            await iv("/events/" + e.id, { method: "DELETE" });
            removed++;
          }
        }
      }
      return res.status(200).json({ ok: true, n: (out || []).length, removed });
    }
    return res.status(400).json({ error: "unknown request" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}

// ── A finished swim, read from the watch's own FIT file ──────────────────────
// Lengths the watch detected, plus the kick sets it cannot see: a lap whose planned
// step ends on the LAP button and that recorded no length is credited at the step's
// planned distance. Laps carry wkt_step_index, which counts the planned steps in
// Garmin's order (each repeat's children, then one index for the repeat itself).
function parseFit(buf) {
  return new Promise((ok, no) => {
    const fp = new (FitParser.default || FitParser)({ force: true, mode: "list", lengthUnit: "m", speedUnit: "m/s" });
    fp.parse(buf, (e, d) => (e ? no(new Error(String(e))) : ok(d)));
  });
}
export function flattenSteps(steps) {
  const out = [];
  (steps || []).forEach(st => {
    if (st.reps) { (st.steps || []).forEach(c => out.push(c)); out.push({ repeat: true }); }
    else out.push(st);
  });
  return out;
}
export function summarise(d, planSteps) {
  const s = (d.sessions || [])[0] || {};
  const pool = s.pool_length || 33.33;
  const lengths = (d.lengths || []).map(l => ({
    active: l.length_type === "active",
    s: Math.round((l.total_timer_time || 0) * 10) / 10,
    strokes: l.total_strokes || 0,
    stroke: l.swim_stroke || null,
  }));
  const flat = flattenSteps(planSteps);
  let credit = 0;
  const laps = (d.laps || []).map(l => {
    const idx = l.wkt_step_index && typeof l.wkt_step_index === "object" ? l.wkt_step_index.value : l.wkt_step_index;
    const st = idx != null ? flat[idx] : null;
    const dist = Math.round((l.total_distance || 0) * 100) / 100;
    const sec = Math.round(l.total_timer_time || 0);
    let kick = 0;
    if (st && st.until_lap_press && st.distance && dist === 0 && sec >= 10) { kick = st.distance; credit += kick; }
    return { step: idx ?? null, m: dist, s: sec, kick, stroke: l.swim_stroke || null };
  });
  return {
    ok: true,
    pool,
    elapsedS: Math.round(s.total_elapsed_time || 0),
    timerS: Math.round(s.total_timer_time || 0),
    activeS: Math.round(s.active_time || 0),
    watchM: Math.round(s.total_distance || 0),
    kickM: Math.round(credit),
    metres: Math.round((s.total_distance || 0) + credit),
    activeLengths: s.num_active_lengths || lengths.filter(l => l.active).length,
    strokesPerLength: s.avg_strokes_per_length || null,
    swolf: s.avg_swolf || null,
    lengths, laps,
  };
}
async function swimSummary(id) {
  const ar = await fetch("https://intervals.icu/api/v1/activity/" + id, { headers: { Authorization: auth() } });
  const a = ar.ok ? await ar.json() : null;
  const r = await fetch("https://intervals.icu/api/v1/activity/" + id + "/file", { headers: { Authorization: auth() } });
  if (!r.ok) throw new Error("intervals.icu " + r.status);
  let buf = Buffer.from(await r.arrayBuffer());
  try { buf = (await import("zlib")).gunzipSync(buf); } catch (_) {}
  const d = await parseFit(buf);
  const date = String((a && a.start_date_local) || ((d.sessions || [])[0] || {}).start_time || "").slice(0, 10);
  let plan = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const ev = await iv("/events?oldest=" + date + "&newest=" + date).catch(() => []);
    plan = (ev || []).find(e => /^grind-swim-/.test(e.external_id || "")) || null;
  }
  const out = summarise(d, plan && plan.workout_doc ? plan.workout_doc.steps : []);
  out.date = date;
  out.name = (a && a.name) || "";
  out.planned = plan ? plan.name : null;
  return out;
}
