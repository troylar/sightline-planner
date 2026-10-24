// Informational jsdom benchmark: DOM/JavaScript cost, not browser layout, paint, or input latency.
// Usage: node test/performance-workspaces.js ORIGINAL_HTML [CURRENT_HTML] [SAMPLES]
const {JSDOM, VirtualConsole} = require("jsdom");
const fs = require("fs"); const path = require("path"); const {performance} = require("perf_hooks");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"));
const files = process.argv.slice(2, 4);
if (!files[0]) throw new Error("Provide the original built HTML path.");
if (!files[1]) files[1] = path.join(__dirname, "..", "dist", "sightline.html");
const samples = Math.max(3, Math.min(20, Number(process.argv[4]) || 5));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function scenario(base){
  const plan = JSON.parse(JSON.stringify(base));
  plan.meta.start = "2026-09-28"; plan.meta.weeks = 12; plan.meta.planId = "perf-synthetic";
  plan.notes = []; plan.views = []; plan.changes = []; plan.deliverables = [];
  const donors = plan.bars.filter(b => b.lane && b.kind !== "waiting");
  const issues = {}, rollups = {};
  const sp = {id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"};
  plan.people.forEach((p, i) => p.jira = {key:"USER" + i, user:"user" + i, name:p.name});
  plan.bars = Array.from({length:120}, (_, i) => {
    const bar = JSON.parse(JSON.stringify(donors[i % donors.length]));
    const epic = "ABC-" + (i * 10 + 1), person = plan.people[i % plan.people.length];
    Object.assign(bar, {id:"perf-bar-" + i, label:"Synthetic initiative " + i, parent:"", lane:plan.lanes[i % plan.lanes.length].id, epics:[epic], jira:"", dependsOn:[], parked:false, storiesOff:[], owners:[]});
    bar.tasks = [{id:"perf-task-" + i, label:"Planning task " + i, start:sp.start, days:3, status:"notstarted", owners:[person.id], jira:""}];
    issues[epic] = {summary:bar.label, status:"In Progress", category:"inprogress", type:"Epic", labels:[]};
    const children = Array.from({length:5}, (_, j) => {
      const key = "ABC-" + (i * 10 + j + 2);
      issues[key] = {summary:"Synthetic story " + i + "/" + j, status:j === 0 ? "Done" : "In Progress", category:j === 0 ? "done" : "inprogress", type:"Story", epic, labels:[], assignee:person.name, assigneeKey:person.jira.key, points:3, sprintId:sp.id, sprint:sp.name, sprintState:sp.state, sprintStart:sp.start, sprintEnd:sp.end};
      return key;
    });
    rollups[epic] = {total:5, done:1, inprogress:4, todo:0, children};
    if (i % 2 === 0) plan.deliverables.push({id:"dv-perf-" + i, name:"Customer outcome " + i, stage:"planned", target:"2026-Q4", lane:bar.lane, owners:[person.id], jira:[epic]});
    return bar;
  });
  return {plan, jira:{kind:"sightline-jira-status", generatedAt:"2026-09-30T10:00:00Z", jiraBase:"https://jira.example.com", missing:[], issues, rollups, sprints:[sp]}};
}
async function measure(file, label){
  const html = fs.readFileSync(file, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-09-30T10:00:00Z").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = () => true; w.prompt = () => "Synthetic"; w.alert = () => {};
    w.Element.prototype.scrollIntoView = function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText:t => ({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s => s;
    w.errors = []; w.addEventListener("error", e => w.errors.push(e.message));
  }});
  const w = dom.window; await wait(200);
  w.BASE_FIXTURE = JSON.stringify(fixture);
  const data = scenario(JSON.parse(w.eval("JSON.stringify(normalize(JSON.parse(BASE_FIXTURE), false))"))); w.PERF_DATA = JSON.stringify(data);
  w.eval(`window.P = JSON.parse(PERF_DATA); S = normalize(P.plan, false); JIRA = parseJiraStatus(JSON.stringify(P.jira)); locked = false; file.handle = null; UI.noWelcome = true; UI.ws = "timeline"; UI.zoom = "weeks"; UI.filter = normFilter({}); setMe(S.people[0].id); resetHistory(); render();`);
  w.profile = {}; w.counting = false;
  for (const name of ["renderGantt", "renderDays", "renderTables", "renderDerived", "renderMainNav", "renderRoadmap", "renderStandup", "renderToday"]){
    if (w.eval(`typeof ${name}`) !== "function") continue;
    w[name + "Original"] = w.eval(name);
    w.eval(`${name} = function(...args){ const t = performance.now(); const value = window.${name}Original(...args); if (window.counting) window.profile[${JSON.stringify(name)}] = (window.profile[${JSON.stringify(name)}] || 0) + performance.now() - t; return value; };`);
  }
  const rows = [];
  for (const ws of ["timeline", "today", "standup", "people", "roadmap", "plan"]){
    w.TARGET_WS = ws;
    const action = "UI.planTab = 'report'; goWs(TARGET_WS);";
    w.eval(action); w.eval(action); await wait(30);
    const times = []; w.profile = {}; w.counting = true;
    for (let i = 0; i < samples; i++){ const t = performance.now(); w.eval(action); times.push(performance.now() - t); await wait(10); }
    w.counting = false;
    rows.push({workspace:ws, medianMs:+median(times).toFixed(1), minMs:+Math.min(...times).toFixed(1), maxMs:+Math.max(...times).toFixed(1), domNodes:w.document.querySelectorAll("*").length,
      profileMeanMs:Object.fromEntries(Object.entries(w.profile).map(([k, v]) => [k, +(v / samples).toFixed(1)]))});
  }
  if (w.errors.length) throw new Error(label + ": " + w.errors.join(" | "));
  await wait(50); dom.window.close();
  return {label, rows};
}
(async () => {
  const baseline = await measure(files[0], "original");
  const current = await measure(files[1], "current");
  const comparison = current.rows.map((row, i) => ({workspace:row.workspace, originalMs:baseline.rows[i].medianMs, currentMs:row.medianMs, changePercent:+((row.medianMs / baseline.rows[i].medianMs - 1) * 100).toFixed(1), currentHiddenTimelineMs:row.workspace === "timeline" ? 0 : row.profileMeanMs.renderGantt || 0}));
  console.log(JSON.stringify({environment:"jsdom; excludes browser layout and paint", scenario:"120 epic initiatives, 600 Jira stories, 120 plan tasks, 60 deliverables; synthetic fixture people/workstreams", samples, comparison, details:[baseline, current]}, null, 2));
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
