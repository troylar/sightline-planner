// Refreshing while editing keeps you the editor (the lock follows the tab, not the page load). Plan > Epics puts work
// Jira has in the active or an upcoming sprint first, "In a sprint, needs a workstream", soonest first, with a suggested
// workstream from where its stories' assignees already work, one-click and bulk placing, sprint stories with no epic,
// and parked epics with sprint work; the Plan badge says how many. Everything rolls up to its highest level: a story
// under a feature under an epic counts under the epic. Each check fails on the build before this.
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
  const at = new Date(2026, 8, 30, 9, 58).toISOString();

  await sec(async ()=>{ const o = JSON.parse(plan); o.meta.lock = {by:"Tester", id:"tab-abc123", at}; o.meta.revision = 4;
    const {ev} = await page({file:true, jira:false, session:"tab-abc123", text: JSON.stringify(o)});
    ok("L1: after a refresh in the same tab you're still the editor, not asked to take over", ev("file.holdLock") === true && ev("editable()") === true && ev("lockOf(S).mine") === true);
    ok("L1: and it says so", /Still editing plan\.json/.test(ev("document.querySelector('#status').textContent"))); });

  await sec(async ()=>{ const o = JSON.parse(plan); o.meta.lock = {by:"Someone", id:"tab-other1", at};
    const {ev} = await page({file:true, jira:false, session:"tab-abc123", text: JSON.stringify(o)});
    ok("L2: another tab's lock is still someone else's", ev("file.holdLock") === false && ev("lockOf(S).mine") === false); });

  await sec(async ()=>{ const {d, ev} = await page();
    const g = d.querySelector("#jiraWs #jiraInSprint");
    ok("G1: Plan > Epics has 'In a sprint, not on the board'", !!g && /In a sprint, not on the board/.test(g.querySelector("summary").textContent));
    const rows = [...g.querySelectorAll("[data-sprint-epic]")].map(x=>x.dataset.sprintEpic);
    ok("G1: with the epics whose stories are in the active or an upcoming sprint, soonest first", JSON.stringify(rows) === JSON.stringify(["ABC-10","ABC-20","ABC-40"]), rows.join(","));
    ok("G1: not one whose stories are only in closed sprints, or one already on the board", !rows.includes("ABC-30") && !rows.includes("ABC-1") && !!d.querySelector('#jiraWs .egroup.uns [data-epic="ABC-30"]'));
    ok("G1: each epic shows once", d.querySelectorAll('#jiraWs [data-epic="ABC-10"]').length === 1);
    ok("G2: each says what's in which sprint", /2 stories in Sprint 42, 1 story in Sprint 43/.test(g.querySelector('[data-sprint-epic="ABC-10"]').textContent), g.querySelector('[data-sprint-epic="ABC-10"] .hint').textContent);
    const sel = d.querySelector("#esp-ABC-10");
    ok("S1: a workstream is suggested from where its stories' assignees already work", sel.value === ev("LANE") && /\(suggested\)/.test(sel.selectedOptions[0].textContent));
    ok("S1: and none when there's nothing to go on", d.querySelector("#esp-ABC-20").value === "");
    d.querySelector('[data-place="ABC-10"]').click(); await wait(40);
    ok("P1: Put on the board places it in that workstream", ev("S.bars.some(b=>(b.epics||[]).includes('ABC-10') && b.lane === LANE)"));
    ok("P1: and its stories go on the timeline in their sprints", ev("storiesOf(S.bars.find(b=>(b.epics||[]).includes('ABC-10'))).filter(x=>x.drawn).length") >= 2); });

  await sec(async ()=>{ const {d, ev} = await page();
    ["ABC-10","ABC-20"].forEach(k=>{ const cb = d.querySelector(`#jiraInSprint [data-sprint-epic="${k}"] .epick`); cb.checked = true; cb.dispatchEvent(new (d.defaultView.Event)("change")); });
    await wait(10);
    const bw = d.querySelector("#jiraBatchWs");
    ok("B1: picking several offers one workstream for all, suggested", !!bw && bw.value === ev("LANE") && /\(suggested\)/.test(bw.selectedOptions[0].textContent));
    d.querySelector("#jiraBatchOn").click(); await wait(40);
    ok("B1: and places them all", ev("['ABC-10','ABC-20'].every(k=>S.bars.some(b=>(b.epics||[]).includes(k) && b.lane === LANE))")); });

  await sec(async ()=>{ const {d, ev} = await page();
    const r = d.querySelector('#jiraInSprint [data-sprint-story="ABC-90"]');
    ok("N1: sprint stories with no epic are listed too", !!r && /Stories in a sprint with no epic \(1\)/.test(d.querySelector("#jiraInSprint").textContent));
    ok("N1: with a suggestion from their assignee", d.querySelector("#esl-ABC-90").value === ev("LANE"));
    r.querySelector("[data-place-story]").click(); await wait(40);
    ok("N2: and go on the board as their own item", ev("S.bars.some(b=>upKey(b.jira) === 'ABC-90' && b.lane === LANE)") && !d.querySelector('#jiraInSprint [data-sprint-story="ABC-90"]')); });

  await sec(async ()=>{ const {d, ev} = await page();
    await ev("epicPark('ABC-40')"); ev("renderJiraWs()"); await wait(10);
    const r = d.querySelector('#jiraInSprint [data-sprint-epic="ABC-40"]');
    ok("K1: a parked epic with sprint work is flagged in the group, not hidden in Parked", !!r && /parked/.test(r.textContent) && !d.querySelector('#jiraWs .egroup.parked [data-epic="ABC-40"]'));
    ok("K2: the Plan badge counts sprint work first", /in a sprint/.test(d.querySelector("#jiraBadge").textContent) && d.querySelector("#jiraBadge").classList.contains("hot")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ok("H1: a feature-level epic under another epic rolls up into it, not its own row", !d.querySelector('#jiraWs [data-epic="ABC-50"]'));
    ok("H1: and its stories count toward the top epic", ev("sprintWork().byEpic.get('ABC-10').some(x=>x.key === 'ABC-51')") && /2 stories in Sprint 42/.test(d.querySelector('[data-sprint-epic="ABC-10"]').textContent)); });

  await sec(async ()=>{ const {d} = await page();
    const r = d.querySelector('#jiraInSprint [data-sprint-story="ABC-90"]');
    ok("R1: a story with no epic keeps its key in its own column (not over the title)", (r.children[0].getAttribute("aria-hidden") === "true" || r.children[0].classList.contains("spick")) && r.children[1].classList.contains("ek") && r.children[2].classList.contains("es")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const o = JSON.parse(JS); o.board = {id:7, name:"Team board", columns:[]}; JIRA = parseJiraStatus(JSON.stringify(o)); render();`); await wait(10);
    const b = d.querySelector("#bnUseSprints");
    ok("J1: when the board's sprints differ from the plan's, a banner says so with the switch one click away", !!b && /The plan's sprints aren't Jira's/.test(d.querySelector("#banners, .banners, body").textContent));
    b.click(); await wait(20);
    ok("J2: and it switches the plan to Jira's sprint names", ev("S.sprints.some(x=>x.name === 'Sprint 42' && x.jira)") && !d.querySelector("#bnUseSprints"), ev("JSON.stringify(S.sprints.map(x=>x.name).slice(0,5))")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
