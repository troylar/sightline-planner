// From the eighth review. Undo never deletes a teammate's edited item or overwrites a restored one, and never rewrites
// who last edited something; a duplicated tab steps down instead of sharing the edit lock; sprint stories whose parent
// isn't in the files are listed, not lost; a parked initiative with sprint work comes back rather than being "moved";
// the Plan badge and the group agree; "Not now" on the sprints banner is per plan; Standup counts only its own hidden
// work; a proposal is judged only against its own server. Each check fails on the build before this.
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
  const at = new Date(2026, 8, 30, 9, 58).toISOString();

  await sec(async ()=>{ const {ev, handle} = await page({file:true, jira:false});
    await ev("quickSave('a note', s=>{ s.notes.push({id:'nT', lane:s.lanes[0].id, date:s.meta.start, text:'mine', author:S.people[0].id}); })"); await wait(40);
    const o = JSON.parse(handle._text); o.notes.find(n=>n.id === "nT").text = "a teammate added to it"; o.meta.revision++; handle._text = JSON.stringify(o);
    ev("undo()"); await wait(150);
    ok("U1: undoing an add leaves the item alone if a teammate changed it since", JSON.parse(handle._text).notes.some(n=>n.id === "nT" && /teammate/.test(n.text)), ev("document.querySelector('#status').textContent")); });

  await sec(async ()=>{ const {ev, handle} = await page({file:true, jira:false});
    const id = ev("S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length).id"); ev(`window.ID = ${JSON.stringify(id)}`);
    await ev("quickSave('marked done', s=>{ s.bars.find(x=>x.id===ID).status = 'done'; })"); await wait(40);
    const o = JSON.parse(handle._text), b = o.bars.find(x=>x.id === id); b.status = "atrisk"; b.edited = {by:"person-teammate", at:"2026-09-30T09:59Z"}; o.meta.revision++; handle._text = JSON.stringify(o);
    ev("undo()"); await wait(150);
    const b2 = JSON.parse(handle._text).bars.find(x=>x.id === id);
    ok("U2: a skipped undo doesn't rewrite who last edited it", b2.status === "atrisk" && b2.edited && b2.edited.by === "person-teammate", JSON.stringify(b2.edited)); });

  await sec(async ()=>{ const o = JSON.parse(plan); o.meta.lock = {by:"Tester", id:"tab-dup0001", at};
    const text = JSON.stringify(o), A = await page({file:true, jira:false, session:"tab-dup0001", text});
    ok("T1: the original tab is the editor", A.ev("file.holdLock") === true);
    const B = await page({file:true, jira:false, session:"tab-dup0001", text}); await wait(100);
    ok("T2: a duplicated tab (same session copied) doesn't also think it's the editor", B.ev("file.holdLock") === false && B.ev("SESSION") !== "tab-dup0001" && A.ev("file.holdLock") === true);
    B.ev("SESSION = 'tab-dup0001'; file.holdLock = true; sessionBC.postMessage({q:SESSION, from:PAGE_NONCE});"); await wait(150);    // the copy got there first, then hears back
    ok("T3: a copy that already claimed the lock steps down when the original answers", B.ev("file.holdLock") === false && B.ev("SESSION") !== "tab-dup0001" && A.ev("file.holdLock") === true); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const o = JSON.parse(JS); o.issues["ABC-95"] = {summary:"Orphan", status:"To Do", category:"todo", type:"Story", assignee:"", assigneeKey:"", labels:[], parent:"ABC-99", sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09"};
      JIRA = parseJiraStatus(JSON.stringify(o)); UI.planTab = "epics"; setWs("plan"); render();`); await wait(10);
    const r = d.querySelector('#jiraInSprint [data-sprint-story="ABC-95"]');
    ok("M1: a sprint story whose parent isn't in the files is listed, not lost", !!r && /under ABC-99, which isn't in the last sync/.test(r.textContent)); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const o = JSON.parse(JS); o.issues["ABC-60"] = {summary:"Quarter", status:"To Do", category:"todo", type:"Epic"}; o.issues["ABC-61"] = {summary:"Feature epic", status:"To Do", category:"todo", type:"Epic", parent:"ABC-60"};
      o.issues["ABC-62"] = {summary:"Deep story", status:"To Do", category:"todo", type:"Story", assignee:"", assigneeKey:"", labels:[], sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09"};
      o.rollups["ABC-61"] = {total:1, todo:1, children:["ABC-62"]}; JIRA = parseJiraStatus(JSON.stringify(o)); UI.planTab = "epics"; setWs("plan"); render();`); await wait(10);
    ok("N1: a story under an epic that's under another epic groups under the top one", ev("sprintWork().byEpic.get('ABC-60')?.some(x=>x.key === 'ABC-62')") === true && !!d.querySelector('#jiraInSprint [data-sprint-epic="ABC-60"]')); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const b = S.bars.find(x=>isLeafBar(x) && !(x.epics||[]).length && x.lane && x.lane !== LANE) || S.bars.find(x=>isLeafBar(x) && !(x.epics||[]).length); b.epics = ["ABC-40"]; b.jira = ""; b.parked = true; window.PL = b.lane;
      S = normalize(JSON.parse(JSON.stringify(S)), false); render();`); await wait(10);
    const r = d.querySelector('#jiraInSprint [data-sprint-epic="ABC-40"]');
    ok("K1: a parked initiative with sprint work has no pick box (it comes back where it was, it isn't moved)", !!r && !r.querySelector(".epick") && !!r.querySelector('[data-on="ABC-40"]') && /parked in /.test(r.textContent));
    const n = d.querySelectorAll("#jiraInSprint [data-sprint-epic]").length, badge = d.querySelector("#jiraBadge .vh").textContent;
    ok("K2: the badge counts what the group lists, with units", new RegExp("^" + n + " epics?(, \\d+ stor(y|ies))? in a sprint$").test(badge), badge + " vs " + n); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const o = JSON.parse(JS); o.board = {id:7, name:"Team board", columns:[]}; JIRA = parseJiraStatus(JSON.stringify(o)); render();`); await wait(10);
    d.querySelector("#bnSprintsLater").click(); await wait(10);
    ok("B1: Not now hides the sprints banner for this plan", !d.querySelector("#bnUseSprints"));
    ev(`S.meta.planId = "p-another"; sprintOfferKey = ""; render();`); await wait(10);
    ok("B1: but not for another plan", !!d.querySelector("#bnUseSprints")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`JIRA = null; JIRA_ISSUES = parseJiraIssues(JSON.stringify({kind:"sightline-jira-issues", version:2, jiraBase:"https://jira-b.example.com", generatedAt:"2026-09-30T08:00:00Z", issues:[{key:"ABC-20", summary:"x", status:"In Progress", category:"inprogress", type:"Story"}]}));
      S.proposals = [{id:"p1", server:"https://jira-a.example.com", key:"ABC-20", field:"status", value:"In Progress", seen:{value:"To Do", at:""}, why:"", review:{state:"proposed", by:"", at:""}}];`);
    ok("P1: a proposal isn't judged against another server's issues file either", ev("proposalState(S.proposals[0])") === "otherServer"); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); const W = d.defaultView;
    ev("sel = null; setWs('timeline'); render();"); await wait(10);
    const g = d.querySelector("#gantt .flag.gate"); const pe = (type, x) => { const e = new W.MouseEvent(type, {bubbles:true, clientX:x, clientY:10, button:0}); Object.defineProperty(e, "pointerId", {value:1}); return e; };
    g.dispatchEvent(pe("pointerdown", 100)); g.dispatchEvent(pe("pointermove", 107)); g.dispatchEvent(pe("pointerup", 107)); g.click(); await wait(10);
    ok("G1: in edit mode, a click on a gate that wobbles a few pixels still opens it", ev("sel && sel.type") === "gate", ev("JSON.stringify(sel)")); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ev(`S.meta.start = "2026-09-07"; S.sprints = Array.from({length:8}, (_, i) => ({id:"sp" + i, name:"S" + i, weeks:3, goal: i === 5 ? "Launch" : ""})); S.meta.weeks = 24;
      JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], issues:{}, rollups:{}, board:{id:7, name:"Team board", columns:[]},
        sprints:[{id:14, name:"Sprint 14 09/03-09/16", state:"closed", start:"2026-09-03", end:"2026-09-16"}, {id:15, name:"Sprint 15 09/17-09/30", state:"active", start:"2026-09-17", end:"2026-09-30"}]}));`);
    const P = JSON.parse(ev("JSON.stringify(sprintProposal())")), after = P.rows.filter(r=>r.plan);
    ok("S1: after Jira's last sprint, names continue Jira's sprint number, not the dates in the name", after[0].name === "Sprint 16" && after[1].name === "Sprint 17", after.slice(0, 3).map(r=>r.name).join(", "));
    ok("S2: and follow Jira's schedule (its 2-week sprints), not the plan's old 3-week ones, to the plan's end", after.every(r=>r.weeks === 2) && P.rows.reduce((a, r)=>a + r.weeks, 0) >= 24, after.map(r=>r.weeks).join(","));
    ok("S2: the plan's goals for those weeks stay", after.some(r=>r.goal === "Launch")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev("setWs('timeline'); render();"); await wait(10);
    const rule = [...d.styleSheets].flatMap(sh=>[...sh.cssRules]).find(r=>r.selectorText === ".gscroll .ghead"), z = Number(rule && rule.style.getPropertyValue("z-index"));   // jsdom's cascade ignores specificity; read the rule
    ok("H1: the sprint header stays above chips, gates and meetings scrolling under it", z >= 8, String(z)); });

  await sec(async ()=>{ const o = JSON.parse(plan); o.meta.start = "2026-09-21"; o.meta.weeks = 12; o.sprints = Array.from({length:6}, (_, i) => ({id:"sp" + i, name:"S" + i, weeks:2, goal:""}));
    const JST = JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], issues:{}, rollups:{}, board:{id:7, name:"Team board", columns:[]},
      sprints:[{id:14, name:"Sprint 14 09/03-09/16", state:"closed", start:"2026-09-03", end:"2026-09-16"}, {id:15, name:"Sprint 15 09/17-09/30", state:"active", start:"2026-09-17", end:"2026-10-02"}]});
    const {d, ev, handle} = await page({file:true, jira:false, text: JSON.stringify(o)});
    ev(`JIRA = parseJiraStatus(${JSON.stringify(JST)}); render();`); await wait(20);
    d.querySelector("#noticeShow")?.click(); await wait(5);          // reading the shared plan: setup notes start folded into one line
    d.querySelector("#bnUseSprints").click(); await wait(400);
    const names = JSON.parse(handle._text).sprints.map(x=>x.name);
    ok("J3: Use Jira's sprints from the banner is saved, so a refresh keeps it", names[0] === "Sprint 15 09/17-09/30" && names[1] === "Sprint 16" && !ev("file.dirty"), names.slice(0, 3).join(", "));
    ok("J3: and says what it did, with units", /1 sprint from Jira, then 5 more on Jira's schedule\. Saved\./.test(ev("document.querySelector('#status').textContent")), ev("document.querySelector('#status').textContent"));
    const R2 = await page({file:true, jira:false, text: handle._text}); R2.ev(`JIRA = parseJiraStatus(${JSON.stringify(JST)}); render();`); await wait(20);
    ok("J4: after a refresh the banner doesn't ask again", !R2.d.querySelector("#bnUseSprints")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
