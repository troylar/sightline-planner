// Cards is Jira's work (the active sprint's issues, placed on the plan or not), and outside owners (a platform team)
// that can own anything and be waited on but have no capacity or sprint load. Each check fails on the build before this.
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
  const st = (who, cat, sid) => ({summary:"Loose " + who, status:"x", category:cat, type:"Story", points:3, assigneeKey:who, assignee:who + " N.", sprintId:sid || 42, sprintState:"active"});
  const J2 = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"Z-1":st("U1","inprogress"), "Z-2":st("","todo"), "Z-3":st("U1","todo",43)},
    sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}]});
  await sec(async ()=>{ const {d, ev} = await page({jira:false});
    ev(`JIRA = parseJiraStatus(${JSON.stringify(J2)}); S.meta.jiraBase = "https://jira.example.com/browse/"; team()[0].jira = {key:"U1", user:"u1", name:"A"}; goWs("standup"); render();`); await wait(10);
    const keys = [...d.querySelectorAll("#standupWs .sucard")].map(c=>c.dataset.card);
    ok("K1: the sprint's issues are on Cards even when they aren't on the plan", keys.includes("jira:Z-1") && keys.includes("jira:Z-2") && !keys.includes("jira:Z-3"), keys.join(" "));
    ok("K2: plan-only work isn't, and the board says where it is", keys.every(k=>/^(jira:|story:)/.test(k) || ev(`!!keysOf(${k.startsWith("bar:") ? "barById" : "taskById"}("${k.split(":")[1]}"), "x")`)) && (keys.some(k=>/^(bar|task):/.test(k)) || /plan-only item/.test(d.querySelector("#suPlanOnly")?.textContent || "")));
    ok("K3: an issue sits with its Jira assignee", !!d.querySelector(`[data-person="${ev("team()[0].id")}"] [data-card="jira:Z-1"]`));
    ev(`window.OPENED = []; window.open = (u)=>OPENED.push(u);`); d.querySelector('[data-card="jira:Z-2"]').click();
    ok("K4: one not on the plan opens in Jira", ev("OPENED[0]") === "https://jira.example.com/browse/Z-2", ev("OPENED[0]")); });

  await sec(async ()=>{ const {d, ev, w} = await page({jira:false});
    ev(`S.people.push({...mkPerson("person-plat", "Platform team", S.people.length, true)}); UI.planTab = "team"; setWs("plan"); render();`);
    ok("O1: Plan, Team lists outside owners on their own", !!d.querySelector('#teamOutside [data-outsider="person-plat"]') && ![...d.querySelectorAll("#t-team > table tbody tr input[aria-label=Name]")].some(i=>i.value === "Platform team"));
    ok("O2: they aren't on the team: no capacity, load or sprint rows", !ev("team().some(p=>p.id==='person-plat')"));
    ev(`const b = S.bars.find(x=>x.lane && !hasTasks(x)); window.B = b.id; select("bar", b.id); render();`);
    const inp = d.querySelector("#f-owner"); inp.value = "Plat"; inp.dispatchEvent(new w.Event("input")); inp.focus(); inp.dispatchEvent(new w.Event("focus")); await wait(10);
    ok("O3: any owner field can pick them", [...d.querySelectorAll("#f-owner-list .oopt")].some(o=>/Platform team/.test(o.textContent) && /outside owner/.test(o.textContent)), d.querySelector("#f-owner-list")?.textContent);
    inp.value = "Security team"; inp.dispatchEvent(new w.Event("input")); await wait(10);
    ok("O4: and add a new one on the spot", !!d.querySelector("#f-owner-oaddx") && /as an outside owner/.test(d.querySelector("#f-owner-oaddx").textContent));
    d.querySelector("#f-owner-oaddx").click(); await wait(10);
    ok("O4: which is an outside owner, owning it", ev(`S.people.find(p=>p.name==="Security team")?.external`) === true && ev(`own(barById(B)).includes(S.people.find(p=>p.name==="Security team").id)`));
    ev(`sel = null; select("bar", B); render();`);
    ok("O5: Waiting on lists them", [...(d.querySelector("#q-bwho")?.querySelectorAll("optgroup option") || [])].some(o=>o.textContent === "Platform team"));
    ev(`UI.rows = "people"; setWs("timeline"); render();`);
    ok("O6: with open work, they get a row by person", /outside owner/.test(d.querySelector('[data-key="person:' + ev(`S.people.find(p=>p.name==="Security team").id`) + '"]')?.textContent || ""));
    ok("no page errors", !w.errs.length, w.errs.join("; ")); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
