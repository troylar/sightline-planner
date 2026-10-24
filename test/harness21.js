// Review 5: Park the rest leaves your picks alone, unchanged Jira files aren't redrawn, counts are cached and
// invalidated, stories are easy to reach from Weeks and Find, and reconnecting handles a refusal. Each check fails on
// the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const epic = (summary) => ({summary, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true});
const st = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", epic:"ABC-1", sprint:"Sprint 42", sprintId:42, sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09", points:3, ...x});
const J = {kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[], issues:{"ABC-1":epic("Search"),
  "ABC-11":st("ABC-11"), "ABC-12":st("ABC-12", {status:"Done", category:"done"}), "ABC-13":st("ABC-13", {sprint:"", sprintId:0, sprintState:"", sprintStart:"", sprintEnd:""})},
  rollups:{"ABC-1":{total:3, todo:0, inprogress:2, done:1, unknown:0, points:9, pointsDone:3, unestimated:0, byState:{}, children:["ABC-11","ABC-12","ABC-13"], childrenCut:false}}};
for (let i = 0; i < 11; i++) J.issues[`ABC-${20 + i}`] = epic(`Other ${i}`);
const status = JSON.stringify(J);
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){}; w.Element.prototype.setPointerCapture=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.A = L[0].id; L[0].epics = ["ABC-1"];
    JIRA = parseJiraStatus(STATUS); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("UI.planTab = 'epics'; setWs('plan'); jiraPicks = new Set(['ABC-20','ABC-21']); renderJiraWs();"); await wait(20);
    const b = d.querySelector("#jiraParkRest");
    ok("Q1: with epics picked, the one-time park names only the rest", !!b && b.textContent === "Park the 9 not picked", b && b.textContent);
    b.click(); await wait(40);
    ok("Q1: and parks only those; your picks stay unsorted", ev("epicPlace('ABC-20').state") === "unsorted" && ev("epicPlace('ABC-21').state") === "unsorted" && ev("epicPlace('ABC-22').state") === "parked"); });

  await sec(async ()=>{ const {ev} = await page();
    ev(`window.draws = 0; const r0 = render; render = (...a) => { draws++; return r0(...a); };
      window.fakeDir = {name:"jira", getFileHandle: async n => ({getFile: async () => ({text: async () => { if (n === "status.json") return STATUS; throw new Error("none"); }})})};`);
    await ev("readJiraDir(fakeDir, true)"); const n1 = ev("draws");
    await ev("readJiraDir(fakeDir, true)"); await ev("readJiraDir(fakeDir, true)");
    ok("Q2: the minute check doesn't reparse or redraw files that haven't changed", n1 === 1 && ev("draws") === 1, `${n1} then ${ev("draws")}`);
    ev("window.STATUS2 = STATUS.replace('Story ABC-11', 'Renamed story'); fakeDir.getFileHandle = async n => ({getFile: async () => ({text: async () => { if (n === 'status.json') return STATUS2; throw new Error('none'); }})});");
    await ev("readJiraDir(fakeDir, true)");
    ok("Q2: a changed file is read and drawn", ev("draws") === 2 && ev("JIRA.issues['ABC-11'].summary") === "Renamed story"); });

  await sec(async ()=>{ const {ev} = await page();
    ok("Q3: one epic's count is worked out once per draw", ev("epicCounts('ABC-1', new Set()) === epicCounts('ABC-1', new Set())"));
    ok("Q3: epic rows count through the same function as the initiative, without a stand-in bar", ev("epicCounts('ABC-1', new Set(['ABC-12'])).done") === 0 && ev("epicCounts('ABC-1', new Set(['ABC-12'])).off") === 1);
    ev("commit(s=>{ s.bars.find(b=>b.id===A).storiesOff = ['ABC-11']; })");
    ok("Q3: a change clears the cache", ev("epicRollup(barById(A)).total") === 2);
    ev("JIRA = parseJiraStatus(STATUS.replace('\"Done\"', '\"Open\"').replace('\"category\":\"done\"', '\"category\":\"todo\"'))");
    ok("Q3: so does new Jira data, even before a redraw", ev("epicCounts('ABC-1', new Set()).done") === 0); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("setZoom('weeks'); select('bar', A);"); await wait(20);
    const b = d.querySelector("#f-stories-days");
    ok("Q4: in Weeks, the initiative's card offers to show its stories in Days", !!b && /See 2 on the timeline/.test(b.textContent), b && b.textContent);
    b.click(); await wait(80);
    ok("Q4: one click opens Days with them drawn", ev("UI.zoom") === "days" && d.querySelectorAll('#gantt [data-key^="story:"]').length === 2);
    ok("Q4: the hover card in Weeks mentions them", /2 in sprints · shown in the Days view/.test(ev("peekContent('bar', A).textContent"))); });

  await sec(async ()=>{ const {ev} = await page();
    const hit = ev("JSON.stringify(findIndex().find(x=>x.kind==='story' && x.id==='ABC-13'))");
    ok("Q5: Find says when a story has no sprint", /no sprint yet/.test(hit), hit); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`JIRA = null; JIRA_ISSUES = null; window.asked = 0; jiraDir = {name:"jira", queryPermission: async()=>"prompt", requestPermission: async()=>{ asked++; return "denied"; }}; UI.planTab = "epics"; setWs("plan");`); await wait(20);
    d.querySelector("#jiraWs #jiraReconnect").click(); await wait(40);
    ok("Q6: if you refuse the browser's prompt, it says what's needed and Reconnect stays", ev("asked") === 1 && /needs permission to read jira/.test(ev("$('#status').textContent")) && !!d.querySelector("#jiraWs #jiraReconnect"));
    ev("setWs('settings')"); await wait(20);
    ok("Q6: Plan, then Jira names the same action Reconnect", d.querySelector("#jiraSetupWs #jiraDirReload")?.textContent === "Reconnect"); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', A); render();"); await wait(20);
    const sw = [...d.querySelectorAll("#f-stories [data-sw]")].map(x=>x.textContent);
    ok("Q7: one set of words for the story switch", sw.length && sw.every(t=>t === "Switch off"), sw.join("|")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
