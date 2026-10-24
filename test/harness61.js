// Team capacity: one figure, points per person per sprint, set from a date so it can change; each person's share is
// that times their allocation, less time off and holidays. Each check fails on the build before this.
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
  const st = (pts, who, sid) => ({summary:"s", status:"x", category:"todo", type:"Story", points:pts, assigneeKey:who, sprintId:sid, sprintState: sid === 42 ? "active" : "future"});
  const JS = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"A-1":st(8,"U1",42), "A-2":st(6,"U2",42), "A-3":st(8,"U1",43)},
    sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}]});
  const prep = `JIRA = parseJiraStatus(${JSON.stringify(JS)}); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[1].jira = {key:"U2", user:"u2", name:"B"}; p[0].days = 5; p[1].days = 5; p[1].off = []; p[0].off = []; UI.capAll = true; goWs("standup"); render();`;
  const caps = (d, i) => [...d.querySelectorAll("#suCap tr[data-cap]")][i].querySelectorAll("td.capc");
  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    ok("T0: with no team figure, the widget offers to set one", !!d.querySelector("#capRatePts") && /Not set/.test(d.querySelector("#capRates").textContent));
    ev(`setCapRate("2026-09-01", 10)`); await wait(10);
    ok("T1: everyone's share is the team figure at 100%", caps(d, 0)[0].textContent === "8/10" && caps(d, 1)[0].textContent === "6/10", caps(d, 0)[0].textContent + " " + caps(d, 1)[0].textContent);
    ev(`setAlloc(team()[1].id, 50)`); await wait(10);
    ok("A1: a 50% allocation halves their share", caps(d, 1)[0].textContent === "6/5" && caps(d, 1)[0].classList.contains("h3"));
    ev(`setCapRate("2026-10-12", 14)`); await wait(10);
    ok("R1: a change from a date applies from the sprint that starts then", caps(d, 0)[0].textContent === "8/10" && caps(d, 0)[1].textContent === "8/14" && /14 per person/.test(d.querySelectorAll("#suCap th")[3].textContent), caps(d, 0)[1].textContent);
    ok("R2: once set, the widget says what's in force in one line", /10 per person per sprint/.test(d.querySelector("#capRates").textContent) && /2 changes/.test(d.querySelector("#capRates").textContent) && !d.querySelector("#capRatePts"));
    d.querySelector("#capRateEdit").click(); await wait(10);
    ok("R2: Change opens the editor with every change listed", d.querySelectorAll("#capRates .caplist li").length === 2 && !!d.querySelector("#capRatePts")); ev("UI.capEditOpen = false;");
    ev(`team()[0].off = [{from:"2026-09-28", to:"2026-10-02", note:""}]; render();`);
    ok("O1: time off still comes out (a week off of two is half)", caps(d, 0)[0].textContent === "8/5");
    ev(`team()[1].days = 3; delete team()[1].alloc; render();`);
    ok("A2: with no allocation set, it follows their days per week", caps(d, 1)[0].textContent === "6/6");
    ok("F1: saved as a feature older copies respect", ev("featuresIn(S).includes('teamCapacity')"));
    ok("N1: normalize keeps rates sorted, one per date, and checks allocation", JSON.stringify(ev(`normalize({...JSON.parse(JSON.stringify(S)), meta:{...S.meta, capRates:[{from:"2026-10-12", points:14},{from:"2026-09-01", points:"10"},{from:"bad", points:3},{from:"2026-09-01", points:9}]}, people:[{id:"x", name:"X", alloc:250}]}, false)`, ) && ev(`JSON.stringify(normalize({...JSON.parse(JSON.stringify(S)), meta:{...S.meta, capRates:[{from:"2026-10-12", points:14},{from:"2026-09-01", points:"10"},{from:"bad", points:3},{from:"2026-09-01", points:9}]}, people:[{id:"x", name:"X", alloc:250}]}, false)).replace(/.*/, m=>m)`)) !== "" && ev(`(() => { const n = normalize({...JSON.parse(JSON.stringify(S)), meta:{...S.meta, capRates:[{from:"2026-10-12", points:14},{from:"2026-09-01", points:"10"},{from:"bad", points:3},{from:"2026-09-01", points:9}]}, people:[{id:"x", name:"X", alloc:250}]}, false); return JSON.stringify([n.meta.capRates, n.people[0].alloc]); })()`) === JSON.stringify([[{from:"2026-09-01", points:9}, {from:"2026-10-12", points:14}], 100])); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); ev(`locked = true; UI.planTab = "team"; setWs("plan"); render();`); await wait(10);
    ok("P1: Plan, Team has the team capacity and an Allocation column, read-only too", !!d.querySelector("#t-team #t-capRatePts") && /Allocation/.test(d.querySelector("#t-team thead").textContent) && !!d.querySelector(`#talloc-${ev("team()[0].id")}`)); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
