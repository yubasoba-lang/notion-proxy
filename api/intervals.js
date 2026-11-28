// GRIND -> intervals.icu -> Garmin Connect. Planned workouts only.
// The key lives in the INTERVALS_API_KEY env var (set by him in Vercel), never here.
// GET  ?a=ping          -> {ok, name}            (checks the key works)
// GET  ?a=list&from&to  -> GRIND's own planned workouts in that range
// POST {events:[...]}   -> upserts them (external_id must start "grind-")
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
