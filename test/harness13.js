// Epic rollups: an initiative linked to Jira epics shows how many of their stories are done. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 23, 14)).toISOString();
const epic = (k, x = {}) => ({summary:`Epic ${k}`, status:"In Progress", category:"inprogress", type:"Epic", url:`https://jira.example.com/browse/${k}`, ...x});
const roll = (done, inprogress, todo, x = {}) => ({total:done + inprogress + todo, done, inprogress, todo, points:0, pointsDone:0, unestimated:done + inprogress + todo, ...x});
// ABC-10: 12 of 40 done, with points. ABC-20: all 5 done. ABC-30: the bar's own key, an epic too. ABC-40: in the plan, no counts yet.
const status = (x = {}) => JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com",
  issues:{"ABC-10":epic("ABC-10"), "ABC-20":epic("ABC-20"), "ABC-30":epic("ABC-30"), "ABC-40":epic("ABC-40"), "ABC-50":{summary:"A story", status:"Done", category:"done", type:"Story"}},
  missing:[], rollups:{"ABC-10":roll(12, 3, 25, {points:80, pointsDone:30, unestimated:4}), "ABC-20":roll(5, 0, 0), "ABC-30":roll(1, 1, 0), "BAD KEY":roll(1,0,0), "ABC-99":{total:9, done:1, inprogress:0, todo:0}}, rollupsTruncated:false, ...x});
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
  w.FIX = plan; w.STATUS = status();
  ev(`askWhoOnStart = ()=>{}; S = normalize(JSON.parse(FIX), false); S.meta.jiraBase = "https://jira.example.com/browse/";
    S.bars[0].epics = ["ABC-10", "ABC-20"]; S.bars[0].jira = ""; S.bars[1].jira = "ABC-30"; S.bars[1].epics = []; S.bars[2].epics = ["ABC-40"]; S.bars[2].jira = "";
    file.handle = null; resetHistory(); sel = null; setWs("timeline"); setZoom("weeks"); JIRA = parseJiraStatus(STATUS); render();`);
  return {w, d: w.document, ev, B: i => ev(`S.bars[${i}].id`)};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- E1, E2: the plan and the status file ----
  await sec(async ()=>{ const {ev} = await page();
    ok("E1: an initiative keeps its list of epics, cleaned up", ev(`JSON.stringify(normalize({lanes:[{id:"a", name:"A"}], bars:[{id:"b", lane:"a", start:0, span:1, epics:["abc-10", "ABC-10", "not a key", 7, "ABC-20"]}]}, false).bars[0].epics)`) === JSON.stringify(["ABC-10","ABC-20"]));
    ok("E1: and it survives saving and reopening", ev(`normalize(JSON.parse(serialize(S, "p.json")), false).bars[0].epics.join()`) === "ABC-10,ABC-20");
    ok("E2: the status file's counts are read", ev("JIRA.rollups['ABC-10'].total") === 40 && ev("JIRA.rollups['ABC-10'].pointsDone") === 30);
    ok("E2: counts that don't add up, or under a bad key, are dropped", ev("'ABC-99' in JIRA.rollups") === false && ev("'BAD KEY' in JIRA.rollups") === false); });

  // ---- E3, E4: counts add up across an initiative's epics, and show on the chart ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    const r = JSON.parse(ev(`JSON.stringify(epicRollup(S.bars[0]))`));
    ok("E3: an initiative's epics are added up", r.epics === 2 && r.total === 45 && r.done === 17 && r.inprogress === 3 && r.pct === 38, JSON.stringify(r));
    ok("E3: its own key counts too when Jira says it's an epic", ev(`JSON.stringify(barEpics(S.bars[1]))`) === JSON.stringify(["ABC-30"]) && ev(`epicRollup(S.bars[1]).total`) === 2);
    ok("E3: a story key is not treated as an epic", (ev(`S.bars[3].jira = "ABC-50"`), ev(`barEpics(S.bars[3]).length`)) === 0);
    ok("E3: epics with no counts yet give no rollup, not zero", ev(`epicRollup(S.bars[2])`) === null);
    const tag = d.querySelector(`#gantt [data-key="bar:${B(0)}"] .tag.jr`);
    ok("E4: the bar shows stories done out of the total", !!tag && tag.textContent === "17/45 stories" && /17 of 45 stories done, 3 in progress/.test(tag.title), tag && tag.title); });

  // ---- E5: link and unlink epics from the panel ----
  await sec(async ()=>{ const {w, d, ev, B} = await page();
    ev(`select("bar", "${B(0)}")`);
    const f = () => d.querySelector("#side .field.epics");
    ok("E5a: the panel lists each epic with its summary and counts", [...f().querySelectorAll(".epicrow")].length === 2 && /ABC-10\s*Epic ABC-10\s*12 of 40 done · 3 in progress/.test(f().textContent), f().textContent.slice(0,160));
    ok("E5a: with a total, points, and what isn't estimated", /17 of 45 stories done \(38%\) · 3 in progress · 30 of 80 points, 9 not estimated/.test(f().querySelector(".eroll").textContent), f().querySelector(".eroll")?.textContent);
    ok("E5a: each epic links to Jira", f().querySelector(".epicrow a")?.getAttribute("href") === "https://jira.example.com/browse/ABC-10");
    const inp = d.querySelector("#f-epic-add"); inp.value = "abc-60"; d.querySelector("#f-epic-go").click(); await wait(10);
    ok("E5b: Link epic adds one", ev(`barById("${B(0)}").epics.join()`) === "ABC-10,ABC-20,ABC-60");
    ok("E5b: it says its stories come on the next sync", /ABC-60\s*counted on the next sync/.test(d.querySelector("#side .field.epics").textContent));
    d.querySelector("#f-epic-add").value = "nope"; d.querySelector("#f-epic-go").click(); await wait(10);
    ok("E5b: something that isn't a key is refused", ev(`barById("${B(0)}").epics.length`) === 3 && /isn't a Jira key/.test(d.querySelector("#status").textContent));
    d.querySelector('#side [aria-label="Unlink ABC-20"]').click(); await wait(10);
    ok("E5c: × unlinks one", ev(`barById("${B(0)}").epics.join()`) === "ABC-10,ABC-60");
    ok("E5c: one Undo brings it back", (ev("undo()"), ev(`barById("${B(0)}").epics.join()`)) === "ABC-10,ABC-20,ABC-60");
    ok("no runtime errors (E5)", w.errs.length === 0, w.errs.join(" | ")); });

  // ---- E6, E7: compare against the stories, never the epic's own status ----
  await sec(async ()=>{ const {w, d, ev, B} = await page();
    ev(`S.bars[4].epics = ["ABC-20"]; S.bars[4].jira = ""; S.bars[4].status = "done"; render()`);
    ok("E6: an initiative whose epic stories are all done isn't flagged, though the epic still says In Progress", ev("jiraMismatch(S.bars[4])") === null && ev("JIRA.issues['ABC-20'].category") === "inprogress");
    ev(`S.bars[5].jira = "ABC-20"; S.bars[5].epics = []; S.bars[5].tasks = []; S.bars[5].status = "done"; render()`);
    ok("E6: the same when the initiative's own Jira key is the epic (the case that used to be flagged)", ev("jiraMismatch(S.bars[5])") === null && !ev("jiraDiffs().some(x=>x.it.id === S.bars[5].id)"));
    ev(`S.bars[0].status = "done"; render()`);
    ok("E6: an initiative made of epics takes its status from its stories, even if someone marks it done", ev(`barById("${B(0)}").status`) === "inprogress" && !ev("jiraDiffs().some(x=>x.it.id === S.bars[0].id)"));
    ok("E6: an epic with no counts yet is never flagged", (ev(`S.bars[2].status = "done"`), ev("jiraMismatch(S.bars[2])")) === null);
    ok("E7: and its status buttons say so instead", (ev(`select("bar", "${B(0)}")`), !!d.querySelector("#side .jlockline")) && /status from its Jira stories/i.test(d.querySelector("#side .jlockline").textContent)); });

  // ---- E9: an epic whose type your admins renamed ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`JIRA = parseJiraStatus(${JSON.stringify(status({issues:{"GP-7":{summary:"Search rollout", status:"Open", category:"todo", type:"Feature", isEpic:true}}, rollups:{"GP-7":roll(2,1,3)}}))}); S.bars[6].jira = "GP-7"; S.bars[6].epics = []; render()`);
    ok("E9: an issue the script marks as an epic counts as one, whatever its type is called", ev("barEpics(S.bars[6]).join()") === "GP-7" && ev("epicRollup(S.bars[6]).total") === 6);
    ev(`JIRA_ISSUES = parseJiraIssues(${JSON.stringify(JSON.stringify({kind:"sightline-jira-issues", generatedAt:at, jql:"x", total:1, issues:[{key:"GP-8", summary:"Payments", status:"Open", category:"todo", type:"Feature", isEpic:true}]}))}); openJiraDialog()`);
    ok("E9: the Jira window says it's an epic", /Feature \(epic\)/.test(d.querySelector("#jiraBody .jnew .jdiff")?.textContent || ""), d.querySelector("#jiraBody .jnew .jdiff")?.textContent);
    ev(`$("#dlgJira").close(); addFromJira(["GP-8"], "lane:int")`);
    ok("E9: adding an epic as an initiative links it as that initiative's epic", ev(`JSON.stringify(S.bars.find(b=>b.jira==="GP-8").epics)`) === JSON.stringify(["GP-8"])); });

  // ---- E8: read-only ----
  await sec(async ()=>{ const {d, ev, B} = await page();
    ev(`locked = true; select("bar", "${B(0)}")`);
    ok("E8: read-only, the epics and counts show but can't be changed", !!d.querySelector("#side .field.epics .eroll") && !d.querySelector("#f-epic-add") && !d.querySelector('#side [aria-label^="Unlink ABC"]')); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
