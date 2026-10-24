// Rows by epic nest by any parent, not only epics: Parent Link or parent up through features and initiatives, which
// the sync writes as ancestors (never as work to sort). A sub-task's task sits on its story's epic.
// Fails on the build before this.
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
  issues:{"ABC-5":{summary:"Top epic", status:"In Progress", category:"inprogress", type:"Epic", parent:"FEAT-3"}, "ABC-6":story("A story", "", S42, {epic:"ABC-1"}), "ABC-7":{summary:"A sub-task", status:"To Do", category:"todo", type:"Sub-task", parent:"ABC-6"}, "ABC-1":{summary:"Placed epic", status:"In Progress", category:"inprogress", type:"Epic", parent:"ABC-5"},
    "ABC-2":story("Assigned story one", "JIRAUSER1", S42), "ABC-3":story("Assigned story two", "JIRAUSER1", S43), "ABC-4":story("Nobody's story", "", S42)},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}],
  ancestors:{"FEAT-3":{summary:"Checkout feature", status:"In Progress", category:"inprogress", type:"Feature", parent:"INIT-1"}, "INIT-1":{summary:"Grow online sales", status:"To Do", category:"todo", type:"Initiative"},
    "ABC-2":{summary:"Not a parent: already an issue", type:"Initiative"}, "bad key":{summary:"x"}},
  rollups:{"ABC-1":{total:3, todo:3, children:["ABC-2","ABC-3","ABC-4"]}}});
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
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id);");
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = ""; L0.owners = []; window.EPIC = L0.id; S.people[1].jira = {key:"JIRAUSER1", user:"u1", name:"U One"}; window.P1 = S.people[1].id; const L1 = S.bars.find(b=>b !== L0 && b.lane && isLeafBar(b)); L1.epics = []; L1.jira = ""; L1.tasks = [{id:"t-sub", label:"Wire the sub-task", start:"2026-09-30", days:2, owners:[], jira:"ABC-7", status:"notstarted"}]; window.SUBT = "t-sub";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); setWs("timeline"); setZoom("weeks"); UI.rows = "epics"; UI.epicOpen = {"INIT-1":true, "FEAT-3":true, "ABC-5":true, "ABC-1":true}; render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  for (const z of ["weeks", "days"]) await sec(async ()=>{ const {d, ev} = await page(); ev(`setZoom(${JSON.stringify(z)}); render();`); await wait(30);
    const rows = () => [...d.querySelectorAll(".eprow")].map(r=>r.dataset.epic), row = k => d.querySelector(`.eprow[data-epic="${k}"]`), pad = k => parseInt(row(k).querySelector(".eplabel").style.paddingLeft);
    ok(`A1 ${z}: initiative, feature, epic, epic, nested`, rows().slice(0, 4).join(",") === "INIT-1,FEAT-3,ABC-5,ABC-1" && pad("INIT-1") < pad("FEAT-3") && pad("FEAT-3") < pad("ABC-5") && pad("ABC-5") < pad("ABC-1"), rows().join(","));
    ok(`A2 ${z}: each level says what it is`, /Initiative ·/.test(row("INIT-1").textContent) && /Feature ·/.test(row("FEAT-3").textContent) && !/Epic ·/.test(row("ABC-5").textContent), row("INIT-1").textContent.slice(0, 70));
    ok(`A3 ${z}: the top counts everything under it`, /4 items · 1 under it/.test(row("INIT-1").textContent) && ![...d.querySelectorAll(".eprow")].some(r=>/not synced/.test(r.textContent)), row("INIT-1").textContent.slice(0, 90));
    ok(`A4 ${z}: a task linked to a sub-task sits on its story's epic`, !!row("ABC-1").querySelector(`[data-peek-type=task][data-peek-id="${ev("SUBT")}"]`));
    ok(`A5 ${z}: no page errors`, !ev("errs.length"), ev("errs.join('|')"));
  });
  await sec(async ()=>{ const {ev} = await page();
    ok("A6 ancestors are read apart from the issues, checked like them", ev(`!!JIRA.ancestors["FEAT-3"] && !JIRA.issues["FEAT-3"] && !JIRA.ancestors["ABC-2"] && !JIRA.ancestors["bad key"] && JIRA.ancestors["FEAT-3"].parent === "INIT-1"`));
    ok("A7 an ancestor is never work to sort", ev(`!jiraEpicList().some(x=>x.key === "FEAT-3" || x.key === "INIT-1")`));
  });
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
