// Synthetic plans for the performance harness: fixed seeds, named sizes, invented names only.
// node test/perf/gen.js M [seed] [outDir] [years]  writes perf-M.json and perf-M-status.json (perf-M-2y.json with years of use)
// A size is how much work is planned at once; years adds what a team piles up using the plan that long: finished work,
// updates, notes, decisions and risks, snapshots, status updates, sprint commitments, meetings, saved views, a full
// Activity log, and who-added-what on everything. Ages are named M-1y, L-2y and so on.
const fs = require("fs"), path = require("path");

const SIZES = {
  S:  {lanes:5,  initiatives:30,   tasks:150,  stories:300,   weeks:26},
  M:  {lanes:12, initiatives:120,  tasks:800,  stories:2000,  weeks:52},
  L:  {lanes:25, initiatives:400,  tasks:3000, stories:8000,  weeks:104},
  XL: {lanes:40, initiatives:1000, tasks:8000, stories:25000, weeks:156},
};
const MAX_WEEKS = 104;                   // normalize() caps meta.weeks; XL asks for three years
// Plans are built around today, so the page needs no fake clock (a Date stand-in costs measurable time in every draw).
// The same size, seed and day give the same plan; set PERF_TODAY to rebuild another day's.
const localDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const TODAY = process.env.PERF_TODAY || localDay();

