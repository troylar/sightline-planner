// Codex review 3: one owner per epic, truthful batch results, Jira dates fixed during scheduling, escaped status keys.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const epic = (k, summary, x = {}) => ({summary, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true, ...x});
const story = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", sprint:"Sprint 42", sprintId:42, sprintStart:"2026-09-28", sprintEnd:"2026-10-09", ...x});
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":epic("ABC-1","Made from an epic"), "ABC-2":epic("ABC-2","Hand-made with an epic key"), "ABC-3":epic("ABC-3","Third"), "ABC-4":epic("ABC-4","Fourth"),
          "ABC-50":story("ABC-50"), "ABC-51":story("ABC-51", {sprintStart:"2026-10-12", sprintEnd:"2026-10-23", sprint:"Sprint 43", sprintId:43})},
  rollups:{"ABC-3":{total:3, todo:0, inprogress:0, done:3, unknown:0, points:0, pointsDone:0, unestimated:3, byState:{"Done %7C Verified||done":[3,0]}}}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){}; w.Element.prototype.setPointerCapture=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.STATUS = status;
  // A: a bar made from ABC-1 the old way (its own key, no epics list). B: a hand-made initiative whose key is ABC-2, with its own work.
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.A = L[0].id; window.B = L[1].id;
    L[0].jira = "ABC-1"; L[0].epics = []; L[1].jira = "ABC-2"; L[1].epics = ["ABC-2"]; L[1].tasks = [{id:"t_hand", label:"Hand work", start:S.meta.start, days:2, status:"notstarted", dependsOn:[]}];
    JIRA = parseJiraStatus(STATUS); JIRA_ISSUES = null; setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev} = await page();
    ok("E1: an initiative made from an epic by its own key counts as on the board", ev("epicPlace('ABC-1').state") === "on" && ev("epicPlace('ABC-1').bar.id === A"));
    const n = ev("S.bars.length"); await ev("epicOnNew('ABC-1', S.lanes[0].id)");
    ok("E1: so On… can't make a second initiative for it", ev("S.bars.length") === n);
    await ev("parkMany(['ABC-1'])");
    ok("E1: batch Park parks it for real (the initiative is parked, not still linked)", ev("epicPlace('ABC-1').state") === "parked" && ev("barById(A).parked") === true); });

  await sec(async ()=>{ const {ev} = await page();
    await ev("epicPark('ABC-2')");
    ok("E2: parking a hand-made initiative's epic lets go of it entirely", ev("barEpics(barById(B)).includes('ABC-2')") === false && ev("!barById(B).parked"));
    ok("E2: so the page and the lock agree: parked, and no Jira status imposed", ev("epicPlace('ABC-2').state") === "parked" && ev("jiraLockOf(barById(B))") === null); });

  await sec(async ()=>{ const {ev} = await page();
    await ev("epicPark('ABC-1')"); ev("S.bars = S.bars.filter(b=>b.id !== A); render();");
    const r = await ev("epicBackOn('ABC-1')");
    ok("E3: Back on when its initiative was removed changes nothing and keeps it parked", r === false && ev("epicPlace('ABC-1').state") === "parked");
    ok("E3: and says how to put it back", /isn't in the plan any more/.test(ev("$('#status').textContent"))); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("goWs('plan'); setPlanTab && setPlanTab('epics'); renderJiraWs();"); await wait(20);
    ev("jiraPicks = new Set(['ABC-3','ABC-4']); renderJiraWs();");
    ev("window.q0 = quickSave; quickSave = () => Promise.resolve(false);");
    d.querySelector("#jiraBatchPark").click(); await wait(30);
    ok("E4: a batch that didn't save keeps the picks", ev("jiraPicks.size") === 2 && !!d.querySelector("#jiraBatch"));
    ev("quickSave = q0;");
    d.querySelector("#jiraBatchPark").click(); await wait(30);
    ok("E4: one that worked clears them", ev("jiraPicks.size") === 0);
    ok("E4: and says what happened (not a stuck Saving…)", ev("$('#status').textContent") === "2 epics parked.", ev("$('#status').textContent"));
    ev("file.handle = {name:'team.json'}; file.holdLock = true; jiraPicks = new Set(['ABC-4']); renderJiraWs();");
    d.querySelector("#jiraBatchOn").click(); await wait(30);
    ok("E4: in an editing session it says the change waits for Save", ev("$('#status').textContent") === "1 epic on the board. Save to share it.", ev("$('#status').textContent")); });

  await sec(async ()=>{ const {ev} = await page();
    // Two Jira stories in one initiative: ABC-51 (a later sprint) must come first, so ABC-50 would be pushed later.
    ev(`const b = barById(A); b.jira = ""; b.epics = []; b.tasks = [{id:"t50", label:"x", jira:"ABC-50", start:"2026-09-28", days:10, status:"inprogress", dependsOn:["t51"]}, {id:"t51", label:"y", jira:"ABC-51", start:"2026-10-12", days:10, status:"inprogress", dependsOn:[]}]; render();`);
    const s0 = ev("barById(A).tasks[0].start");
    ev("commit(s=>{ s.meta.title = s.meta.title + ' '; })"); ev("render()");
    ok("E5: scheduling leaves a Jira-sprint story where Jira put it", s0 === "2026-09-28" && ev("barById(A).tasks[0].start") === "2026-09-28" && ev("reschedule().moved") === 0); });

  await sec(async ()=>{ const {ev} = await page();
    ok("E6: a status with | in its name stays one status", ev("stateKeyParts('Done %7C Verified||done').join('/')") === "Done | Verified//done" && ev("stateKeyParts('100%25 %257C||todo')[0]") === "100% %7C");
    ev("barById(A).epics = ['ABC-3']; render();");
    ok("E6: and its stories count as done", ev("epicRollup(barById(A)).done") === 3);
    ok("E6: the status map lists it by its real name", ev("statusesInUse().st.has('Done | Verified')")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
