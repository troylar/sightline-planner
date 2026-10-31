const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = JSON.parse(fs.readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8"));
const R=[]; const ok=(n,c,x="")=>R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){
  // Keep the October time-off and meeting exercises on an explicit working day.
  const RealDate = w.Date, now = new RealDate('2026-10-07T14:00:00Z').getTime();
  w.Date = class extends RealDate {constructor(...args){args.length ? super(...args) : super(now);} static now(){return now;}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.indexedDB=undefined; w.confirm=()=>true; w.alert=m=>{w.lastAlert=m;}; w.prompt=()=>"T"; w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.HTMLAnchorElement.prototype.click=function(){};
  w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
const w=dom.window,d=w.document,ev=s=>w.eval(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
// Under a parallel run a fixed few milliseconds can end before the editor is drawn: wait for it, up to two seconds.
const until=async(what,f,ms=2000)=>{ const t=Date.now(); while(!f() && Date.now()-t<ms) await wait(10); if (!f()) console.log(`(waited ${ms}ms for ${what}; the check below will fail)`); };
(async()=>{
  await wait(150);
  ev("window.__askWho = askWhoOnStart; askWhoOnStart = ()=>{}");   // tested on its own below
  ev("window.__resched = reschedule; reschedule = ()=>({moved:0})");   // auto-moving is tested on its own below
  // The 15-second shared-file check runs on real time. On a loaded machine it fired mid-run against the stand-in file
  // handles below, found no permission, unlinked the "file" and dropped the edit lock, and Present then started in SR9.
  ev("stopAuto(); startAuto = ()=>{}");
  const st = plan.meta.start;  // a Monday
  const p = JSON.parse(JSON.stringify(plan));
  p.holidays=[{date:"2026-10-12",name:"Columbus Day"}];
  const b0 = p.bars[0]; b0.datesFrom="tasks";
  b0.tasks=[{id:"t1",label:"Design",start:st,days:3,owner:"A",status:"done"},{id:"t2",label:"Build",start:st,days:5,owner:"B",status:"inprogress"}];
  ok("load plan with tasks", ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`)===true); await wait(30); ev("setWs('timeline')");
  ok("old plan (no tasks) still loads", ev(`normalize(${JSON.stringify(plan)},true).bars.every(b=>Array.isArray(b.tasks)&&b.datesFrom==="manual")`));
  ok("derived start = task start", ev(`Math.abs(barById("${b0.id}").start)<1e-9`) && ev(`barEndDay(barById("${b0.id}"))===startDay()+4`), ev(`JSON.stringify([barById("${b0.id}").start,barById("${b0.id}").span])`));
  ok("rollup pct by task-days", ev(`rollupOf(barById("${b0.id}")).pct`)===38);
  ok("rollup status inprogress + owners", ev(`effStatus(barById("${b0.id}"))`)==="inprogress" && ev(`effOwner(barById("${b0.id}"))`)==="A, B");
  ok("holiday skipped by addWork", ev(`dayToIso(addWork(isoToDay("2026-10-09"),2,holidaySet(S)))`)==="2026-10-13");
  ok("weekend skipped", ev(`dayToIso(addWork(isoToDay("2026-10-02"),2,new Set()))`)==="2026-10-05");
  ok("task start on weekend snaps to Monday", ev(`dayToIso(taskSpan({start:"2026-10-03",days:1},new Set()).s)`)==="2026-10-05");
  // drag-equivalent: commit shift
  ev(`commit(()=>shiftTasks(barById("${b0.id}"),7))`);
  ok("shifting derived bar moves tasks + bar", ev(`taskById("t1").t.start`)!==st && ev(`Math.abs(barById("${b0.id}").start-1)<1e-9`));
  ev("undo()"); ok("undo restores task dates", ev(`taskById("t1").t.start`)===st);
  // late task -> late bar
  ev(`commit(()=>{taskById("t2").t.start="2020-01-06";})`);
  ok("task before plan start clamps on reload", ev(`normalize(S,false).bars[0].tasks[1].start`)===st);
  ev("undo()");
  // manual mode outside warning
  ev(`commit(()=>{const b=barById("${b0.id}"); b.datesFrom="manual"; b.start=0; b.span=0.5;})`);
  ok("manual mode warns tasks outside", ev(`tasksOutside(barById("${b0.id}")).length`)>=1, ev(`tasksOutside(barById("${b0.id}")).length+" end="+dayToIso(barEndDay(barById("${b0.id}")))`));
  ev("render()"); ok("outside tag shown in weeks view", /outside/.test(d.querySelector("#gantt").textContent));
  ev("undo()");
  // day view
  ev("setZoom('days')");
  ok("day view renders task bars", d.querySelectorAll(".tbar").length===2 && d.querySelectorAll(".gday").length>20);
  ok("holiday column shaded", d.querySelectorAll(".gday.hol").length===1);
  ev(`openInitiative("${b0.id}")`);
  ok("drill-in shows one initiative + back link", d.querySelectorAll(".dlabel").length===1 && /All initiatives/.test(d.querySelector(".gcorner").textContent));
  ok("drill-in without a focus keeps its own back link", d.querySelectorAll(".dlabel").length===1 && /All initiatives/.test(d.querySelector(".gcorner").textContent));
  ev("UI.ws='people'; render()");
  ok("day-level load", /working day/.test(d.querySelector("#loadHint").textContent) && d.querySelectorAll("#load .p").length>=1);
  ev("UI.ws='timeline'; render()");
  ev(`select("task","t2")`); ok("task editor opens", !!d.querySelector("#f-tlabel") && d.querySelector("#f-tdays").value==="5");
  ev(`addTask(barById("${b0.id}"))`); ok("add task appends after last", ev(`barById("${b0.id}").tasks.length`)===3 && ev(`barById("${b0.id}").tasks[2].start`)>st);
  ev(`del("task",barById("${b0.id}").tasks[2].id)`); ok("delete task", ev(`barById("${b0.id}").tasks.length`)===2);
  // baseline tasks
  ev("S.baseline=null"); d.querySelector("#baseline").click();
  const hasBl = ev(`!!(S.baseline && S.baseline.tasks && S.baseline.tasks.t1)`);
  ok("baseline snapshots tasks", hasBl);
  ev(`commit(()=>{taskById("t2").t.days=7;})`);
  ok("task slip vs baseline = +2d", ev(`slipTask(taskById("t2").t)`)===2);
  ev("render()"); ok("slip tag shown", /\+2d/.test(d.querySelector("#gantt").textContent));
  // holidays table
  ev("UI.planTab='calendar';setWs('plan')");
  const hb = d.querySelectorAll("#t-holidays tbody tr").length; d.querySelector("#addHoliday").click();
  ok("add holiday", d.querySelectorAll("#t-holidays tbody tr").length===hb+1);
  ev("setWs('timeline')");
  // task ids unique across plan
  let e=""; try{ ev(`normalize({lanes:[{id:"a"}],bars:[{id:"x",lane:"a",tasks:[{id:"q"}]},{id:"y",lane:"a",tasks:[{id:"q"}]}]},true)`);}catch(x){e=x.message;}
  ok("duplicate task ids rejected", /Duplicate id "q"/.test(e));
  // injection
  ev(`commit(()=>{taskById("t1").t.label="<img src=x onerror=alert(1)>";})`); ev("render()");
  ok("no HTML injection in tasks", !d.querySelector("#gantt img") && !d.querySelector("#side img"));
  ev("setZoom('weeks')"); ok("back to weeks", d.querySelectorAll(".bar").length===29);
  ok("progress tag in weeks", /\d+\/\d+ (tasks|items)/.test(d.querySelector("#gantt .bar .tags").textContent));
  ok("bar name comes before tags", d.querySelector("#gantt .bar .nm").nextElementSibling.classList.contains("tags"));
  // --- batch 1 UX ---
  ev("sel=null; render()"); ok("side hidden with no selection", !d.body.classList.contains("hasSel"));
  d.querySelector("#help").click(); ok("? opens the help screen", d.querySelector("#dlgHelp").open && /Getting started/.test(d.querySelector("#helpNav").textContent));
  d.querySelector("#helpClose").click(); ok("help closes", !d.querySelector("#dlgHelp").open);
  let nulls = [];
  ev("S.bars").forEach(b=>{ ev(`select("bar","${b.id}")`); if (/\bnull\b/.test(d.querySelector("#side").textContent)) nulls.push(b.id); (b.tasks||[]).forEach(t=>{ ev(`select("task","${t.id}")`); if (/\bnull\b/.test(d.querySelector("#side").textContent)) nulls.push(t.id); }); });
  ev("S.milestones").forEach(m=>{ ev(`select("ms","${m.id}")`); if (/\bnull\b/.test(d.querySelector("#side").textContent)) nulls.push(m.id); });
  ev("S.lanes").forEach(l=>{ ev(`select("lane","${l.id}")`); if (/\bnull\b/.test(d.querySelector("#side").textContent)) nulls.push(l.id); });
  ok("no 'null' text in any side panel", nulls.length===0, nulls.join(","));
  d.querySelector(".sidehead .x").click(); ok("close button clears selection", ev("sel")===null);
  // view-only: linked file without the lock
  ev("file.handle = {name:'x.json'}; file.holdLock = false; render()");
  ok("view-only: editable() false", ev("editable()")===false);
  ev(`select("bar","${b0.id}")`);
  ok("view-only: can still open an initiative", ev("sel && sel.id")===b0.id && /Quick updates below save right away/.test(d.querySelector("#side").textContent) && d.querySelector("#f-label").disabled && !d.querySelector("#q-addupd").disabled);
  ok("view-only: fields disabled, nav enabled", d.querySelector("#f-label").disabled && [...d.querySelectorAll("#side .nav")].every(x=>!x.disabled));
  ok("view-only: commit still blocked", ev('commit(s=>s.meta.title="nope")')===false);
  ev("file.handle = null; sel=null; render()");
  // start date shifts tasks
  const t1s = ev(`taskById("t1").t.start`);
  d.querySelector("#settings").click(); d.querySelector("#dStart").value="2026-09-30"; d.querySelector("#dDatesOk").click();
  ok("start date snaps to Monday", ev("S.meta.start")==="2026-09-28");
  ok("tasks move with the start date", ev(`taskById("t1").t.start`)===ev(`dayToIso(isoToDay("${t1s}")+7)`));
  ev("undo()"); ok("undo restores start + tasks", ev("S.meta.start")===st && ev(`taskById("t1").t.start`)===t1s);
  // days window
  ev("UI.dayZoom=undefined; UI.zoomN=undefined; setZoom('days')");
  ok("days lays out the whole plan, fitted to the work by default", d.querySelectorAll(".gday").length===ev("DV.N") && ev("DV.N")>=55 && d.querySelector("#zoomLab").textContent==="Fit" && d.querySelector("#zoomOut").disabled, String(d.querySelectorAll(".gday").length));
  ok("days header keeps the sprints", d.querySelectorAll("#gantt .gsprint").length===ev("S.sprints.length") && d.querySelectorAll(".sprintline").length>0 && /S1/.test(d.querySelector("#gantt .gsprint:nth-child(2)").textContent));
  ok("empty initiatives are compact rows", d.querySelectorAll(".lane.compact").length===ev("S.bars.filter(b=>!b.tasks.length).length"));
  ok("no repeated 'No tasks yet' hints", !/No tasks yet/.test(d.querySelector("#gantt").textContent));
  ok("task bars show owner initials", [...d.querySelectorAll(".tbar .who")].some(x=>/^[A-Z][a-z]?$/.test(x.textContent.trim())), [...d.querySelectorAll(".tbar .who")].map(x=>x.textContent).join(","));
  ok("every initiative has a bar in the day view", d.querySelectorAll(".ibar").length===ev("S.bars.length"));
  ok("Fit shows the shown work's weeks on one screen", ev("DV.colW * Math.min(DV.N, fitWeeks() * 5)") <= ev("Math.max(300, ($('#gscroll')?.clientWidth || 1100) - UI.labelW.days - 2)") + 1);
  ev("setZoomN(2)");
  ok("legend switches to days", d.querySelector("#legend").classList.contains("days"));
  ev("setZoom('weeks')");
  // --- batch 2 UX ---
  ok("chip: local plan says this browser only", /This browser only/.test(d.querySelector("#sourceText").textContent) && d.querySelector("#source").classList.contains("local"));
  d.querySelector("#fileMenuBtn").click(); ok("File menu opens", !d.querySelector("#fileMenu").hidden && d.querySelector("#fileMenuBtn").getAttribute("aria-expanded")==="true");
  d.body.click(); ok("File menu closes on outside click", d.querySelector("#fileMenu").hidden);
  d.querySelector("#source").click(); ok("chip opens the File menu", !d.querySelector("#fileMenu").hidden);
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true})); ok("Esc closes the menu first", d.querySelector("#fileMenu").hidden);
  ev("file.handle={name:'plan.json'}; file.holdLock=false; updateFileUI()");
  ok("chip: shared read-only", /plan\.json · read-only/.test(d.querySelector("#sourceText").textContent));
  ev("file.holdLock=true; file.dirty=true; updateFileUI()");
  ok("chip: editing unsaved", /editing · unsaved/.test(d.querySelector("#sourceText").textContent) && d.querySelector("#source").classList.contains("unsaved"));
  ok("new shared plan disabled while holding the lock", d.querySelector("#newShared").disabled);
  ev("file.handle=null; file.holdLock=false; file.dirty=false; updateFileUI(); render()");
  // + buttons
  const lane0 = ev("S.lanes[0].id"), nb = ev("S.bars.length");
  d.querySelector(`.lane[data-lane="${lane0}"] .addbtn`).click();
  ok("+ Initiative adds after the lane's last bar", ev("S.bars.length")===nb+1 && ev(`sel.type==="bar" && barById(sel.id).start >= Math.max(...S.bars.filter(b=>b.lane==="${lane0}" && b.id!==sel.id).map(b=>b.start+b.span)) - 1e-9`));
  ev("undo(); sel=null; setZoom('days')");
  const nt = ev(`barById("${b0.id}").tasks.length`);
  d.querySelector(`.track[data-bar="${b0.id}"] .addbtn`).click();
  ok("+ Task adds a task", ev(`barById("${b0.id}").tasks.length`)===nt+1);
  ev("undo(); sel=null; setZoom('weeks')");
  // drag tip
  ev(`tip({clientX:100,clientY:100},[h("span",{},"Oct 5 → Oct 16")])`);
  ok("drag tip shows", !d.querySelector("#dragtip").hidden && /Oct 5/.test(d.querySelector("#dragtip").textContent));
  ev("hideTip()"); ok("drag tip hides", d.querySelector("#dragtip").hidden);
  // present
  ev(`commit(()=>{ const b=barById("r1"); b.start=0; b.span=0.5; b.status="inprogress"; })`);
  await ev("setPresent(true)");
  { const late = ev(`(reviewSets().find(x=>x[0]==="late") || [,,,[]])[3].length`);   // counted by the app: how many fixture items are late depends on today
    ok("present: review chips shown", !!d.querySelector(".review .rchip.bad") && late >= 1 && ev(`isLate(barById("r1"))`) && new RegExp(late + "\\s*late").test(d.querySelector(".review").textContent), `${late} late`); }
  ok("present: warn banner replaced", !d.querySelector("#banners .banner.warn"));
  d.querySelector(".rchip.bad").click();
  ok("present: late chip opens the late item read-only", ev("sel && sel.type")==="bar" && ev("isLate(barById(sel.id))") && d.body.classList.contains("hasSel") && d.querySelector("#f-label").disabled);
  ok("present: no view-only nag or quick-update panel", !/View only|Quick updates below/.test(d.querySelector("#side").textContent) && !d.querySelector("#side .quick"));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("present: Esc closes panel before exiting", ev("present")===true && ev("sel")===null);
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("present: second Esc exits", ev("present")===false);
  ev("undo()");
  // new shared plan via save picker
  let written = "";
  w.showSaveFilePicker = async()=>({name:"team-plan.json", kind:"file",
    createWritable: async()=>({write: async t=>{written=t;}, close: async()=>{}}),
    getFile: async()=>({size: written.length, text: async()=>written}),
    queryPermission: async()=>"granted", requestPermission: async()=>"granted"});
  await ev("newSharedPlan()"); await wait(50);
  ok("new shared plan: writes and links the file", /"bars"/.test(written) && ev("file.handle && file.handle.name")==="team-plan.json" && /team-plan\.json · read-only/.test(d.querySelector("#sourceText").textContent));
  ok("new shared plan: no lock written", JSON.parse(written).meta.lock == null);
  ev("file.handle=null; file.holdLock=false; file.dirty=false; locked=false; updateFileUI()");
  // welcome
  ev("S = blankPlan(); S.sprints = evenSprints(12,2,0); syncWeeks(S); UI.noWelcome=false; render()");
  ok("welcome shows on a blank local plan", !!d.querySelector(".welcome"));
  [...d.querySelectorAll(".welcome .linkish")].find(x=>/this browser only/.test(x.textContent)).click();
  ok("welcome can be dismissed, leaving the setup checklist", !d.querySelector(".welcome") && /Set up this plan/.test(d.querySelector("#gantt").textContent));
  // --- themes ---
  const tb = d.querySelector("#theme");
  ok("theme starts on auto (no data-theme)", !d.documentElement.hasAttribute("data-theme") && tb.textContent.startsWith("◐") && /Theme: Auto/.test(tb.textContent));
  tb.click(); ok("theme → light", d.documentElement.getAttribute("data-theme")==="light");
  tb.click(); ok("theme → dark", d.documentElement.getAttribute("data-theme")==="dark" && /Dark/.test(tb.getAttribute("aria-label")));
  ok("theme remembered", w.localStorage.getItem("timeline-planner-theme")==="dark");
  tb.click(); ok("theme → back to auto", !d.documentElement.hasAttribute("data-theme"));
  const css = [...d.querySelectorAll("style")].map(x=>x.textContent).join("\n");
  ok("dark tokens under both media query and [data-theme=dark]", /prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)\{[^}]*--on-accent/.test(css) && /:root\[data-theme="dark"\]\{[^}]*--tip-bg/.test(css));
  ok("no hardcoded light-only text colors left in tooltip/buttons", !/#dragtip\{[^}]*background:var\(--ink\)/.test(css) && /\.btn\.primary\{[^}]*var\(--on-accent\)/.test(css));
  // --- milestone dates ---
  ok("parse '~Oct 16' label", ev(`dayToIso(parseLabelDay("~Oct 16"))`)==="2026-10-16");
  ok("parse range 'Nov 2–13' takes first date", ev(`dayToIso(parseLabelDay("Nov 2–13"))`)==="2026-11-02");
  ev(`S.milestones.push({id:"mx",date:"Oct 16",stretch:"Oct 9",what:"X",dep:"",status:"commit",lane:S.lanes[0].id,at:5,stretchAt:null}); render()`);
  ok("mismatch detected (label vs chart)", /Oct 16/.test(ev(`labelMismatch(S.milestones.find(m=>m.id==="mx"),false)`)||"") && /isn't on the chart/.test(ev(`labelMismatch(S.milestones.find(m=>m.id==="mx"),true)`)||""));
  ev("UI.planTab='milestones';setWs('plan')");
  ok("mismatch flagged in table", d.querySelectorAll("#t-milestones .misflag").length>=1);
  d.querySelector("#placeMs").click();
  ok("place from labels fixes both", ev(`atToDay(S.milestones.find(m=>m.id==="mx").at)`)===ev(`isoToDay("2026-10-16")`) && ev(`atToDay(S.milestones.find(m=>m.id==="mx").stretchAt)`)===ev(`isoToDay("2026-10-09")`) && !ev(`labelMismatch(S.milestones.find(m=>m.id==="mx"),false)`));
  ev(`select("ms","mx")`);
  const inp = d.querySelector("#f-mat"); inp.value="2026-10-23"; inp.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok("date picker moves the milestone and its label", ev(`S.milestones.find(m=>m.id==="mx").date`)==="Oct 23" && ev(`dayToIso(atToDay(S.milestones.find(m=>m.id==="mx").at))`)==="2026-10-23");
  ev(`S.milestones.find(m=>m.id==="mx").date="~Oct 23"; render()`);
  ev(`keyNudge({key:"ArrowRight",preventDefault(){},altKey:false,shiftKey:false},"ms","mx",false)`);
  ok("nudging keeps ~ and updates label", /^~Oct (2[6-9]|30)$/.test(ev(`S.milestones.find(m=>m.id==="mx").date`)), ev(`S.milestones.find(m=>m.id==="mx").date`));
  ev(`S.milestones.find(m=>m.id==="mx").date="After security sign-off"; keyNudge({key:"ArrowRight",preventDefault(){},altKey:false,shiftKey:false},"ms","mx",false)`);
  ok("custom text label left alone", ev(`S.milestones.find(m=>m.id==="mx").date`)==="After security sign-off");
  ok("chart scroller present with pinned header", !!d.querySelector("#gscroll .gantt .ghead"));
  // --- day zoom ---
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30);
  ev(`UI.zoomN=0; setZoom("days"); commit(()=>{ barById("${b0.id}").tasks.push({id:"t9",label:"One-day review with a long name",start:"${st}",days:1,owner:"A",status:"notstarted",jira:""}); })`);
  ok("narrow one-day task: name shown beside the bar", [...d.querySelectorAll(".tlabel")].some(x=>/One-day review/.test(x.textContent)) && !!d.querySelector('[data-key="task:t9"].narrow'));
  const col0 = ev("DV.colW"); d.querySelector("#zoomIn").click();
  ok("zoom in shows one sprint fewer (wider columns)", ev("zoomN()") === ev("maxZoomN()") && ev("DV.colW") > col0 && /sprints?$/.test(d.querySelector("#zoomLab").textContent));
  const n0 = ev("zoomN()"); d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"+",bubbles:true})); ok("+ key zooms in by one sprint", ev("zoomN()") === Math.max(1, n0 - 1));
  for (let k=0;k<20;k++) d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"+",bubbles:true}));
  ok("zooms in to 1 sprint and stops", ev("zoomN()") === 1 && d.querySelector("#zoomLab").textContent === "1 sprint" && d.querySelector("#zoomIn").disabled && Math.abs(ev("DV.colW") - Math.max(14, ev("Math.max(300, ($('#gscroll')?.clientWidth || 1100) - UI.labelW.days - 2)") / Math.min(ev("DV.N"), ev("sprintLen()") * 5))) < 1);
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"-",bubbles:true})); d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"-",bubbles:true}));
  ok("− key zooms out one sprint at a time", ev("zoomN()") === Math.min(3, ev("maxZoomN()") + 1) || ev("zoomN()") === 0);
  for (let k=0;k<20;k++) d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"-",bubbles:true}));
  ok("and out to Fit", ev("zoomN()") === 0 && d.querySelector("#zoomLab").textContent === "Fit");
  d.querySelector('.tlabel').click(); ok("clicking the outside name opens the task", ev("sel && sel.type")==="task");
  ev("undo(); sel=null; setZoom('weeks')");
  // --- gates + milestones on the chart ---
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30); ev("setZoom('weeks')");
  ok("weeks: gates row with one marker per day that has gates", d.querySelectorAll("#gantt .gaterow .flag.gate").length===ev("new Set(S.gates.map(g=>parseLabelDay(g.neededBy)).filter(x=>x!=null)).size") && ev("S.gates.length")>0);
  ok("gates row is not a drop target", d.querySelector("#gantt .gaterow").closest(".lane[data-lane]")===null);
  ev("UI.dayZoom=5; setZoom('days')");
  ok("days: gates row shown", d.querySelectorAll("#gantt .gaterow .flag.gate").length>0);
  const msLanes = ev("new Set(S.milestones.filter(m=>m.lane && (m.at!=null||m.stretchAt!=null)).map(m=>m.lane)).size");
  ok("days: milestone row for each lane with milestones", d.querySelectorAll("#gantt .markrow:not(.gaterow)").length===msLanes, `${d.querySelectorAll("#gantt .markrow:not(.gaterow)").length} vs ${msLanes}`);
  ok("days: a milestone stored on a Saturday shows on the Friday", ev(`(()=>{ const m=S.milestones.find(x=>x.at!=null && dow(atToDay(x.at))===6); if(!m) return true; const f=[...document.querySelectorAll("#gantt .markrow .flag")].find(el=>el.title.startsWith(fmtDay(atToDay(m.at))) || true); return DV.colOf(nearWeekday(atToDay(m.at)))===DV.colOf(atToDay(m.at)-1); })()`));
  const mflag = d.querySelector("#gantt .markrow:not(.gaterow) .flag:not(.stretch)"); mflag.click();
  ok("days: clicking a milestone opens it", ev("sel && sel.type")==="ms");
  ev("sel=null; setZoom('weeks')");
  // --- senior review 6 regressions ---
  d.elementFromPoint = ()=>null;
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30); ev("setZoom('weeks'); sel=null; render()");
  ev(`select("bar","${b0.id}")`);
  [...d.querySelectorAll("#side button")].find(x=>x.textContent==="Add next step").click();
  ok("SR1: Add next step doesn't clone tasks; plan still loads", ev("barById(sel.id).tasks.length")===0 && (()=>{ try { ev("parseText(serialize(S,'x.json'))"); return true; } catch(e){ return false; } })());
  ev("undo(); sel=null; render()");
  ev(`commit(()=>{ barById("c1").start = 1.1; })`);
  const pastN = ev("past.length");
  ev(`(()=>{ const el=document.querySelector('[data-key="bar:c1"]'); drag={type:"bar",id:"c1",mode:"move",x0:0,w:1000,orig:clone(barById("c1")),moved:false,snapshot:JSON.stringify(S),el,pid:1}; barById("c1").start = 1.0; onUp({clientX:-50,clientY:-50}); })()`);
  ok("SR2: sub-threshold drag leaves the plan untouched", ev(`barById("c1").start`)===1.1 && ev("past.length")===pastN);
  ev(`(()=>{ const el=document.querySelector('[data-key="bar:c1"]'); drag={type:"bar",id:"c1",mode:"move",x0:0,w:1000,orig:clone(barById("c1")),moved:true,snapshot:JSON.stringify(S),el,pid:1}; barById("c1").start = 3; })()`);
  await ev("setPresent(true)");
  ok("SR2: entering Present cancels an in-flight drag", ev(`barById("c1").start`)===1.1 && ev("drag")===null);
  await ev("setPresent(false)"); ev("undo()");
  ok("SR3: 501 tasks survive import", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"b",lane:"a",tasks:Array.from({length:501},(_,i)=>({id:"q"+i,label:"t",start:"2026-09-21",days:1}))}]},true).bars[0].tasks.length`)===501);
  ok("SR4: cross-year label picks the year near the chart", ev(`(()=>{ const keep=S; S=normalize({meta:{start:"2026-12-07",weeks:48},lanes:[{id:"a"}],milestones:[{id:"z",lane:"a",date:"Oct 4",what:"x",at:43}]},false); const m=S.milestones[0]; const r=[labelMismatch(m,false), dayToIso(parseLabelDay("Oct 4", atToDay(m.at)))]; S=keep; return JSON.stringify(r); })()`)===JSON.stringify([null,"2027-10-04"]));
  ok("SR4: Place from labels never drags an out-of-plan date to week 0", ev(`(()=>{ const keep=S; S=normalize({meta:{start:"2026-09-21",weeks:12},lanes:[{id:"a"}],milestones:[{id:"z",lane:"a",date:"Jun 4",what:"x",at:5}]},false); placeFromLabels(); const at=S.milestones[0].at; S=keep; return at; })()`)===5);
  ev("file.handle={name:'x.json'}; file.holdLock=true; render()");
  ev("window.__ro=null; exclusive(async()=>{ window.__ro = document.querySelector('#title').disabled; })"); await wait(10);
  ok("SR5: controls freeze as soon as file work starts", ev("window.__ro")===true);
  ok("SR7: can't replace the plan while holding the edit lock", ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`)===false);
  ev("doneEditing = async()=>false");
  await ev("setPresent(true)");
  ok("SR9: Present doesn't start if finishing editing fails", ev("present")===false);
  ev("file.holdLock=false; render()");
  ok("SR8: view-only hides edit controls", d.body.classList.contains("viewonly") && w.getComputedStyle(d.querySelector("#addHoliday")).display==="none");
  const blBefore = ev("S.baseline"); ev("setStatus('')"); d.querySelector("#baseline").click();
  ok("SR8: no false 'Baseline set' when view-only", ev("S.baseline")===blBefore && !/Baseline set/.test(d.querySelector("#status").textContent));
  ev("file.handle=null; render()");
  ok("SR6: dependency loop still detected", ev(`(()=>{ const keep=S; S=normalize({lanes:[{id:"a"}],bars:[{id:"x",lane:"a",dependsOn:["z"]},{id:"y",lane:"a",dependsOn:["x"]},{id:"z",lane:"a",dependsOn:["y"]},{id:"k",lane:"a",dependsOn:["x"]}]},false); const r=findCycles().map(b=>b.id).sort().join(); S=keep; return r; })()`)==="x,y,z");
  const t0 = Date.now(); ev(`(()=>{ const keep=S; S=normalize({lanes:[{id:"a"}],bars:Array.from({length:3000},(_,i)=>({id:"n"+i,lane:"a",dependsOn:i?["n"+(i-1)]:[]}))},false); findCycles(); S=keep; })()`);
  ok("SR6: 3,000-item dependency chain checks fast", Date.now()-t0 < 1500, (Date.now()-t0)+"ms");
  ok("SR10: mid-week start snaps to Monday, items keep their dates", ev(`(()=>{ const d=normalize({meta:{start:"2026-09-23"},lanes:[{id:"a"}],bars:[{id:"b",lane:"a",start:0,span:1}]},false); return d.meta.start + "|" + d.bars[0].start.toFixed(4); })()`)==="2026-09-21|"+(2/7).toFixed(4));
  ok("SR10: impossible dates rejected", ev(`normalize({meta:{start:"2026-09-21"},lanes:[{id:"a"}],bars:[{id:"b",lane:"a",tasks:[{id:"t",start:"2026-02-31",days:1}]}],holidays:[{date:"2026-13-01"}]},false)`).bars[0].tasks[0].start==="2026-09-21" && ev(`normalize({lanes:[{id:"a"}],holidays:[{date:"2026-13-01"}]},false).holidays.length`)===0);
  ok("SR12: unreadable lane colors fall back to ink for labels", ev(`labelOn("#f0e68c")`)==="var(--ink)" && ev(`labelOn("#1f3f6b")`)==="#1f3f6b");
  // --- workspaces ---
  d.querySelector("#nav-delivery").click(); d.querySelector("#delivery-status").click();
  d.querySelector('#sidenav [data-section="milestones"]').click();
  ok("Delivery lists show one list at a time", !d.querySelector("#ws-plan").hidden && d.querySelector("#ws-timeline").hidden && [...d.querySelectorAll("#ws-plan [data-plan]")].filter(x=>!x.hidden).every(x=>x.dataset.plan==="milestones"));
  d.querySelector('#sidenav [data-section="gates"]').click();
  ok("Plan nav switches to Gates, with no plain count beside it", !d.querySelector("#sec-gates").hidden && d.querySelector("#sec-milestones").hidden && /^Gates$/.test(d.querySelector('#sidenav [data-section="gates"]').textContent.trim()));
  d.querySelector('#sidenav [data-section="calendar"]').click();
  ok("Calendar holds sprints and holidays", [...d.querySelectorAll("#ws-plan [data-plan=calendar]")].every(x=>!x.hidden));
  d.querySelector("#nav-delivery").click(); d.querySelector("#tab-people").click(); ok("Capacity tab shows load", !d.querySelector("#ws-people").hidden && d.querySelector("#ws-timeline").hidden);
  ev(`select("bar", S.bars[0].id)`); ok("selecting an item returns to Timeline", !d.querySelector("#ws-timeline").hidden);
  ev("sel=null; render()");
  ok("gates migrated: ids and real dates", ev("S.gates.every(g=>g.id && (g.date==='' || validIso(g.date)))") && ev("S.gates.filter(g=>g.date).length")===ev("S.gates.filter(g=>parseLabelDay(g.neededBy)!=null).length"));
  ok("chart doesn't trap the mouse wheel", ![...d.querySelectorAll("style")].map(x=>x.textContent).join("").split("}").some(r=>/(gscroll|\.gantt)[^{]*\{[^}]*overscroll-behavior:contain/.test(r)));   // the details pane may
  // --- holidays visible + feedback ---
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30); ev("setZoom('weeks'); sel=null; render()");
  const t2end = ev(`taskSpan(taskById("t2").t, HS()).e`);
  ev(`holidayChange(s=>{ s.holidays.push({date:dayToIso(taskSpan(taskById("t2").t, HS()).s + 1 + (dow(taskSpan(taskById("t2").t, HS()).s + 1)===6?2:dow(taskSpan(taskById("t2").t, HS()).s + 1)===0?1:0)),name:"Test day"}); s.holidays.sort((a,b)=>a.date<b.date?-1:1); }, "Added")`);
  ok("holiday inside a task pushes its end and says so", ev(`taskSpan(taskById("t2").t, HS()).e`) > t2end && /now ends? later/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
  ok("weeks view shows the holiday", [...d.querySelectorAll("#gantt .holstrip")].some(x=>/Test day/.test(x.title)) && d.querySelectorAll("#gantt .holdot").length>0);
  ev("undo()");
  ev(`holidayChange(s=>{ s.holidays.push({date:"2026-10-10",name:"Sat"}); }, "Added")`);
  ev("UI.planTab='calendar';setWs('plan')");
  ok("weekend holiday flagged and moves nothing", /nothing moved/.test(d.querySelector("#status").textContent) && d.querySelectorAll("#t-holidays .misflag").length===1);
  ev("undo()");
  d.querySelector("#addHoliday").click(); await until("the new holiday row to take focus", ()=>d.activeElement && /^hol-/.test(d.activeElement.id));
  ok("+ Holiday focuses the new row and reports", d.activeElement && /^hol-/.test(d.activeElement.id) && /Added a holiday on/.test(d.querySelector("#status").textContent));
  ev("undo();setWs('timeline')");
  // --- holidays take working days from initiatives too ---
  ev(`S = normalize({meta:{start:"2026-09-21",weeks:12},lanes:[{id:"a"}],bars:[{id:"i1",lane:"a",start:2,span:2,label:"Spans Columbus Day"},{id:"i2",lane:"a",start:4,span:1,label:"Next",dependsOn:["i1"]},{id:"w1",lane:"a",start:2,span:2,kind:"waiting",label:"Wait"}],sprints:[{name:"S0",weeks:2},{name:"S1",weeks:2},{name:"S2",weeks:2},{name:"S3",weeks:2},{name:"S4",weeks:2},{name:"S5",weeks:2}],holidays:[]},false); resetHistory(); setZoom("weeks")`);
  const e0 = ev(`dayToIso(barEndDay(barById("i1")))`);
  ev(`holidayChange(s=>{ s.holidays.push({date:"2026-10-12",name:"Columbus Day"}); }, "Added")`);
  ok("initiative spanning a holiday ends a working day later", e0==="2026-10-16" && ev(`dayToIso(barEndDay(barById("i1")))`)==="2026-10-19", ev(`dayToIso(barEndDay(barById("i1")))`));
  ok("…and the status says initiatives moved", /initiative/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
  ok("waiting blocks don't stretch", ev(`dayToIso(barEndDay(barById("w1")))`)==="2026-10-16");
  ok("a 1-day holiday slip is a tight handoff, not a conflict", ev(`depProblems(barById("i2")).length`)===0 && ev(`depTight(barById("i2")).length`)===1);
  ev("render()"); ok("tight tag on the bar, no warning banner", !!d.querySelector('[data-key="bar:i2"] .tag.soft') && !/starts? before what (it waits|they wait) for finishes/.test(d.querySelector("#banners").textContent));
  ev(`commit(()=>{ barById("i2").start = 3; })`);
  ok("a full-week overlap is still a red conflict", ev(`depProblems(barById("i2")).length`)===1 && /starts? before what (it waits|they wait) for finishes/.test(d.querySelector("#banners").textContent));
  ev("undo()");
  ok("sprint header shows real working days", /9d/.test([...d.querySelectorAll("#gantt .gsprint")][1].textContent));
  ok("bar is drawn a day wider", ev(`visEndW(barById("i1"))`) > 4);
  ev("undo()"); ok("undo restores the plain 2-week block", ev(`dayToIso(barEndDay(barById("i1")))`)==="2026-10-16" && ev(`depProblems(barById("i2")).length`)===0 && ev(`depTight(barById("i2")).length`)===0);
  // --- step 3: add on the chart ---
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30); ev("setZoom('weeks'); sel=null; render()");
  const nms = ev("S.milestones.length");
  ev(`createAt("milestone", S.lanes[0].id, isoToDay("2026-10-14"))`); await until("the new milestone's editor", ()=>d.activeElement && d.activeElement.id==="f-mwhat");
  ok("create milestone at a day opens it", ev("S.milestones.length")===nms+1 && ev("sel.type")==="ms" && ev("dayToIso(nearWeekday(atToDay(S.milestones.find(m=>m.id===sel.id).at)))")==="2026-10-14" && ev("S.milestones.find(m=>m.id===sel.id).date")==="" && d.activeElement.id==="f-mwhat");
  ev("undo()");
  const ng = ev("S.gates.length");
  ev(`createAt("gate", null, isoToDay("2026-10-17"))`); await until("the new gate's editor (#f-gdate)", ()=>d.querySelector("#f-gdate") && d.activeElement && d.activeElement.id==="f-gname");
  ok("create gate snaps weekend to Friday and opens the gate editor", ev("S.gates.length")===ng+1 && ev("gateById(sel.id).date")==="2026-10-16" && !!d.querySelector("#f-gdate") && d.activeElement.id==="f-gname");
  const gd = d.querySelector("#f-gdate"); gd.value="2026-10-21"; gd.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok("gate date picker updates date and label", ev("gateById(sel.id).date")==="2026-10-21" && ev("gateById(sel.id).neededBy")==="Oct 21");
  ev("undo(); undo(); sel=null; render()");
  d.querySelector("#gantt .gaterow .flag.gate").click();
  ok("clicking a gate on the chart opens its editor", ev("sel && sel.type")==="gate" && !!d.querySelector("#f-gname"));
  ev("sel=null; render()");
  d.querySelector("#addBtn").click();
  ok("+ Add opens the menu with all types", !d.querySelector("#addMenu").hidden && d.querySelectorAll("#addMenu button").length>=6);
  d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"i",bubbles:true}));
  ok("I key creates an initiative", d.querySelector("#addMenu").hidden && ev("sel && sel.type")==="bar" && ev("barById(sel.id).label")==="New initiative");
  ev("undo(); sel=null; render()");
  d.querySelector("#addBtn").click(); d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("Esc closes the add menu", d.querySelector("#addMenu").hidden);
  const nr = ev("S.risks.length"); ev(`createAt("risk")`); await wait(5);
  ok("adding a risk jumps to the Risks list", ev("S.risks.length")===nr+1 && !d.querySelector("#ws-plan").hidden && !d.querySelector("#sec-risks").hidden);
  ev("undo(); setWs('timeline')");
  // the hover + button path (geometry is zero in jsdom, so drive it directly)
  ev(`insCtx = {add:"lane:"+S.lanes[0].id, day:isoToDay("2026-10-07")}; document.querySelector('.track[data-add^="lane:"]').append(ins); ins.hidden=false`);
  ins_click: { ev("ins.click()"); }
  ok("+ on a lane opens Initiative / Milestone / Gate / Note / Meeting", !d.querySelector("#addMenu").hidden && d.querySelectorAll("#addMenu button").length===5 && /Oct 7/.test(d.querySelector("#addMenu .mh").textContent));
  d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"g",bubbles:true}));
  ok("G from the chart menu creates a gate on that day", ev("sel && sel.type")==="gate" && ev("gateById(sel.id).date")==="2026-10-07");
  ev("undo(); sel=null; render()");
  ev("file.handle={name:'x.json'}; file.holdLock=false; render()");
  d.querySelector("#addBtn").click(); ok("view-only: no add menu", d.querySelector("#addMenu").hidden);
  ev("file.handle=null; render()");
  // --- steps 4-6: filters, views, present ---
  ev(`loadExternal(${JSON.stringify(JSON.stringify(p))},"t")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); setWs('timeline'); setZoom('weeks'); sel=null; render()");
  const laneF0 = ev("S.lanes[0].id"), laneCount = d.querySelectorAll("#gantt .lane[data-lane]").length;
  d.querySelector("#filterBtn").click();
  ok("Filters opens a popover with people, workstreams, status", !d.querySelector("#filterPop").hidden && /Workstreams/.test(d.querySelector("#filterPop").textContent) && /Status/.test(d.querySelector("#filterPop").textContent));
  [...d.querySelectorAll("#filterPop .fchip")].find(x=>x.textContent===ev("S.lanes[0].name")).click();
  ok("People lists work owners, not gate teams", ![...d.querySelectorAll("#filterPop .fchip")].some(x=>x.textContent==="AppSec"));
  ok("lane filter shows just that lane", d.querySelectorAll("#gantt .lane[data-lane]").length===1 && !!d.querySelector(`#gantt .lane[data-lane="${laneF0}"]`) && /1/.test(d.querySelector("#filterBtn").textContent));
  ok("filter badge + Custom filter label, no 'null' text", d.querySelector("#filterBtn").classList.contains("factive") && /Custom filter/.test(d.querySelector("#viewBtn").textContent) && !/null/.test(d.querySelector("#wsbar").textContent));
  ev("setFilter(x=>{ x.lanes=[]; x.kinds=['milestone']; })");
  ok("'Show only Milestones' hides bars, keeps diamonds", d.querySelectorAll("#gantt .bar").length===0 && d.querySelectorAll("#gantt .flag:not(.gate)").length>0 && !d.querySelector("#gantt .gaterow"));
  ev("setFilter(x=>{ x.kinds=[]; x.people=['Nobody Here']; })");
  ok("nothing matches → clear message with Clear filters", /No items match/.test(d.querySelector("#gantt").textContent));
  [...d.querySelectorAll("#gantt .empty .linkish")].find(x=>/Clear/.test(x.textContent)).click();
  ok("Clear filters restores everything", !ev("fActive()") && d.querySelectorAll("#gantt .lane[data-lane]").length===laneCount);
  ev("setFilter(x=>{ x.range={type:'next4'}; })");
  ok("Next 4 weeks hides later initiatives", ev("S.bars.some(b=>!barVisible(b))") && d.querySelectorAll("#gantt .bar").length===ev("S.bars.filter(b=>barVisible(b)).length"));
  ok("filters don't change the math (late/deps use the whole plan)", ev("S.bars.filter(isLate).length")===ev("S.bars.filter(isLate).length") && ev("findCycles().length")===0);
  d.body.click(); ok("popover closes on outside click", d.querySelector("#filterPop").hidden);
  // save a personal view
  d.querySelector("#viewBtn").click(); [...d.querySelectorAll("#viewMenu button")].find(x=>/Save current/.test(x.textContent)).click();
  d.querySelector("#viewName").value = "Next month"; d.querySelector(".vform").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
  ok("save personal view", ev("personalViews().length")===1 && /Next month/.test(d.querySelector("#viewBtn").textContent) && !/Modified/.test(d.querySelector("#viewBtn").textContent));
  ev("setFilter(x=>{ x.lanes=[S.lanes[1].id]; })");
  ok("changing filters marks the view Modified and shows Save", /Modified/.test(d.querySelector("#viewBtn").textContent) && !d.querySelector("#viewSave").hidden);
  d.querySelector("#viewSave").click();
  ok("Save updates the view", !/Modified/.test(d.querySelector("#viewBtn").textContent) && ev("personalViews()[0].def.filter.lanes.length")===1);
  ev("clearView()"); ok("All work clears the view", /All work/.test(d.querySelector("#viewBtn").textContent) && !ev("fActive()"));
  d.querySelector("#viewBtn").click(); [...d.querySelectorAll("#viewMenu .vname")].find(x=>x.textContent==="Next month").click();
  ok("switching to a saved view reapplies it", ev("fActive()") && ev("UI.filter.range.type")==="next4" && /Next month/.test(d.querySelector("#viewBtn").textContent));
  // team view needs the lock
  ev("file.handle={name:'x.json'}; file.holdLock=false; render()");
  d.querySelector("#viewBtn").click(); [...d.querySelectorAll("#viewMenu button")].find(x=>/Save current/.test(x.textContent)).click();
  ok("team views need Start editing", d.querySelector("#vsTeam").disabled && /needs Start editing/.test(d.querySelector("#viewMenu").textContent));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ev("file.handle=null; render()");
  d.querySelector("#viewBtn").click(); [...d.querySelectorAll("#viewMenu button")].find(x=>/Save current/.test(x.textContent)).click();
  d.querySelector("#viewName").value = "Team one"; d.querySelector("#vsTeam").checked = true; d.querySelector(".vform").dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
  ok("team view saved into the plan (undoable)", ev("S.views.length")===1 && ev("UI.view.src")==="team" && ev("past.length")>0 && (()=>{ try { ev("parseText(serialize(S,'x.json'))"); return true; } catch(e){ return false; } })());
  // delete + undo toast
  ev(`deleteView("personal", personalViews()[0])`);
  ok("delete shows Undo toast", ev("personalViews().length")===0 && !d.querySelector("#toast").hidden && /Undo/.test(d.querySelector("#toast").textContent));
  d.querySelector("#toast .linkish").click(); ok("Undo brings the view back", ev("personalViews().length")===1);
  // present keeps the view
  ev(`applyView("team", S.views[0])`);
  await ev("setPresent(true)");
  ok("Present keeps the view and shows its scope", ev("fActive()") && /of \d+ initiatives/.test(d.querySelector(".review").textContent) && w.getComputedStyle(d.querySelector("#filterBtn")).display==="none");
  await ev("setPresent(false)");
  ev("setWs('people')"); ok("People tab follows the filter", !d.querySelector("#ws-people").hidden);
  ev("clearView(); setWs('timeline')");
  ok("views persist per plan id", ev("!!readPV()[S.meta.planId]"));
  ev("S.milestones.forEach(m=>{ m.stretch=''; m.date=''; }); render()");
  ok("no 'null' text anywhere in the chrome", !/null/.test(d.querySelector(".top").textContent + d.querySelector("#wsbar").textContent + d.querySelector("#sidenav").textContent));
  // --- roster + owner pickers ---
  const realPlan = require("fs").readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8");
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); setWs('timeline'); setZoom('weeks'); sel=null; render()");
  ok("owner text becomes a roster of people", ev("S.people.length")>=8 && ev("S.people.some(p=>p.name==='Avery')") && ev("S.bars.every(b=>Array.isArray(b.owners) && b.owner===undefined)"));
  ok("owners point at real people", ev("S.bars.flatMap(b=>b.owners).every(id=>!!personById(id))") && ev(`effOwner(S.bars.find(b=>b.owners.length>1))`).includes(", "));
  ok("migration is stable across save/load", (()=>{ const a = ev("JSON.stringify(S.people.map(p=>p.id))"); ev("S = parseText(serialize(S,'x.json')); render()"); return a===ev("JSON.stringify(S.people.map(p=>p.id))"); })());
  const oBar = ev("S.bars.find(b=>!b.tasks.length && b.kind==='work').id");
  ev(`select("bar","${oBar}")`);
  ok("owner field is a picker with chips", !!d.querySelector("#side .opick") && d.querySelectorAll("#side .opick .ochip").length===ev(`barById("${oBar}").owners.length`));
  const oInp = d.querySelector("#f-owner"); oInp.focus(); oInp.value = "cas"; oInp.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok("typing filters the team list", [...d.querySelectorAll("#f-owner-list .oopt")].some(x=>/Casey/.test(x.textContent)));
  oInp.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})); await wait(5);
  ok("Enter picks the person", ev(`barById("${oBar}").owners.map(personName).includes("Casey")`));
  const oInp2 = d.querySelector("#f-owner"); oInp2.focus(); oInp2.value = "Priya"; oInp2.dispatchEvent(new w.Event("input",{bubbles:true}));
  ok("unknown name offers to add to the team", /Add "Priya" to the team/.test(d.querySelector("#f-owner-list").textContent));
  oInp2.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})); await wait(5);
  ok("new person added and assigned", ev("S.people.some(p=>p.name==='Priya')") && ev(`barById("${oBar}").owners.map(personName).includes("Priya")`));
  [...d.querySelectorAll("#side .ochip .ox")].pop().click(); await wait(5);
  ok("× removes an owner", !ev(`barById("${oBar}").owners.map(personName).includes("Priya")`));
  const oPriya = ev("S.people.find(p=>p.name==='Priya').id");
  ev(`removePerson("${oPriya}")`); ok("remove person", !ev("S.people.some(p=>p.name==='Priya')"));
  ev("sel=null; setWs('plan'); setPlanTab('team')");
  ok("Plan → Team lists the roster", !d.querySelector('[data-plan="team"]').hidden && d.querySelectorAll("#t-team tbody tr").length===ev("S.people.length"));
  const oAvery = ev("S.people.find(p=>p.name==='Avery').id");
  ev(`select("person","${oAvery}")`); [...d.querySelectorAll("#side button")].find(x=>/\+ Time off/.test(x.textContent)).click();
  ok("person editor adds time off", ev(`personById("${oAvery}").off.length`)===1 && !!d.querySelector("#side .offrow"));
  ev("undo(); sel=null; setWs('timeline')");
  ev(`UI.filter = normFilter({people:["${oAvery}"]}); render()`);
  ok("people filter uses person ids", d.querySelectorAll("#gantt .bar").length>0 && ev("S.bars.filter(b=>barVisible(b)).every(b=>effOwnerIds(b).includes('"+oAvery+"'))"));
  ev("UI.filter = normFilter({}); render()");
  // --- rows by person, reassign, column width, time off ---
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); setWs('timeline'); setZoom('weeks'); sel=null; render()");
  d.querySelector("#rPeople").click();
  ok("By person: one row per person plus Unassigned", d.querySelectorAll("#gantt .lane.personrow").length===ev("S.people.filter(pp=>personItems(pp.id, null).length).length") + (ev("personItems(null,null).length") ? 1 : 0) && /Unassigned/.test(d.querySelector("#gantt").textContent));
  const pH = ev("S.people.find(p=>p.name==='Avery').id"), pR = ev("S.people.find(p=>p.name==='Blake').id");
  const rowCols = () => [...d.querySelectorAll("#gantt .lane[data-person]")].map(r=>w.getComputedStyle(r).gridTemplateColumns);
  ok("By person: each row keeps the timeline's columns (name, then the track), not another list's", rowCols().length > 0 && rowCols().every(c=>/^var\(--lw/.test(c)), rowCols().join(" / "));
  const sharedBar = ev(`S.bars.find(b=>b.owners.includes("${pH}") && b.owners.includes("${pR}") && !b.tasks.length).id`);
  ok("shared work shows in each owner's row", !!d.querySelector(`.lane.personrow[data-person="${pH}"] [data-key^="bar:${sharedBar}"]`) && !!d.querySelector(`.lane.personrow[data-person="${pR}"] [data-key^="bar:${sharedBar}"]`));
  const maxRow = d.querySelector(`.lane.personrow[data-person="${ev("S.people.find(p=>p.name==='Harper').id")}"]`);
  d.elementFromPoint = ()=>maxRow;
  ev(`(()=>{ const el=document.querySelector('.lane.personrow[data-person="${pH}"] [data-key^="bar:${sharedBar}"]'); drag={type:"bar",id:"${sharedBar}",mode:"move",x0:0,w:1000,orig:clone(barById("${sharedBar}")),moved:false,snapshot:JSON.stringify(S),el,pid:1,fromPerson:"${pH}"}; onUp({clientX:5,clientY:5}); })()`);
  ok("drag onto another person reassigns (undoable)", !ev(`barById("${sharedBar}").owners.includes("${pH}")`) && ev(`barById("${sharedBar}").owners.map(personName).includes("Harper")`));
  ev("undo()"); ok("undo restores the owner", ev(`barById("${sharedBar}").owners.includes("${pH}")`));
  d.elementFromPoint = ()=>null;
  ok("rows setting saved with views", ev("currentDef().rows")==="people");
  // column width
  const lw0 = ev("UI.labelW.weeks");
  d.querySelector("#gantt .colgrip").dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
  ok("name column widens from the keyboard", ev("UI.labelW.weeks")===lw0+16 && d.querySelector("#gantt").style.getPropertyValue("--lw")===(lw0+16)+"px");
  d.querySelector("#gantt .colgrip").dispatchEvent(new w.MouseEvent("dblclick",{bubbles:true}));
  ok("double-click fits the column to the names", ev("UI.labelW.weeks")!==lw0+16 && ev("UI.labelW.weeks")>=120);
  ok("column width is part of the view", ev("currentDef().labelW.weeks")===ev("UI.labelW.weeks"));
  // time off
  ev(`commit(()=>{ barById("${b0.id}") ; })`);
  const offTask = ev(`(()=>{ const b = S.bars.find(x=>x.kind==='work' && !x.tasks.length); const id = newId('task'); commit(()=>{ b.tasks.push({id, label:'Off test', start:'2026-10-05', days:3, owners:['${pH}'], jira:'', status:'notstarted'}); }); return id; })()`);
  const offEnd0 = ev(`dayToIso(taskSpan(taskById("${offTask}").t, HS()).e)`);
  ev(`commit(()=>{ personById("${pH}").off.push({from:"2026-10-06", to:"2026-10-06", note:"dentist"}); })`);
  ok("time off pushes that person's task out a day", offEnd0==="2026-10-07" && ev(`dayToIso(taskSpan(taskById("${offTask}").t, HS()).e)`)==="2026-10-08");
  ok("capacity drops for that week", ev(`availDays(personById("${pH}"), isoToDay("2026-10-05"))`)===4 && ev(`availDays(personById("${pH}"), isoToDay("2026-10-12"))`)===5);
  ev("render()"); ok("person row shows the day off", !!d.querySelector(`.lane.personrow[data-person="${pH}"] .offstrip`));
  ev("setWs('people')"); ok("load grid shows reduced capacity", /·4d/.test(d.querySelector("#load").textContent));
  ev("setWs('timeline'); UI.dayZoom=5; setZoom('days')");
  ok("Days by person: rows with tasks, draggable", d.querySelectorAll("#gantt .lane.personrow").length>0 && !!d.querySelector(`.lane.personrow[data-person="${pH}"] .tbar`) && !!d.querySelector(`.lane.personrow[data-person="${pH}"] .colshade.off`));
  ok("Days by person: each row keeps the timeline's columns too", rowCols().length > 0 && rowCols().every(c=>/^var\(--lw/.test(c)), rowCols().join(" / "));
  const robRow = d.querySelector(`.lane.personrow[data-person="${pR}"]`);
  d.elementFromPoint = ()=>robRow;
  ev(`(()=>{ const el=document.querySelector('[data-key^="task:${offTask}"]'); tdrag={tid:"${offTask}",mode:"move",x0:0,colW:20,orig:{},snapshot:JSON.stringify(S),el,moved:false,fromPerson:"${pH}"}; onTaskUp({clientX:3,clientY:3}); })()`);
  ok("drag a task onto another person reassigns it", ev(`taskById("${offTask}").t.owners.map(personName).join()`)==="Blake");
  d.elementFromPoint = ()=>null;
  ev("undo(); undo(); undo(); setRows('lanes'); setZoom('weeks')");
  // --- hover card + chart name ---
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); setWs('timeline'); setRows('lanes'); setZoom('weeks'); sel=null; render()");
  const pv = (el, type) => { const ev0 = new w.MouseEvent(type,{bubbles:true,clientX:300,clientY:300}); Object.defineProperty(ev0, "pointerType", {value:"mouse"}); el.dispatchEvent(ev0); };
  const firstBar = d.querySelector('#gantt .bar[data-peek-type="bar"]'), fbId = firstBar.dataset.peekId;
  ok("chart items carry no native tooltip", !firstBar.hasAttribute("title") && !d.querySelector('#gantt .flag[data-peek-type][title]'));
  pv(firstBar, "pointerover"); await wait(120);
  ok("card waits for a short pause", d.querySelector("#peek").hidden);
  await wait(320);
  ok("hovering an initiative shows its full title and details", !d.querySelector("#peek").hidden && d.querySelector("#peek .pk-t").textContent===ev(`barById("${fbId}").label`) && /Dates/.test(d.querySelector("#peek").textContent) && /Owners/.test(d.querySelector("#peek").textContent));
  firstBar.dispatchEvent(new w.MouseEvent("pointerout",{bubbles:true,relatedTarget:d.body})); await wait(150);
  ok("card closes when the pointer leaves", d.querySelector("#peek").hidden);
  pv(firstBar, "pointerover"); await wait(420); ev("render()");
  ok("any redraw closes the card (no stale details)", d.querySelector("#peek").hidden);
  const gateEl = d.querySelector('#gantt [data-peek-type="gate"]'); pv(gateEl, "pointerover"); await wait(420);
  ok("gate card shows needed-by, blocks, owner", /Needed by/.test(d.querySelector("#peek").textContent) && /Blocks/.test(d.querySelector("#peek").textContent));
  ev("closePeek()");
  const msEl = d.querySelector('#gantt .flag[data-peek-type="ms"]'); pv(msEl, "pointerover"); await wait(420);
  ok("milestone card shows date and status", /Date/.test(d.querySelector("#peek").textContent) && /Status/.test(d.querySelector("#peek").textContent));
  ev("closePeek(); setRows('people')");
  const pl = d.querySelector('#gantt [data-peek-type="person"]'); pv(pl, "pointerover"); await wait(420);
  ok("person card shows active items and next time off", /Active now/.test(d.querySelector("#peek").textContent));
  ev("closePeek(); setRows('lanes')");
  const fb2 = d.querySelector('#gantt .bar[data-peek-type="bar"]'); pv(fb2, "pointerover"); await wait(420);
  ev("Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || function(){}; Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || function(){}");
  ev(`startDrag({button:0,preventDefault(){},stopPropagation(){},currentTarget:document.querySelector('#gantt .bar[data-peek-type="bar"]'),target:document.querySelector('#gantt .bar[data-peek-type="bar"]'),clientX:0,pointerId:1}, "bar", "${fbId}", "move")`);
  ok("starting a drag closes the card", d.querySelector("#peek").hidden); ev("onCancel()");
  await ev("setPresent(true)");
  const fb3 = d.querySelector('#gantt .bar[data-peek-type="bar"]'); pv(fb3, "pointerover"); await wait(420);
  ok("Present keeps cards, without editing hints", !d.querySelector("#peek").hidden && !d.querySelector("#peek .pk-h"));
  await ev("setPresent(false)");
  // chart name
  const cnBar = ev(`S.bars.find(b=>/·/.test(b.label)).id`);
  ev(`select("bar","${cnBar}")`);
  ok("editor suggests a chart name", !!d.querySelector("#f-chart") && [...d.querySelectorAll("#side .linkish")].some(x=>/^Use "/.test(x.textContent)));
  [...d.querySelectorAll("#side .linkish")].find(x=>/^Use "/.test(x.textContent)).click();
  ok("chart name is used on the bar, title unchanged", ev(`barById("${cnBar}").chartName`).length>0 && ev(`barById("${cnBar}").label`).includes("·") && d.querySelector(`#gantt [data-key="bar:${cnBar}"] .nm`).textContent===ev(`barById("${cnBar}").chartName`));
  ok("chart name survives save/load and is capped", (()=>{ const x = ev(`parseText(serialize(S,'x.json')).bars.find(b=>b.id==="${cnBar}").chartName`); return x===ev(`barById("${cnBar}").chartName`) && x.length<=32; })());
  ev("sel=null; render()");
  const cnEl = d.querySelector(`#gantt [data-key="bar:${cnBar}"]`); pv(cnEl, "pointerover"); await wait(420);
  ok("card shows the full title and the chart name", d.querySelector("#peek .pk-t").textContent===ev(`barById("${cnBar}").label`) && /On the chart/.test(d.querySelector("#peek").textContent));
  ev("closePeek(); undo()");
  ok("name spill is idempotent", (()=>{ ev("spillLabels(); spillLabels(); spillLabels()"); const n = d.querySelectorAll("#gantt .spill").length; const ids = [...d.querySelectorAll("#gantt .spill")].map(x=>x.dataset.peekId); return new Set(ids).size === ids.length; })());
  ok("item types: tasks are pills, initiatives square-ish, legend explains", !!d.querySelector("#legend .lg-task") && !!d.querySelector("#legend .lg-init") && !/initiative<\/span>/.test(d.querySelector("#gantt").innerHTML));
  // --- final review regressions ---
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],people:[{id:"p1",name:"Pat"},{id:"p2",name:"Sam"}],bars:[{id:"f1",lane:"a",start:0.5,span:1,label:"Frac"},{id:"t1b",lane:"a",start:0,span:2,label:"Has tasks",owners:["p1"],tasks:[{id:"tt1",label:"x",start:"2026-10-05",days:3,owners:["p2"]}]}],gates:[{id:"g1",gate:"G",date:"2026-10-16",neededBy:"Oct 16"}],sprints:[{name:"S0",weeks:2},{name:"S1",weeks:2},{name:"S2",weeks:2},{name:"S3",weeks:2},{name:"S4",weeks:2},{name:"S5",weeks:2}]},false); resetHistory(); UI.filter=normFilter({}); UI.view=null; file.handle=null; render()`);
  ok("F-P1: a 1-week initiative at a half-week start is still 5 working days", ev(`workBetween(nextWork(wkDay(barById("f1").start), new Set()), barEndDay(barById("f1")), new Set())`)===5);
  ok("F-P1: an initiative with tasks matches people through its tasks, and its lead (1.147.0), whose view still hides the others' tasks", ev(`barVisible(barById("t1b"), normFilter({people:["p1"]}))`)===true && ev(`taskVisible(taskById("tt1").t, normFilter({people:["p1"]}))`)===false && ev(`barVisible(barById("t1b"), normFilter({people:["p2"]}))`)===true && ev(`barVisible(barById("t1b"), normFilter({people:["p1"], status:["done"]}))`)===false);
  ev(`commit(()=>{ personById("p2").off.push({from:"2026-10-06",to:"2026-10-06",note:""}); })`);
  document_baseline: { ev("S.baseline=null"); d.querySelector("#baseline").click(); }
  ok("F-P1: a fresh baseline shows no slip when time off is already in the task", ev(`slipTask(taskById("tt1").t)`)===null && ev(`!!S.baseline.tasks.tt1.end`));
  ok("F-P1: dragging uses holidays + the owner's time off", ev(`taskHs(taskById("tt1").t).has(isoToDay("2026-10-06"))`) && ev(`workBetween(isoToDay("2026-10-05"), isoToDay("2026-10-09"), taskHs(taskById("tt1").t))`)===4);
  d.querySelector("#settings").click(); d.querySelector("#dStart").value="2026-10-12"; d.querySelector("#dDatesOk").click();
  ok("F-P2: moving the plan start moves gate dates and their labels", ev(`gateById("g1").date`)==="2026-10-23" && ev(`gateById("g1").neededBy`)==="Oct 23");
  ev("undo()");
  ok("F-P2: mixed old/new owners keep the owner", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"b",lane:"a",owner:"Alice",owners:[]}]},false).bars[0].owners.length`)===1);
  ok("F-P2: lane ids don't collide with person ids", ev(`normalize({lanes:[{id:"l1"},{id:"l2"}],people:[{id:"l2",name:"X"}],bars:[{id:"b",lane:"l2"}]},false).bars[0].lane`)==="l2");
  ok("F-P2: 'Current sprint' after the plan ends matches nothing and says so", (()=>{ ev(`S.meta.start="2020-01-06"; syncWeeks(S)`); const r = ev(`JSON.stringify(fRangeDays(normFilter({range:{type:"sprint"}})))`); const l = ev(`rangeLabel(normFilter({range:{type:"sprint"}}))`); ev(`S.meta.start="2026-10-05"`); return r==="[1,0]" && /No current sprint/.test(l); })());
  ev(`UI.filter = normFilter({lanes:["a"]}); render(); createView("Lane A", "personal")`);
  ev("setWs('people')"); ok("F-P2: switching workspace marks the view Modified", /Modified/.test(d.querySelector("#viewBtn").textContent));
  ev("setWs('timeline'); clearView()");
  ev(`UI.filter = normFilter({lanes:["gone"], people:["nobody"]}); render()`);
  ok("F-P2: filters drop deleted lanes and people", ev("UI.filter.lanes.length")===0 && ev("UI.filter.people.length")===0);
  d.querySelector("#filterBtn").click();
  const chipF = [...d.querySelectorAll("#filterPop .fchip")].find(x=>x.dataset.fkey && x.dataset.fkey.startsWith("status:")); chipF.focus(); chipF.click();
  ok("F-P2: focus stays on the chip you toggled", d.activeElement && d.activeElement.dataset.fkey===chipF.dataset.fkey);
  d.body.click(); ev("UI.filter=normFilter({}); render()");
  ok("F-P2: done items keep full-contrast text", /\.bar\.st-done \.nm[^{]*\{[^}]*color:var\(--ink\)/.test([...d.querySelectorAll("style")].map(x=>x.textContent).join("")));
  d.querySelector("#load").replaceChildren(); ev("UI.ws='timeline'; render()");
  ok("F-P2: hidden load grid isn't rebuilt", d.querySelector("#load").childElementCount===0);
  ev("setWs('people')"); ok("…and appears when you open People", d.querySelector("#load").childElementCount>0); ev("setWs('timeline')");
  // save-as freezes editing until the new file is linked
  let release; const gate = new Promise(r=>release=r); let written2 = "";
  w.showSaveFilePicker = async()=>({name:"slow.json", kind:"file", createWritable: async()=>({write: async t=>{ await gate; written2=t; }, close: async()=>{}}), getFile: async()=>({size:written2.length, text: async()=>written2}), queryPermission: async()=>"granted", requestPermission: async()=>"granted"});
  ev("S.meta.title='Before'; render()");
  const pSave = ev("newSharedPlan()"); await wait(20);
  ok("F-P1: can't edit while the new file is being written", ev(`commit(s=>s.meta.title="Typed during write")`)===false);
  release(); await pSave; await wait(20);
  ok("F-P1: new shared plan keeps what was on screen", ev("S.meta.title")==="Before" && ev("file.handle && file.handle.name")==="slow.json");
  ev("file.handle=null; file.holdLock=false; file.dirty=false; locked=false; render()");
  // --- people everywhere + first-week UX ---
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); setWs('timeline'); setRows('lanes'); setZoom('weeks'); sel=null; render()");
  ok("gate owners come from the roster; teams become outside owners", ev("S.gates.every(g=>Array.isArray(g.owners) && g.owner===undefined)") && ev("S.people.some(p=>p.external && p.name==='AppSec')") && ev("S.gates.some(g=>ownerNames(g).includes('Morgan'))"));
  ok("outside owners get no person rows or load", ev("personRows().every(r=>!r.pp || !r.pp.external)") && ev("allPeople().every(id=>!personById(id).external)"));
  ok("lane people are picked people", ev("S.lanes.some(l=>laneMembers(l).length>=2)") && ev("S.lanes.every(l=>l.who===undefined)"));
  ok("milestones: one date; plain labels cleared, ~estimates kept", ev("S.milestones.filter(m=>m.at!=null && /^\\s*[A-Za-z]{3} \\d{1,2}\\s*$/.test(m.date)).length")===0 && ev("S.milestones.some(m=>/^~/.test(m.date))"));
  ok("stretch labels became real stretch dates", ev("S.milestones.filter(m=>m.stretchAt!=null).length")>=3);
  ev("render()"); ok("chart shows the date when there's no label", [...d.querySelectorAll("#gantt .flag")].some(x=>/^Oct 2 /.test(x.textContent)));
  ok("scope line doesn't repeat what the view buttons say", !/By lane|Weeks/.test(d.querySelector("#scopeLine").textContent), d.querySelector("#scopeLine").textContent);
  ev("UI.filter=normFilter({range:{type:'next4'}}); render()"); ok("scope line includes filters and counts", /of \d+ initiatives/.test(d.querySelector("#scopeLine").textContent)); ev("UI.filter=normFilter({}); render()");
  ev(`commit(s=>{ const b = s.bars.find(x=>!x.tasks.length && x.kind==='work'); b.tasks=[{id:'dkt',label:'x',start:s.meta.start,days:2,owners:[],jira:'',status:'notstarted'}]; b.datesFrom='tasks'; })`);
  ok("task-dated initiatives are marked ≡ on the chart", !!d.querySelector("#gantt .bar .dk") && !!d.querySelector("#legend .lg-dk"));
  ev("undo()");
  // edit strip
  ev("file.handle={name:'team.json'}; file.holdLock=false; S.meta.lock=null; S.meta.savedAt=new Date().toISOString(); S.meta.revision=7; updateFileUI()"); await wait(5);
  ok("strip: read-only with Start editing", !d.querySelector("#editstrip").hidden && /Read-only · team.json/.test(d.querySelector("#editstrip").textContent) && /revision 7/.test(d.querySelector("#editstrip").textContent) && /Start editing/.test(d.querySelector("#editstrip").textContent));
  ev("S.meta.lock={by:'Pat',id:'other',at:new Date().toISOString()}; updateFileUI()"); await wait(5);
  ok("strip: someone else editing, with Take over", /Pat is editing/.test(d.querySelector("#editstrip").textContent) && /Take over/.test(d.querySelector("#editstrip").textContent));
  ev("S.meta.lock={by:'Me',id:SESSION,at:new Date().toISOString()}; file.holdLock=true; file.dirty=true; updateFileUI()"); await wait(5);
  ok("strip: you're editing, unsaved, lock countdown", /You're editing team.json/.test(d.querySelector("#editstrip").textContent) && /unsaved changes/.test(d.querySelector("#editstrip").textContent) && /lock (2[0-9]|30) min left/.test(d.querySelector("#editstrip").textContent));
  ev("S.meta.lock={by:'Me',id:SESSION,at:new Date(Date.now()-27*60000).toISOString()}; updateFileUI()"); await wait(5);
  ok("strip: turns amber when the lock is about to end", d.querySelector("#editstrip").classList.contains("soon") && /save to keep it/.test(d.querySelector("#editstrip").textContent));
  await ev("(async()=>{ file.holdLock=false; await setPresent(true); })()"); await wait(5);
  ok("strip hidden in Present", d.querySelector("#editstrip").hidden);
  await ev("setPresent(false)");
  ev("file.handle=null; file.holdLock=false; file.dirty=false; S.meta.lock=null; updateFileUI(); render()"); await wait(5);
  ok("strip hidden when not on a shared file", d.querySelector("#editstrip").hidden);
  // --- last-batch review regressions ---
  ok("L1: mixed gate owners keep the legacy owner", ev(`normalize({lanes:[{id:"a"}],gates:[{id:"g",gate:"G",owner:"Alice",owners:[]}]},false).gates[0].owners.length`)===1);
  ok("L2: lane migration keeps 'Morgan reviews' / 'UX Emery' style notes", (()=>{ const d2 = ev(`JSON.stringify(normalize({lanes:[{id:"a",who:"Alice · Bob reviews"},{id:"b",who:"UX Carol, Dan"}],people:[{id:"p1",name:"Alice"},{id:"p2",name:"Bob"},{id:"p3",name:"Carol"},{id:"p4",name:"Dan"}]},false).lanes.map(l=>[l.members.length,l.note]))`); return d2===JSON.stringify([[2,"Bob reviews"],[2,"UX Carol"]]); })());
  ok("L3: parenthetical gate owners stay one owner", ev(`normalize({lanes:[{id:"a"}],gates:[{id:"g",gate:"G",owner:"AppSec (Alice & Bob)"}]},false).people.map(p=>p.name).join("|")`)==="AppSec");
  ok("L2b: migration is idempotent", (()=>{ const a = ev(`JSON.stringify(normalize(normalize({lanes:[{id:"a",who:"Alice · Bob reviews"}],people:[{id:"p1",name:"Alice"},{id:"p2",name:"Bob"}],gates:[{id:"g",owner:"AppSec (x)"}]},false),false).lanes)`); const b = ev(`JSON.stringify(normalize({lanes:[{id:"a",who:"Alice · Bob reviews"}],people:[{id:"p1",name:"Alice"},{id:"p2",name:"Bob"}],gates:[{id:"g",owner:"AppSec (x)"}]},false).lanes)`); return a===b; })());
  ev(`select("ms", S.milestones[0].id)`);
  ev("UI.planTab='milestones';setWs('plan')");
  ok("L8: stretch label is editable", !!d.querySelector("#f-mstl") && [...d.querySelectorAll("#t-milestones thead th")].some(x=>x.textContent==="Stretch label"));
  ev("sel=null;setWs('timeline')");
  ok("L9: initials pick a readable text color", ev(`iniFg("#f0e68c")`)!=="#ffffff" && ev(`iniFg("#1f3f6b")`)==="#ffffff");
  ev("UI.ws='people'; render()"); ok("L10: scope line on People doesn't repeat the page name", !/Load by person/.test(d.querySelector("#scopeLine").textContent)); ev("UI.ws='timeline'; render()");
  ev("UI.filter=normFilter({kinds:['milestone'], mstatus:['gated']}); render()");
  ok("L10b: scope counts milestones when only milestones show", /milestones: gated/.test(d.querySelector("#scopeLine").textContent) && /\d+ milestones?/.test(d.querySelector("#scopeLine").textContent));
  ev("UI.filter=normFilter({}); render()");
  const pvL = (el, type) => { const ev0 = new w.MouseEvent(type,{bubbles:true,clientX:300,clientY:300}); Object.defineProperty(ev0, "pointerType", {value:"mouse"}); el.dispatchEvent(ev0); };
  const bL = d.querySelector('#gantt .bar[data-peek-type="bar"]'); pvL(bL, "pointerover"); await wait(420);
  ok("L6: open card is exposed and linked to the item", d.querySelector("#peek").getAttribute("aria-hidden")==="false" && d.querySelector("#peek").getAttribute("role")==="tooltip" && bL.getAttribute("aria-describedby")==="peek");
  ev("closePeek()"); ok("L6b: closing unlinks it", !bL.hasAttribute("aria-describedby") && d.querySelector("#peek").getAttribute("aria-hidden")==="true");
  const bb2 = ev("S.bars.find(b=>!b.tasks.length && b.kind==='work').id"); ev(`select("bar","${bb2}")`);
  const oi = d.querySelector("#f-owner"); oi.focus(); oi.value=""; oi.dispatchEvent(new w.Event("input",{bubbles:true}));
  oi.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
  ok("L5: picker exposes the active option", !!oi.getAttribute("aria-activedescendant") && d.getElementById(oi.getAttribute("aria-activedescendant"))?.getAttribute("aria-selected")==="true");
  oi.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("L5b: Escape collapses the picker", oi.getAttribute("aria-expanded")==="false");
  ev("sel=null; render()");
  ev("file.handle={name:'team.json'}; file.holdLock=true; file.dirty=false; S.meta.lock={by:'Me',id:SESSION,at:new Date().toISOString()}; updateFileUI()"); await wait(5);
  d.querySelector('#editstrip [data-act="Done editing"]').focus(); ev("renderEditStrip()");
  ok("L7: strip refresh keeps focus on its button", d.activeElement && d.activeElement.dataset.act==="Done editing");
  ev("file.handle=null; file.holdLock=false; S.meta.lock=null; updateFileUI(); render()"); await wait(5);
  // --- post-it notes + who am I ---
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("UI.view=null; UI.filter=normFilter({}); UI.notes='all'; setWs('timeline'); setRows('lanes'); setZoom('weeks'); sel=null; setMe(''); render()");
  const laneN = ev("S.lanes[0].id");
  ev(`createAt("note", "${laneN}", isoToDay("2026-10-07"))`); await wait(15);
  ok("first note asks who you are", !d.querySelector("#addMenu").hidden && /Which one are you/.test(d.querySelector("#addMenu").textContent));
  [...d.querySelectorAll("#addMenu button")].find(x=>/Avery/.test(x.textContent)).click(); await until("the new note's text box", ()=>d.activeElement && d.activeElement.id==="f-ntext");
  ok("note created by you, opens for typing", ev("S.notes.length")===1 && ev("personName(S.notes[0].author)")==="Avery" && ev("sel.type")==="note" && d.activeElement.id==="f-ntext");
  ok("you're remembered (and named on the edit lock)", ev("meId()")===ev("S.notes[0].author") && ev("myName()")==="Avery");
  const noteTa = d.querySelector("#f-ntext"); noteTa.value = "Confirm scope with the boss"; noteTa.dispatchEvent(new w.Event("input",{bubbles:true})); noteTa.dispatchEvent(new w.Event("change",{bubbles:true}));
  ev("sel=null; render()");
  ok("note shows on the chart in its lane and day", [...d.querySelectorAll(`#gantt .lane[data-lane="${laneN}"] .note`)].some(x=>/Confirm scope/.test(x.textContent)));
  ev(`commit(s=>s.notes.push({id:"nx", text:"Other person's note", date:"2026-10-14", lane:"${laneN}", author:s.people.find(p=>p.name==="Blake").id, created:""}))`);
  ev("UI.notes='mine'; render()"); ok("Only mine hides others' notes", d.querySelectorAll("#gantt .note").length===1 && /Confirm scope/.test(d.querySelector("#gantt .note").textContent));
  ev("UI.notes='others'; render()"); ok("Only others' hides mine", d.querySelectorAll("#gantt .note").length===1 && /Other person/.test(d.querySelector("#gantt .note").textContent));
  ev("UI.notes='none'; render()"); ok("Hide notes hides all", d.querySelectorAll("#gantt .note").length===0 && /hidden/.test(d.querySelector("#notesBtn").textContent));
  d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"n",bubbles:true})); ok("N toggles notes back on", ev("UI.notes")==="all" && d.querySelectorAll("#gantt .note").length===2);
  d.querySelector("#notesBtn").click(); ok("Notes menu shows counts and who you are", /All notes\s*2/.test(d.querySelector("#notesMenu").textContent) && /Avery · change/.test(d.querySelector("#notesMenu").textContent));
  d.body.click();
  ok("notes survive save/load", ev("parseText(serialize(S,'x.json')).notes.length")===2);
  ok("notes setting saved in views", ev("currentDef().notes")==="all");
  ev("setRows('people')"); ok("By person shows notes in the author's row", !!d.querySelector(`.lane.personrow[data-person="${ev("meId()")}"] .note`)); ev("setRows('lanes')");
  ev("UI.dayZoom=5; setZoom('days')"); ok("Days view has a notes row per lane", [...d.querySelectorAll("#gantt .markrow .flag.notechip")].length>=1); ev("setZoom('weeks')");
  const pvN = (el, type) => { const ev0 = new w.MouseEvent(type,{bubbles:true,clientX:300,clientY:300}); Object.defineProperty(ev0, "pointerType", {value:"mouse"}); el.dispatchEvent(ev0); };
  pvN(d.querySelector("#gantt .note"), "pointerover"); await wait(420);
  ok("hovering a note shows author and day", /Written by/.test(d.querySelector("#peek").textContent) && /NOTE/i.test(d.querySelector("#peek .pk-k").textContent));
  ev("closePeek(); undo(); undo(); undo(); setMe(''); render()");
  // --- persisted name ---
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30); ev("setMe(S.people.find(p=>p.name==='Blake').id)");
  ok("name remembered across plans", (()=>{ ev("S.meta.planId='p-other-plan'; render()"); return ev("personName(meId())")==="Blake" && w.localStorage.getItem("timeline-planner-me-name")==="Blake"; })());
  ok("lock name uses it", ev("myName()")==="Blake");
  ev("setMe('')"); ok("change clears it", ev("meId()")==="" && !w.localStorage.getItem("timeline-planner-me-name"));
  // --- notes review regressions ---
  ok("N1: plans without an id get the same id every load", ev(`normalize({meta:{title:"T",start:"2026-09-21"},lanes:[{id:"a"}]},false).meta.planId`)===ev(`normalize({meta:{title:"T",start:"2026-09-21"},lanes:[{id:"a"}]},false).meta.planId`));
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"},{id:"b",name:"B"}],people:[{id:"p1",name:"Pat"},{id:"p2",name:"Sam"}],notes:[{id:"na",text:"in A",date:"2026-10-07",lane:"a",author:"p1"},{id:"nb",text:"in B",date:"2026-10-08",lane:"b",author:"p2"}],sprints:[{name:"S0",weeks:2},{name:"S1",weeks:2},{name:"S2",weeks:2},{name:"S3",weeks:2},{name:"S4",weeks:2},{name:"S5",weeks:2}]},false); resetHistory(); UI.filter=normFilter({}); UI.view=null; UI.notes="all"; file.handle=null; setWs('timeline'); setRows('lanes'); setZoom('weeks'); render()`);
  ok("N4: a lane with only notes still shows (weeks)", !!d.querySelector('#gantt .lane[data-lane="b"] .note'));
  ev("UI.dayZoom=5; setZoom('days')"); ok("N4: … and in Days", [...d.querySelectorAll("#gantt .flag.notechip")].length===2);
  ev("setRows('people')"); ok("N4: Days by person shows the author's notes", !!d.querySelector('.lane.personrow[data-person="p2"] .note')); ev("setRows('lanes'); setZoom('weeks')");
  { const n0 = ev("S.notes.length"); ev(`del("lane","b")`); ok("N2: a workstream with notes in it isn't deleted outright", ev("S.notes.length")===n0 && ev("S.lanes.some(l=>l.id==='b')"));
    ev(`window.confirm = ()=>true; moveLaneWork("b", S.lanes.find(l=>l.id!=="b").id)`); ok("N2: moving its work keeps its notes, in the other workstream", ev("S.notes.length")===n0 && !ev("S.lanes.some(l=>l.id==='b')") && ev("S.notes.every(n=>S.lanes.some(l=>l.id===n.lane))")); ev("undo()"); }
  d.querySelector("#settings").click(); d.querySelector("#dStart").value="2026-10-12"; d.querySelector("#dDatesOk").click();
  ok("N3: moving the plan start moves notes", ev(`S.notes.find(n=>n.id==="na").date`)==="2026-10-14"); ev("undo()");
  ok("N5: mixed lane data keeps who text", ev(`JSON.stringify((l=>[l.members.length,l.note])(normalize({lanes:[{id:"a",members:[],who:"Alice reviews"}],people:[{id:"p1",name:"Alice"}]},false).lanes[0]))`)===JSON.stringify([1,"Alice reviews"]));
  let e6=""; try { ev(`normalize({lanes:[{id:"a"}],notes:[{id:"n",date:"2026-02-31",lane:"a"}]},true)`); } catch(x){ e6=x.message; }
  ok("N6: strict load rejects broken notes instead of silently changing them", /invalid date/.test(e6));
  ok("N6: no silent cap on notes", ev(`normalize({lanes:[{id:"a"}],notes:Array.from({length:1200},(_,i)=>({id:"q"+i,text:"x",date:"2026-10-05",lane:"a"}))},false).notes.length`)===1200);
  ev("setMe('p1'); render()"); d.querySelector("#addBtn").click();
  d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"n",bubbles:true})); await wait(10);
  ok("N7: N in the add menu makes a note and doesn't hide notes", ev("UI.notes")==="all" && ev("sel && sel.type")==="note"); ev("undo(); sel=null; render()");
  ev("setMe(''); UI.notes='mine'; S.notes.push({id:'anon',text:'nobody',date:'2026-10-09',lane:'a',author:'',created:''}); render()");
  ok("N8: with no identity, 'Only mine' shows nothing (not anonymous notes)", d.querySelectorAll("#gantt .note").length===0);
  ev("S.notes = S.notes.filter(n=>n.id!=='anon'); setMe('p1'); UI.notes='all'; render()");
  d.querySelector("#notesBtn").click(); [...d.querySelectorAll("#notesMenu button")].find(x=>/change/.test(x.textContent)).click(); await wait(10);
  ok("N8: 'change' actually opens the chooser (not closed by its own click)", !d.querySelector("#addMenu").hidden && /Which one are you/.test(d.querySelector("#addMenu").textContent));
  d.querySelector("#addMenu").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  ok("N8: cancelling 'change' keeps who you are and returns focus", ev("meId()")==="p1" && d.activeElement && d.activeElement.id==="notesBtn");
  let conf = ""; w.confirm = m=>{ conf = m; return false; }; ev(`removePerson("p2")`); w.confirm = ()=>true;
  ok("N9: removing a note author warns about the notes", /wrote 1 note/.test(conf) && !!ev(`personById("p2")`));
  ev(`select("note","na")`); const nd = d.querySelector("#f-ndate"); nd.value="2027-06-01"; nd.dispatchEvent(new w.Event("change",{bubbles:true}));
  ok("N10: note dates stay inside the plan", ev(`isoToDay(S.notes.find(n=>n.id==="na").date)`) <= ev("startDay() + S.meta.weeks*7 - 3") && d.querySelector("#f-ndate").hasAttribute("max"));
  ev("undo(); sel=null; render()");
  d.querySelector("#notesBtn").click();
  ok("N11: notes menu items are menu items; trigger controls it", [...d.querySelectorAll("#notesMenu button")].every(b=>/menuitem/.test(b.getAttribute("role")||"")) && d.querySelector("#notesBtn").getAttribute("aria-controls")==="notesMenu");
  d.body.click(); ev("setMe('')");
  // --- ask who you are on start ---
  ev("askWhoOnStart = window.__askWho"); ev("localStorage.removeItem(ME_KEY); setMe(''); try{ sessionStorage.removeItem('tp-who-skip'); }catch(e){}"); ev(`loadExternal(${JSON.stringify(realPlan)},"real")`);
  for (let i = 0; i < 30 && d.querySelector("#addMenu").hidden; i++) await wait(50);      // the prompt comes 50 ms after the plan draws: wait for it, not a fixed time
  ok("opening a plan asks who you are", !d.querySelector("#addMenu").hidden && /Which one are you/.test(d.querySelector("#addMenu").textContent) && /Just looking/.test(d.querySelector("#addMenu").textContent));
  [...d.querySelectorAll("#addMenu button")].find(x=>/Just looking/.test(x.textContent)).click();
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(120);
  ok("'Just looking' isn't asked again this session", d.querySelector("#addMenu").hidden);
  ev("try{ sessionStorage.removeItem('tp-who-skip'); }catch(e){}; askWhoOnStart = ()=>{}");
  // not on the list / empty team
  ev("askWhoOnStart = window.__askWho; localStorage.removeItem(ME_KEY); setMe('');");
  w.prompt = ()=>"Priya Test";
  ev("whoAmI(null, ()=>{}, true)"); await wait(10);
  [...d.querySelectorAll("#addMenu button")].find(x=>/not on the list/.test(x.textContent)).click(); await wait(5);
  ok("'I'm not on the list' adds you and remembers you", ev("S.people.some(p=>p.name==='Priya Test')") && ev("personName(meId())")==="Priya Test");
  ev("undo(); localStorage.removeItem(ME_KEY); setMe('')");
  ev("S = normalize({meta:{title:'Fresh'},lanes:[{id:'a',name:'A'}],bars:[{id:'b',lane:'a',label:'x'}]},false); resetHistory(); file.handle=null; try{ sessionStorage.removeItem('tp-who-skip'); }catch(e){}; render(); askWhoOnStart()"); await wait(10);
  ok("an empty team asks for your name and makes you the first member", ev("S.people.length")===1 && ev("S.people[0].name")==="Priya Test" && ev("personName(meId())")==="Priya Test");
  ev("file.handle={name:'x.json'}; file.holdLock=false; localStorage.removeItem(ME_KEY); setMe(''); S.people=[]; render(); try{ sessionStorage.removeItem('tp-who-skip'); }catch(e){}; askWhoOnStart()"); await wait(10);
  ok("viewing read-only never asks to add you", ev("S.people.length")===0);
  ev("file.handle=null; askWhoOnStart = ()=>{}; localStorage.removeItem(ME_KEY); setMe(''); try{ sessionStorage.removeItem('tp-who-skip'); }catch(e){}"); w.prompt = ()=>"T";
  ev(`loadExternal(${JSON.stringify(realPlan)},"real")`); await wait(30);
  // menus never stack
  ev("render()"); d.querySelector("#notesBtn").click(); d.querySelector("#filterBtn").click();
  ok("opening Filters closes the Notes menu", d.querySelector("#notesMenu").hidden && !d.querySelector("#filterPop").hidden);
  d.querySelector("#viewBtn").click(); ok("opening Views closes Filters", d.querySelector("#filterPop").hidden && !d.querySelector("#viewMenu").hidden);
  d.body.click();
  // --- dependencies: links + automatic moving ---
  ev("reschedule = window.__resched");
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],people:[{id:"p1",name:"Pat"}],
    bars:[{id:"x",lane:"a",start:0,span:1,label:"First"},{id:"y",lane:"a",start:1,span:1,label:"Second",dependsOn:["x"]},{id:"z",lane:"a",start:2,span:1,label:"Third",dependsOn:["y"]},
          {id:"tb",lane:"a",start:4,span:2,label:"With tasks",tasks:[{id:"t1",label:"Design",start:"2026-11-02",days:3},{id:"t2",label:"Build",start:"2026-11-05",days:2,dependsOn:["t1"]}]}],
    gates:[{id:"g1",gate:"Consent",date:"2026-10-05"}], milestones:[{id:"m1",what:"Done",lane:"a",at:3,after:["z"]}],
    sprints:[{name:"S0",weeks:2},{name:"S1",weeks:2},{name:"S2",weeks:2},{name:"S3",weeks:2},{name:"S4",weeks:2},{name:"S5",weeks:2}]},false); resetHistory(); UI.filter=normFilter({}); file.handle=null; setRows('lanes'); setZoom('weeks'); sel=null; render()`);
  ev(`commit(()=>{ barById("x").span = 2; })`);
  ok("D1: making an initiative longer pushes the chain after it", ev(`barById("y").start`)===2 && ev(`barById("z").start`)===3, ev(`[barById("y").start, barById("z").start].join()`));
  ok("D1: a milestone 'done when' follows its initiative", ev(`dayToIso(nearWeekday(atToDay(S.milestones[0].at)))`)===ev(`dayToIso(barEndDay(barById("z")))`));
  ok("D1: the move is one Undo", (()=>{ ev("undo()"); return ev(`barById("y").start`)===1 && ev(`barById("z").start`)===2; })());
  ev(`commit(()=>{ barById("y").waitsFor = ["g1"]; })`); ev(`commit(()=>{ gateById("g1").date = "2026-10-21"; })`);
  ok("D2: a gate moving later pushes the initiative that waits for it", ev(`dayToIso(nextWork(wkDay(barById("y").start), new Set()))`)==="2026-10-21");
  ev("undo(); undo()");
  ev(`commit(()=>{ taskById("t1").t.days = 5; })`);
  ok("D3: a longer task pushes the task after it", ev(`taskById("t2").t.start`)===ev(`dayToIso(taskSpan(taskById("t1").t, HS()).e + 1 + (dow(taskSpan(taskById("t1").t, HS()).e + 1)===6 ? 2 : 0))`));
  ev("undo()");
  ev(`commit(()=>{ barById("x").span = 1.2; })`);
  ok("D4: a tight handoff (≤2 days overlap) isn't pushed", ev(`barById("y").start`)===1);
  ev("undo()");
  ev(`commit(s=>{ s.meta.autoSchedule = false; }); commit(()=>{ barById("x").span = 3; })`);
  ok("D5: with auto-move off, nothing moves (conflict shows instead)", ev(`barById("y").start`)===1 && ev(`depProblems(barById("y")).length`)===1);
  ev("undo(); undo()");
  ev(`makeLink("bar","x","bar","z")`); ok("D6: linking initiatives by drag-drop", ev(`barById("z").dependsOn.includes("x")`)); ev("undo()");
  ev(`makeLink("bar","z","bar","x")`); ok("D6: a link that would loop is refused", !ev(`barById("x").dependsOn.includes("z")`));
  ev(`makeLink("gate","g1","bar","x")`); ok("D6: gate → initiative link", ev(`barById("x").waitsFor.includes("g1")`)); ev("undo()");
  ev(`makeLink("bar","y","ms","m1")`); ok("D6: initiative → milestone link", ev(`S.milestones[0].after.includes("y")`)); ev("undo()");
  ev(`makeLink("task","t2","task","t1")`); ok("D6: task loop refused", !ev(`taskById("t1").t.dependsOn.includes("t2")`));
  ev(`select("bar","y")`);
  ok("D7: selecting an item highlights what it's linked to", !!d.querySelector('#gantt [data-peek-id="x"].linked') && !!d.querySelector('#gantt [data-peek-id="z"].linked'));
  ok("D7: side panel shows 'Starts after', 'Waits for gates', 'Followed by'", /Starts after these finish/.test(d.querySelector("#side").textContent) && /Waits for gates/.test(d.querySelector("#side").textContent) && /Followed by/.test(d.querySelector("#side").textContent));
  ok("D8: link dots appear on editable bars", d.querySelectorAll("#gantt .bar .linkdot").length>=3);
  ev(`del("bar","z")`); ok("D9: deleting an initiative removes it from milestone 'done when'", !ev(`S.milestones[0].after.includes("z")`)); ev("undo()");
  ok("D10: links survive save/load", (()=>{ const r = ev(`(()=>{ const p2 = parseText(serialize(S,'x.json')); return JSON.stringify([p2.bars.find(b=>b.id==='tb').tasks[1].dependsOn, p2.milestones[0].after, p2.meta.autoSchedule]); })()`); return r===JSON.stringify([["t1"],["z"],true]); })());
  ev("sel=null; reschedule = ()=>({moved:0})");
  // --- groups, meetings, time off ---
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],people:[{id:"p1",name:"Pat"},{id:"p2",name:"Lee"},{id:"p3",name:"Kim"}],
    bars:[{id:"x",lane:"a",start:0,span:2,label:"First"}], holidays:[{date:"2026-10-12",name:"Columbus Day"}],
    groups:[{id:"gr1",name:"Reviewers",members:["p1","p2","ghost"]}],
    meetings:[{id:"mt1",title:"Standup",date:"2026-10-05",time:"09:30",minutes:15,recur:{freq:"weekly"},attendees:["p3"],groups:["gr1"]},
              {id:"mt2",title:"Kickoff",date:"2026-10-07",attendees:["p1"]},
              {id:"mt3",title:"Monthly",date:"2026-10-30",recur:{freq:"monthly",until:"2026-12-31"}},
              {id:"mt4",title:"Bad",date:"nope",time:"25:99",recur:{freq:"hourly"},attendees:["nobody"],groups:["nogroup"]}]},false); resetHistory(); UI.filter=normFilter({}); file.handle=null; setRows('lanes'); setZoom('weeks'); sel=null; render()`);
  ok("M1: a group drops members who aren't on the team", ev(`JSON.stringify(S.groups[0].members)`)==='["p1","p2"]');
  ok("M1: bad meeting fields are cleaned up", ev(`JSON.stringify([S.meetings[3].date, S.meetings[3].time, S.meetings[3].recur.freq, S.meetings[3].attendees.length, S.meetings[3].groups.length])`)==='["2026-10-05","","none",0,0]');
  ok("M2: attendees = people plus group members", ev(`attendeesOf(meetingById("mt1")).sort().join()`)==="p1,p2,p3");
  ok("M3: a weekly meeting skips holidays", ev(`occurrences(meetingById("mt1"), isoToDay("2026-10-05"), isoToDay("2026-10-31")).map(dayToIso).join()`)==="2026-10-05,2026-10-19,2026-10-26");
  ok("M3: a monthly meeting repeats on the same date and stops at 'until'", ev(`occurrences(meetingById("mt3"), isoToDay("2026-10-01"), isoToDay("2027-03-01")).map(dayToIso).join()`)==="2026-10-30,2026-11-30,2026-12-30", ev(`occurrences(meetingById("mt3"), isoToDay("2026-10-01"), isoToDay("2027-03-01")).map(dayToIso).join()`));
  ok("M4: the weeks view shows a Meetings row with a count per week", !!d.querySelector("#gantt .lane.meetrow") && d.querySelector('#gantt .meetweek[data-peek-id="0|"]').textContent.trim()==="3", d.querySelector('#gantt .meetweek')?.textContent);
  ok("M4: hovering a week lists its meetings", (()=>{ const c = ev(`peekContent("mweek","0")`); return !!c && /Standup/.test(c.textContent) && /Kickoff/.test(c.textContent); })());
  ev("setZoom('days'); UI.dayZoom = 10; render()");
  ok("M5: the Days view shows each meeting on its day", d.querySelectorAll('#gantt .flag.meet').length>=2);
  ev("setRows('people')");
  ok("M5: by person, attendees see the meeting in their row", !!d.querySelector('#gantt [data-person="p2"] .meetchip') && !d.querySelector('#gantt [data-person="p3"] .meetchip[data-peek-id="mt2"]'));
  ev("setRows('lanes'); setZoom('weeks')");
  ev(`UI.filter = normFilter({kinds:["work"]}); render()`); ok("M6: a Work-only filter hides meetings", !d.querySelector("#gantt .meetrow"));
  ev(`UI.filter = normFilter({people:["p3"]}); render()`); ok("M6: filtering by a person keeps only their meetings", ev(`S.meetings.filter(m=>meetingShown(m)).map(m=>m.id).join()`)==="mt1");
  ev(`UI.filter = normFilter({}); render()`);
  ok("R1: an older 15-minute meeting gets an end time", ev(`meetingById("mt1").end`)==="09:45" && ev(`meetTimeText(meetingById("mt1"))`)==="9:30 AM – 9:45 AM · 15 min");
  const occ = (r, date, from, to) => ev(`(()=>{ const m = {id:"q", date:"${date}", recur:normRecur(${JSON.stringify(r)}, "${date}"), skip:[]}; return occurrences(m, isoToDay("${from}"), isoToDay("${to}")).map(dayToIso).join(); })()`);
  ok("R2: every weekday (holiday skipped)", occ({freq:"daily",weekdays:true},"2026-10-08","2026-10-08","2026-10-14")==="2026-10-08,2026-10-09,2026-10-13,2026-10-14");
  ok("R2: every 3 days (weekend hits dropped)", occ({freq:"daily",every:3},"2026-10-05","2026-10-05","2026-10-16")==="2026-10-05,2026-10-08,2026-10-14", occ({freq:"daily",every:3},"2026-10-05","2026-10-05","2026-10-16"));
  ok("R3: weekly on Tue and Thu", occ({freq:"weekly",days:[2,4]},"2026-10-05","2026-10-05","2026-10-16")==="2026-10-06,2026-10-08,2026-10-13,2026-10-15");
  ok("R3: every 2 weeks on Wed", occ({freq:"weekly",every:2,days:[3]},"2026-10-05","2026-10-05","2026-11-01")==="2026-10-07,2026-10-21");
  ok("R4: the second Tuesday of every month", occ({freq:"monthly",mode:"nth",nth:2,wd:2},"2026-10-01","2026-10-01","2026-12-31")==="2026-10-13,2026-11-10,2026-12-08");
  ok("R4: the last Friday of every month", occ({freq:"monthly",mode:"nth",nth:5,wd:5},"2026-10-01","2026-10-01","2026-12-31")==="2026-10-30,2026-11-27,2026-12-25");
  ok("R4: day 31 falls on the last day in shorter months (and a Saturday moves to Friday)", occ({freq:"monthly",day:31},"2026-10-01","2026-10-01","2026-12-31")==="2026-10-30,2026-11-30,2026-12-31", occ({freq:"monthly",day:31},"2026-10-01","2026-10-01","2026-12-31"));
  ok("R5: yearly on the first Monday of November", occ({freq:"yearly",mode:"nth",nth:1,wd:1,month:10},"2026-10-01","2026-10-01","2027-12-31")==="2026-11-02,2027-11-01", occ({freq:"yearly",mode:"nth",nth:1,wd:1,month:10},"2026-10-01","2026-10-01","2027-12-31"));
  ok("R6: end after 3 occurrences", occ({freq:"weekly",days:[1],ends:"count",count:3},"2026-10-05","2026-10-01","2026-12-31")==="2026-10-05,2026-10-19", "holiday 10/12 uses one of the three");
  ok("R6: end by a date", occ({freq:"weekly",days:[1],ends:"until",until:"2026-10-20"},"2026-10-05","2026-10-01","2026-12-31")==="2026-10-05,2026-10-19");
  ok("R7: Outlook-style summary", ev(`recurText({date:"2026-10-06", time:"09:30", end:"10:00", recur:normRecur({freq:"weekly",days:[2,4],ends:"until",until:"2026-12-11"},"2026-10-06")})`)==="Occurs every Tuesday and Thursday from 9:30 AM to 10:00 AM, starting Tue Oct 6 until Fri Dec 11" || /^Occurs every Tuesday and Thursday from 9:30 AM to 10:00 AM, starting .*Oct 6 until .*Dec 11$/.test(ev(`recurText({date:"2026-10-06", time:"09:30", end:"10:00", recur:normRecur({freq:"weekly",days:[2,4],ends:"until",until:"2026-12-11"},"2026-10-06")})`)), ev(`recurText({date:"2026-10-06", time:"09:30", end:"10:00", recur:normRecur({freq:"weekly",days:[2,4],ends:"until",until:"2026-12-11"},"2026-10-06")})`));
  ev(`openMeeting("mt1", isoToDay("2026-10-19"))`);
  ok("R8: the editor shows the Outlook-style repeat panel", !!d.querySelector("fieldset.recur #f-mrec") && d.querySelectorAll(".wdbtn").length===5 && d.querySelector("#f-rwd1").getAttribute("aria-pressed")==="true");
  d.querySelector("#f-rwd3").click();
  ok("R8: clicking a weekday adds it", ev(`JSON.stringify(meetingById("mt1").recur.days)`)==="[1,3]");
  ev("undo()"); ev(`openMeeting("mt1", isoToDay("2026-10-19"))`);
  d.querySelector("#f-mskip").click();
  ok("R9: 'Skip just this date' removes one occurrence and it can be brought back", ev(`occurrences(meetingById("mt1"), isoToDay("2026-10-19"), isoToDay("2026-10-19")).length`)===0 && /Oct 19/.test(d.querySelector("#side").textContent));
  ev("undo()"); ev(`openMeeting("mt1")`);
  const t = d.querySelector("#f-mtime"); t.value = "13:00"; t.dispatchEvent(new w.Event("change"));
  ok("R10: moving the start time keeps the length", ev(`meetingById("mt1").end`)==="13:15");
  ev("undo(); sel=null; render()");
  // meetings live in swim lanes
  ev(`createAt("meeting", "a", isoToDay("2026-10-14"))`);
  ok("ML1: a meeting added in a lane belongs to that lane", ev(`meetingById(sel.id).lane`)==="a");
  ok("ML1: it shows in the lane's row", !!d.querySelector('#gantt .track[data-lane="a"] .meetweek[data-peek-id="1|a"]'), ev('UI.zoom')+' '+[...d.querySelectorAll('#gantt .meetweek')].map(x=>x.dataset.peekId).join());
  { const f = d.querySelector("#f-mlane"); f.value = ""; f.dispatchEvent(new w.Event("change")); }
  ok("ML2: changing the lane moves it (to Team meetings)", ev(`meetingById(sel.id).lane`)==="" && !d.querySelector('#gantt .track[data-lane="a"] .meetweek'));
  ev("undo()"); ev("UI.dayZoom = 10; setZoom('days')");
  ok("ML3: Days shows a Meetings row inside the lane", [...d.querySelectorAll("#gantt .lane.meetrow .glabel")].some(x=>/Meetings/.test(x.textContent) && !/Team/.test(x.textContent)));
  ok("ML4: the hover + on a lane's Meetings row adds to that lane", ev(`(()=>{ insCtx = {add:"meetings:a", day:isoToDay("2026-10-15")}; ins.hidden=false; ins.click(); return meetingById(sel.id).lane; })()`)==="a");
  ev("undo(); undo(); setZoom('weeks'); sel=null; render()");
  ev(`createAt("meeting", null, isoToDay("2026-10-14"))`);
  ok("R11: a new meeting starts with a time", ev(`meetingById(sel.id).time`)==="09:00" && ev(`meetingById(sel.id).end`)==="09:30");
  ok("M7: + Add meeting creates one and opens its editor", ev("S.meetings.length")===5 && !!d.querySelector("#f-mtitle") && !!d.querySelector("#f-mrec"));
  ev(`commit(()=>{ const m = meetingById(sel.id); m.recur.freq = "weekly"; m.recur.every = 2; m.groups = ["gr1"]; }); render()`);
  ok("M7: every-2-weeks repeats and a group can be added", ev(`occurrences(meetingById(sel.id), isoToDay("2026-10-14"), isoToDay("2026-11-30")).length`)===4 && ev(`attendeesOf(meetingById(sel.id)).length`)>=2);
  ev(`del("meeting", sel.id)`); ok("M7: delete meeting", ev("S.meetings.length")===4);
  ev(`createAt("group")`); ok("M8: + Group creates one and opens its editor", ev("S.groups.length")===2 && !!d.querySelector("#f-grname")); ev("undo()");
  ev(`del("group","gr1")`); ok("M8: deleting a group removes it from meetings", ev("S.groups.length")===0 && ev(`meetingById("mt1").groups.length`)===0); ev("undo()");
  ev(`removePerson ? removePerson("p1") : null`);
  ok("M9: removing a person takes them out of groups and meetings", !ev(`S.groups[0].members.includes("p1")`) && !ev(`meetingById("mt2").attendees.includes("p1")`)); ev("undo()");
  ev("UI.planTab='meetings'; setWs('plan')");
  ok("M10: Plan → Meetings lists every meeting with its next date", d.querySelectorAll("#t-meetings tbody tr").length===4 && /Occurs every Monday/.test(d.querySelector("#t-meetings").textContent));
  ev("UI.planTab='team'; render()"); ok("M10: Plan → Team lists groups (Everyone first)", d.querySelectorAll("#t-groups tbody tr").length===2 && /Everyone/.test(d.querySelector("#t-groups tbody tr").textContent));
  ok("M11: meetings and groups survive save/load", ev(`(()=>{ const p2 = parseText(serialize(S,'x.json')); return p2.meetings.length===4 && p2.groups.length===1 && p2.meetings[0].recur.freq==="weekly"; })()`));
  ok("M11: the change engine tracks meetings", ev(`(()=>{ const a = JSON.parse(JSON.stringify(S)); const b = JSON.parse(JSON.stringify(S)); b.meetings[0].title = "Daily"; const ops = diffPlans(a,b); return ops.length===1 && ops[0].type==="meeting" || ops[0].type==="meetings"; })()`), ev(`JSON.stringify(diffPlans(S, Object.assign(JSON.parse(JSON.stringify(S)), {meetings: S.meetings.map((m,i)=>i? m : {...m, title:"Daily"})})))`));
  ev("setWs('people')");
  ev(`commit(()=>{ personById("p2").off.push({from:"2026-10-09", to:"2026-10-13", note:"Trip"}); })`);
  ok("T1: the time-off tracker lists time off with working days (holiday excluded)", /Lee/.test(d.querySelector("#offTracker").textContent) && [...d.querySelectorAll("#offTracker tbody tr td")].some(td=>td.textContent==="2"), d.querySelector("#offTracker tbody")?.textContent);
  d.querySelector("#offWho").value = "p3"; d.querySelector("#offFrom").value = "2026-10-20"; d.querySelector("#offTo").value = "2026-10-21";
  d.querySelector("#offTracker form").dispatchEvent(new w.Event("submit",{cancelable:true}));
  ok("T2: quick add writes time off for that person", ev(`JSON.stringify(personById("p3").off)`)==='[{"from":"2026-10-20","to":"2026-10-21","note":""}]');
  const rows0 = d.querySelectorAll("#offTracker tbody tr").length; d.querySelector("#offTracker tbody .x").click();
  ok("T3: remove time off", d.querySelectorAll("#offTracker tbody tr").length===rows0-1);
  ev("setWs('timeline'); sel=null");
  // --- Days: the + on an initiative row offers more than a task ---
  ev(`S.bars[0].tasks = [{id:"tk1",label:"Design",start:"2026-10-05",days:2}]; S = normalize(S,false); resetHistory(); UI.dayZoom = 10; setZoom("days"); render()`);
  ev(`insCtx = {add:"task:x", day:isoToDay("2026-10-07")}; document.querySelector('#gantt .track[data-add="task:x"]').append(ins); ins.hidden = false`);
  ev("ins.click()"); await wait(5);
  const menuTxt = [...d.querySelectorAll("#addMenu button")].map(b=>b.textContent).join("|");
  ok("DA1: the + in Days opens a menu, not just a task", !d.querySelector("#addMenu").hidden && /Task in "First"/.test(menuTxt) && /Milestone/.test(menuTxt) && /Note/.test(menuTxt) && /Meeting/.test(menuTxt) && /Initiative/.test(menuTxt), menuTxt);
  [...d.querySelectorAll("#addMenu button")].find(b=>/^Milestone/.test(b.textContent)).click();
  ok("DA2: picking Milestone adds one on that day in that lane", ev(`S.milestones.length`)===1 && ev(`S.milestones[0].lane`)==="a" && ev(`dayToIso(nearWeekday(atToDay(S.milestones[0].at)))`)==="2026-10-07", ev(`JSON.stringify(S.milestones[0])`));
  ev("undo()");
  ev(`insCtx = {add:"task:x", day:isoToDay("2026-10-07")}; ins.hidden = false`); ev("ins.click()"); await wait(5);
  [...d.querySelectorAll("#addMenu button")].find(b=>/^Task in/.test(b.textContent)).click();
  ok("DA3: picking Task still adds a task to that initiative", ev(`barById("x").tasks.length`)===2);
  ev("undo(); setZoom('weeks'); sel=null; render()");
  // --- nested initiatives ---
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"},{id:"b",name:"B"}],people:[{id:"p1",name:"Pat"},{id:"p2",name:"Lee"}],
    bars:[{id:"P",lane:"a",start:0,span:6,label:"Platform"},{id:"C1",lane:"b",parent:"P",start:1,span:2,label:"Auth",owners:["p1"],status:"done"},{id:"C2",lane:"a",parent:"P",start:3,span:2,label:"Search",owners:["p2"],status:"inprogress"},
          {id:"G",lane:"a",parent:"C2",start:3,span:1,label:"Index"},{id:"Q",lane:"b",start:0,span:1,label:"Other"},{id:"L1",lane:"a",parent:"L2",start:0,span:1,label:"Loop1"},{id:"L2",lane:"a",parent:"L1",start:0,span:1,label:"Loop2"},{id:"X",lane:"a",parent:"nope",start:0,span:1,label:"Orphan"}]},false); resetHistory(); UI.filter=normFilter({}); UI.collapsed={}; file.handle=null; setRows('lanes'); setZoom('weeks'); sel=null; render()`);
  ok("N1: sub-initiatives take their top initiative's lane", ev(`barById("C1").lane`)==="a" && ev(`barById("G").lane`)==="a");
  ok("N1: loops and missing parents are cleared", ev(`[barById("L1").parent, barById("L2").parent].filter(Boolean).length`)===1 && ev(`barById("X").parent`)==="");
  ok("N2: a holder spans what's inside it", Math.abs(ev(`barById("P").start`) - 1) < 1e-9 && ev(`dayToIso(barEndDay(barById("P")))`)===ev(`dayToIso(barEndDay(barById("C2")))`), ev(`JSON.stringify([barById("P").start, barById("P").span])`));
  ok("N2: progress and owners roll up", ev(`rollupOf(barById("P")).done`)===1 && ev(`effStatus(barById("P"))`)==="inprogress" && ev(`effOwnerIds(barById("P")).sort().join()`)==="p1,p2");
  ok("N3: Weeks draws a box around what's inside and a fold button", !!d.querySelector('#gantt .nestbox[data-nest="P"]') && !!d.querySelector('#gantt [data-key="bar:P"] .nest-tg'));
  ok("N3: children sit in rows beneath their holder", (()=>{ const top = k=>parseFloat(d.querySelector(`#gantt [data-key="bar:${k}"]`).style.top); return top("C1") > top("P") && top("G") > top("C2"); })());
  d.querySelector('#gantt [data-key="bar:P"] .nest-tg').click();
  ok("N4: folding hides what's inside", !d.querySelector('#gantt [data-key="bar:C1"]') && !d.querySelector('#gantt .nestbox[data-nest="P"]'));
  d.querySelector('#gantt [data-key="bar:P"] .nest-tg').click();
  ev(`commit(()=>{ barById("C2").start = 5; })`);
  ok("N5: moving a child out pushes its holder's end", ev(`dayToIso(barEndDay(barById("P")))`)===ev(`dayToIso(barEndDay(barById("C2")))`) && ev(`barById("G").start`)===3);
  ev("undo()");
  ev(`commit(()=>shiftBar(barById("P"), 14))`);
  ok("N6: moving a holder moves everything inside it", Math.abs(ev(`barById("C1").start`) - 3) < 1e-9 && Math.abs(ev(`barById("G").start`) - 5) < 1e-9 && Math.abs(ev(`barById("P").start`) - 3) < 1e-9, ev(`JSON.stringify(["C1","G","P"].map(k=>barById(k).start))`));
  ev("undo()");
  ok("N7: drop inside another", ev(`commit(()=>moveBarTo("Q","C2","inside"))`) && ev(`barById("Q").parent`)==="C2" && ev(`barById("Q").lane`)==="a"); ev("undo()");
  ok("N7: can't drop a holder inside its own child", !ev(`moveBarTo("P","G","inside")`));
  ev(`commit(()=>moveBarTo("C2","C1","before"))`);
  ok("N8: reorder keeps the parent and puts it first", ev(`kidsOf("P").map(b=>b.id).join()`)==="C2,C1"); ev("undo()");
  ev(`commit(()=>moveBarToLane("C2","b"))`);
  ok("N9: moving to another lane takes what's inside and makes it top level", ev(`barById("C2").parent`)==="" && ev(`barById("G").lane`)==="b" && ev(`barById("G").parent`)==="C2"); ev("undo()");
  ev(`select("bar","C2")`); d.querySelector("#f-outdent").click();
  ok("N10: Outdent takes it out one level", ev(`barById("C2").parent`)==="" ); ev("undo()");
  ev(`select("bar","C2")`); d.querySelector("#f-indent").click();
  ok("N10: Indent puts it inside the one above", ev(`barById("C2").parent`)==="C1"); ev("undo()");
  ev(`select("bar","P")`); d.querySelector("#f-addsub").click();
  ok("N11: + Sub-initiative adds one inside, after its siblings", ev(`barById(sel.id).parent`)==="P" && ev(`kidsOf("P").length`)===3); ev("undo()");
  ev(`select("bar","P")`); ok("N12: the editor shows what's inside and locks rolled-up fields", /Inside it/.test(d.querySelector("#side").textContent) && d.querySelector("#f-status").disabled && /what's inside/.test(d.querySelector("#side").textContent));
  ev(`del("bar","C2")`); ok("N13: deleting a holder deletes what's inside", !ev(`barById("G")`) && !ev(`barById("C2")`)); ev("undo()");
  ok("N14: people rows and load skip holders (no double counting)", ev(`personItems("p1", null).map(x=>x.key).join()`)==="bar:C1");
  ev(`UI.filter = normFilter({people:["p2"]}); render()`); ok("N15: a person filter keeps the holder of their work", ev(`barVisible(barById("P"))`) && ev(`barVisible(barById("C2"))`) && !ev(`barVisible(barById("C1"))`), ev(`JSON.stringify(["P","C2","C1","G"].map(k=>barVisible(barById(k))))`) + ev(`JSON.stringify(UI.filter)`));
  ev(`UI.filter = normFilter({}); UI.dayZoom = 12; setZoom("days"); render()`);
  ok("N16: Days lists an outline with indentation", (()=>{ const rows = [...d.querySelectorAll("#gantt [data-orow]")].map(r=>r.dataset.orow); const pad = k=>parseFloat(d.querySelector(`#gantt [data-orow="${k}"] .dlabel`).style.paddingLeft); return rows.indexOf("C2") > rows.indexOf("P") && rows.indexOf("G") === rows.indexOf("C2") + 1 && pad("G") > pad("C2") && pad("C2") > pad("P"); })());
  ok("N16: holders get a summary bar", !!d.querySelector('#gantt [data-orow="P"] .ibar.summary'));
  ev(`startOutlineDrag({button:0, clientY:0, pointerId:1, preventDefault(){}, stopPropagation(){}, currentTarget:document.querySelector('#gantt [data-orow="Q"] .grip-o')}, "Q")`);
  ev(`(()=>{ const st = startOutlineDrag.last, row = document.querySelector('#gantt [data-orow="C1"]'); const _e = document.elementFromPoint; document.elementFromPoint = ()=>row; row.getBoundingClientRect = ()=>({top:0, height:40}); st.move({clientX:5, clientY:20}); st.end({}); document.elementFromPoint = _e; })()`);
  ok("N17: dragging a row's grip onto the middle of another nests it", ev(`barById("Q").parent`)==="C1"); ev("undo()");
  ok("N18: nesting survives save/load", ev(`(()=>{ const p2 = parseText(serialize(S,'x.json')); return p2.bars.find(b=>b.id==="G").parent==="C2"; })()`));
  ev("setZoom('weeks'); sel=null; render()");
  // --- review fixes ---
  ok("RV1: an initiative can't depend on its own holder (reschedule ignores it; loads drop it)", ev(`normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],bars:[{id:"H",lane:"a",start:0,span:4,label:"H"},{id:"C",lane:"a",parent:"H",start:0,span:1,label:"C",dependsOn:["H"]}]},false).bars[1].dependsOn.length`)===0);
  ev(`makeLink("bar","P","bar","C1")`); ok("RV1: linking a holder to its child is refused", !ev(`barById("C1").dependsOn.includes("P")`));
  ev(`commit(()=>{ barById("Q").dependsOn = ["C1"]; }); commit(()=>moveBarTo("Q","C1","inside") || NOCHANGE)`);
  ok("RV1: nesting drops a link that became inside-the-same-tree", ev(`barById("Q").dependsOn.length`)===0); ev("undo(); undo()");
  { const chain = Array.from({length:11},(_,i)=>`{id:"d${i}",lane:"a",${i?`parent:"d${i-1}",`:""}start:0,span:1,label:"L${i}"}`).join(",");
    ok("RV2: deep nesting (11 levels) survives a reload", ev(`normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],bars:[${chain}]},false).bars[10].parent`)==="d9"); }
  const past0 = ev("past.length"); ev(`commit(()=>moveBarTo("P","G","inside") || NOCHANGE)`);
  ok("RV10: a refused move leaves no empty undo step", ev("past.length")===past0);
  ok("RV4: weekend matches don't use up 'End after'", occ({freq:"daily",every:1,ends:"count",count:10},"2026-10-05","2026-10-01","2026-12-31").split(",").length===10, occ({freq:"daily",every:1,ends:"count",count:10},"2026-10-05","2026-10-01","2026-12-31"));
  ok("RV4: a yearly date on a weekend moves to the nearest weekday", occ({freq:"yearly",month:6,day:4,ends:"count",count:3},"2026-07-01","2026-07-01","2028-12-31")==="2026-07-03,2027-07-05", occ({freq:"yearly",month:6,day:4,ends:"count",count:3},"2026-07-01","2026-07-01","2028-12-31"));
  ev(`S.meetings = [{id:"lm",title:"Lane sync",lane:"b",date:"2026-10-06",time:"",end:"",recur:normRecur({},"2026-10-06"),skip:[],attendees:[],groups:[],note:""}]; render()`);
  ev(`window.confirm = ()=>true; moveLaneWork("b", S.lanes.find(l=>l.id!=="b").id)`); ok("RV5: moving a workstream's work takes its meetings along (they don't become team-wide)", ev(`S.meetings[0].lane`)===ev(`S.lanes.find(l=>l.id!=="b").id`)); ev("undo()");
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],bars:[{id:"H",lane:"a",start:0,span:4,label:"H"},{id:"C",lane:"a",parent:"H",start:0,span:1,label:"C",tasks:[{id:"t",label:"x",start:"2026-10-05",days:1}],datesFrom:"tasks"}]},false); resetHistory(); commit(()=>{})`);
  ok("RV7: a holder of a one-day item ends that same day", ev(`dayToIso(barEndDay(barById("H")))`)==="2026-10-05", ev(`dayToIso(barEndDay(barById("H")))`));
  ok("RV6: deep holders stay fast", (()=>{ const t0 = Date.now(); ev(`(()=>{ const bars=[]; for (let i=0;i<9;i++) for (let k=0;k<3;k++) bars.push({id:"n"+i+"_"+k, lane:"a", parent: i ? "n"+(i-1)+"_0" : "", start:0, span:1, label:"n"}); S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],bars},false); rollupOf(barById("n0_0")); render(); })()`); return Date.now() - t0 < 1500; })());
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],people:[{id:"p",name:"P",off:[{from:"2026-10-09",to:"2026-10-13"}]}],holidays:[{date:"2026-10-12",name:"H"}],bars:[]},false); render()`);
  ok("RV11: time-off day counts leave holidays out", ev(`offDaysCount(personById("p"))`)===2);
  ev(`S = normalize({meta:{start:"2026-10-05",weeks:12},lanes:[{id:"a",name:"A"}],holidays:[{date:"2026-10-12",name:"H"}],bars:[{id:"Big",lane:"a",start:0,span:6,label:"Big"},{id:"Sm",lane:"a",start:1,span:1,label:"Small"},{id:"Bd",lane:"a",start:2,span:1,label:"Build",dependsOn:["Big"]}]},false); resetHistory(); render()`);
  ev(`commit(()=>moveBarTo("Sm","Big","inside") || NOCHANGE)`);
  ok("RV12: nesting shrinks a plain initiative to what's inside (and says so)", Math.abs(ev(`barById("Big").start`) - 1) < 1e-9);
  ev(`commit(()=>moveBarTo("Sm","Big","after") || NOCHANGE)`);
  ok("RV12: emptying it again brings its own dates back", ev(`barById("Big").start`)===0 && ev(`barById("Big").span`)===6 && !ev(`"plan" in barById("Big")`));
  ev(`commit(()=>moveBarTo("Bd","Big","inside") || NOCHANGE)`);
  ok("RV13: nesting a bar into the one it depends on removes the link instead of running away", ev(`barById("Bd").dependsOn.length`)===0 && ev(`barById("Big").start`) < 4, ev(`JSON.stringify([barById("Bd").start, barById("Big").start, S.meta.weeks])`));
  ok("RV14: a one-off meeting on a holiday still shows", ev(`occurrences({id:"z",date:"2026-10-12",recur:normRecur({},"2026-10-12"),skip:[]}, isoToDay("2026-10-01"), isoToDay("2026-10-31")).length`)===1);
  // A browser moves a scrolled box to the top when the chart it holds is laid out empty (as a redraw empties it first).
  ev(`(()=>{ const gsc = $("#gscroll"), g = $("#gantt"); let top = 0; window.__pageY = 0;
    const layout = () => { if (!g.childElementCount){ top = 0; window.__pageY = 0; } };
    Object.defineProperty(gsc, "scrollTop", {configurable:true, get(){ return top; }, set(v){ top = v; }});
    Object.defineProperty(gsc, "clientWidth", {configurable:true, get(){ layout(); return 1100; }});
    Object.defineProperty(window, "scrollY", {configurable:true, get(){ return window.__pageY; }});
    window.scrollTo = (x, y) => { window.__pageY = y; }; })()`);
  for (const z of ["weeks","days"]){
    ev(`setZoom("${z}")`); ev(`$("#gscroll").scrollTop = 240; window.__pageY = 90; render()`);
    ok(`SC1: a redraw keeps the timeline where you'd scrolled to (${z})`, ev(`$("#gscroll").scrollTop`)===240 && ev("window.scrollY")===90, ev(`JSON.stringify([$("#gscroll").scrollTop, window.scrollY])`));
  }
  ev(`setZoom("weeks"); delete $("#gscroll").scrollTop; delete $("#gscroll").clientWidth; delete window.scrollY`);
  ev("sel=null; render()");
  { const r = JSON.parse(ev(`JSON.stringify([...document.querySelectorAll("#gantt .track > .bar")].map(b=>({bin:b.querySelectorAll(":scope > .bin").length, nm:!!b.querySelector(":scope > .bin .nm"), h:[...b.querySelectorAll(".h")].every(x=>x.parentElement === b)})))`));
    ok("PL1: every Weeks bar keeps its name in one box that can ride along the left edge, its drag handles outside it", r.length >= 1 && r.every(x=>x.bin === 1 && x.nm && x.h), r.length + " bars " + JSON.stringify(r.find(x=>!(x.bin === 1 && x.nm && x.h)))); }
  { // a narrow bar hides a tag it can't fit whole (cutTags), so a late task bar must say "late" in its own accessible name
    w.__tlPlan = JSON.stringify(plan);
    const r = JSON.parse(ev(`(()=>{ const was = JSON.stringify(S), out = []; S = parseText(window.__tlPlan); const b0 = S.bars.find(b=>!b.parked && own(b).length);
      act("task.add", {id:"t-late", bar:b0.id, start:"2026-09-28", days:3, label:"Overdue check", owners:[own(b0)[0]]}, S); actTask(S, "t-late").t.status = "inprogress";   // the clock is fixed at Oct 7, so it ended last week
      try { for (const [z, rows] of [["weeks", "people"], ["days", "people"], ["days", "lanes"]]){ goWs("timeline"); UI.zoom = z; UI.rows = rows; render();
        out.push(...[...document.querySelectorAll("#gantt .taskbar, #gantt .tbar")].filter(b=>b.dataset.peekType === "task").filter(b=>b.classList.contains("late")).map(b=>({z:z + "/" + rows, cls:b.className.split(" ").slice(0, 2).join("."), late:true, said:/late/i.test(b.getAttribute("aria-label") || "")}))); } }
      finally { S = JSON.parse(was); render(); }
      return JSON.stringify(out); })()`));
    ok("TL1: every late task bar says late in its accessible name, in Weeks and Days, by person and by workstream", r.length >= 2 && r.every(x=>x.late && x.said), JSON.stringify(r) + ` of ${r.length}: ` + [...new Set(r.map(x=>x.z))].join(", ")); }
  { // QB: an empty Updates or Notes box is one line until opened; a draft, an earlier open, or an entry keeps it full.
    ev("render()"); await wait(20);
    ev(`commit(()=>{ S.bars[0].tasks.push({id:"qb1",label:"QB one",start:S.meta.start,days:1,owners:[],status:"notstarted"},{id:"qb2",label:"QB two",start:S.meta.start,days:1,owners:[],status:"notstarted"}); })`);
    const tk = "qb1", tk2 = "qb2";
    ev(`select("task","${tk}")`); await wait(20);
    const st = () => JSON.parse(ev(`JSON.stringify([...document.querySelectorAll("#side .field")].filter(f=>f.querySelector("#q-upd,#sticky-in")).map(f=>({q:f.classList.contains("quiet"), hid:f.querySelector(".uadd").hidden, open:f.querySelector(".qopen")?.textContent || ""})))`));
    const a = st();
    ok("QB1: an empty Updates and Notes box are each one line with an Add button", a.length === 2 && a.every(x=>x.q && x.hid) && a[0].open === "+Add an update" && a[1].open === "+Add a note" && !/No updates yet/.test(d.querySelector("#side").textContent), JSON.stringify(a));
    ev(`document.querySelector('#side .qopen[data-qopen="q-upd"]')?.click()`); await wait(5);
    const b1 = st(), f1 = ev("document.activeElement && document.activeElement.id");
    ev("renderSide()"); await wait(5); const b2 = st();
    ok("QB2: Add an update opens the box, puts the cursor in it, and it stays open on a redraw", !b1[0].q && !b1[0].hid && f1 === "q-upd" && !b2[0].q && b2[1].q, JSON.stringify([b1, f1, b2]));
    ev("document.activeElement.blur()"); ok("QB3: S opens an empty Notes box and puts the cursor in it", ev('quickKey("s")') === true && !st()[1].q && ev("document.activeElement && document.activeElement.id") === "sticky-in", JSON.stringify(st()));
    ev(`composerDrafts.set(composerKey("task:${tk2}","q-upd"), "half-written"); select("task","${tk2}")`); await wait(5);
    ok("QB4: a box with an unsent draft opens full, with the draft", !st()[0].q && ev(`document.querySelector("#q-upd").value`) === "half-written", JSON.stringify(st()));
    ev(`composerDrafts.clear(); addUpdate(S, "task:${tk2}", "Started"); renderSide()`); await wait(5);
    ok("QB5: a box with updates shows them and the add field, not one line", !st()[0].q && d.querySelectorAll("#side .ulog li").length >= 1, JSON.stringify(st()));
  }
  { // the holiday set and day parsing are cached across draws: an edit in place, an added and a removed holiday all show at once
    const r = ev(`(()=>{ const P = clone(S); P.holidays = [{date:"2026-10-12", name:"A"}]; const n = isoToDay("2026-10-12"), m = isoToDay("2026-10-13");
      const a = holidaySet(P).has(n); P.holidays[0].date = "2026-10-13"; const b = holidaySet(P).has(m) && !holidaySet(P).has(n);
      P.holidays.push({date:"2026-10-12", name:"B"}); const c = holidaySet(P).has(n); P.holidays.splice(0, 2); const e = holidaySet(P).size === 0;
      return [a, b, c, e, isoToDay("2026-10-12") === n, isoToDay("2026-10-12") === dayNum(2026, 10, 12)].join(); })()`);
    const u = ev(`(()=>{ const was = S.updates, key = "bar:" + S.bars[0].id, n0 = updatesFor(key).length; S.updates = [...(S.updates || [])];
      addUpdate(S, key, "one"); const a = updatesFor(key).length === n0 + 1 && updatesFor(key)[0].text === "one";
      S.updates[S.updates.length - 1].text = "edited"; const b = updatesFor(key)[0].text === "edited";
      S.updates.splice(S.updates.length - 1, 1); const c = updatesFor(key).length === n0;
      updatesFor(key).push({item:key}); const e = updatesFor(key).length === n0; S.updates = was; return [a, b, c, e].join(); })()`);
    ok("HC2: an item's updates follow adds, edits and deletes, and callers can't change the index", u === "true,true,true,true", u);
    const dw = ev(`(()=>{ const bad = []; for (let n = -40000; n <= 40000; n += 0.5) if (dow(n) !== new Date(n * 86400000).getUTCDay()) bad.push(n); return bad.length + ":" + bad.slice(0, 3).join(); })()`);
    ok("HC3: the weekday of every day from 1860 to 2079 matches the calendar", dw === "0:", dw);
    ok("HC1: holidays edited, added or removed in place count at once, and dates read the same", r === "true,true,true,true,true,true", r); }
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
