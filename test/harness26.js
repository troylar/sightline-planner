// 1.18: Jira facts are shown, not copied: titles and assignees follow Jira, the plan keeps its own chart name and
// lead, and titles that differ are reviewed (never rewritten silently). Plus: milestones, gates and notes drag in Days
// and gates drag in Weeks. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Fresh title from Jira", status:"In Progress", category:"inprogress", type:"Story", assignee:"Avery S.", assigneeKey:"JIRAUSER1"},
          "ABC-2":{summary:"Task title from Jira", status:"To Do", category:"todo", type:"Story", assignee:"Avery S.", assigneeKey:"JIRAUSER1"},
          "ABC-9":{summary:"An epic", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-21", end:"2026-10-02", goal:"Ship it"}], rollups:{}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){}; w.Element.prototype.setPointerCapture=function(){};
    w.Element.prototype.getBoundingClientRect = function(){ return {left:0, top:0, width:1200, height:30, right:1200, bottom:30, x:0, y:0}; };
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0]?.id || null);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.J = L[0].id; window.P = L[1].id; window.T = L[2].id;
    L[0].jira = "ABC-1"; L[0].label = "STALE-XYZ"; L[0].chartName = ""; L[1].jira = "";
    L[2].jira = ""; L[2].tasks = [{id:"tj", label:"OLD-TASK-TITLE", jira:"ABC-2", start:"2026-09-28", days:2, status:"notstarted", owners:[], dependsOn:[]}];
    S.people[0].jira = {key:"JIRAUSER1", user:"avery", name:"Avery S."}; window.AV = S.people[0].id;
    S.sprints[0].jira = 42; S = normalize(JSON.parse(JSON.stringify(S)), false);
    JIRA = parseJiraStatus(STATUS); setWs("timeline"); setZoom("weeks"); render();`);
  return {w, d: w.document, ev};
}
const drag = (w, el, x0, x1) => { const mk = (t, x) => { const e = new w.Event(t, {bubbles:true}); Object.assign(e, {clientX:x, clientY:5, button:0, pointerId:1}); el.dispatchEvent(e); }; mk("pointerdown", x0); mk("pointermove", x0 + 10); mk("pointermove", x1); mk("pointerup", x1); };
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    const seen = () => d.body.innerHTML.includes("STALE-XYZ") || d.body.innerHTML.includes("OLD-TASK-TITLE");
    ok("F1: a Jira item shows Jira's title in Weeks, not the one stored in the plan", !seen() && d.querySelector(`#gantt [data-key="bar:${ev("J")}"]`).textContent.includes("Fresh title from Jira"));
    ev("setZoom('days'); render();"); await wait(10);
    ok("F1: and in Days, for tasks too", !seen() && d.body.innerHTML.includes("Task title from Jira"));
    ev("select('bar', J)"); await wait(10);
    ok("F1: its card shows Jira's title read-only, with no title box to edit", !!d.querySelector("#f-jfacts") && /Fresh title from Jira/.test(d.querySelector("#f-jfacts").textContent) && !d.querySelector("#f-label") && !seen());
    ok("F1: the hover and Find agree", /Fresh title from Jira/.test(ev("peekContent('bar', J).textContent")) && ev("findIndex().find(x=>x.id===J).text") === "Fresh title from Jira"); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA = null; JIRA_ISSUES = null; select('bar', J); render();"); await wait(10);
    ok("F2: without the Jira files, the stored title shows, marked as not current", ev("barTitle(barById(J))") === "STALE-XYZ" && !!d.querySelector("#f-jtitle .stale") && /Connect the Jira folder/.test(d.querySelector("#f-jtitle").textContent)); });

  await sec(async ()=>{ const {ev} = await page();
    ev("JIRA_ISSUES = parseJiraIssues(JSON.stringify({kind:'sightline-jira-issues', version:2, generatedAt:'" + at + "', jiraBase:'https://jira.example.com', searches:[{name:'Epics', jql:'x', total:1, keys:['ABC-9']}], issues:[{key:'ABC-9', summary:'An epic', status:'In Progress', category:'inprogress', type:'Feature', isEpic:true}]}))");
    await ev("epicOnNew('ABC-9', S.lanes[0].id)");
    const b = JSON.parse(ev("JSON.stringify(S.bars.find(b=>(b.epics||[]).includes('ABC-9')))"));
    ok("F3: putting an epic on the board copies nothing from Jira: its key, no owners", b.label === "ABC-9" && b.owners.length === 0 && !JSON.stringify(b).includes("An epic"), JSON.stringify(b).slice(0,120));
    ok("F3: yet it shows the epic's title", ev("chartLabel(S.bars.find(b=>(b.epics||[]).includes('ABC-9')))") === "An epic"); });

  await sec(async ()=>{ const {d, ev} = await page();
    ok("F4: Jira's assignee counts as the person on it, with no owners typed in", ev("JSON.stringify(peopleOf(allTaskById('tj')))".replace("allTaskById('tj')", "taskById('tj').t")) === JSON.stringify([ev("AV")]));
    ev("UI.filter = normFilter({people:[AV]}); render();");
    ok("F4: so the people filter finds it", ev("taskVisible(taskById('tj').t)") === true);
    ev("UI.filter = normFilter({}); taskById('tj').t.owners = [AV]; render();");
    ok("F5: an owner that's just the assignee (copied in) isn't shown as a lead", ev("leadOf(taskById('tj').t).length") === 0);
    ev("select('task', 'tj'); render();"); await wait(10);
    ok("F5: the card shows Jira's assignee (in From Jira) and offers the plan's lead", /Assignee\s*Avery/.test((n => { if (!n) return ""; n = n.cloneNode(true); n.querySelectorAll(".oav").forEach(x=>x.remove()); return n.textContent; })(d.querySelector("#f-jfacts"))) && /Lead \(the plan's/.test(d.querySelector("#side").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("UI.planTab = 'types'; setWs('plan');"); await wait(10);
    const name = [...d.querySelectorAll('#t-sprints input[aria-label="Sprint name"]')][0];
    ok("F6: a sprint that follows Jira can't be renamed here", name && name.hasAttribute("readonly"));
    ok("F6: the plan's own timeboxes still can", ![...d.querySelectorAll('#t-sprints input[aria-label="Sprint name"]')][1].hasAttribute("readonly")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("UI.planTab = 'epics'; setWs('plan');"); await wait(10);
    const r = d.querySelector('#titleDiffs [data-tdiff="ABC-1"]');
    ok("F7: titles the plan changed from Jira's are listed, with both", !!r && /Fresh title from Jira/.test(r.textContent) && /STALE-XYZ/.test(r.textContent));
    await ev("settleTitles([titleDiffs().find(x=>x.key==='ABC-1')], true)");
    ok("F7: Keep ours puts the plan's name on the chart and lets the title follow Jira", ev("barById(J).chartName") === "STALE-XYZ" && ev("barById(J).label") === "ABC-1" && ev("chartLabel(barById(J))") === "STALE-XYZ" && ev("barTitle(barById(J))") === "Fresh title from Jira");
    await ev("settleTitles([titleDiffs().find(x=>x.key==='ABC-2')], false)");
    ok("F7: Use Jira's drops the old title", ev("taskById('tj').t.label") === "ABC-2" && ev("titleDiffs().length") === 0); });

  await sec(async ()=>{ const {w, d, ev} = await page();
    ev(`commit(s=>{ s.milestones.push({id:"msX", lane:s.lanes[0].id, at:2, what:"Beta", status:"planned", after:[]}); s.gates.push({id:"gX", gate:"Security review", date:"2026-10-01", neededBy:"Oct 1", blocks:"", owners:[]}); }); setZoom("days"); UI.dayZoom = 5; render();`); await wait(10);
    const ms = d.querySelector('#gantt [data-peek-id="msX"]'), at0 = ev("S.milestones.find(m=>m.id==='msX').at");
    if (ms) drag(w, ms, 300, 700); await wait(10);
    ok("M1: in Days, a milestone can be dragged to another day", !!ms && ev("S.milestones.find(m=>m.id==='msX').at") !== at0, `${at0} -> ${ev("S.milestones.find(m=>m.id==='msX').at")}`);
    const g = d.querySelector('#gantt [data-peek-id="gX"]'), g0 = ev("S.gates.find(x=>x.id==='gX').date");
    if (g) drag(w, g, 300, 900); await wait(10);
    ok("M2: so can a gate", !!g && ev("S.gates.find(x=>x.id==='gX').date") !== g0, `${g0} -> ${ev("S.gates.find(x=>x.id==='gX').date")}`);
    ev("S.gates.find(x=>x.id==='gX').date = '2026-10-01'; setZoom('weeks'); render();"); await wait(10);
    const g2 = d.querySelector('#gantt .gaterow [data-peek-id="gX"]'), g1 = ev("S.gates.find(x=>x.id==='gX').date");
    if (g2) drag(w, g2, 600, 60); await wait(10);
    ok("M3: and in Weeks", !!g2 && ev("S.gates.find(x=>x.id==='gX').date") !== g1, `${g1} -> ${ev("S.gates.find(x=>x.id==='gX').date")}`);
    const g3 = d.querySelector('#gantt .gaterow [data-peek-id="gX"]'), before = ev("S.gates.find(x=>x.id==='gX').date");
    g3.click(); await wait(10);
    ok("M4: a click without dragging still opens it, and moves nothing", ev("S.gates.find(x=>x.id==='gX').date") === before); });

  await sec(async ()=>{ const {ev} = await page();
    // a sync that stops returning ABC-1 and ABC-2 (a permissions change, say), then a sync that has them again
    ev("barById(J).storiesOff = ['ABC-77']; S.meta.jiraSkip = ['ABC-88']; barById(J).epics = ['ABC-9'];");
    ev("JIRA = parseJiraStatus(STATUS.replace(/\"ABC-1\":\\{[^}]*\\},/, '').replace(/\"ABC-2\":\\{[^}]*\\},/, '')); render();");
    const gone = ev("JSON.stringify([!!jiraOf('ABC-1'), !!jiraOf('ABC-2')])");
    ev("S = normalize(JSON.parse(serialize(S, 'p.json')), false); render();");          // saved and opened again while they're missing
    const kept = ev("JSON.stringify([barById(J).jira, barById(J).storiesOff, S.meta.jiraSkip, barById(J).epics, taskById('tj').t.jira])");
    ok("K1: when a sync stops returning an issue, nothing added around it is removed, even after saving", gone === "[false,false]" && kept === JSON.stringify(["ABC-1", ["ABC-77"], ["ABC-88"], ["ABC-9"], "ABC-2"]), kept);
    ev("JIRA = parseJiraStatus(STATUS); render();");
    ok("K1: and when it comes back, it's all attached again", ev("barTitle(barById(J))") === "Fresh title from Jira" && ev("taskTitle(taskById('tj').t)") === "Task title from Jira"); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
