// Jira search: the issues a filter finds, listed so they can be added to the plan or skipped. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
// The two files the sync script writes: jira-status.json (the plan's own keys) and jira-issues.json (the search).
// The search found ABC-1..4; ABC-2 is already on an initiative in the plan.
const issue = (k, x = {}) => ({summary:`Summary of ${k}`, status:"In Progress", category:"inprogress", assignee:"Avery", due:"2026-10-09", updated:"", resolved:false, type:"Story", priority:"High", url:`https://jira.example.com/browse/${k}`, ...x});
const at = new Date(Date.UTC(2026, 8, 23, 14)).toISOString();
const status = () => JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:at, jiraBase:"https://jira.example.com", issues:{"ABC-2":issue("ABC-2")}, missing:[]});
const listing = (extra = {}) => JSON.stringify({kind:"sightline-jira-issues", version:1, generatedAt:at, jiraBase:"https://jira.example.com", jql:"project = ABC AND resolution = Unresolved", total:4, truncated:false,
  issues:[{key:"ABC-1", ...issue("ABC-1")}, {key:"ABC-2", ...issue("ABC-2")}, {key:"ABC-3", ...issue("ABC-3", {assignee:"Someone Else", due:"", category:"todo", status:"Open"})},
          {key:"ABC-4", ...issue("ABC-4", {summary:"<img src=x onerror=window.pwned=1>"})}, {key:"bad key", ...issue("x")}, {key:"ABC-1", ...issue("ABC-1", {summary:"duplicate"})}], ...extra});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 23, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.STATUS = status(); w.LISTING = listing();
  ev(`askWhoOnStart = ()=>{}; S = normalize(JSON.parse(FIX), false); S.bars[0].jira = "abc-2"; file.handle = null; resetHistory(); sel = null; setWs("timeline"); render();
    JIRA = parseJiraStatus(STATUS); JIRA_ISSUES = parseJiraIssues(LISTING); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- J1: jira-issues.json is its own file, read as untrusted data ----
  await sec(async ()=>{ const {ev} = await page();
    ok("J1: the search and its issues are read from jira-issues.json", ev("JIRA_ISSUES.jql") === "project = ABC AND resolution = Unresolved" && ev("JIRA_ISSUES.issues['ABC-1'].type") === "Story" && ev("JIRA_ISSUES.issues['ABC-1'].priority") === "High");
    ok("J1: bad and repeated keys are dropped, Jira's order kept", ev("JSON.stringify(JIRA_ISSUES.keys)") === JSON.stringify(["ABC-1","ABC-2","ABC-3","ABC-4"]) && ev("JIRA_ISSUES.issues['ABC-1'].summary") === "Summary of ABC-1", ev("JSON.stringify(JIRA_ISSUES.keys)"));
    ok("J1: the status file stays status only", ev("Object.keys(JIRA.issues).join()") === "ABC-2" && ev("JIRA.filter") === undefined);
    ok("J1: the two files can't be mixed up", ev(`(()=>{ try { parseJiraIssues(STATUS); return false; } catch(e){ return /jira-issues.json/.test(e.message); } })()`) && ev(`(()=>{ try { parseJiraStatus(LISTING); return false; } catch(e){ return true; } })()`));
    ok("J1: a huge search text is capped", ev(`parseJiraIssues(${JSON.stringify(listing({jql:"x".repeat(9000)}))}).jql.length`) === 2000);
    ok("J1: with no issues file, nothing is offered", (ev("JIRA_ISSUES = null"), ev("jiraNew().length")) === 0); });

  // ---- J2: what's new = in the search, not in the plan (any case), not skipped ----
  await sec(async ()=>{ const {ev} = await page();
    ok("J2: an issue already on an initiative isn't offered again, even in lower case", ev("JSON.stringify(jiraNew())") === JSON.stringify(["ABC-1","ABC-3","ABC-4"]), ev("JSON.stringify(jiraNew())"));
    ev(`S.bars[1].tasks = [{id:"tj", label:"x", start:S.meta.start, days:1, owners:[], jira:"ABC-3", status:"notstarted"}]`);
    ok("J2: nor one already on a task", !ev("jiraNew()").includes("ABC-3")); });

  // ---- J3: the Jira window lists them, and adds the picked ones as initiatives ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev("openJiraDialog()");
    const body = d.querySelector("#jiraBody"), rows = () => [...body.querySelectorAll(".jnew .jdiff")];
    ok("J3a: the window says how many aren't in the plan, and shows the search", /3 issues aren.t in the plan yet/.test(body.textContent) && body.querySelector(".jnew code")?.textContent === "project = ABC AND resolution = Unresolved");
    ok("J3a: each shows its key, summary, type, status, assignee and due date", rows().length === 3 && /ABC-1/.test(rows()[0].textContent) && /Story · In Progress · Avery · due Oct 9/.test(rows()[0].textContent), rows()[0]?.textContent);
    ok("J3a: Jira text is shown as text, never as HTML", !body.querySelector(".jnew img") && ev("!window.pwned") && rows()[2].textContent.includes("<img"));
    ok("J3a: nothing is picked until you pick it", rows().every(r=>!r.querySelector("input").checked));
    const n0 = ev("S.bars.length");
    rows()[0].querySelector("input").checked = true; rows()[1].querySelector("input").checked = true;
    const tgt = body.querySelector("#jiraTarget"); tgt.value = "lane:int";
    body.querySelector("#jiraAdd").click(); await wait(10);
    const added = ev(`JSON.stringify(S.bars.filter(b=>["ABC-1","ABC-3"].includes(b.jira)).map(b=>({j:b.jira, l:b.label, lane:b.lane, st:b.status, o:b.owners, start:b.start, span:b.span})))`);
    const a = JSON.parse(added);
    ok("J3b: Add picked makes one initiative per picked issue, in the chosen lane", ev("S.bars.length") === n0 + 2 && a.length === 2 && a.every(x=>x.lane === "int"), added);
    ok("J3b: shows Jira's summary as its title, linked by the key (the title isn't copied into the plan)", a[0].l === "ABC-1" && a[0].j === "ABC-1" && ev(`barTitle(S.bars.find(b=>b.jira==="ABC-1"))`) === "Summary of ABC-1");
    ok("J3b: status comes from Jira, not copied in", ev(`jiraCategory(S.bars.find(b=>b.jira==="ABC-1")).category`) === "inprogress" && ev(`jiraCategory(S.bars.find(b=>b.jira==="ABC-3")).category`) === "todo");
    ok("J3b: with no Jira user link, nobody is guessed as owner from a display name", a[0].o.length === 0 && a[1].o.length === 0, JSON.stringify(a.map(x=>x.o)));
    ok("J3b: it starts today and ends on its due date", ev(`fmtDay(wkDay(${a[0].start}))`) === "Sep 21" && ev(`barEndDay(S.bars.find(b=>b.jira==="ABC-1")) >= isoToDay("2026-10-09")`) && ev(`barEndDay(S.bars.find(b=>b.jira==="ABC-1")) <= isoToDay("2026-10-16")`), ev(`fmtDay(barEndDay(S.bars.find(b=>b.jira==="ABC-1")))`));
    ok("J3b: and they drop off the list", ev("JSON.stringify(jiraNew())") === JSON.stringify(["ABC-4"]) && /1 issue isn.t in the plan yet/.test(d.querySelector("#jiraBody").textContent));
    ok("J3b: one Undo takes the whole batch back", (ev("undo()"), ev("S.bars.length")) === n0);
    ok("no runtime errors (J3)", w.errs.length === 0, w.errs.join(" | ")); });

  // ---- J4: or as tasks in an initiative ----
  await sec(async ()=>{ const {d, ev} = await page();
    const leaf = ev(`S.bars.find(b=>!hasKids(b) && !(b.tasks||[]).length && b.id !== S.bars[0].id).id`);
    ev("openJiraDialog()"); const body = d.querySelector("#jiraBody");
    body.querySelector(".jnew .jdiff input").checked = true; body.querySelector("#jiraTarget").value = "bar:" + leaf; body.querySelector("#jiraAdd").click(); await wait(10);
    const t = JSON.parse(ev(`JSON.stringify(barById("${leaf}").tasks)`));
    ok("J4: Add picked can make tasks in an initiative instead", t.length === 1 && t[0].jira === "ABC-1" && t[0].label === "ABC-1" && ev(`taskTitle(S.bars.flatMap(b=>b.tasks||[]).find(t=>t.jira==="ABC-1"))`) === "Summary of ABC-1" && t[0].start === "2026-09-23");
    ok("J4: a task runs from today to its due date", t[0].days === ev(`workBetween(isoToDay("2026-09-23"), isoToDay("2026-10-09"), HS())`), String(t[0].days)); });

  // ---- J5: skip, shared through the plan file ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("openJiraDialog()"); const body = () => d.querySelector("#jiraBody");
    body().querySelector(".jnew .jdiff input").checked = true; body().querySelector("#jiraSkip").click(); await wait(10);
    ok("J5: Skip picked leaves it out of the list", !ev("jiraNew()").includes("ABC-1") && /1 skipped/.test(body().textContent));
    ok("J5: the skip is saved in the plan, so teammates see it too", ev(`normalize(JSON.parse(serialize(S, "p.json")), false).meta.jiraSkip.includes("ABC-1")`));
    ok("J5: and a teammate's skip is brought in when their change is merged", ev(`(()=>{ const a = clone(S); a.meta.jiraSkip = []; return diffPlans(a, S).some(o=>o.type === "meta" && o.field === "jiraSkip"); })()`));
    ok("J5: bad keys in a plan's skip list are dropped", ev(`JSON.stringify(normalize({meta:{jiraSkip:["abc-9", "not a key", 5, "ABC-9"]}, lanes:[{id:"a", name:"A"}]}, false).meta.jiraSkip)`) === JSON.stringify(["ABC-9"]));
    body().querySelector("#jiraUnskip").click(); await wait(10);
    ok("J5: Show them again brings skipped issues back", ev("jiraNew()").includes("ABC-1")); });

  // ---- J8: the Jira window connects the issues file on its own ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA_ISSUES = null; openJiraDialog()"); const body = d.querySelector("#jiraBody");
    ok("J8: without it, the window offers to connect jira-issues.json", /Connect jira-issues.json/.test(body.querySelector("#jiraIssuesConnect")?.textContent || "") && !body.querySelector(".jnew .jdiff"));
    ev(`JIRA_ISSUES = parseJiraIssues(LISTING); openJiraDialog()`);
    ok("J8: with it, Reload and Disconnect are there too", !!body.querySelector("#jiraIssuesReload") && !!body.querySelector("#jiraIssuesOff"));
    body.querySelector("#jiraIssuesOff").click(); await wait(10);
    ok("J8: Disconnect drops only the issues file", ev("JIRA_ISSUES") === null && ev("JIRA !== null")); });

  // ---- J10: Select all ----
  await sec(async ()=>{ const {d, w} = await page();
    w.eval("openJiraDialog()"); const body = d.querySelector("#jiraBody"), all = body.querySelector("#jiraAll"), boxes = () => [...body.querySelectorAll(".jdiffs input")];
    ok("J10: a Select all checkbox heads the list, with the count", !!all && /Select all 3/.test(all.closest("label").textContent));
    all.checked = true; all.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("J10: it ticks every issue", boxes().length === 3 && boxes().every(b=>b.checked));
    boxes()[0].checked = false; boxes()[0].dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("J10: unticking one shows it's partly selected", all.checked === false && all.indeterminate === true);
    all.checked = false; all.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("J10: unticking it clears them all", boxes().every(b=>!b.checked));
    w.eval("locked = true; openJiraDialog()");
    ok("J10: read-only, there's nothing to select", !d.querySelector("#jiraAll")); });

  // ---- J11: connect a board's folder instead of its files ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    const dir = (files, name = "jira-Team") => ({name, getFileHandle: async n => { if (!(n in files)) throw new Error("NotFound"); return {getFile: async ()=>({text: async ()=>files[n]})}; },
      queryPermission: async ()=>"granted", requestPermission: async ()=>"granted"});
    w.DIR = dir({"status.json": w.STATUS, "issues.json": w.LISTING});
    ev("JIRA = null; JIRA_ISSUES = null"); await ev("readJiraDir(DIR)");
    ok("J11: one folder brings both the status and the search", ev("!!JIRA && !!JIRA_ISSUES") && ev("JIRA_ISSUES.keys.length") === 4);
    w.OLD = dir({"jira-status.json": w.STATUS}, "planner");
    ev("JIRA = null; JIRA_ISSUES = null"); await ev("readJiraDir(OLD)");
    ok("J11: a folder with the old file names works too", ev("!!JIRA") && ev("JIRA_ISSUES") === null);
    w.EMPTY = dir({}, "Downloads");
    ok("J11: a folder with no Jira files says so", (await ev("readJiraDir(EMPTY)")) === false && /Downloads has no Sightline Jira files/.test(d.querySelector("#status").textContent));
    ev("jiraDir = DIR; openJiraDialog()");
    ok("J11: connected, the window shows the folder and hides the per-file buttons", /jira-Team/.test(d.querySelector(".jfolder").textContent) && !d.querySelector("#jiraConnect") && !d.querySelector("#jiraIssuesConnect"));
    ev("jiraDir = null; openJiraDialog()");
    ok("J11: not connected, it offers the folder first", !!d.querySelector("#jiraDirConnect") && d.querySelector("#jiraDirConnect").classList.contains("primary")); });

  // ---- J12: several named searches ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    const V2 = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:at, jiraBase:"https://jira.example.com",
      searches:[{name:"Epics", jql:"project = ABC AND cf[1] is not EMPTY", total:2, truncated:false, keys:["ABC-1","ABC-3"]},
                {name:"This sprint", jql:"project = ABC AND sprint in openSprints()", total:3, truncated:false, keys:["ABC-3","ABC-4","ABC-2"]},
                {name:"This sprint", jql:"dupe", keys:["ABC-1"]}, {name:"", keys:["ABC-1"]}],
      issues:[{key:"ABC-1", ...issue("ABC-1")}, {key:"ABC-2", ...issue("ABC-2")}, {key:"ABC-3", ...issue("ABC-3")}, {key:"ABC-4", ...issue("ABC-4")}]});
    ev(`JIRA_ISSUES = parseJiraIssues(${JSON.stringify(V2)})`);
    ok("J12: each named search is read, with its own keys; duplicates and blanks are dropped", ev("JIRA_ISSUES.searches.map(x=>x.name + ':' + x.keys.join('+')).join()") === "Epics:ABC-1+ABC-3,This sprint:ABC-3+ABC-4+ABC-2");
    ok("J12: what's new counts each issue once across searches", ev("jiraNew().length") === 3 && ev("jiraNew(false, 'This sprint').join()") === "ABC-3,ABC-4");
    ev("UI.jiraSearch = 'Epics'; openJiraDialog()");
    const pills = () => [...d.querySelectorAll("#jiraBody .jsearches button")];
    ok("J12: the Jira window shows one button per search, with how many are new in each", pills().map(b=>b.textContent).join() === "Epics2,This sprint2");
    ok("J12: and lists the chosen search", [...d.querySelectorAll("#jiraBody .jnew .jdiff")].map(r=>r.dataset.k).join() === "ABC-1,ABC-3" && /project = ABC AND cf\[1\] is not EMPTY/.test(d.querySelector("#jiraBody .jcmd").textContent));
    pills()[1].click(); await wait(10);
    ok("J12: switching shows the other search, and is remembered", ev("UI.jiraSearch") === "This sprint" && [...d.querySelectorAll("#jiraBody .jnew .jdiff")].map(r=>r.dataset.k).join() === "ABC-3,ABC-4");
    ev(`$("#dlgJira").close(); setWs("today")`);
    const sec12 = [...d.querySelectorAll("#today .tsec")].find(x=>/New in Jira/.test(x.textContent));
    ok("J12: Today says how many are new in each search", !!sec12 && /2 in Epics/.test(sec12.textContent) && /2 in This sprint/.test(sec12.textContent), sec12?.textContent);
    ok("J12: an older file with one search still reads", ev(`parseJiraIssues(LISTING).searches.length`) === 1 && ev(`parseJiraIssues(LISTING).searches[0].name`) === "Search"); });

  // ---- J9: epic, sprint and story points come through from both files ----
  await sec(async ()=>{ const {d, ev} = await page();
    const L = JSON.stringify({kind:"sightline-jira-issues", generatedAt:at, jql:"x", total:2, issues:[
      {key:"ABC-1", ...issue("ABC-1", {epic:"ABC-10", parent:"ABC-9", sprint:"Sprint 5", points:3})},
      {key:"ABC-3", ...issue("ABC-3", {epic:"not a key", parent:"<b>", sprint:"x".repeat(200), points:"5"})}]});
    ev(`JIRA_ISSUES = parseJiraIssues(${JSON.stringify(L)})`);
    ok("J9: epic, parent, sprint and points are read", ev("JSON.stringify(['epic','parent','sprint','points'].map(f=>JIRA_ISSUES.issues['ABC-1'][f]))") === JSON.stringify(["ABC-10","ABC-9","Sprint 5",3]));
    ok("J9: and checked like the rest", ev("JSON.stringify(['epic','parent','points'].map(f=>JIRA_ISSUES.issues['ABC-3'][f]))") === JSON.stringify(["","",null]) && ev("JIRA_ISSUES.issues['ABC-3'].sprint.length") === 80);
    ev("openJiraDialog()");
    ok("J9: the Jira window shows them", /epic ABC-10 · Sprint 5 · 3 pts/.test(d.querySelector("#jiraBody .jnew .jdiff")?.textContent || ""), d.querySelector("#jiraBody .jnew .jdiff")?.textContent);
    ev(`$("#dlgJira").close(); JIRA = parseJiraStatus(${JSON.stringify(JSON.stringify({kind:"sightline-jira-status", generatedAt:at, issues:{"ABC-2":issue("ABC-2", {sprint:"Sprint 5", points:1})}, missing:[]}))}); select("bar", S.bars[0].id)`);
    ok("J9: so does an item's From Jira part (its sprint and points)", /Sprint 5/.test(d.querySelector("#side #f-jfacts")?.textContent || "") && /Points\s*1(?!\d)/.test(d.querySelector("#side #f-jfacts")?.textContent || ""), d.querySelector("#side #f-jfacts")?.textContent); });

  // ---- J6: only someone editing can add or skip ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("locked = true; openJiraDialog()"); const body = d.querySelector("#jiraBody");
    ok("J6: read-only, the list shows but Add and Skip don't", body.querySelectorAll(".jnew .jdiff").length === 3 && !body.querySelector("#jiraAdd") && !body.querySelector("#jiraSkip") && /Start editing/.test(body.textContent));
    ok("J6: and addFromJira refuses", ev(`addFromJira(["ABC-1"], "lane:int")`) === 0 && !ev(`S.bars.some(b=>b.jira==="ABC-1")`)); });

  // ---- J7: Today says when the search has something new ----
  await sec(async ()=>{ const {d, ev} = await page();
    d.querySelector("#tab-today").click();
    const sec7 = [...d.querySelectorAll("#today .tsec")].find(x=>/New in Jira/.test(x.textContent));
    ok("J7: Today shows how many issues aren't in the plan yet", !!sec7 && /3 issues not in the plan yet/.test(sec7.textContent), sec7?.textContent);
    sec7.querySelector("#tJiraNew").click();
    ok("J7: Review opens Plan, Epics", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics");
    ev(`S.meta.jiraSkip = ["ABC-1","ABC-3","ABC-4"]; setWs("today")`);
    ok("J7: and says nothing when there's nothing new", ![...d.querySelectorAll("#today .tsec")].some(x=>/New in Jira/.test(x.textContent))); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
