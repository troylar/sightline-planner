// Sort Jira work and four levels: a story whose parent is a feature, under an epic the board doesn't have, and not in a
// sprint, is grouped under that epic (climbing the feature the sync brought as an ancestor), never under the feature and
// never past the epic to what's above it. When the sync didn't find Parent Link, the page says why stories show with no
// epic. Every key and name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const story = (summary, extra = {}) => ({summary, status:"To Do", category:"todo", type:"Story", assignee:"", assigneeKey:"", labels:[], ...extra});
const SPRINT = {sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09"};
// initiative ABC-59 > epic ABC-60 > feature ABC-61 > stories ABC-62 (no sprint, from a search) and ABC-63 (in the sprint)
const ANCESTORS = {"ABC-61":{summary:"Points feature", status:"In Progress", category:"inprogress", type:"Feature", isEpic:false, parent:"ABC-60"},
  "ABC-60":{summary:"Loyalty", status:"In Progress", category:"inprogress", type:"Epic", isEpic:true, parent:"ABC-59"},
  "ABC-59":{summary:"Customer growth", status:"In Progress", category:"inprogress", type:"Initiative", isEpic:false}};
const status = (extra = {}) => JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-10-07T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], board:{id:7, name:"Team board"},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}], rollups:{},
  issues:{"ABC-63":story("Points in the sprint", {...SPRINT, parent:"ABC-61"}), "ABC-70":story("A story with no parent at all", SPRINT)}, ancestors:ANCESTORS, ...extra});
const issuesFile = JSON.stringify({kind:"sightline-jira-issues", generatedAt:"2026-10-07T08:00:00Z", jql:"project = ABC", total:1, truncated:false,
  issues:[{key:"ABC-62", ...story("Points balance page", {parent:"ABC-61"})}]});
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD("2026-10-07T14:00:00").getTime(); w.Date = class extends RD {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    await wait(150); const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
    w.FIX = FIX; w.JS = status(); w.JI = issuesFile;
    ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); resetHistory(); JIRA = parseJiraStatus(JS); JIRA_ISSUES = parseJiraIssues(JI); quickMode = true; render()");
    const pile = J("sortPile().map(x=>({key:x.key, epic:x.epic}))"), of = k => (pile.find(x=>x.key === k) || {}).epic;
    ok("S1 a story under a feature, its epic not on the board, not in a sprint: grouped under the epic", of("ABC-62") === "ABC-60", JSON.stringify(pile));
    ok("S1 …not under the feature, and not past the epic to the initiative above it", of("ABC-62") !== "ABC-61" && of("ABC-62") !== "ABC-59");
    ok("S2 the same for one in the sprint", of("ABC-63") === "ABC-60");
    const groups = J("sortGroups(sortPile()).map(g=>({id:g.id, name:g.name, n:g.items.length}))");
    ok("S3 its group is named for the epic, with the epic's summary", groups.some(g=>g.id === "e:ABC-60" && g.name === "ABC-60 Loyalty" && g.n === 2) && !groups.some(g=>g.id === "e:ABC-61"), JSON.stringify(groups));
    ok("S3 …and a story with no parent is still No epic", of("ABC-70") === "" || of("ABC-70") == null);
    const SW = J("(()=>{ const s = sprintWork(); return {epics:[...s.byEpic.keys()], loose:s.noEpic.map(x=>({key:x.key, missing:x.missing || ''}))}; })()");
    ok("S4 In a sprint, not on the board: listed under its epic, not as loose work missing its feature", SW.epics.includes("ABC-60") && !SW.loose.some(x=>x.key === "ABC-63") && !SW.loose.some(x=>x.missing === "ABC-61"), JSON.stringify(SW));
    const lane = ev("S.lanes[0].id"), r = J(`(r => ({ok:r.ok, reason:r.reason || '', bars:(r.plan.bars || []).filter(b=>/^ABC-/.test(b.jira || '') || (b.epics || []).length).map(b=>({jira:b.jira, lane:b.lane, epics:b.epics || []}))}))(applyAction(S, "jira.toWorkstream", {keys:["ABC-62"], lane:${JSON.stringify(lane)}}))`);
    ok("S5 placing it adds the story on its own (its epic's list isn't known), never the whole epic", r.ok && r.bars.some(b=>b.jira === "ABC-62" && b.lane === lane) && !r.bars.some(b=>b.jira === "ABC-60" || b.epics.includes("ABC-60")), JSON.stringify(r));
    const notice = () => { const el = ev("healthLine()"); return el && el.querySelector("#jiraNoParent"); };
    ok("N1 a sync that found Parent Link: no notice", !notice());
    w.JS = status({noParentLink:true}); ev("JIRA = parseJiraStatus(JS); dropJiraMemos && dropJiraMemos(); sortMemo = null; sprintMemo = null");
    ok("N2 a sync without Parent Link, with stories showing no epic: says why, and how to check", !!notice() && /didn't find Jira's Parent Link field/.test(notice().textContent) && /fields --set parentLink=/.test(notice().textContent), notice()?.textContent);
    w.JS = status({noParentLink:true, issues:{"ABC-63":story("Points in the sprint", {...SPRINT, parent:"ABC-61"})}}); w.JI = JSON.stringify({kind:"sightline-jira-issues", generatedAt:"2026-10-07T08:00:00Z", jql:"x", total:0, truncated:false, issues:[]});
    ev("JIRA = parseJiraStatus(JS); JIRA_ISSUES = parseJiraIssues(JI); sortMemo = null; sprintMemo = null");
    ok("N3 …but not when every story has its epic", !notice() && J("sortPile().map(x=>x.epic)").every(Boolean));
    ok("N4 the page reads the flag strictly", ev("parseJiraStatus(JSON.stringify({...JSON.parse(JS), noParentLink:'yes'})).noParentLink") === false);
    // The epic itself synced as an issue (the plan links it), with its own Parent Link to an initiative: still stop at the epic.
    w.JS = status({issues:{"ABC-63":story("Points in the sprint", {...SPRINT, parent:"ABC-61"}), "ABC-60":{...ANCESTORS["ABC-60"], assignee:"", assigneeKey:"", labels:[]}},
      ancestors:{"ABC-61":ANCESTORS["ABC-61"], "ABC-59":ANCESTORS["ABC-59"]}});
    w.JI = issuesFile; ev("JIRA = parseJiraStatus(JS); JIRA_ISSUES = parseJiraIssues(JI); dropJiraMemos && dropJiraMemos(); sortMemo = null; sprintMemo = null");
    const SW2 = J("(()=>{ const s = sprintWork(); return {epics:[...s.byEpic.keys()], loose:s.noEpic.map(x=>({key:x.key, missing:x.missing || ''}))}; })()");
    ok("E1 an epic synced as an issue, with a parent above it: its sprint stories group under the epic, not the initiative", SW2.epics.includes("ABC-60") && !SW2.epics.includes("ABC-59") && !SW2.loose.some(x=>x.key === "ABC-63" || x.missing === "ABC-59"), JSON.stringify(SW2));
    ok("E2 …and the sort pile files them under the epic too", J("sortPile().filter(x=>/^ABC-6[23]$/.test(x.key)).map(x=>x.epic)").every(e=>e === "ABC-60"), JSON.stringify(J("sortPile().map(x=>({key:x.key, epic:x.epic}))")));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
