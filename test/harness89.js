// Sort Jira work into the plan in bulk: a pile of everything in a sprint or a search that isn't on the plan, grouped,
// picked in bulk (groups, Shift ranges), dropped on a workstream (one initiative per epic, the rest of the epic's stories
// switched off), an initiative (as tasks, or switched back on) or Not ours; number keys, Move to, and Accept suggested.
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
    stopAuto(); startAuto = ()=>{}; file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; locked = false; file.baseText = FILE; file.baseHash = hashText(FILE);
    window.AMTEXT = ""; window.amFake = {name:"troy.amend.json", queryPermission: async () => "granted", requestPermission: async () => "granted", getFile: async () => ({text: async () => AMTEXT})};
    AM = {handle: amFake, name: amFake.name}; amTried = S.meta.planId; localStorage.removeItem(amKey()); UI.ws = "roadmap"; render();`;
  const amFile = changes => JSON.stringify({kind:"sightline-amendments", version:1, planId:"__PID__", batchId:"b1", createdAt:"2026-09-30T10:00:00Z", source:"Sample Helper", basedOn:{planRevision:0}, changes});
  const load = async (ev, changes, raw) => { ev(`AMTEXT = ${JSON.stringify(raw || amFile(changes))}.replace("__PID__", S.meta.planId); AM.hash = ""; `); await ev("amRead(true)"); await wait(10); };

  await sec(async ()=>{ const {d, ev} = await page(); ev(setup); ev(`UI.ws = "plan"; UI.planTab = "epics"; UI.jiraSort = false; render();`); await wait(20);
    const F = () => JSON.parse(ev("FILE")), host = () => d.querySelector("#jiraWs");
    const pileKeys = () => [...d.querySelectorAll(".srow")].map(x=>x.dataset.sk).sort();
    ok("S1 Jira work says how many aren't on the plan, with Sort them in bulk", /6 Jira issues in a sprint or your searches aren't on the plan/.test(d.querySelector("#sortCall")?.textContent || ""), d.querySelector("#sortCall")?.textContent || "none");
    d.querySelector("#sortOpen").click(); await wait(20);
    ok("S2 the pile has sprint work not on the plan (not what its epic already covers)", JSON.stringify(pileKeys()) === JSON.stringify(["ABC-11","ABC-12","ABC-21","ABC-41","ABC-51","ABC-90"]), JSON.stringify(pileKeys()));
    const gs = [...d.querySelectorAll(".sgroup")].map(g=>g.dataset.sg + ":" + g.querySelectorAll(".srow").length);
    ok("S3 grouped by epic, a feature's stories under its epic, no-epic last", JSON.stringify(gs) === JSON.stringify(["e:ABC-10:3","e:ABC-20:1","e:ABC-40:1","~none:1"]), JSON.stringify(gs));
    const click = (sel, shift) => { const el = d.querySelector(sel); el.dispatchEvent(new d.defaultView.MouseEvent("click", {bubbles:true, shiftKey:!!shift})); };
    click("#sk-ABC-11"); await wait(5); click("#sk-ABC-51", true); await wait(5);
    ok("S4 Shift-click picks a range", ev("JSON.stringify([...sortSel].sort())") === JSON.stringify(["ABC-11","ABC-12","ABC-51"]), ev("JSON.stringify([...sortSel])"));
    click("#sk-ABC-12"); await wait(5);
    d.querySelector(`.sdrop[data-target="lane:${ev("LANE")}"]`).click(); await wait(80);
    const b10 = F().bars.find(b=>(b.epics || []).includes("ABC-10"));
    ok("S5 dropping on a workstream makes one initiative for the epic, with the stories not picked switched off", b10 && b10.lane === ev("LANE") && JSON.stringify(b10.storiesOff || []) === JSON.stringify(["ABC-12"]), JSON.stringify(b10 || {}).slice(0, 200));
    ok("S6 and the pile keeps the one left out", JSON.stringify(pileKeys()) === JSON.stringify(["ABC-12","ABC-21","ABC-41","ABC-90"]), JSON.stringify(pileKeys()));
    click("#sk-ABC-12"); await wait(5); d.querySelector(`.sdrop[data-target="lane:${ev("LANE")}"]`).click(); await wait(80);
    ok("S7 dropping it on the same workstream switches it back on in its epic's initiative", !(F().bars.find(b=>(b.epics || []).includes("ABC-10")).storiesOff || []).length && F().bars.filter(b=>(b.epics || []).includes("ABC-10")).length === 1);
    click("#sk-ABC-90"); await wait(5); host().dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"1", bubbles:true})); await wait(80);
    const lane1 = ev("lanesByStart()[0].id"), b90 = F().bars.find(b=>b.jira === "ABC-90");
    ok("S8 a story with no epic, by number key: its own initiative in workstream 1", b90 && b90.lane === lane1 && !(b90.epics || []).length, JSON.stringify(b90 || {}).slice(0, 120));
    const target = ev(`sortBarsIn("${ev("LANE")}").filter(b=>!(b.epics||[]).length)[0]?.id || ""`);
    click("#sk-ABC-21"); await wait(5);
    ev(`UI.sortOpen = "${ev("LANE")}"; renderJiraWs();`); await wait(10);
    if (target){ d.querySelector(`.sdrop[data-target="bar:${target}"]`).click(); await wait(80); }
    const tb = target && F().bars.find(b=>b.id === target);
    ok("S9 dropping on an initiative adds the stories as its Jira-linked tasks", !!tb && (tb.tasks || []).some(t=>t.jira === "ABC-21"), target || "no initiative to drop on");
    click("#sk-ABC-41"); await wait(5); d.querySelector('.sdrop[data-target="skip"]').click(); await wait(80);
    ok("S10 Not ours hides it from the pile and the plan", (F().meta.jiraSkip || []).includes("ABC-41") && !pileKeys().includes("ABC-41"));
    ok("S11 when nothing is left it says so", /Everything in a sprint or your searches is on the plan/.test(host().textContent), pileKeys().join());
    ok("S12 each drop was one undoable save", /Undo/.test(ev("document.querySelector('#toast')?.textContent || ''")) || ev("quickUndoable()"));
    ok("S13 no errors", !ev("errs.length"), ev("JSON.stringify(errs)"));
  });
  await sec(async ()=>{ const {d, ev} = await page(); ev(setup); ev(`UI.ws = "plan"; UI.planTab = "epics"; UI.jiraSort = true; render();`); await wait(20);
    const sugBtn = d.querySelector("#sortAccept");
    ok("A1 Accept suggested offers the groups whose people already have work somewhere", !!sugBtn && /Accept \d+ suggested/.test(sugBtn.textContent), sugBtn ? sugBtn.textContent : "none");
    sugBtn.click(); await wait(200);
    const left = [...d.querySelectorAll(".srow")].map(x=>x.dataset.sk);
    ok("A2 and sorts them in one go, leaving the rest", !left.includes("ABC-11") && !left.includes("ABC-90") && left.includes("ABC-41"), JSON.stringify(left));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