function rng(seed){                      // mulberry32: the same seed gives the same plan everywhere
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const day = s => Date.parse(s + "T00:00:00Z");
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const short = ms => { const d = new Date(ms); return MON[d.getUTCMonth()] + " " + d.getUTCDate(); };

const WORDS = ["paging","search","export","import","billing","audit","alerts","reports","sync","tokens","themes","limits","retries","caching","indexes","webhooks","roles","onboarding","metrics","queues","schemas","drafts","previews","uploads","sharing","tagging","history","filters","digests","quotas"];
const VERBS = ["Rework","Add","Speed up","Harden","Split","Retire","Measure","Document","Migrate","Simplify","Batch","Validate"];
const FIRST = ["Avery","Blake","Casey","Devon","Emery","Finley","Gray","Harper","Indigo","Jules","Kai","Logan","Morgan","Noel","Oakley","Parker","Quinn","Reese","Sage","Tatum","Umi","Vale","Wren","Yael","Zion"];
const LAST = ["Stone","Ito","Moore","Lane","Park","Reed","Shaw","Vance","West","Young","Ford","Hale","Knox","Marsh","Nash","Price","Rowe","Shore","Tate","Wells"];

function generate(size, seed = 1, today = TODAY, years = 0){
  { const m = /^([A-Z]+)-(\d+(?:\.\d+)?)y$/.exec(size); if (m){ size = m[1]; years = Number(m[2]); } }
  const z = SIZES[size]; if (!z) throw new Error("Unknown size " + size + ". Use S, M, L or XL, with -1y or -2y for years of use.");
  const r = rng(seed * 7919 + size.length), pick = a => a[Math.floor(r() * a.length)], int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const phrase = () => pick(VERBS) + " " + pick(WORDS) + " " + pick(WORDS);
  // A plan in use for years runs to the 104-week cap with today late in it: the past fills the plan, a few months stay ahead.
  const weeks = years ? MAX_WEEKS : Math.min(z.weeks, MAX_WEEKS), past = years ? Math.min(MAX_WEEKS - 26, Math.round(52 * years)) : Math.round(weeks / 3);
  // without years, today sits a third of the way in, so the sprint presets have work on both sides
  const todayMs = day(today), startMon = todayMs - past * 7 * DAY;
  const start = iso(startMon - ((new Date(startMon).getUTCDay() + 6) % 7) * DAY);
  const s0 = day(start), wk = w => s0 + w * 7 * DAY;

  const people = Array.from({length:Math.min(200, z.lanes * 3)}, (_, i) => {
    const name = FIRST[i % FIRST.length] + " " + LAST[Math.floor(i / FIRST.length) % LAST.length] + (i >= FIRST.length * LAST.length ? " " + i : "");
    return {id:"p" + i, name, jira:{key:"u-" + i, user:"user" + i, name}};
  });
  const lanes = Array.from({length:z.lanes}, (_, i) => ({id:"ws" + i, name:"Workstream " + (i + 1) + " " + WORDS[i % WORDS.length], color:"#" + (0x2c6fbb + i * 0x1f3a5) .toString(16).slice(-6)}));

  const sprints = [], jsprints = [];
  for (let w = 0, n = 1; w < weeks; w += 2, n++){
    const a = wk(w), e = a + 11 * DAY;
    sprints.push({id:"s" + n, name:"Sprint " + n, weeks:Math.min(2, weeks - w), goal:n % 3 ? "" : phrase(), jira:1000 + n});
    jsprints.push({id:1000 + n, name:"Sprint " + n, state:e < todayMs ? "closed" : a <= todayMs ? "active" : "future", start:iso(a), end:iso(e)});
  }
  jsprints.push({id:990, name:"Parking lot", state:"future", start:iso(s0 - 28 * DAY), end:iso(s0 - 17 * DAY)});   // a stale future sprint

  const bars = [], issues = {}, rollups = {}; let key = 100;
  const epicBars = [];
  const doneBars = years ? Math.round(z.initiatives * 0.75 * years) : 0, doneTasks = years ? Math.round(z.tasks * 0.75 * years) : 0;
  for (let i = 0; i < z.initiatives + doneBars; i++){
    const old = i >= z.initiatives, lane = lanes[i % lanes.length].id, st = old ? int(0, Math.max(0, past - 4)) : years ? int(Math.max(0, past - 12), weeks - 4) : int(0, Math.max(0, weeks - 4)), span = Math.min(weeks - st, int(1, 12));
    const long = r() < 0.1, label = long ? phrase() + ", " + Array.from({length:12}, phrase).join(", ") : phrase();
    const b = {id:"b" + i, lane, start:st, span:Math.max(1, span), label:label.slice(0, 280), kind:"work", owners:[pick(people).id, pick(people).id], jira:"", status:old ? "done" : pick(["notstarted","inprogress","inprogress","done"]), dependsOn:[], tasks:[]};
    if (r() < 0.6 && !old){ const k = "ABC-" + (key++); b.epics = [k]; epicBars.push(b); issues[k] = {summary:b.label.slice(0, 120), status:"In Progress", category:"inprogress", type:"Epic", isEpic:true}; }
    if (r() < 0.03) b.parked = true;
    bars.push(b);
  }
  // deep dependency chains: every 25th initiative starts a chain of up to 20
  for (let i = 0; i < bars.length; i += 25) for (let j = 1; j < 20 && i + j < bars.length; j++) bars[i + j].dependsOn = [bars[i + j - 1].id];
  for (let t = 0; t < z.tasks + doneTasks; t++){
    const old = t >= z.tasks, b = old ? bars[z.initiatives + (t % Math.max(1, doneBars))] : bars[t % z.initiatives], a = wk(b.start) + int(0, Math.max(0, b.span * 5 - 1)) * DAY;
    b.tasks.push({id:"t" + t, label:phrase(), start:iso(a), days:int(1, 10), status:old ? "done" : pick(["notstarted","inprogress","done"]), owners:[pick(people).id], jira:""});
  }

  // Jira stories: spread over the epics, across sprints, some unestimated, some with no sprint, some abandoned
  const STATES = [["To Do","todo"],["In Progress","inprogress"],["Code Review","inprogress"],["QA","inprogress"],["Done","done"]];
  const unsorted = [];
  for (let s = 0; s < z.stories; s++){
    const k = "ABC-" + (key++), orphan = r() < 0.04 || !epicBars.length, b = orphan ? null : epicBars[s % epicBars.length];
    const sw = b ? Math.min(weeks - 1, b.start + int(0, b.span + 2)) : int(0, weeks - 1);
    const sp = r() < 0.05 ? null : jsprints[Math.min(jsprints.length - 2, Math.floor(sw / 2))];
    let [status, category] = sp && sp.state === "closed" ? (r() < 0.85 ? STATES[4] : pick(STATES)) : sp && sp.state === "future" ? STATES[0] : pick(STATES);
    const who = r() < 0.15 ? null : pick(people), abandoned = r() < 0.02;
    if (abandoned){ status = "Won't Do"; category = "done"; }
    const it = {summary:phrase() + (r() < 0.05 ? " " + Array.from({length:8}, phrase).join(" ") : ""), status, category, type:"Story", labels:r() < 0.3 ? [pick(WORDS)] : []};
    if (abandoned) it.resolution = "Won't Do";
    if (r() > 0.2) it.points = pick([1,2,3,5,8,13]);
    if (who) Object.assign(it, {assignee:who.name, assigneeKey:who.jira.key});
    if (sp) Object.assign(it, {sprint:sp.name, sprintId:sp.id, sprintState:sp.state, sprintStart:sp.start, sprintEnd:sp.end});
    if (b){ it.epic = b.epics[0]; (rollups[b.epics[0]] ||= []).push(k); } else unsorted.push(k);
    issues[k] = it;
  }
  for (const [ek, kids] of Object.entries(rollups)){
    const c = {total:kids.length, todo:0, inprogress:0, done:0, unknown:0, points:0, pointsDone:0, unestimated:0};
    for (const k of kids){ const it = issues[k]; c[it.category]++; if (it.points == null) c.unestimated++; else { c.points += it.points; if (it.category === "done") c.pointsDone += it.points; } }
    rollups[ek] = {...c, children:kids};
  }
  // a Jira-linked task in every tenth initiative with an epic, and some stories turned off
  epicBars.forEach((b, i) => { const kids = rollups[b.epics[0]]?.children || [];
    if (i % 10 === 0 && kids.length && b.tasks.length) b.tasks[0].jira = kids[0];
    if (i % 7 === 0 && kids.length > 3) b.storiesOff = kids.slice(1, 3); });

  // many milestones on one day, plus a steady spread
  const milestones = [];
  const pileWeek = Math.round(weeks / 3) + 1;
  for (let m = 0; m < Math.max(8, Math.round(z.initiatives / 8)); m++){
    const w = m < 8 ? pileWeek + 0.4 : int(0, weeks - 1) + 0.4;
    milestones.push({id:"ms" + m, date:short(wk(w)), what:phrase(), dep:"", status:pick(["commit","commit","stretch"]), lane:lanes[m % lanes.length].id, at:w});
  }
  const notes = Array.from({length:Math.round(z.initiatives / 2)}, (_, i) => ({id:"n" + i, text:phrase() + ". " + phrase() + ".", date:iso(wk(bars[i % bars.length].start)), lane:bars[i % bars.length].lane, author:pick(people).id, on:"bar:" + bars[i % bars.length].id}));
  const decisions = Array.from({length:Math.max(4, Math.round(z.initiatives / 10))}, (_, i) => ({id:"d" + i, text:"Decide " + phrase(), state:i % 3 ? "open" : "decided", owners:[pick(people).id], due:iso(wk(int(0, weeks - 1))), item:bars[i % bars.length].id}));
  const risks = Array.from({length:Math.max(4, Math.round(z.initiatives / 20))}, (_, i) => ({id:"r" + i, sev:pick(["high","med","low"]), text:"Risk to " + phrase(), owners:[pick(people).id], item:bars[(i * 3) % bars.length].id}));

  const aged = years ? age({r, pick, int, phrase, people, lanes, bars, milestones, notes, decisions, risks, sprints, jsprints, issues, unsorted, wk, todayMs, past, weeks, years}) : {};

  const plan = {meta:{title:"Performance plan " + size + (years ? " after " + years + (years === 1 ? " year" : " years") : ""), planId:"perf-" + size + "-" + seed, start, weeks, sprintWeeks:2, jiraBase:"https://jira.example.com/browse/", jiraSkip:unsorted.slice(0, 5)},
    people, lanes, bars, milestones, gates:[], decisions, risks, baseline:null, sprints, notes, ...aged};
  const status = {kind:"sightline-jira-status", version:1, generatedAt:today + "T08:00:00Z", jiraBase:"https://jira.example.com/browse/", missing:[], issues, rollups, sprints:jsprints,
    board:{id:7, name:"Team board", columns:[{name:"To Do", statuses:["To Do"]}, {name:"In Progress", statuses:["In Progress"]}, {name:"Code Review", statuses:["Code Review"]}, {name:"QA", statuses:["QA"]}, {name:"Done", statuses:["Done"]}]}};
  return {plan, status, asked:{...z, ...(years ? {years, doneInitiatives:doneBars, doneTasks} : {})}, weeks, today};
}

// What a plan piles up in use, at the rates of a team that uses it every day. Each collection stops at the page's own cap.
function age({r, pick, int, phrase, people, lanes, bars, milestones, notes, decisions, risks, sprints, jsprints, issues, unsorted, wk, todayMs, past, weeks, years}){
  const W = Math.round(52 * years), at = (wkAgo, h = 10) => new Date(todayMs - wkAgo * 7 * DAY + h * 3600000).toISOString();
  const by = () => pick(people).id, stamp = (wkAgo) => ({by:by(), at:at(wkAgo, int(8, 18))});
  const longText = n => Array.from({length:n}, phrase).join(". ") + ".";
  // finished work and old notes, decisions and risks: added long ago, edited since
  const ago = w => Math.max(0, past - w);
  for (const b of bars){ b.added = stamp(ago(b.start)); if (r() < 0.7) b.edited = stamp(Math.max(0, ago(b.start) - int(0, 8)));
    for (const t of b.tasks){ t.added = stamp(ago(b.start)); if (r() < 0.5) t.edited = stamp(Math.max(0, ago(b.start) - int(0, 4))); } }
  for (let i = 0; i < W * 6; i++){ const b = pick(bars), w = int(0, W - 1);
    notes.push({id:"na" + i, text:longText(int(1, 4)).slice(0, 500), date:iso(todayMs - w * 7 * DAY), lane:b.lane, author:by(), on:"bar:" + b.id, added:stamp(w)}); }
  for (let i = 0; i < W * 3; i++){ const w = int(0, W - 1), open = w < 6 && r() < 0.5;
    decisions.push({id:"da" + i, text:"Decide " + phrase() + ". " + longText(int(0, 3)), state:open ? "open" : "decided", owners:[by()], due:iso(todayMs - w * 7 * DAY), item:pick(bars).id, added:stamp(w)}); }
  for (let i = 0; i < W; i++){ const w = int(0, W - 1);
    risks.push({id:"ra" + i, sev:pick(["high","med","low"]), text:"Risk to " + phrase() + ". " + longText(int(0, 2)), owners:[by()], item:pick(bars).id, added:stamp(w)}); }
  // dated updates on items: two a person a week, the page keeps 20,000
  const items = bars.flatMap(b => ["bar:" + b.id, ...b.tasks.map(t => "task:" + t.id)]);
  const updates = Array.from({length:Math.min(20000, people.length * 2 * W)}, (_, i) => ({id:"u" + i, item:pick(items), at:at(int(0, W - 1), int(8, 18)), by:by(), text:longText(int(1, 3)).slice(0, 1000)}));
  // twelve snapshots, the most the page keeps, each a copy of every item
  const snapInfo = () => { const b = {}, t = {}, m = {};
    for (const x of bars){ b[x.id] = [x.label.slice(0, 120), iso(wk(x.start)), iso(wk(x.start + x.span) - DAY), x.status, x.lane, 0];
      for (const k of x.tasks) t[k.id] = [k.label, k.start, iso(day(k.start) + (k.days - 1) * DAY), k.status]; }
    for (const x of milestones) m[x.id] = [x.what, iso(wk(Math.floor(x.at)))]; return {b, t, m, dv:{}}; };
  const snapshots = Array.from({length:Math.min(12, Math.ceil(W / 6))}, (_, i) => ({id:"snap" + i, name:"Quarter review " + (i + 1), takenAt:at(Math.round(W * (1 - i / 12)), 15), by:by(), base:{}, info:snapInfo()}));
  // weekly status updates (the page keeps 26) and a commitment for every sprint (26 kept, up to 500 issues each)
  const sections = () => Object.fromEntries(["ontrack","changed","risk","decisions","next"].map(k => [k, longText(int(2, 8)).slice(0, 4000)]));
  const reports = Array.from({length:Math.min(26, W)}, (_, i) => ({id:"rep" + i, at:at(i, 16), by:by(), status:pick(["ontrack","ontrack","atrisk"]), title:"Week " + (W - i), sections:sections()}));
  const keys = Object.keys(issues).filter(k => !issues[k].isEpic);
  const closed = jsprints.filter(s => s.state !== "future").slice(-26);
  const commitments = closed.map((s, i) => ({id:"cmt" + i, sprint:s.id, name:s.name, at:s.start + "T09:00:00.000Z", by:by(), goal:phrase(), points:int(20, 80), capacity:int(40, 90),
    keys:Array.from({length:int(20, Math.min(500, Math.max(20, Math.round(keys.length / 26))))}, () => [pick(keys), pick([1,2,3,5,8])]), note:""}));
  // meetings that repeat for years: skipped weeks and moved ones pile up (the page keeps 300 of each)
  const meetings = Array.from({length:12}, (_, i) => { const d0 = iso(wk(0) + (i % 5) * DAY);
    return {id:"meet" + i, title:pick(["Standup","Planning","Review","Retro","Sync","Demo"]) + " " + (i + 1), date:d0, time:"09:30", end:"10:00",
      recur:{freq:"weekly", every:1, days:[1 + (i % 5)], ends:"never"}, skip:Array.from({length:Math.min(300, W * 2)}, (_, k) => iso(wk(0) + (k * 7 + (i % 5)) * DAY)),
      moves:Array.from({length:Math.min(300, W)}, (_, k) => ({from:iso(wk(0) + (k * 14 + (i % 5)) * DAY), to:iso(wk(0) + (k * 14 + (i % 5) + 1) * DAY), time:"11:00", end:"11:30"})),
      attendees:people.slice(i * 3, i * 3 + 8).map(p => p.id), groups:[], lane:lanes[i % lanes.length].id, note:phrase()}; });
  const holidays = Array.from({length:Math.ceil(10 * (years + 1))}, (_, i) => ({date:iso(wk(0) + Math.round(i * 36.5) * DAY), name:"Holiday " + (i + 1)}));
  const views = Array.from({length:20}, (_, i) => ({id:"view" + i, name:"View " + (i + 1) + " " + pick(WORDS), def:{filter:{people:[by()], lanes:[pick(lanes).id], q:pick(WORDS)}, zoom:i % 3 ? "weeks" : "days", rows:"lanes"}}));
  // the last 30 days of edits, at the page's cap: 1,000 records within 256 KB
  const changes = []; let bytes = 2;
  for (let i = 0; i < 1000; i++){ const b = pick(bars), c = {id:"chg" + i, by:by(), at:new Date(todayMs - (1000 - i) * 30 * DAY / 1000).toISOString(), what:pick(["status","dates","label","owners"]) + " on " + b.label.slice(0, 40),
      ops:[{type:"bars", op:"set", id:b.id, field:"status", prev:"notstarted", value:"inprogress"}]};
    bytes += JSON.stringify(c).length + 1; if (bytes > 262144) break; changes.push(c); }
  // and Jira issues the team skipped, years of them
  unsorted.push(...keys.slice(0, Math.min(2000, keys.length)).filter((k, i) => i % 9 === 0));
  return {updates, snapshots, reports, commitments, meetings, holidays, views, changes};
}

module.exports = {generate, SIZES, TODAY};

if (require.main === module){
  const [size = "S", seed = "1", out = ".", years = "0"] = process.argv.slice(2);
  const g = generate(size, Number(seed), TODAY, Number(years));
  fs.mkdirSync(out, {recursive:true});
  fs.writeFileSync(path.join(out, `perf-${size}.json`), JSON.stringify(g.plan));
  fs.writeFileSync(path.join(out, `perf-${size}-status.json`), JSON.stringify(g.status));
  console.log(size, "plan", JSON.stringify(g.plan).length, "bytes; status", JSON.stringify(g.status).length, "bytes;", Object.keys(g.status.issues).length, "issues");
}
