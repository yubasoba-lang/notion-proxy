/* Garmin → GRIND, through intervals.icu.

   OFF until three things are true: INTERVALS_API_KEY is set in the Vercel project,
   this file is listed in vercel.json (a build and a route), and HAS_WATCH is true in
   index.html. With no key it answers 503 "not configured" and touches nothing.

   Garmin Connect syncs every activity to intervals.icu, and intervals.icu keeps the
   ORIGINAL FIT file the watch wrote. That file is the only place the per-length
   stroke counts and the per-set reps and weights survive — Strava's API drops them.

     GET  /api/intervals?op=list&oldest=YYYY-MM-DD     recent swims and strength sessions
     GET  /api/intervals?op=fit&id=<activity id>       that activity's FIT, decoded
     POST /api/intervals?op=plan  {date,name,description}   a planned swim for the watch

   The decoder below was written from the FIT profile, not from a file off his watch.
   Field numbers for the length (101) and set (225) messages must be checked against
   the first real swim and the first real gym session before any of this is trusted:
   add &raw=1 to op=fit to see every message it found.                              */

import zlib from "zlib";

const API = "https://intervals.icu/api/v1";
// "0" means "the athlete this API key belongs to".
const ATHLETE = process.env.INTERVALS_ATHLETE_ID || "0";

function auth() {
  return "Basic " + Buffer.from("API_KEY:" + process.env.INTERVALS_API_KEY).toString("base64");
}

// ── FIT ──────────────────────────────────────────────────────────────────────
// A FIT file is a header, then records. A definition record says which fields the
// next data records of that local type carry; a data record is just those bytes.
const BASE = {
  0:[1,"u8"],1:[1,"s8"],2:[1,"u8"],3:[2,"s16"],4:[2,"u16"],5:[4,"s32"],6:[4,"u32"],
  7:[1,"str"],8:[4,"f32"],9:[8,"f64"],10:[1,"u8"],11:[2,"u16"],12:[4,"u32"],13:[1,"u8"],
  14:[8,"s64"],15:[8,"u64"],16:[8,"u64"],
};
function readOne(buf, off, kind, le) {
  switch (kind) {
    case "u8":  return buf.readUInt8(off);
    case "s8":  return buf.readInt8(off);
    case "u16": return le ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
    case "s16": return le ? buf.readInt16LE(off) : buf.readInt16BE(off);
    case "u32": return le ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
    case "s32": return le ? buf.readInt32LE(off) : buf.readInt32BE(off);
    case "f32": return le ? buf.readFloatLE(off) : buf.readFloatBE(off);
    case "f64": return le ? buf.readDoubleLE(off) : buf.readDoubleBE(off);
    case "u64": return Number(le ? buf.readBigUInt64LE(off) : buf.readBigUInt64BE(off));
    case "s64": return Number(le ? buf.readBigInt64LE(off) : buf.readBigInt64BE(off));
    default:    return null;
  }
}
// Returns every data message as {num, f:{fieldNumber: value | [values]}}.
export function decodeFit(buf) {
  const headerSize = buf.readUInt8(0);
  const dataSize = buf.readUInt32LE(4);
  if (buf.toString("ascii", 8, 12) !== ".FIT") throw new Error("not a FIT file");
  const end = Math.min(buf.length, headerSize + dataSize);
  const defs = {};
  const out = [];
  let p = headerSize;
  while (p < end) {
    const h = buf.readUInt8(p++);
    const compressed = (h & 0x80) !== 0;
    if (!compressed && (h & 0x40)) {
      const local = h & 0x0f;
      const le = buf.readUInt8(p + 1) === 0;
      const num = le ? buf.readUInt16LE(p + 2) : buf.readUInt16BE(p + 2);
      const n = buf.readUInt8(p + 4);
      p += 5;
      const fields = [];
      for (let i = 0; i < n; i++) {
        fields.push({ num: buf.readUInt8(p), size: buf.readUInt8(p + 1), type: buf.readUInt8(p + 2) & 0x1f });
        p += 3;
      }
      let devSize = 0;
      if (h & 0x20) {
        const nd = buf.readUInt8(p++);
        for (let i = 0; i < nd; i++) { devSize += buf.readUInt8(p + 1); p += 3; }
      }
      defs[local] = { num, le, fields, devSize };
      continue;
    }
    const local = compressed ? (h >> 5) & 0x03 : h & 0x0f;
    const def = defs[local];
    if (!def) throw new Error("data record before its definition at byte " + p);
    const f = {};
    for (const fd of def.fields) {
      const b = BASE[fd.type] || [1, "u8"];
      if (b[1] === "str") {
        f[fd.num] = buf.toString("utf8", p, p + fd.size).replace(/\0.*$/, "");
      } else if (fd.size % b[0] === 0 && fd.size >= b[0]) {
        const count = fd.size / b[0];
        const vals = [];
        for (let i = 0; i < count; i++) vals.push(readOne(buf, p + i * b[0], b[1], def.le));
        f[fd.num] = count === 1 ? vals[0] : vals;
      }
      p += fd.size;
    }
    p += def.devSize;
    out.push({ num: def.num, f });
  }
  return out;
}
const INVALID16 = 0xffff, INVALID32 = 0xffffffff;
const ok16 = v => (typeof v === "number" && v !== INVALID16 ? v : null);
const ok32 = v => (typeof v === "number" && v !== INVALID32 ? v : null);
const first = v => (Array.isArray(v) ? v[0] : v);

