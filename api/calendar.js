/* Weekly plan + exams as a subscribable calendar feed.
   Lives on the server so the app itself stays exactly as light as it was: the phone
   subscribes to this URL and Apple/Google re-fetch it periodically.

   Repeats are expressed as rules, not thousands of events, so the two things that vary
   by week handle themselves:
     - Thursday's Pathophysiology lecture: odd weeks only  → INTERVAL=2 from an odd week
     - Friday's layout changes at week 8 (30 Oct)          → one rule UNTIL, one FROM

   NOTE: the plan below mirrors DAY_PLAN in index.html. If the timetable changes, both
   need updating — the app reads its copy, the calendar reads this one.

   From 22 Nov 2026 the training week changes (six swims, club at 06:15, a solo swim
   on Tuesday, the leg day renamed). The old rules are not edited: on the days that
   change they simply end on the 21st, and PLAN_V2 starts the day after. Mirrors
   TRAINING_V2_START and DAY_PLAN_V2 in index.html.                                    */

const TZ = "Europe/Budapest";
const SEMESTER_END = "20261212T000000Z";      // last teaching week ends Fri 11 Dec
// Classes, study blocks and meals stop with the semester. Training does not: swims,
// lifts, the trip to the pool and the CO2 table carry on through the exam period, to
// the end of the Base phase (Sun 7 Feb 2027). Move this when the next phase is planned.
const TRAINING_END = "20270207T225959Z";
const isTraining = it => /^(Swim practice|Gym · |Leave for the pool|Pool to |CO2 table)/.test(it.l);
const untilFor = it => (isTraining(it) ? TRAINING_END : SEMESTER_END);
const EXAMS_DB = "21463a0b4e7c802ebea5c74d09c69b8e";

// First date of each weekday in teaching week 1 (Mon 7 Sep 2026).
const ANCHOR = { Mon:"20260907", Tue:"20260908", Wed:"20260909", Thu:"20260910", Fri:"20260911", Sat:"20260912", Sun:"20260913" };

// alarm: minutes before the start; 0 or absent = no notification.
// ── Pool under construction ────────────────────────────────────────────
// The club pool is open mornings only, so club practice moved to Monday and Friday
// first thing. PLAN below stays the normal week; POOL_AM_PLAN overlays the days that
// changed, and Friday's gym and evening rules in ALTERNATING are filtered out while
// this is on. Set to false when the pool reopens. Mirrors index.html.
const POOL_MORNINGS_ONLY = true;

