// The status map: how each Jira status and resolution shows in Sightline (the board's columns, abandoned work, the
// team's overrides), and parking-lot sprints. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
// A board shaped like a real one: work flows Ready -> To Do -> In Progress -> Step 1 -> Step 2 -> Done, and Done holds
// finished AND abandoned statuses. "Completed" is (wrongly) in Jira's in-progress category but sits in Done.
const COLS = [{name:"Ready", statuses:["Ready","Backlog"]}, {name:"To Do", statuses:["To Do"]}, {name:"In Progress", statuses:["In Progress"]},
  {name:"Testing (Step 1)", statuses:["Step 1"]}, {name:"Awaiting review (Step 2)", statuses:["Step 2"]},
  {name:"Done", statuses:["Closed","Abandoned","Done","Not Applicable","In Production","Expired","Completed"]}];
const iss = (k, status, category, x = {}) => ({summary:`Issue ${k}`, status, category, type:"Story", resolution:"", ...x});
const status = (x = {}) => JSON.stringify({kind:"sightline-jira-status", snapshot:"aaaa1111bbbb2222", jiraBase:"https://jira.example.com", generatedAt:at,
  board:{id:7, name:"Team board", columns:COLS},
  sprints:[{id:50, name:"Sprint 50", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:99, name:"Parking Lot", state:"future", start:"2026-09-21", end:"2026-09-25"}],
  issues:{"ABC-1":iss("ABC-1","Closed","done",{resolution:"Won't Do"}), "ABC-2":iss("ABC-2","Step 1","inprogress"), "ABC-3":iss("ABC-3","Backlog","todo"),
          "ABC-4":iss("ABC-4","Completed","inprogress"), "ABC-5":iss("ABC-5","In Progress","inprogress",{sprint:"Parking Lot", sprintId:99, sprintState:"future", sprintStart:"2026-09-21", sprintEnd:"2026-09-25"}),
          "ABC-6":iss("ABC-6","Weird","",{}), "ABC-10":{summary:"Epic", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}},
  missing:[], rollups:{"ABC-10":{total:10, todo:2, inprogress:3, done:5, unknown:0, points:0, pointsDone:0, unestimated:10,
    byState:{"Closed|Done|done":[3,0], "Abandoned||done":[2,0], "Closed|Duplicate|done":[1,0], "Step 2||inprogress":[2,0], "Backlog||todo":[2,0]}}}, ...x});
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
  w.FIX = plan; w.ST = status();
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length);
    L[0].jira = "ABC-1"; L[1].jira = "ABC-2"; L[2].jira = "ABC-5"; L[2].start = 6; L[3].epics = ["ABC-10"]; L[3].jira = "";
    L[4].tasks = [{id:"ta", label:"Kept", start:S.meta.start, days:4, owners:[], jira:"", status:"done"}, {id:"tb", label:"Dropped", start:S.meta.start, days:6, owners:[], jira:"ABC-1", status:"inprogress"}]; L[4].datesFrom = "manual";
    window.IDS = L.slice(0,5).map(b=>b.id);
    file.handle = null; resetHistory(); sel = null; setWs("timeline"); setZoom("weeks"); JIRA = parseJiraStatus(ST); render();`);
  return {w, d: w.document, ev, B: i => ev(`IDS[${i}]`)};
}
const st = (ev, a, b, c) => ev(`JSON.stringify(jiraState(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${JSON.stringify(c)}))`);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- M1: the files ----
  await sec(async ()=>{ const {ev} = await page();
    ok("M1: the board's columns and their statuses are read", ev("JIRA.board.columns.length") === 6 && ev("JIRA.board.columns[5].statuses.includes('Abandoned')"));
    ok("M1: each issue's resolution and sprint state", ev("JIRA.issues['ABC-1'].resolution") === "Won't Do" && ev("JIRA.issues['ABC-5'].sprintState") === "future");
    ok("M1: epic counts by status and resolution", ev("Object.keys(JIRA.rollups['ABC-10'].byState).length") === 5); });

  // ---- M2: what each status means, automatically ----
  await sec(async ()=>{ const {ev} = await page();
    const S2 = (a,b,c) => JSON.parse(st(ev,a,b,c));
    ok("M2: the board's last column is done", S2("Closed","Done","done").state === "done" && S2("In Production","","done").state === "done");
    ok("M2: ...even for a status Jira misfiled as in progress", S2("Completed","","inprogress").state === "done");
    ok("M2: abandoned statuses in the Done column are abandoned, not done", S2("Abandoned","","done").state === "abandoned" && S2("Not Applicable","","done").state === "abandoned" && S2("Expired","","done").state === "abandoned");
    ok("M2: so is anything closed as Won't Do, Duplicate or Cancelled", S2("Closed","Won't Do","done").state === "abandoned" && S2("Closed","Duplicate","done").state === "abandoned" && S2("Done","Cancelled","done").state === "abandoned");
    ok("M2: early columns are not started", S2("Backlog","","todo").state === "notstarted" && S2("Ready","","todo").state === "notstarted");
    ok("M2: middle columns are in progress, and show the column's name", S2("Step 1","","inprogress").state === "inprogress" && S2("Step 1","","inprogress").label === "Testing (Step 1)");
    ok("M2: a status not on the board falls back to Jira's category", S2("Reviewing","","inprogress").state === "inprogress" && S2("Weird","","").state === null); });

  // ---- M3: the team's overrides ----
  await sec(async ()=>{ const {ev} = await page();
    ev(`S.meta.jiraStatusMap = {"Step 2":"done", "Weird":"inprogress"}; S.meta.jiraResMap = {"Duplicate":"done"}`);
    ok("M3: a status set in the map wins", JSON.parse(st(ev,"Step 2","","inprogress")).state === "done" && JSON.parse(st(ev,"Weird","","")).state === "inprogress");
    ok("M3: a resolution can be marked not abandoned", JSON.parse(st(ev,"Closed","Duplicate","done")).state === "done");
    ok("M3: the map is saved in the plan, cleaned", ev(`JSON.stringify(normalize({lanes:[{id:"a", name:"A"}], meta:{jiraStatusMap:{"A":"done", "B":"nope", "":"done"}, jiraResMap:"x"}}, false).meta.jiraStatusMap)`) === JSON.stringify({A:"done"}));
    const r = JSON.parse(ev(`(()=>{ S.meta.jiraStatusMap = {"X":"done"}; file.baseText = serialize(S, "p.json"); const base = parseText(file.baseText);
      S = clone(base); S.meta.jiraStatusMap = {"X":"done", "Mine":"abandoned"};
      const theirs = clone(base); theirs.meta.jiraStatusMap = {"X":"done", "Theirs":"inprogress"}; theirs.meta.revision = (base.meta.revision || 0) + 1;
      rebaseOnto(theirs, serialize(theirs, "p.json")); return JSON.stringify(S.meta.jiraStatusMap); })()`));
    ok("M3: two people's map changes both survive a merge", r.Mine === "abandoned" && r.Theirs === "inprogress" && r.X === "done", JSON.stringify(r)); });

  // ---- M4: abandoned work in the plan ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    ok("M4: an item linked to abandoned work is marked abandoned, and closed", ev(`barById("${B(0)}").abandoned`) === true && ev(`barById("${B(0)}").status`) === "done");
    ok("M4: it's struck through on the chart", d.querySelector(`#gantt .bar[data-key="bar:${B(0)}"]`)?.classList.contains("abandoned"));
    ok("M4: an item in a middle column is in progress", ev(`barById("${B(1)}").status`) === "inprogress" && !ev(`barById("${B(1)}").abandoned`));
    ev(`select("bar", "${B(0)}")`);
    ok("M4: the panel says why", /Status from Jira: Abandoned \(Won't Do\)/.test(d.querySelector("#side .jstatus")?.textContent || ""), d.querySelector("#side .jstatus")?.textContent);
    ok("M4: abandoned tasks don't count toward an initiative's progress", ev(`rollupOf(barById("${B(4)}")).n`) === 1 && ev(`rollupOf(barById("${B(4)}")).pct`) === 100 && ev(`effStatus(barById("${B(4)}"))`) === "done");
    ok("M4: the flag survives saving", ev(`normalize(JSON.parse(serialize(S, "p.json")), false).bars.find(b=>b.id==="${B(0)}").abandoned`) === true); });

  // ---- M5: epic counts follow the map ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    const r = () => JSON.parse(ev(`JSON.stringify(epicRollup(barById("${B(3)}")))`));
    ok("M5: counts come from each status's meaning; abandoned ones are left out", r().total === 7 && r().done === 3 && r().abandoned === 3 && r().inprogress === 2 && r().todo === 2, JSON.stringify(r()));
    ev(`select("bar", "${B(3)}")`);
    ok("M5: the panel says how many were abandoned", /3 abandoned in Jira, not counted/.test(d.querySelector("#side .field.epics")?.textContent || ""));
    ev(`S.meta.jiraStatusMap = {"Step 2":"done"}; render()`);
    ok("M5: changing the map changes the counts at once", r().done === 5 && r().inprogress === 0); });

  // ---- M6: a "future" sprint whose dates have passed is a parking lot ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    ok("M6: an issue parked in it isn't scheduled by it", ev(`jiraLockOf(barById("${B(2)}")).dates`) === false && ev(`barById("${B(2)}").start`) === 6);
    ev(`select("bar", "${B(2)}")`);
    ok("M6: and says so", /In Parking Lot, which isn't a scheduled sprint/.test(d.querySelector("#side .jlockline")?.textContent || ""), d.querySelector("#side .jlockline")?.textContent);
    ok("M6: the plan's sprints ignore it", !ev("JSON.stringify(sprintProposal().rows)").includes("Parking Lot")); });

  // ---- M7, M8: the status map in the Jira window ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev("openJiraDialog()");
    const m = d.querySelector("#jiraMap");
    ok("M7: the Jira window lists the statuses in use, grouped by board column", !!m && /Board column: Done/.test(m.textContent) && /Board column: Testing \(Step 1\)/.test(m.textContent) && /Not on the board/.test(m.textContent));
    ok("M7: each says what it shows as, and why", /Automatic: Done · board column Done/.test(m.textContent) && /Automatic: Abandoned · status Abandoned/.test(m.textContent));
    ok("M7: it opens by itself when a status has no category", m.open === true && /1 need a choice/.test(m.querySelector("summary").textContent), m.querySelector("summary").textContent);
    ok("M7: resolutions in use are listed too", /Won't Do/.test(m.textContent) && /Duplicate/.test(m.textContent));
    const sel = m.querySelector('[id^="sm-"]'); const name = sel.closest("tr").firstChild.textContent;
    sel.value = "abandoned"; sel.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(10);
    ok("M7: choosing one saves it for the team", ev(`S.meta.jiraStatusMap[${JSON.stringify(name)}]`) === "abandoned", name);
    ok("M7: with the board's columns, there's no warning about them", !d.querySelector("#jiraMapNoBoard"));
    ev(`JIRA.board.columns = []; openJiraDialog()`);
    ok("M7: without them, the map says why and what to do", /couldn't read your board's columns/.test(d.querySelector("#jiraMapNoBoard")?.textContent || ""));
    ev(`const sv = JIRA; JIRA = null; JIRA_ISSUES = parseJiraIssues(JSON.stringify({kind:"sightline-jira-issues", generatedAt:"${at}", jql:"x", total:1, issues:[{key:"ABC-9", summary:"s", status:"Backlog", category:"todo", type:"Story"}]})); openJiraDialog()`);
    ok("M7: and with only the issues file connected, it says to connect the status file", /connect the Jira folder/.test(d.querySelector("#jiraMapNoBoard")?.textContent || ""), d.querySelector("#jiraMapNoBoard")?.textContent);
    ev("locked = true; openJiraDialog()");
    ok("M8: read-only, the map shows but can't be changed", [...d.querySelectorAll('#jiraMap select')].every(s=>s.disabled) && /Start editing/.test(d.querySelector("#jiraMap").textContent));
    ok("no runtime errors (M7)", w.errs.length === 0, w.errs.join(" | ")); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