// The parts GRIND uses. Message and field numbers are from the FIT profile:
//   session 18 · 7 total_elapsed_time (ms) · 9 total_distance (cm) · 44 pool_length (cm)
//   length  101 · 3 total_elapsed_time (ms) · 5 total_strokes · 7 swim_stroke · 12 length_type
//   set     225 · 0 duration (ms) · 3 repetitions · 4 weight (1/16 kg) · 5 set_type
//                 7 category · 8 category_subtype
// swim_stroke: 0 free, 1 back, 2 breast, 3 fly, 4 drill, 5 mixed. length_type: 0 idle, 1 active.
export function summariseFit(msgs) {
  const out = { lengths: [], sets: [], poolLength: null, elapsed: null, distance: null };
  for (const m of msgs) {
    const f = m.f;
    if (m.num === 18) {
      const e = ok32(f[7]); if (e != null) out.elapsed = e / 1000;
      const d = ok32(f[9]); if (d != null) out.distance = d / 100;
      const pl = ok16(f[44]); if (pl != null) out.poolLength = pl / 100;
    } else if (m.num === 101) {
      const t = ok32(f[3]);
      out.lengths.push({
        seconds: t != null ? t / 1000 : 0,
        strokes: ok16(f[5]) || 0,
        stroke: typeof f[7] === "number" && f[7] !== 255 ? f[7] : null,
        active: f[12] === 1,
      });
    } else if (m.num === 225) {
      const w = ok16(f[4]);
      const dur = ok32(f[0]);
      out.sets.push({
        active: f[5] === 1,
        reps: ok16(f[3]) || 0,
        weight: w != null ? Math.round((w / 16) * 100) / 100 : 0,
        category: ok16(first(f[7])),
        subtype: ok16(first(f[8])),
        seconds: dur != null ? dur / 1000 : 0,
      });
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.INTERVALS_API_KEY) return res.status(503).json({ error: "not configured" });

  const op = (req.query && req.query.op) || "";
  try {
    if (op === "list") {
      const oldest = String(req.query.oldest || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(oldest)) return res.status(400).json({ error: "oldest=YYYY-MM-DD required" });
      const newest = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const r = await fetch(`${API}/athlete/${ATHLETE}/activities?oldest=${oldest}&newest=${newest}`, { headers: { Authorization: auth() } });
      if (!r.ok) return res.status(r.status).json({ error: "intervals.icu " + r.status });
      const all = await r.json();
      const keep = all
        .filter(a => a.type === "Swim" || a.type === "WeightTraining")
        .map(a => ({ id: a.id, type: a.type, name: a.name, start_date_local: a.start_date_local, elapsed_time: a.elapsed_time, distance: a.distance, pool_length: a.pool_length }));
      return res.status(200).json(keep);
    }
    if (op === "fit") {
      const id = String(req.query.id || "");
      if (!/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: "id required" });
      // /file is the original the watch wrote, gzipped. /fit-file is intervals.icu's
      // own regenerated version and has lost the strength sets.
      const r = await fetch(`${API}/activity/${id}/file`, { headers: { Authorization: auth() } });
      if (!r.ok) return res.status(r.status).json({ error: "intervals.icu " + r.status });
      let buf = Buffer.from(await r.arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
      const msgs = decodeFit(buf);
      const sum = summariseFit(msgs);
      if (req.query.raw) {
        const counts = {};
        msgs.forEach(m => { counts[m.num] = (counts[m.num] || 0) + 1; });
        sum.messageCounts = counts;
        sum.sample = msgs.filter(m => m.num === 101 || m.num === 225 || m.num === 18).slice(0, 12);
      }
      return res.status(200).json(sum);
    }
    if (op === "plan") {
      if (req.method !== "POST") return res.status(405).json({ error: "POST" });
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      const { date, name, description } = body || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !name) return res.status(400).json({ error: "date and name required" });
      const r = await fetch(`${API}/athlete/${ATHLETE}/events`, {
        method: "POST",
        headers: { Authorization: auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ category: "WORKOUT", type: "Swim", start_date_local: date + "T00:00:00", name, description: description || "" }),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
    return res.status(400).json({ error: "op must be list, fit or plan" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
