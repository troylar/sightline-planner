// Amendments v1.1, initiatives and tasks: set name, status, owners, workstream and dates; add initiatives and tasks. Jira
// status and dates stay Jira's, dates from tasks can't be set, and the review shows what else a date change moves before
// applying. Fails on the build before this.
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
    stopAuto(); startAuto = ()=>{}; file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; locked = false; file.baseText = FILE; file.baseHash = hashText(FILE);
    window.AMTEXT = ""; window.amFake = {name:"troy.amend.json", queryPermission: async () => "granted", requestPermission: async () => "granted", getFile: async () => ({text: async () => AMTEXT})};
    AM = {handle: amFake, name: amFake.name}; amTried = S.meta.planId; localStorage.removeItem(amKey()); UI.ws = "roadmap"; render();`;
  const amFile = changes => JSON.stringify({kind:"sightline-amendments", version:1, planId:"__PID__", batchId:"b1", createdAt:"2026-09-30T10:00:00Z", source:"Sample Helper", basedOn:{planRevision:0}, changes});
  const load = async (ev, changes, raw) => { ev(`AMTEXT = ${JSON.stringify(raw || amFile(changes))}.replace("__PID__", S.meta.planId); AM.hash = ""; `); await ev("amRead(true)"); await wait(10); };


  await sec(async ()=>{ const {d, ev} = await page(); ev(setup);
    const ids = JSON.parse(ev(`(()=>{ S.meta.autoSchedule = true; const kids = id => S.bars.some(x=>x.parent === id);
      const plain = S.bars.filter(b=>!(b.tasks||[]).length && !kids(b.id) && !b.parent && b.kind !== "waiting" && !b.parked && !b.jira && !(b.epics||[]).length && !(b.dependsOn||[]).length);
      const A = plain[0], B = plain[1], J = plain[2]; J.jira = "ABC-2"; B.dependsOn = [A.id]; B.start = A.start + A.span; B.lane = A.lane;
      window.FILE = serialize(S, "p.json"); file.baseText = FILE; file.baseHash = hashText(FILE); render();
      return JSON.stringify({A:A.id, B:B.id, J:J.id, Astart:amWeekIso(S, A.start), Anext:amWeekIso(S, A.start + 1), Bstart:B.start, lane:A.lane, Aspan:A.span, Jstatus:J.status}); })()`));
    await load(ev, [
      {id:"move", summary:"Push A a week", ops:[{op:"set", type:"initiative", id:ids.A, field:"start", prev:ids.Astart, value:ids.Anext}]},
      {id:"jira", summary:"Mark J done", ops:[{op:"set", type:"initiative", id:ids.J, field:"status", prev:ids.Jstatus, value:"done"}]},
      {id:"new", summary:"Add pilot work", ops:[{op:"add", type:"initiative", id:"bar-pilot", value:{label:"Pilot", lane:ids.lane, start:ids.Anext, weeks:2}}, {op:"add", type:"task", id:"task-pilot1", value:{initiative:"bar-pilot", label:"Kickoff", start:ids.Anext, days:2}}]}]);
    ev(`sel = {type:"amend", id:"x"}; render();`); await wait(20);
    const rowOf = id => d.querySelector(`[data-am="${id}"]`);
    ok("I1 an initiative's move is ready, with what it changes", rowOf("move").classList.contains("am-ready") && /start .* → /.test(rowOf("move").textContent), rowOf("move").textContent.slice(0, 160));
    const down = ev(`(()=>{ const seen = new Set(), q = ["${ids.A}"]; while (q.length){ const x = q.shift(); S.bars.forEach(b=>{ if ((b.dependsOn || []).includes(x) && !seen.has(b.id)){ seen.add(b.id); q.push(b.id); } }); } return seen.size; })()`);
    const naive = ev(`(()=>{ const real = S; S = clone(real); const b = S.bars.find(x=>x.id === "${ids.A}"); b.start = amIsoWeek(S, "${ids.Anext}"); rollup(S); const n = reschedule().moved; S = real; return n; })()`);
    const said = Number(((rowOf("move").querySelector(".amknock")?.textContent || "").match(/moves (\d+)/) || [])[1]);
    ok("I2 the review says what else it moves: only items that depend on it and must move", said >= 1 && said <= down && said < naive, `said ${said}, ${down} depend on it, the plan-wide count ${naive}`);
    ok("I3 a Jira-linked item's status is refused, pointing to a proposal", rowOf("jira").classList.contains("am-invalid") && /status comes from Jira: propose a status/.test(rowOf("jira").textContent));
    ok("I4 checking doesn't change the plan", ev(`S.bars.find(b=>b.id === "${ids.B}").start`) === ids.Bstart);
    rowOf("move").querySelector('[data-amapply="move"]').click(); await wait(80);
    const F1 = JSON.parse(ev("FILE")), A1 = F1.bars.find(b=>b.id === ids.A), B1 = F1.bars.find(b=>b.id === ids.B);
    ok("I5 applying moves it, and the linked item after it", ev(`amWeekIso(S, ${A1.start})`) === ids.Anext && B1.start > ids.Bstart, `A ${A1.start}, B ${ids.Bstart} → ${B1.start}`);
    rowOf("new").querySelector('[data-amapply="new"]').click(); await wait(80);
    const P1 = JSON.parse(ev("FILE")).bars.find(b=>b.id === "bar-pilot");
    ok("I6 an initiative and its task can be added together", P1 && P1.label === "Pilot" && P1.span === 2 && (P1.tasks || []).some(t=>t.id === "task-pilot1" && t.days === 2), JSON.stringify(P1 || {}).slice(0, 160));
    await load(ev, [{id:"rename", summary:"Rename", ops:[{op:"set", type:"initiative", id:ids.A, field:"label", prev:ev(`S.bars.find(b=>b.id === "${ids.A}").label`), value:"Wrong name"}]}]); ev("render()"); await wait(20);
    rowOf("rename").querySelector('[data-amedit="rename"]').click(); await wait(20);
    const f = d.querySelector("#amed-rename-0-value"); f.value = "Right name"; d.querySelector('[data-amsave="rename"]').click(); await wait(20);
    ok("I7 Edit works on initiative changes too", /Right name/.test(rowOf("rename").textContent) && /Edited by you/.test(rowOf("rename").textContent));
    ev(`amRows(); S.bars.find(b=>b.id === "${ids.A}").label = "Renamed on the card"; changeGen++;`); await wait(10);   // what a commit does: edit in place, count a change
    ok("I9 an edit on the card is seen at once: the rename now waits as changed since", ev(`amRows().find(r=>r.c.id === "rename").group`) === "changed");
    const V = JSON.parse(ev("JSON.stringify(assistantView())")), vj = (V.initiatives || []).find(x=>x.id === ids.J), va = (V.initiatives || []).find(x=>x.id === ids.A);
    ok("I8 the assistant's view lists initiatives, marking Jira-linked ones, with a guide for them", vj && vj.jiraLinked && va && va.start && !va.jiraLinked && /type:'initiative'/.test(V.guide));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
