// Points, a sprint burndown and a capacity planner. The burndown is the active Jira sprint's points left per working
// day (from resolved dates, or the sync's daily notes, which also show scope); capacity is each person's points per
// sprint, less their time off, against Jira's assigned points. Each check fails on the build before this.
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
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:opts.url || "https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
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
  const st = (pts, who, cat, res, sid) => ({summary:"s", status:"x", category:cat, type:"Story", points:pts, assigneeKey:who, sprintId:sid || 42, sprintState: (sid || 42) === 42 ? "active" : "future", resolvedAt:res || ""});
  const JS = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"A-1":st(5,"U1","done","2026-09-29"), "A-2":st(8,"U1","todo"), "A-3":st(3,"U2","todo"), "A-4":st(null,"U2","todo"), "A-5":st(13,"U2","todo","",43)},
    sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}],
    burndown:{"42":{"2026-09-28":{scope:12, left:12, stories:3, unestimated:1}}}});
  const prep = `JIRA = parseJiraStatus(${JSON.stringify(JS)}); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[0].capacity = 10; p[1].jira = {key:"U2", user:"u2", name:"B"}; p[1].capacity = 10;
    p[1].off = [{from:"2026-10-12", to:"2026-10-16", note:""}]; goWs("standup"); render();`;

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    const B = JSON.parse(ev("JSON.stringify(burndownData(activeJiraSprint()))"));
    ok("P1: the burndown covers the active Jira sprint's working days", B.days.length === 10 && B.total === 16 && B.count === 4 && B.unest === 1);
    ok("P1: points left: the sync's note for its day, resolved dates otherwise", B.left[0].left === 12 && B.left[0].scope === 12 && B.left[1].left === 11 && B.left[2].left === 11 && B.left[3] === null, JSON.stringify(B.left.slice(0, 4)));
    const t = d.querySelector("#suBurn")?.textContent || "";
    ok("P2: Cards shows it with units", /11 of 16 points left/.test(t) && /5 done/.test(t) && /2 pts ahead of ideal/.test(t) && /4 added since the sprint started/.test(t) && /1 of 4 stories not estimated/.test(t) && !!d.querySelector("#suBurn svg polyline.bleft"), t.slice(0, 120)); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    const rows = [...d.querySelectorAll("#suCap tbody tr[data-cap]")].map(r=>[...r.querySelectorAll("td.capc")].map(c=>c.textContent.trim()));
    ok("C1: each person's assigned points against capacity, per sprint", JSON.stringify(rows[0]) === JSON.stringify(["13/10", "0/10"]), JSON.stringify(rows));
    ok("C1: less their time off (a week off of two is half)", rows[1][1] === "13/5" && d.querySelectorAll("#suCap td.capc.h3, #suCap td.capc.h4").length === 2 && !!d.querySelector("#suCap td.capc.h4"), JSON.stringify(rows[1]));
    ok("C2: unassigned points are counted too", /Unassigned/.test(d.querySelector("#suCap .capun").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    d.querySelector("#capRatePts").value = "12"; d.querySelector("#capRateSet").click(); await wait(10);
    ok("C3: the team's capacity is set right there, and saved as a feature older copies respect", JSON.stringify(ev("S.meta.capRates.map(r=>r.points)")) === "[12]" && ev("featuresIn(S).includes('teamCapacity')") && ev("normalize(JSON.parse(JSON.stringify(S)), false).meta.capRates[0].points") === 12); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
