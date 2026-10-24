// Review 16, bulk sort: stories only join an epic's initiative when the Jira files list that epic's stories in full;
// a parked epic comes back with only the picked stories; everything is decided again on the latest file (a teammate's
// placement, epic link, parking or Not ours wins); Accept suggested is one save; number keys don't switch pages.
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
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
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
  const setup = `S.deliverables = [{id:"dv-bed", name:"Auto mode for Bedrock models", stage:"planned", target:"2027-H1"}, {id:"dv-chk", name:"Checkout", stage:"planned", target:"2026-Q4", jira:["ABC-10"]}];
    window.FILE = serialize(S, "p.json"); FileStore.read = async () => FILE; FileStore.writeIfUnchanged = async (hd, exp, text) => { FILE = text; return "ok"; };
    file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; locked = false; file.baseText = FILE; file.baseHash = hashText(FILE);
    window.AMTEXT = ""; window.amFake = {name:"troy.amend.json", queryPermission: async () => "granted", requestPermission: async () => "granted", getFile: async () => ({text: async () => AMTEXT})};
    AM = {handle: amFake, name: amFake.name}; amTried = S.meta.planId; localStorage.removeItem(amKey()); UI.ws = "roadmap"; render();`;
  const amFile = changes => JSON.stringify({kind:"sightline-amendments", version:1, planId:"__PID__", batchId:"b1", createdAt:"2026-09-30T10:00:00Z", source:"Anteroom", basedOn:{planRevision:0}, changes});
  const load = async (ev, changes, raw) => { ev(`AMTEXT = ${JSON.stringify(raw || amFile(changes))}.replace("__PID__", S.meta.planId); AM.hash = ""; `); await ev("amRead(true)"); await wait(10); };


  const open = async (ev) => { ev(setup); ev(`UI.ws = "plan"; UI.planTab = "epics"; UI.jiraSort = true; render();`); await wait(20); };
  const withJira = (ev, patch) => ev(`(()=>{ const o = JSON.parse(JS); ${patch}; JIRA = parseJiraStatus(JSON.stringify(o)); dropJiraMemos(); sortMemo = null; renderJiraWs(); })()`);
  const lane = ev => ev("LANE"), F = ev => JSON.parse(ev("FILE"));
  await sec(async ()=>{ const {ev} = await page(); await open(ev);
    withJira(ev, `o.rollups["ABC-20"] = {total:3, todo:3, children:[], sprintKids:["ABC-21"]}`);
    await ev(`sortMove(["ABC-21"], "lane:${lane(ev)}")`); await wait(60);
    const f = F(ev), e20 = f.bars.find(b=>(b.epics || []).includes("ABC-20")), s21 = f.bars.find(b=>b.jira === "ABC-21");
    ok("V1 without the epic's full story list, a story goes on alone (no epic initiative counting stories nobody picked)", !e20 && !!s21, JSON.stringify({e20:!!e20, s21:!!s21}));
  });
  await sec(async ()=>{ const {ev} = await page(); await open(ev);
    withJira(ev, `o.issues["ABC-95"] = {summary:"A task under a story", status:"To Do", category:"todo", type:"Task", parent:"ABC-90", sprintId:42, sprintState:"active", sprint:"Sprint 42"}`);
    await ev(`sortMove(["ABC-95"], "lane:${lane(ev)}")`); await wait(60);
    const f = F(ev);
    ok("V2 a parent that isn't an epic isn't treated as one", !f.bars.some(b=>(b.epics || []).includes("ABC-90")) && f.bars.some(b=>b.jira === "ABC-95"));
  });
  await sec(async ()=>{ const {ev} = await page(); await open(ev);
    ev(`(()=>{ const o = JSON.parse(FILE); o.bars.push({id:"bar-e10", lane:"${lane(ev)}", start:1, span:1, label:"ABC-10", kind:"work", owners:[], jira:"ABC-10", epics:["ABC-10"], status:"notstarted", dependsOn:[], tasks:[], datesFrom:"manual", parked:true}); FILE = JSON.stringify(o); S = normalize(o, false); file.baseText = FILE; sortMemo = null; renderJiraWs(); })()`);
    await ev(`sortMove(["ABC-11"], "lane:${lane(ev)}")`); await wait(60);
    const b = F(ev).bars.find(x=>x.id === "bar-e10");
    ok("V3 a parked epic comes back with only the picked story", b && !b.parked && JSON.stringify(b.storiesOff) === JSON.stringify(["ABC-12"]), JSON.stringify(b || {}).slice(0, 200));
  });
  await sec(async ()=>{ const {ev} = await page(); await open(ev);
    ev(`(()=>{ const o = JSON.parse(FILE); o.meta.jiraSkip = ["ABC-90"]; o.bars.push({id:"bar-e20", lane:o.lanes[1] ? o.lanes[1].id : o.lanes[0].id, start:1, span:1, label:"ABC-20", kind:"work", owners:[], jira:"ABC-20", epics:["ABC-20"], status:"notstarted", dependsOn:[], tasks:[], datesFrom:"manual"}); FILE = JSON.stringify(o); })()`);
    await ev(`sortMove(["ABC-90", "ABC-21"], "lane:${lane(ev)}")`); await wait(60);
    const f = F(ev);
    ok("V4 a teammate's Not ours and epic link, saved a moment ago, win", !f.bars.some(b=>b.jira === "ABC-90") && !f.bars.some(b=>b.jira === "ABC-21"), JSON.stringify(f.bars.filter(b=>/ABC-(90|21)/.test(b.jira)).map(b=>b.jira)));
  });
  await sec(async ()=>{ const {ev} = await page(); await open(ev);
    const t = ev(`sortBarsIn("${ev("LANE")}").filter(b=>!(b.epics||[]).length)[0].id`);
    ev(`(()=>{ const o = JSON.parse(FILE); o.bars.find(b=>b.id === "${t}").parked = true; FILE = JSON.stringify(o); })()`);
    await ev(`sortMove(["ABC-90"], "bar:${t}")`); await wait(60);
    ok("V5 an initiative a teammate just parked doesn't take the stories", !(F(ev).bars.find(b=>b.id === t).tasks || []).some(x=>x.jira === "ABC-90"));
  });
  await sec(async ()=>{ const {ev, d} = await page(); await open(ev);
    const before = ev("quickDone.length"); d.querySelector("#sortAccept").click(); await wait(200);
    ok("V6 Accept suggested is one save, so one Undo", ev("quickDone.length") === before + 1, `${before} -> ${ev("quickDone.length")}`);
  });
  await sec(async ()=>{ const {ev, d} = await page(); await open(ev);
    d.querySelector("#sk-ABC-90").dispatchEvent(new d.defaultView.MouseEvent("click", {bubbles:true})); await wait(5);
    d.querySelector("#jiraWs").dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"1", bubbles:true})); await wait(80);
    ok("V7 a number key sorts without also switching pages", ev("UI.ws") === "plan" && F(ev).bars.some(b=>b.jira === "ABC-90"), ev("UI.ws"));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
