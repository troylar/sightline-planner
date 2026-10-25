// Sprints from Jira, and Jira-owned items: their dates come from their sprint and their status from Jira.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 23, 14)).toISOString();
// The sample plan starts Mon Sep 21, 2026 and runs 12 weeks (six 2-week sprints).
const SPRINTS = [
  {id:41, name:"Sprint 41", state:"closed", start:"2026-09-14", end:"2026-09-25", goal:"Old"},      // started before the plan
  {id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09", goal:"Pilot"},
  {id:44, name:"Sprint 44", state:"future", start:"2026-10-19", end:"2026-10-30", goal:""},          // a week's gap before it
  {id:45, name:"Sprint 45", state:"future", start:"2026-11-04", end:"2026-11-13", goal:""},          // starts on a Wednesday
  {id:46, name:"Sprint 46", state:"future", start:"", end:"", goal:""},                              // no dates yet
  {id:30, name:"Sprint 30", state:"closed", start:"2026-04-06", end:"2026-04-17", goal:""}];         // long before the plan
const story = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", sprint:"Sprint 42", sprintId:42, sprintStart:"2026-09-28", sprintEnd:"2026-10-09", ...x});
const status = (x = {}) => JSON.stringify({kind:"sightline-jira-status", snapshot:"aaaa1111bbbb2222", jiraBase:"https://jira.example.com", generatedAt:at,
  board:{id:7, name:"Team board"}, sprints:SPRINTS,
  issues:{"ABC-1":story("ABC-1"), "ABC-2":story("ABC-2", {status:"Done", category:"done"}), "ABC-3":story("ABC-3", {sprint:"", sprintId:0, sprintStart:"", sprintEnd:"", category:"todo", status:"Open"}),
          "ABC-4":story("ABC-4", {sprint:"Sprint 30", sprintId:30, sprintStart:"2026-04-06", sprintEnd:"2026-04-17"}), "ABC-10":{summary:"Epic", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}},
  missing:[], rollups:{"ABC-10":{total:4, todo:1, inprogress:1, done:2, unknown:0, points:0, pointsDone:0, unestimated:4, sprintStart:"2026-09-28", sprintEnd:"2026-10-30"}}, ...x});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();                                     // Wed Sep 30
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){}; w.Element.prototype.setPointerCapture=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.ST = status();
  // bar 0: a leaf initiative linked to story ABC-1. bar 1 gets a task linked to ABC-2. bar 2: ABC-3 (no sprint). bar 3: ABC-4 (sprint outside the plan). bar 4: epics.
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length);
    L[0].jira = "ABC-1"; L[0].status = "notstarted"; L[0].start = 5; L[0].span = 3;
    L[1].tasks = [{id:"tk", label:"Task on ABC-2", start:"2026-11-02", days:4, owners:[], jira:"ABC-2", status:"notstarted"}]; L[1].datesFrom = "manual";
    L[2].jira = "ABC-3"; L[3].jira = "ABC-4"; L[4].epics = ["ABC-10"]; L[4].jira = ""; L[4].start = 0; L[4].span = 1; L[4].dependsOn = [];
    window.IDS = L.slice(0,5).map(b=>b.id);
    file.handle = null; resetHistory(); sel = null; setWs("timeline"); setZoom("weeks"); UI.shelves = false; JIRA = parseJiraStatus(ST); render();`);
  return {w, d: w.document, ev, B: i => ev(`IDS[${i}]`)};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- S1: the status file brings sprints ----
  await sec(async ()=>{ const {ev} = await page();
    ok("S1: the board and its sprints are read", ev("JIRA.board.name") === "Team board" && ev("JIRA.sprints.length") === 6 && ev("JIRA.sprints[1].state") === "active");
    ok("S1: each issue carries its sprint's id and dates", ev("JIRA.issues['ABC-1'].sprintId") === 42 && ev("JIRA.issues['ABC-1'].sprintStart") === "2026-09-28");
    ok("S1: bad sprints are dropped", ev(`parseJiraStatus(${JSON.stringify(status({sprints:[{id:"x"}, {id:5, start:"2026-10-09", end:"2026-10-01"}, {id:6, name:"S6"}]}))}).sprints.map(x=>x.id).join()`) === "6"); });

  // ---- S2, S3: Jira sets the status and the dates ----
  await sec(async ()=>{ const {ev, B} = await page();
    ok("S2: a Jira-linked initiative takes Jira's status", ev(`barById("${B(0)}").status`) === "inprogress");
    ok("S2: so does a Jira-linked task", ev(`taskById("tk").t.status`) === "done");
    ok("S3: an initiative sits in its sprint's weeks", ev(`fmtDay(wkDay(barById("${B(0)}").start))`) === "Sep 28" && ev(`barById("${B(0)}").span`) === 2, ev(`[barById("${B(0)}").start, barById("${B(0)}").span].join()`));
    ok("S3: a task runs its sprint's working days", ev(`taskById("tk").t.start`) === "2026-09-28" && ev(`taskById("tk").t.days`) === 10, ev(`[taskById("tk").t.start, taskById("tk").t.days].join()`));
    ok("S3: an issue with no sprint isn't moved", ev(`barById("${B(2)}").start`) === ev(`normalize(JSON.parse(FIX), false).bars.find(b=>b.id==="${B(2)}").start`));
    ok("S3: nor one whose sprint is outside the plan, which says so", ev(`jiraLockOf(barById("${B(3)}")).dates`) === false && ev(`jiraLockOf(barById("${B(3)}")).outside`) === true);
    ev(`commit(()=>{ barById("${B(0)}").start = 8; barById("${B(0)}").status = "done"; })`);
    ok("S3: a change that slips through is put back on the next draw", ev(`fmtDay(wkDay(barById("${B(0)}").start))`) === "Sep 28" && ev(`barById("${B(0)}").status`) === "inprogress");
    ev(`barById("${B(0)}").status = "atrisk"; render()`);
    ok("S2: At risk is kept for something Jira says is in progress", ev(`barById("${B(0)}").status`) === "atrisk"); });

  // ---- S4: Jira items can't be dragged ----
  await sec(async ()=>{ const {w, d, ev, B} = await page();
    const down = el => el.dispatchEvent(new w.MouseEvent("pointerdown", {bubbles:true, button:0, clientX:10, clientY:10}));
    const locked = d.querySelector(`#gantt .bar[data-key="bar:${B(0)}"]`), free = d.querySelector(`#gantt .bar[data-key="bar:${B(2)}"]`);
    ok("S4: a Jira-scheduled bar has no resize handles and says why", locked.classList.contains("jlock") && /Scheduled by Jira/.test(locked.title));
    ev(`startDrag({button:0, preventDefault(){}, stopPropagation(){}, currentTarget:document.querySelector('#gantt .bar[data-key="bar:${B(0)}"]'), clientX:0, clientY:0}, "bar", "${B(0)}", "move")`);
    ok("S4: dragging it is refused, with the reason", ev("drag") === null && /change its sprint in Jira/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
    ev(`startDrag({button:0, preventDefault(){}, stopPropagation(){}, currentTarget:document.querySelector('#gantt .bar[data-key="bar:${B(2)}"]'), clientX:0, clientY:0}, "bar", "${B(2)}", "move")`);
    ok("S4: an issue with no sprint can still be moved", ev("drag !== null") && !free.classList.contains("jlock")); ev("drag = null"); });

  // ---- S5, S6: the panel and Today don't offer what Jira owns ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    ev(`select("task", "tk")`);
    ok("S5: a Jira task's dates and status can't be edited", d.querySelector("#f-tstart").disabled && d.querySelector("#f-tdays").disabled && d.querySelector("#f-tstatus").disabled);
    ok("S5: the status buttons become 'Status from Jira'", !d.querySelector("#side #q-done") && /Status from Jira: Done/.test(d.querySelector("#side .jstatus")?.textContent || ""));
    ok("S5: and it says where the dates come from", /Scheduled by its Jira sprint, Sprint 42 \(Sep 28 – Oct 9\); status from Jira \(Done\)\. Change it in Jira\./.test(d.querySelector("#side .jlockline")?.textContent || ""), d.querySelector("#side .jlockline")?.textContent);
    ev(`select("bar", "${B(2)}")`);
    ok("S5: an issue with no sprint says so, and its dates stay editable", /Not in a Jira sprint yet/.test(d.querySelector("#side .jlockline")?.textContent || "") && !d.querySelector("#f-start").disabled);
    ev(`barById("${B(0)}").start = 0; JIRA.issues["ABC-1"].sprintStart = "2026-09-21"; JIRA.issues["ABC-1"].sprintEnd = "2026-09-25"; JIRA.issues["ABC-1"].category = "todo"; JIRA.issues["ABC-1"].status = "Open"; sel = null; setWs("today")`);
    const row = [...d.querySelectorAll("#today li.trow")].find(li=>li.dataset.tkey === "bar:" + ev(`IDS[0]`));
    ok("S6: Today lists it, but sends you to Jira instead of offering Start or Next week", !!row && /Update it in Jira/.test(row.textContent) && !/Start today|Next week/.test(row.querySelector(".tacts").textContent), row?.textContent.slice(0,160)); });

  // ---- S9, S10: the plan's sprints follow the board ----
  await sec(async ()=>{ const {d, ev} = await page();
    const P = JSON.parse(ev("JSON.stringify(sprintProposal())"));
    ok("S9: Jira's sprints become the plan's, in whole weeks from the plan's start", P.rows.map(r=>`${r.name}:${r.weeks}`).join() === "Sprint 41:1,Sprint 42:2,No sprint:1,Sprint 44:2,Sprint 45:2,Sprint 46:2,Sprint 47:2", P.rows.map(r=>`${r.name}:${r.weeks}`).join());
    ok("S9: after Jira's last sprint the plan keeps its own sprints, so it isn't cut short", P.rows.slice(-2).every(r=>r.plan) && P.rows.reduce((a,r)=>a+r.weeks,0) === 12);
    ok("S9: it says what didn't fit exactly", P.notes.some(n=>/Sprint 41 started Sep 14, before the plan/.test(n)) && P.notes.some(n=>/Sprint 45 starts on a Wednesday/.test(n)) && P.undated === 1, JSON.stringify(P.notes));
    ev("setWs('plan'); UI.planTab = 'types'; render()");
    ok("S11: Plan, Sprints says the board's sprints are different", /Your Jira board's sprints are different/.test(d.querySelector("#sprintsJira")?.textContent || ""));
    ev("openJiraDialog()");
    const box = d.querySelector("#jiraSprints");
    ok("S10: the Jira window shows what the sprints will be, with Jira's own dates where they differ", !!box && /Now 6 sprints, 12 weeks .* After: 7 sprints, 12 weeks/.test(box.textContent) && /Team board/.test(box.textContent) && box.querySelectorAll("tbody tr").length === 7 && /Sep 21 – Sep 25\s*Jira: Sep 14 – Sep 25/.test(box.textContent), box.textContent.slice(0,200));
    const ids0 = ev("S.sprints.map(x=>x.id).join()");
    box.querySelector("#jiraUseSprints").click(); await wait(10);
    ok("S10: Use Jira's sprints makes them the plan's (the plan may add a sprint at the end if work moves past it)", ev("S.sprints.map(x=>x.name + ':' + x.weeks + ':' + (x.jira||'')).join()").startsWith("Sprint 41:1:41,Sprint 42:2:42,No sprint:1:,Sprint 44:2:44,Sprint 45:2:45,Sprint 46:2:,Sprint 47:2:"), ev("S.sprints.map(x=>x.name + ':' + x.weeks).join()"));
    ok("S10: goals come from Jira when it has one", ev("S.sprints[1].goal") === "Pilot");
    ok("S10: sprints keep their ids where they can, so ceremonies and process rules still attach", ev("S.sprints[0].id") === ids0.split(",")[0]);
    ok("S10: afterwards they match", ev("sprintProposal().same") === true && /match the board/.test(d.querySelector("#jiraSprints").textContent));
    ok("S10: and one Undo puts the old sprints back", (ev("undo()"), ev("S.sprints.map(x=>x.id).join()")) === ids0); });

  // ---- S12: an initiative made of epics follows its stories' sprints ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    ok("S12: its bar covers its stories' sprints, on its own", ev(`fmtDay(wkDay(barById("${B(4)}").start))`) === "Sep 28" && ev(`barById("${B(4)}").span`) === 5, ev(`[barById("${B(4)}").start, barById("${B(4)}").span].join()`));
    ev(`select("bar", "${B(4)}")`);
    ok("S12: and says so", /Its dates follow its stories' sprints \(Sep 28 – Oct 30\)/.test(d.querySelector("#side .jlockline")?.textContent || ""), d.querySelector("#side .jlockline")?.textContent);
    ev(`startDrag({button:0, preventDefault(){}, stopPropagation(){}, currentTarget:document.querySelector('#gantt .bar[data-key="bar:${B(4)}"]'), clientX:0, clientY:0}, "bar", "${B(4)}", "move")`);
    ok("S12: so it can't be dragged away from them", ev("drag") === null);
    ok("S12: its status follows its stories", ev(`barById("${B(4)}").status`) === "inprogress"); });

  // ---- S13: read-only ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("locked = true; openJiraDialog()");
    ok("S13: read-only, the sprint comparison shows but can't be applied", !!d.querySelector("#jiraSprints") && !d.querySelector("#jiraUseSprints") && /Start editing/.test(d.querySelector("#jiraSprints").textContent));
    ok("no runtime errors (S13)", ev("window.errs.length") === 0, ev("window.errs.join(' | ')")); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
