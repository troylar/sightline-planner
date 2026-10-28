// A newer Sightline: the page says so when the plan was saved with a newer version or the sync found a newer page in
// the plan's folder, and Refresh never loses unsaved edits. Each check fails on the build before this.
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
  ok("V0: the page carries its version where the sync can read it", /<meta name="sightline-version" content="\d+\.\d+\.\d+">/.test(html.slice(0, 2000)));
  await sec(async ()=>{ const {d, ev} = await page({jira:false});
    ok("V1: nothing to say when the plan is from this version or older", ev(`S.meta.savedWith = "1.0.0"; newerShown = "x"; render(); !document.querySelector("#newerRefresh")`));
    ev(`S.meta.savedWith = "99.0.0"; render();`);
    ok("V2: a plan saved with a newer version says so, with Refresh", !!d.querySelector("#newerRefresh") && /Sightline 99\.0\.0 is available/.test(d.querySelector("#banners").textContent));
    d.querySelector("#newerLater").click(); await wait(5);
    ok("V3: Not now hides it for that version", !d.querySelector("#newerRefresh"));
    ev(`JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", issues:{}, missing:[], page:{version:"99.1.0", file:"timeline-planner.html"}})); render();`);
    ok("V4: the sync's newer page in the plan's folder, by name", /timeline-planner\.html in the plan's folder is 99\.1\.0/.test(d.querySelector("#banners").textContent));
    ok("V5: the status file's page is checked", ev(`JSON.stringify(parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", issues:{}, page:{version:"2.0.0", file:"../x/y.html"}})).page)`) === JSON.stringify({version:"2.0.0", file:"..xy.html"})
      && ev(`parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", issues:{}, page:{version:"<b>", file:"x"}})).page`) === null); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ev(`window.RELOADS = 0; reloadPage = () => { RELOADS++; }; window.SAVES = 0; stopAuto(); startAuto = ()=>{}; file.handle = {name:"plan.json"}; file.dirty = true; file.holdLock = true;
      save = () => { SAVES++; file.dirty = false; return Promise.resolve(); }; doneEditing = () => { file.holdLock = false; return Promise.resolve(); };`);
    ev(`confirm = () => false; safeRefresh();`); await wait(10);
    ok("G1: with unsaved edits, Cancel keeps the page and the edits", ev("RELOADS") === 0 && ev("SAVES") === 0 && ev("file.dirty") === true);
    ev(`confirm = () => true; safeRefresh();`); await wait(20);
    ok("G2: OK saves, ends editing, then refreshes", ev("SAVES") === 1 && ev("RELOADS") === 1 && ev("file.holdLock") === false);
    ev(`RELOADS = 0; file.dirty = true; save = () => Promise.resolve(); safeRefresh();`); await wait(20);
    ok("G3: if the save fails, it doesn't refresh", ev("RELOADS") === 0 && ev("file.dirty") === true);
    ev(`file.dirty = false; file.holdLock = false; safeRefresh();`); await wait(10);
    ok("G4: nothing unsaved: it just refreshes", ev("RELOADS") === 1); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