const PLAN = {
  Mon:[
    {t:"05:30",e:"06:00",l:"Leave for the pool",alarm:10},
    {t:"06:00",e:"07:30",l:"Swim practice",n:"Solo · log the main set after",alarm:20},
    {t:"07:45",e:"08:25",l:"Pool to home",n:"40 min",alarm:10},
    {t:"09:00",e:"12:00",l:"Study room",n:"ECG moved to Wednesday",alarm:10},
    {t:"12:15",e:"13:15",l:"Lunch together",alarm:10},
    {t:"13:30",e:"14:45",l:"Study room",alarm:10},
    {t:"15:00",e:"15:15",l:"Study room to campus",n:"One station",alarm:10},
    {t:"15:15",e:"17:45",l:"Pharmacology I",alarm:15,n:"Two blocks, 15 min gap at 16:45"},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:30",l:"Study room",n:"22:00 peak",alarm:10},
  ],
  Tue:[
    {t:"09:30",e:"11:00",l:"Pharmacology lecture",alarm:15},
    {t:"11:00",e:"12:00",l:"Study room",n:"Lecture review",alarm:10},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"18:00",l:"Study room",n:"17:00 peak · snack at 16:45",alarm:10},
    {t:"18:30",e:"19:30",l:"Swim practice",alarm:20,n:"Leave at 18:15 · log the main set after"},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10,n:"Recovery meal"},
    {t:"21:00",e:"22:30",l:"Study room",n:"Shoulders rest after swimming",alarm:10},
  ],
  Wed:[
    {t:"09:30",e:"12:45",l:"Pathology I",alarm:15,n:"Two blocks — snack in the 11:00 gap"},
    {t:"13:15",e:"14:15",l:"Lunch together",alarm:10},
    {t:"14:45",e:"16:15",l:"Gym · Pull",n:"Be through the door before 15:00",alarm:15},
    {t:"16:45",e:"17:25",l:"Leave for the ECG practical",n:"40 min",alarm:15},
    {t:"17:30",e:"19:00",l:"Clinical ECG practical",alarm:15},
    {t:"19:00",e:"19:40",l:"Travel home",n:"40 min",alarm:0},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10},
    {t:"20:45",e:"21:00",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"21:00",e:"22:00",l:"Study room",alarm:10},
  ],
  Thu:[
    // 08:00 slot alternates — see ALTERNATING below.
    {t:"10:30",e:"12:00",l:"German for Medical Purposes",alarm:15},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"18:00",l:"Study room",n:"17:00 peak · snack at 16:45",alarm:10},
    {t:"18:30",e:"19:30",l:"Swim practice",alarm:20,n:"Leave at 18:15 · log the main set after"},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10,n:"Recovery meal"},
    {t:"21:00",e:"22:30",l:"Study room",n:"Shoulders rest after swimming",alarm:10},
  ],
  Fri:[
    {t:"08:30",e:"09:45",l:"Medical Statistics",alarm:15},
    {t:"20:30",e:"20:45",l:"CO2 table",n:"Sitting down, at home",alarm:10},
  ],
  Sat:[
    {t:"08:00",e:"09:30",l:"Swim practice",n:"Solo · log the main set after",alarm:20},
    {t:"10:30",e:"12:00",l:"Gym · Pull and press",alarm:15},
    {t:"12:30",e:"13:30",l:"Lunch together",alarm:10},
    {t:"14:30",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:00",l:"Study room",alarm:10},
  ],
  Sun:[
    {t:"08:00",e:"09:30",l:"Swim practice",n:"Solo · log the main set after",alarm:20},
    {t:"10:30",e:"12:00",l:"Gym · Upper",n:"Light accessory day",alarm:15},
    {t:"12:45",e:"13:30",l:"Lunch together",alarm:10},
    {t:"13:30",e:"15:00",l:"Batch cooking",alarm:10},
    {t:"15:30",e:"18:15",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:45",e:"19:45",l:"Dinner together",alarm:10},
    {t:"19:45",e:"21:30",l:"Study room",n:"Plan the week first",alarm:10},
  ],
};


// Days that change while the club pool is mornings only. The spare solo swim is on
// Wednesday rather than Thursday, because Thursday has an 08:00 lecture on odd weeks.
const POOL_AM_PLAN = {
  Mon:[
    {t:"05:45",e:"06:15",l:"Leave for the pool",alarm:10},
    {t:"06:15",e:"07:45",l:"Swim practice",n:"Club · log the main set after",alarm:20},
    {t:"07:45",e:"08:25",l:"Pool to home",n:"40 min",alarm:10},
    {t:"09:00",e:"12:00",l:"Study room",n:"ECG moved to Wednesday",alarm:10},
    {t:"12:15",e:"13:15",l:"Lunch together",alarm:10},
    {t:"13:30",e:"14:45",l:"Study room",alarm:10},
    {t:"15:00",e:"15:15",l:"Study room to campus",n:"One station",alarm:10},
    {t:"15:15",e:"17:45",l:"Pharmacology I",alarm:15,n:"Two blocks, 15 min gap at 16:45"},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:30",l:"Study room",n:"22:00 peak",alarm:10},
  ],
  Tue:[
    {t:"09:30",e:"11:00",l:"Pharmacology lecture",alarm:15},
    {t:"11:00",e:"12:00",l:"Study room",n:"Lecture review",alarm:10},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"15:30",l:"Gym · Pull",n:"Through the door before 15:00 — no swim today, go heavy",alarm:15},
    {t:"15:45",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"21:45",l:"Study room",alarm:10},
  ],
  Wed:[
    {t:"05:30",e:"06:00",l:"Leave for the pool",alarm:10},
    {t:"06:00",e:"07:30",l:"Swim practice",n:"Solo · log the main set after",alarm:20},
    {t:"07:45",e:"08:25",l:"Pool to campus",n:"40 min",alarm:10},
    {t:"09:30",e:"12:45",l:"Pathology I",alarm:15,n:"Two blocks — snack in the 11:00 gap"},
    {t:"13:15",e:"14:15",l:"Lunch together",alarm:10},
    {t:"14:30",e:"16:15",l:"Study room",alarm:10},
    {t:"16:45",e:"17:25",l:"Leave for the ECG practical",n:"40 min",alarm:15},
    {t:"17:30",e:"19:00",l:"Clinical ECG practical",alarm:15},
    {t:"19:00",e:"19:40",l:"Travel home",n:"40 min",alarm:0},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10},
    {t:"20:45",e:"21:00",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"21:00",e:"22:00",l:"Study room",alarm:10},
  ],
  Thu:[
    {t:"10:30",e:"12:00",l:"German for Medical Purposes",alarm:15},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"15:30",l:"Gym · Legs",n:"Through the door before 15:00 — jump work",alarm:15},
    {t:"15:45",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"21:45",l:"Study room",alarm:10},
  ],
  Fri:[
    {t:"05:45",e:"06:15",l:"Leave for the pool",alarm:10},
    {t:"06:15",e:"07:40",l:"Swim practice",n:"Club · leave early if Statistics is tight",alarm:20},
    {t:"07:45",e:"08:25",l:"Pool to campus",n:"40 min",alarm:10},
    {t:"08:30",e:"09:45",l:"Medical Statistics",alarm:15},
    {t:"12:00",e:"13:00",l:"Lunch together",alarm:10},
    {t:"13:15",e:"15:00",l:"Study room",alarm:10},
    {t:"15:15",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
    {t:"20:15",e:"20:30",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"20:30",e:"22:00",l:"Study room",alarm:10},
  ],
};
if(POOL_MORNINGS_ONLY)Object.assign(PLAN, POOL_AM_PLAN);

