/* Weekly plan + exams as a subscribable calendar feed.
   Lives on the server so the app itself stays exactly as light as it was: the phone
   subscribes to this URL and Apple/Google re-fetch it periodically.

   Repeats are expressed as rules, not thousands of events, so the two things that vary
   by week handle themselves:
     - Thursday's Pathophysiology lecture: odd weeks only  → INTERVAL=2 from an odd week
     - Friday's layout changes at week 8 (30 Oct)          → one rule UNTIL, one FROM

   NOTE: the plan below mirrors DAY_PLAN in index.html. If the timetable changes, both
   need updating — the app reads its copy, the calendar reads this one.                */

const TZ = "Europe/Budapest";
const SEMESTER_END = "20261212T000000Z";      // last teaching week ends Fri 11 Dec
const EXAMS_DB = "21463a0b4e7c802ebea5c74d09c69b8e";

// First date of each weekday in teaching week 1 (Mon 7 Sep 2026).
const ANCHOR = { Mon:"20260907", Tue:"20260908", Wed:"20260909", Thu:"20260910", Fri:"20260911", Sat:"20260912", Sun:"20260913" };

// alarm: minutes before the start; 0 or absent = no notification.
const PLAN = {
  Mon:[
    {t:"08:00",e:"09:45",l:"Clinical Pathophysiology lecture",alarm:15,n:"Two blocks, 15 min gap at 08:45"},
    {t:"10:00",e:"11:30",l:"Clinical ECG",alarm:15},
    {t:"11:45",e:"12:45",l:"Lunch together",alarm:10},
    {t:"13:15",e:"15:00",l:"Study room",alarm:10},
    {t:"15:15",e:"17:45",l:"Pharmacology I",alarm:15,n:"Two blocks, 15 min gap at 16:45"},
    {t:"18:30",e:"19:30",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:30",l:"Study room",n:"22:00 peak",alarm:10},
  ],
  Tue:[
    {t:"09:30",e:"11:00",l:"Pharmacology lecture",alarm:15},
    {t:"11:00",e:"12:00",l:"Study room",n:"Lecture review",alarm:10},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"18:00",l:"Study room",n:"17:00 peak · snack at 16:45",alarm:10},
    {t:"18:30",e:"20:00",l:"Swim practice",alarm:20,n:"Leave at 18:15 · log the main set after"},
    {t:"20:30",e:"21:30",l:"Gym · Pull",n:"Moderate weights",alarm:15},
    {t:"21:45",e:"22:30",l:"Dinner together",alarm:10,n:"Recovery meal"},
  ],
  Wed:[
    {t:"09:30",e:"12:45",l:"Pathology I",alarm:15,n:"Two blocks — snack in the 11:00 gap"},
    {t:"13:15",e:"14:15",l:"Lunch together",alarm:10},
    {t:"14:15",e:"14:45",l:"Brisk walk to campus"},
    {t:"15:00",e:"17:30",l:"Study room",alarm:10},
    {t:"17:45",e:"18:00",l:"CO2 table",n:"Sitting down, at home",alarm:10},
    {t:"18:00",e:"19:00",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:15",l:"Study room",n:"22:00 peak",alarm:10},
  ],
  Thu:[
    // 08:00 slot alternates — see ALTERNATING below.
    {t:"10:30",e:"12:00",l:"German for Medical Purposes",alarm:15},
    {t:"12:15",e:"13:45",l:"Lunch together",alarm:10},
    {t:"14:00",e:"18:00",l:"Study room",n:"17:00 peak · snack at 16:45",alarm:10},
    {t:"18:30",e:"20:00",l:"Swim practice",alarm:20,n:"Leave at 18:15 · log the main set after"},
    {t:"20:30",e:"21:30",l:"Gym · Push + Rotation",n:"Moderate weights",alarm:15},
    {t:"21:45",e:"22:30",l:"Dinner together",alarm:10,n:"Recovery meal"},
  ],
  Fri:[
    {t:"08:30",e:"09:45",l:"Medical Statistics",alarm:15},
    {t:"20:30",e:"20:45",l:"CO2 table",n:"Sitting down, at home",alarm:10},
  ],
  Sat:[
    {t:"10:00",e:"11:30",l:"Gym · Lower + Power",n:"Then 20 min easy row",alarm:15},
    {t:"12:30",e:"13:30",l:"Lunch together",alarm:10},
    {t:"14:30",e:"18:00",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"19:00",e:"20:00",l:"Dinner together",alarm:10},
  ],
  Sun:[
    {t:"11:00",e:"12:15",l:"Gym · Upper accessory + Core",n:"Then 20 min easy bike",alarm:15},
    {t:"12:45",e:"13:30",l:"Lunch together",alarm:10},
    {t:"13:30",e:"15:00",l:"Batch cooking"},
    {t:"15:30",e:"18:15",l:"Study room",n:"17:00 peak",alarm:10},
    {t:"18:45",e:"19:45",l:"Dinner together",alarm:10},
    {t:"20:00",e:"22:15",l:"Study room",n:"Plan the week first · 22:00 peak",alarm:10},
  ],
};

// Events that don't repeat every week.
const ALTERNATING = [
  // Thursday 08:00 — lecture on odd weeks (first: 24 Sep, week 3), study on even (17 Sep).
  {day:"Thu",start:"20260924",t:"08:00",e:"10:30",l:"Clinical Pathophysiology",alarm:15,every:2,n:"Odd weeks only"},
  {day:"Thu",start:"20260917",t:"08:00",e:"10:30",l:"Study room",every:2,n:"No lecture this week",alarm:10},
  // Friday weeks 1–7, ending 23 Oct.
  {day:"Fri",start:"20260911",t:"10:15",e:"11:45",l:"ECG lecture",alarm:15,until:"20261023T220000Z"},
  {day:"Fri",start:"20260911",t:"12:00",e:"13:30",l:"Microbiology II practical",alarm:15,until:"20261023T220000Z"},
  {day:"Fri",start:"20260911",t:"13:45",e:"14:45",l:"Lunch together",until:"20261023T220000Z",alarm:10},
  {day:"Fri",start:"20260911",t:"15:30",e:"18:00",l:"Study room",n:"17:00 peak",until:"20261023T220000Z",alarm:10},
  {day:"Fri",start:"20260911",t:"18:30",e:"19:30",l:"Dinner together",alarm:10,n:"Evening off",until:"20261023T220000Z"},
  // Friday from week 8 (30 Oct): Microbiology moves earlier, ECG lectures are over.
  {day:"Fri",start:"20261030",t:"10:15",e:"11:30",l:"Microbiology practical",alarm:15},
  {day:"Fri",start:"20261030",t:"12:00",e:"13:00",l:"Lunch together",alarm:10},
  {day:"Fri",start:"20261030",t:"13:30",e:"17:30",l:"Study room",n:"17:00 peak",alarm:10},
  {day:"Fri",start:"20261030",t:"18:00",e:"19:00",l:"Dinner together",alarm:10,n:"Evening off"},
];

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
    PLAN[day].forEach((it,i)=>{
      lines.push(...vevent({
        date:ANCHOR[day],t:it.t,e:it.e,l:it.l,n:it.n,alarm:it.alarm,
        rrule:`FREQ=WEEKLY;BYDAY=${BYDAY[day]};UNTIL=${SEMESTER_END}`,
        id:["w",day,i,it.l],
      }));
    });
  });

  ALTERNATING.forEach((it,i)=>{
    let rr=`FREQ=WEEKLY;BYDAY=${BYDAY[it.day]}`;
    if(it.every)rr+=`;INTERVAL=${it.every}`;
    rr+=`;UNTIL=${it.until||SEMESTER_END}`;
    lines.push(...vevent({date:it.start,t:it.t,e:it.e,l:it.l,n:it.n,alarm:it.alarm,rrule:rr,id:["a",i,it.day,it.l]}));
  });

  lines.push(...await examEvents());
  lines.push("END:VCALENDAR");

  res.setHeader("Content-Type","text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition",'inline; filename="grind.ics"');
  res.setHeader("Cache-Control","public, max-age=900");
  res.status(200).send(lines.join("\r\n")+"\r\n");
}
