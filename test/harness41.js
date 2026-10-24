// Workstreams can start and end on a date: outside those dates the row fades, with the date at the edge (Weeks and
// Days); a workstream the dates on screen don't reach isn't drawn, and the hidden note counts it with "Show anyway";
// its card sets the dates; work dated outside them says so; pickers list ones that haven't started last. Saved as a
// feature older copies don't know, so they open the plan read-only. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
const ST = (sid, st, start, end) => ({sprintId:sid, sprint:"Sprint " + sid, sprintState:st, sprintStart:start, sprintEnd:end});
const S42 = ST(42, "active", "2026-09-28", "2026-10-09"), S43 = ST(43, "future", "2026-10-12", "2026-10-23"), S40 = ST(40, "closed", "2026-08-31", "2026-09-11");
const story = (sum, who, sp, extra) => ({summary:sum, status:"To Do", category:"todo", type:"Story", assignee:who ? who + " N." : "", assigneeKey:who || "", labels:[], ...sp, ...(extra || {})});
const JS = JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Placed epic", status:"In Progress", category:"inprogress", type:"Epic"}, "ABC-2":story("Placed work", "JIRAUSER1", S42),
    "ABC-10":{summary:"Checkout", status:"To Do", category:"todo", type:"Epic"}, "ABC-11":story("Pay by card", "JIRAUSER1", S42), "ABC-12":story("Receipts", "JIRAUSER1", S43),
    "ABC-20":{summary:"Gift cards", status:"To Do", category:"todo", type:"Epic"}, "ABC-21":story("Balance page", "JIRAUSER9", S43),
    "ABC-30":{summary:"Old stuff", status:"To Do", category:"todo", type:"Epic"}, "ABC-31":story("Done long ago", "JIRAUSER1", S40),
    "ABC-40":{summary:"Parked with sprint work", status:"To Do", category:"todo", type:"Epic"}, "ABC-41":story("Still planned", "", S43),
    "ABC-50":{summary:"Wallet feature", status:"To Do", category:"todo", type:"Epic", parent:"ABC-10"}, "ABC-51":story("Wallet story", "JIRAUSER1", S42, {parent:"ABC-50"}),
    "ABC-90":story("Loose story", "JIRAUSER1", S42)},
  sprints:[{id:40, name:"Sprint 40", state:"closed", start:"2026-08-31", end:"2026-09-11"}, {id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}],
  rollups:{"ABC-1":{total:1, todo:1, children:["ABC-2"]}, "ABC-10":{total:2, todo:2, children:["ABC-11","ABC-12"]}, "ABC-20":{total:1, todo:1, children:["ABC-21"]}, "ABC-30":{total:1, todo:1, children:["ABC-31"]}, "ABC-40":{total:1, todo:1, children:["ABC-41"]}}});
async function page(opts = {}){
  const handle = makeHandle("plan.json", opts.text || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    if (opts.session) w.sessionStorage.setItem("sightline-session", opts.session);
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.BroadcastChannel = globalThis.BroadcastChannel; w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id);");
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = "";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); UI.planTab = "epics"; setWs("plan"); render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const setL = `S.lanes[1].from = "2026-11-02"; S.lanes[2].until = "2026-10-16"; S.lanes[3].from = "2027-03-01"; S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); render();`;

  await sec(async ()=>{ const {ev} = await page({jira:false}); ev(setL);
    ok("F1: a workstream keeps its start and end", ev("S.lanes[1].from") === "2026-11-02" && ev("S.lanes[2].until") === "2026-10-16");
    ok("F1: and the plan says it uses them, so older copies open it read-only", ev("featuresIn(S).includes('laneDates') && KNOWN_FEATURES.includes('laneDates')"));
    ok("F1: an end before the start isn't kept", ev(`normalize({...clone(S), lanes:[{id:"x", name:"X", from:"2027-01-01", until:"2026-01-01"}]}, false).lanes[0].until`) === undefined); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(setL); await wait(10);
    const api = d.querySelector(`#gantt .lane[data-lane="${ev("S.lanes[1].id")}"]`), srch = d.querySelector(`#gantt .lane[data-lane="${ev("S.lanes[2].id")}"]`);
    ok("W1: before a workstream starts, its row fades, with the date at the edge", !!api.querySelector(".lwin.before") && /Starts Nov 2/.test(api.querySelector(".lwin-tag").textContent));
    ok("W1: after it ends too", !!srch.querySelector(".lwin.after") && /Ends Oct 16/.test(srch.querySelector(".lwin-tag").textContent));
    ok("W1: and its name says so", /starts Nov 2/.test(api.querySelector(".lname").textContent));
    ok("W2: one the dates on screen don't reach isn't drawn", !d.querySelector(`#gantt .lane[data-lane="${ev("S.lanes[3].id")}"]`));
    ok("W2: and the note says so, with Show anyway", /1 workstream outside the dates on screen \(.*starts Mar 1 2027\)/.test(d.querySelector("#hiddenStrip").textContent));
    d.querySelector("#hsLanesShow").click(); await wait(10);
    ok("W2: Show anyway draws it, faded", !!d.querySelector(`#gantt .lane[data-lane="${ev("S.lanes[3].id")}"] .lwin.before`) && !!d.querySelector("#hsLanesHide")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(setL + " setZoom('days'); render();"); await wait(10);
    ok("D1: in Days, every row of the workstream fades, the date on the first", d.querySelectorAll("#gantt .lwin").length >= 3 && d.querySelectorAll("#gantt .lwin-tag").length >= 1); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(setL + " select('lane', S.lanes[0].id);"); await wait(10);
    const f = d.querySelector("#f-lfrom"); f.value = "2026-10-05"; f.dispatchEvent(new (d.defaultView.Event)("change")); await wait(10);
    ok("C1: the workstream's card sets its start", ev("S.lanes[0].from") === "2026-10-05");
    ev("select('lane', S.lanes[2].id)"); await wait(10); const g = d.querySelector("#f-lfrom"); g.value = "2027-01-01"; g.dispatchEvent(new (d.defaultView.Event)("change")); await wait(10);
    ok("C1: and won't start after it ends", !ev("S.lanes[2].from")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(setL);
    const id = ev("S.bars.find(b=>b.lane === S.lanes[1].id && wkDay(b.start) < isoToDay('2026-11-02'))?.id"); ev(`select('bar', ${JSON.stringify(id)})`); await wait(10);
    ok("B1: work dated outside its workstream's dates says so", !!id && /before API v2 starts \(Nov 2\)/.test(d.querySelector("#side #f-outwin")?.textContent || "")); });

  await sec(async ()=>{ const {ev} = await page({jira:false}); ev(setL);
    const order = JSON.parse(ev("JSON.stringify(lanesByStart().map(l=>l.id))")), fut = [ev("S.lanes[1].id"), ev("S.lanes[3].id")];
    ok("P1: pickers list workstreams that haven't started last", fut.every(id=>order.indexOf(id) >= order.length - 2)); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