// ── Training v2 · from 22 Nov 2026 ─────────────────────────────────────────────
// Only the days that change are listed. A day listed here has its old weekly rule
// stopped at V2_UNTIL (the end of 21 Nov, Budapest) and these start in its place,
// so nothing up to and including MEFOB on the 21st moves.
const V2_UNTIL = "20261121T225959Z";
const V2_FIRST = { Sun:"20261122", Mon:"20261123", Tue:"20261124", Wed:"20261125", Thu:"20261126", Fri:"20261127", Sat:"20261128" };
const V2_SWIM = (note, dest) => [
  {t:"05:45",e:"06:15",l:"Leave for the pool",alarm:10},
  {t:"06:15",e:"07:45",l:"Swim practice",n:note,alarm:20},
  {t:"07:55",e:"08:35",l:dest,n:"40 min",alarm:10},
];
const PLAN_V2_POOL_AM = {
  Mon:[
    ...V2_SWIM("Club · log the main set after","Pool to home"),
    {t:"09:00",e:"12:00",l:"Study room",n:"ECG moved to Wednesday",alarm:10},
    {t:"12:15",e:"13:15",l:"Lunch together",alarm:10},
    {t:"13:30",e:"14:45",l:"Study room",alarm:10},
    {t:"15:00",e:"15:15",l:"Study room to campus",n:"One station",alarm:10},
    {t:"15:15",e:"17:45",l:"Pharmacology I",alarm:15,n:"Two blocks, 15 min gap at 16:45"},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"21:45",l:"Study room",n:"Early night — Tuesday swim starts 06:15",alarm:10},
  ],
  Tue:[
    ...V2_SWIM("Solo · speed day · 60 to 90 min · log it after","Pool to campus"),
    {t:"09:30",e:"11:00",l:"Pharmacology lecture",alarm:15},
    {t:"11:00",e:"12:00",l:"Study room",n:"Lecture review",alarm:10},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"15:30",l:"Gym · Pull",n:"Through the door before 15:00 — the heavy pull day",alarm:15},
    {t:"15:45",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"21:45",l:"Study room",alarm:10},
  ],
  Wed:[
    ...V2_SWIM("Solo · aerobic and technique · 60 to 90 min · log it after","Pool to campus"),
    {t:"09:30",e:"12:45",l:"Pathology I",alarm:15,n:"Two blocks — snack in the 11:00 gap"},
    {t:"13:15",e:"14:15",l:"Lunch together",alarm:10},
    {t:"14:30",e:"16:15",l:"Study room",alarm:10},
    {t:"16:45",e:"17:25",l:"Leave for the ECG practical",n:"40 min",alarm:15},
    {t:"17:30",e:"19:00",l:"Clinical ECG practical",alarm:15},
    {t:"19:00",e:"19:40",l:"Travel home",n:"40 min",alarm:0},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10},
    {t:"20:45",e:"21:00",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"21:00",e:"22:00",l:"Study room",alarm:10},
  ],
  Thu:[
    {t:"10:30",e:"12:00",l:"German for Medical Purposes",alarm:15},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"15:30",l:"Gym · Lower power",n:"Through the door before 15:00 — jumps first. A full rest day every fourth week",alarm:15},
    {t:"15:45",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"21:45",l:"Study room",alarm:10},
  ],
  Fri:[
    {t:"05:45",e:"06:15",l:"Leave for the pool",alarm:10},
    {t:"06:15",e:"07:40",l:"Swim practice",n:"Club · out of the water by 07:40, Statistics is 08:30",alarm:20},
    {t:"07:45",e:"08:25",l:"Pool to campus",n:"40 min",alarm:10},
    {t:"08:30",e:"09:45",l:"Medical Statistics",alarm:15},
    {t:"12:00",e:"13:00",l:"Lunch together",alarm:10},
    {t:"13:15",e:"15:00",l:"Study room",alarm:10},
    {t:"15:15",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
    {t:"20:15",e:"20:30",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"20:30",e:"22:00",l:"Study room",alarm:10},
  ],
};
// Once the pool reopens: solo mornings on Monday and Wednesday, club back to Tuesday
// and Thursday evenings, the leg day on Wednesday (two clear days before weekend
// volleyball) and the heavy pull day on Friday — that swap is in ALTERNATING below.
const PLAN_V2_NORMAL = {
  Mon:[
    ...V2_SWIM("Solo · speed day · 60 to 90 min · log it after","Pool to home"),
    {t:"09:00",e:"12:00",l:"Study room",n:"ECG moved to Wednesday",alarm:10},
    {t:"12:15",e:"13:15",l:"Lunch together",alarm:10},
    {t:"13:30",e:"14:45",l:"Study room",alarm:10},
    {t:"15:00",e:"15:15",l:"Study room to campus",n:"One station",alarm:10},
    {t:"15:15",e:"17:45",l:"Pharmacology I",alarm:15,n:"Two blocks, 15 min gap at 16:45"},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:30",l:"Study room",n:"22:00 peak",alarm:10},
  ],
  Wed:[
    ...V2_SWIM("Solo · aerobic and technique · 60 to 90 min · log it after","Pool to campus"),
    {t:"09:30",e:"12:45",l:"Pathology I",alarm:15,n:"Two blocks — snack in the 11:00 gap"},
    {t:"13:15",e:"14:15",l:"Lunch together",alarm:10},
    {t:"14:45",e:"16:15",l:"Gym · Lower power",n:"Be through the door before 15:00 — jumps first",alarm:15},
    {t:"16:45",e:"17:25",l:"Leave for the ECG practical",n:"40 min",alarm:15},
    {t:"17:30",e:"19:00",l:"Clinical ECG practical",alarm:15},
    {t:"19:00",e:"19:40",l:"Travel home",n:"40 min",alarm:0},
    {t:"19:45",e:"20:30",l:"Dinner together",alarm:10},
    {t:"20:45",e:"21:00",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"21:00",e:"22:00",l:"Study room",alarm:10},
  ],
};
const PLAN_V2 = POOL_MORNINGS_ONLY ? PLAN_V2_POOL_AM : PLAN_V2_NORMAL;
// The weekend keeps its times in both weeks; the two lifts change hands. Volleyball is
// usually Saturday, so Saturday gets the light upper session and pull-and-press moves
// to Sunday.
PLAN_V2.Sat = [
  {t:"08:00",e:"09:30",l:"Swim practice",n:"Solo · 100 pace · log it after",alarm:20},
  {t:"10:30",e:"12:00",l:"Gym · Upper",n:"Light — volleyball today",alarm:15},
  {t:"12:30",e:"13:30",l:"Lunch together",alarm:10},
  {t:"14:30",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
  {t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
  {t:"20:00",e:"22:00",l:"Study room",alarm:10},
];
PLAN_V2.Sun = [
  {t:"08:00",e:"09:30",l:"Swim practice",n:"Solo · base, kick and fly · log it after",alarm:20},
  {t:"10:30",e:"12:00",l:"Gym · Pull and press",n:"Moderate — club swim tomorrow",alarm:15},
  {t:"12:45",e:"13:30",l:"Lunch together",alarm:10},
  {t:"13:30",e:"15:00",l:"Batch cooking",alarm:10},
  {t:"15:30",e:"18:15",l:"Study room",n:"17:00 peak",alarm:10},
  {t:"18:45",e:"19:45",l:"Dinner together",alarm:10},
  {t:"19:45",e:"21:30",l:"Study room",n:"Plan the week first",alarm:10},
];

// Events that don't repeat every week.
// Friday's gym and evening blocks are replaced by POOL_AM_PLAN while the pool is
// mornings only, so they are filtered out below rather than deleted.
const ALTERNATING_ALL = [
  // Thursday 08:00 — lecture on odd weeks (first: 24 Sep, week 3), study on even (17 Sep).
  {day:"Thu",start:"20260924",t:"08:00",e:"10:30",l:"Clinical Pathophysiology",alarm:15,every:2,n:"Odd weeks only"},
  {day:"Thu",start:"20260917",t:"08:00",e:"10:30",l:"Study room",every:2,n:"No lecture this week",alarm:10},
  // Friday weeks 1–7, ending 23 Oct.
  {day:"Fri",start:"20260911",t:"10:15",e:"11:45",l:"ECG lecture",alarm:15,until:"20261023T220000Z"},
  {day:"Fri",start:"20260911",t:"12:00",e:"13:30",l:"Microbiology II practical",alarm:15,until:"20261023T220000Z"},
  {day:"Fri",start:"20260911",t:"13:45",e:"14:45",l:"Lunch together",until:"20261023T220000Z",alarm:10},
  {day:"Fri",start:"20260911",t:"15:00",e:"16:30",l:"Gym · Legs",n:"Jump work — volleyball",until:"20261023T220000Z",alarm:15},
  {day:"Fri",start:"20260911",t:"16:45",e:"18:30",l:"Study room",n:"17:00 peak",until:"20261023T220000Z",alarm:10},
  {day:"Fri",start:"20260911",t:"19:00",e:"20:00",l:"Dinner together",alarm:10,until:"20261023T220000Z"},
  {day:"Fri",start:"20260911",t:"20:15",e:"20:30",l:"CO2 table",n:"Sitting down, at home",until:"20261023T220000Z",alarm:10},
  {day:"Fri",start:"20260911",t:"20:30",e:"22:30",l:"Study room",n:"22:00 peak",until:"20261023T220000Z",alarm:10},
  // Friday from week 8 (30 Oct): Microbiology moves earlier, ECG lectures are over.
  {day:"Fri",start:"20261030",t:"10:15",e:"11:45",l:"Microbiology practical",alarm:15},
  {day:"Fri",start:"20261030",t:"12:00",e:"13:00",l:"Lunch together",alarm:10},
  {day:"Fri",start:"20261030",t:"13:15",e:"14:45",l:"Study room",alarm:10},
  {day:"Fri",start:"20261030",t:"15:00",e:"16:30",l:"Gym · Legs",n:"Jump work — volleyball",alarm:15},
  {day:"Fri",start:"20261030",t:"16:45",e:"18:30",l:"Study room",n:"17:00 peak",alarm:10},
  {day:"Fri",start:"20261030",t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
  {day:"Fri",start:"20261030",t:"20:15",e:"20:30",l:"CO2 table",n:"Sitting down, at home",alarm:10},
  {day:"Fri",start:"20261030",t:"20:30",e:"22:30",l:"Study room",n:"22:00 peak",alarm:10},
];
// v2, normal week only: Friday's gym session becomes the heavy pull day. The Legs rule
// ends on the 21st and a Pull rule starts on the 27th. While the pool is mornings
// only Friday has no gym at all, so the filter below already drops both.
const ALTERNATING_V2 = ALTERNATING_ALL
  .map(x=>(x.day==="Fri" && x.l==="Gym · Legs" && !x.until) ? {...x, until:V2_UNTIL} : x)
  .concat([{day:"Fri",start:V2_FIRST.Fri,t:"15:00",e:"16:30",l:"Gym · Pull",n:"The heavy pull day · a full rest day every fourth week",alarm:15}]);
const ALTERNATING = POOL_MORNINGS_ONLY
  ? ALTERNATING_V2.filter(x=>!(x.day==="Fri" && /Gym|Study room|Dinner together|Lunch together|CO2/.test(x.l)))
  : ALTERNATING_V2;

const BYDAY = { Mon:"MO", Tue:"TU", Wed:"WE", Thu:"TH", Fri:"FR", Sat:"SA", Sun:"SU" };

function esc(s){return String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");}
function hhmm(t){return t.replace(":","")+"00";}
function uid(parts){return parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g,"")+"@grind";}

function vevent({date,t,e,l,n,alarm,rrule,id}){
  const out=[
    "BEGIN:VEVENT",
    `UID:${uid(id)}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`,
    `DTSTART;TZID=${TZ}:${date}T${hhmm(t)}`,
    `DTEND;TZID=${TZ}:${date}T${hhmm(e)}`,
    `SUMMARY:${esc(l)}`,
  ];
  if(rrule)out.push(`RRULE:${rrule}`);
  if(n)out.push(`DESCRIPTION:${esc(n)}`);
  if(alarm){
    out.push("BEGIN:VALARM","ACTION:DISPLAY",`DESCRIPTION:${esc(l)}`,`TRIGGER:-PT${alarm}M`,"END:VALARM");
  }
  out.push("END:VEVENT");
  return out;
}

async function examEvents(){
  const token=process.env.NOTION_TOKEN;
  if(!token)return [];
  try{
    const r=await fetch(`https://api.notion.com/v1/databases/${EXAMS_DB}/query`,{
      method:"POST",
      headers:{Authorization:`Bearer ${token}`,"Notion-Version":"2022-06-28","Content-Type":"application/json"},
      body:JSON.stringify({page_size:100}),
    });
    const data=await r.json();
    const out=[];
    (data.results||[]).forEach(p=>{
      const props=p.properties||{};
      if(props.Archive&&props.Archive.checkbox)return;
      const d=props["Exam Date"]&&props["Exam Date"].date&&props["Exam Date"].date.start;
      if(!d)return;
      if(d.slice(0,10)<new Date().toISOString().slice(0,10))return;      // past exams add nothing
      const name=((props.Exam&&props.Exam.title)||[]).map(x=>x.plain_text).join("")||"Exam";
      const date=d.slice(0,10).replace(/-/g,"");
      let start="08:00",end="10:00";
      if(d.length>10){
        start=d.slice(11,16);
        const [h,m]=start.split(":").map(Number);
        end=String(h+2).padStart(2,"0")+":"+String(m).padStart(2,"0");
      }
      out.push(...vevent({date,t:start,e:end,l:"EXAM · "+name,alarm:60,id:["exam",p.id]}));
    });
    return out;
  }catch(err){
    return ["X-GRIND-EXAM-ERROR:"+esc(err.message)];   // feed still works without exams
  }
}

export default async function handler(req,res){
  const lines=[
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GRIND//Weekly plan//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "X-WR-CALNAME:GRIND","X-WR-TIMEZONE:"+TZ,"REFRESH-INTERVAL;VALUE=DURATION:PT1H","X-PUBLISHED-TTL:PT1H",
    // Budapest: CET/CEST, last Sunday in March / October.
    "BEGIN:VTIMEZONE",`TZID:${TZ}`,
    "BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT",
    "BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD",
    "END:VTIMEZONE",
  ];

  Object.keys(PLAN).forEach(day=>{
    const v2=PLAN_V2[day];
    PLAN[day].forEach((it,i)=>{
      lines.push(...vevent({
        date:ANCHOR[day],t:it.t,e:it.e,l:it.l,n:it.n,alarm:it.alarm,
        rrule:`FREQ=WEEKLY;BYDAY=${BYDAY[day]};UNTIL=${v2?V2_UNTIL:untilFor(it)}`,
        id:["w",day,i,it.l],
      }));
    });
    if(v2)v2.forEach((it,i)=>{
      lines.push(...vevent({
        date:V2_FIRST[day],t:it.t,e:it.e,l:it.l,n:it.n,alarm:it.alarm,
        rrule:`FREQ=WEEKLY;BYDAY=${BYDAY[day]};UNTIL=${untilFor(it)}`,
        id:["v2",day,i,it.l],
      }));
    });
  });

  ALTERNATING.forEach((it,i)=>{
    let rr=`FREQ=WEEKLY;BYDAY=${BYDAY[it.day]}`;
    if(it.every)rr+=`;INTERVAL=${it.every}`;
    rr+=`;UNTIL=${it.until||untilFor(it)}`;
    lines.push(...vevent({date:it.start,t:it.t,e:it.e,l:it.l,n:it.n,alarm:it.alarm,rrule:rr,id:["a",i,it.day,it.l]}));
  });

  lines.push(...await examEvents());
  lines.push("END:VCALENDAR");

  res.setHeader("Content-Type","text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition",'inline; filename="grind.ics"');
  res.setHeader("Cache-Control","public, max-age=900");
  res.status(200).send(lines.join("\r\n")+"\r\n");
}
