// Jira releases are first-class and Jira's: the timeline shows the ones dated in the plan (Weeks and Days) as From
// Jira markers, released or past due; a release's card has Jira's dates and its issues' progress; a Jira item's card
// names its release; nothing is copied into the plan. Each check fails on the build before this.
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
  const JS = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"ABC-20":{summary:"Leaf story", status:"Done", category:"done", type:"Story", releases:[{id:"101", name:"2026.10"}]}, "ABC-21":{summary:"Other", status:"To Do", category:"todo", type:"Story", releases:[{id:"101", name:"2026.10"}]}},
    releases:[{id:"101", name:"2026.10", project:"ABC", date:"2026-10-15", start:"2026-10-01", released:false}, {id:"100", name:"2026.09", project:"ABC", date:"2026-09-24", released:false}, {id:"99", name:"2026.08", project:"ABC", date:"2026-09-22", released:true}, {id:"50", name:"Ancient", project:"ABC", date:"2024-01-01", released:true}]});
  const prep = `S.meta.start = "2026-09-21"; const b = S.bars.find(x=>isLeafBar(x) && !(x.tasks||[]).length && x.lane); b.jira = "ABC-20"; window.B = b.id; S = normalize(JSON.parse(JSON.stringify(S)), false);
    JIRA = parseJiraStatus(${JSON.stringify(JS)}); UI.zoom = "weeks"; setWs("timeline"); render();`;

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    const flags = [...d.querySelectorAll("#gantt .relrow .flag.release")];
    ok("R1: the timeline shows Jira's releases dated in the plan, in a Releases row", flags.length === 3 && flags.some(f=>/2026\.10/.test(f.textContent)) && !flags.some(f=>/Ancient/.test(f.textContent)) && /from Jira/.test(d.querySelector("#gantt .relrow").textContent));
    ok("R1: released and past-due ones look it", d.querySelector('#gantt [data-rel="99"]').classList.contains("released") && d.querySelector('#gantt [data-rel="100"]').classList.contains("late"));
    d.querySelector('#gantt [data-rel="101"]').click(); await wait(10);
    const card = d.querySelector("#side #f-relfacts")?.textContent || "";
    ok("R2: clicking one opens its card, from Jira, read-only", ev("sel && sel.type") === "release" && /From Jira/.test(card) && /Oct 15/.test(card) && /Not released yet/.test(card) && /Read-only here/.test(card), card.slice(0, 160));
    ok("R2: with how its issues are going", /1 of 2 done/.test(card) && !!d.querySelector('#side a.jlink[href="https://jira.example.com/projects/ABC/versions/101"]'));
    ok("R2: and which are on this plan", /Work from Jira on this plan \(1\)/.test(d.querySelector("#side").textContent) && /ABC-20/.test(d.querySelector("#side .rel-issues")?.textContent || "")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep + " select('bar', B);"); await wait(10);
    ok("R3: a Jira item's card names its release", /Release2026\.10 \(Oct 15\)/.test(d.querySelector("#side #f-jfacts")?.textContent.replace(/\s+/g, "") ? d.querySelector("#side #f-jfacts").textContent.replace(/\n/g, "") : ""), (d.querySelector("#side #f-jfacts")?.textContent || "").slice(0, 200));
    ok("R4: nothing about releases is copied into the plan", !/2026\.10|releases/.test(ev("JSON.stringify(S)"))); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep + " setZoom('days'); render();"); await wait(10);
    ok("R5: Days has the Releases row too", /Releases/.test(d.querySelector("#gantt").textContent) && d.querySelectorAll("#gantt .relrow [class*=release]").length >= 1); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
