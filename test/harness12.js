// People linked to Jira users. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 23, 14)).toISOString();
const issue = (k, who, x = {}) => ({summary:`Summary of ${k}`, status:"In Progress", category:"inprogress", assignee:who[0], assigneeKey:who[1], assigneeUser:who[2], due:"", updated:"", type:"Story", url:`https://jira.example.com/browse/${k}`, ...x});
const AVERY = ["Avery Smith", "JIRAUSER100", "asmith"], BLAKE = ["Blake Jones", "JIRAUSER200", "bjones"], NEW = ["Riley Chen", "JIRAUSER300", "rchen"];
// ABC-2 is on the plan's first initiative; the search found ABC-1..3.
const status = () => JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", issues:{"ABC-2":issue("ABC-2", BLAKE)}, missing:[]});
const listing = () => JSON.stringify({kind:"sightline-jira-issues", generatedAt:at, jql:"project = ABC", total:3, truncated:false,
  issues:[{key:"ABC-1", ...issue("ABC-1", ["A. Smith", "JIRAUSER100", "asmith"])}, {key:"ABC-2", ...issue("ABC-2", BLAKE)}, {key:"ABC-3", ...issue("ABC-3", NEW)},
          {key:"ABC-4", ...issue("ABC-4", ["Avery", "JIRAUSER999", "someone"])}, {key:"ABC-5", ...issue("ABC-5", ["Bad", "has space", "<b>"])}]});
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
  ev(`askWhoOnStart = ()=>{}; S = normalize(JSON.parse(FIX), false); S.bars[0].jira = "ABC-2"; file.handle = null; resetHistory(); sel = null; setWs("timeline"); render();
    JIRA = parseJiraStatus(STATUS); JIRA_ISSUES = parseJiraIssues(LISTING); render();`);
  return {w, d: w.document, ev, pid: n => ev(`S.people.find(p=>p.name===${JSON.stringify(n)}).id`)};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- P1: a person can carry a Jira identity, saved in the plan ----
  await sec(async ()=>{ const {ev} = await page();
    const n = src => ev(`JSON.stringify(normalize({lanes:[{id:"a", name:"A"}], people:${JSON.stringify(src)}}, false).people.map(p=>p.jira))`);
    ok("P1: a person's Jira key, user name and display name are kept", n([{name:"Avery", jira:{key:"JIRAUSER100", user:"asmith", name:"Avery Smith"}}]) === JSON.stringify([{key:"JIRAUSER100", user:"asmith", name:"Avery Smith"}]));
    ok("P1: a bad key isn't", n([{name:"A", jira:{key:"has space"}}, {name:"B", jira:"JIRAUSER1"}]) === JSON.stringify([null, null]));
    ok("P1: one Jira user can't be linked to two people", n([{name:"A", jira:{key:"K1"}}, {name:"B", jira:{key:"K1"}}]) === JSON.stringify([{key:"K1", user:"", name:""}, null]));
    ev(`S.people[0].jira = {key:"JIRAUSER100", user:"asmith", name:"Avery Smith"}`);
    ok("P1: it survives saving and reopening", ev(`normalize(JSON.parse(serialize(S, "p.json")), false).people[0].jira.key`) === "JIRAUSER100");
    ok("P1: and a teammate's link merges in like any other edit", ev(`(()=>{ const a = clone(S); a.people[0].jira = null; return diffPlans(a, S).some(o=>o.type === "people" && o.field === "jira"); })()`)); });

  // ---- P2, P3: both Jira files carry who each issue is assigned to ----
  await sec(async ()=>{ const {ev} = await page();
    ok("P2: the status file gives the assignee's key and user name", ev("JIRA.issues['ABC-2'].assigneeKey") === "JIRAUSER200" && ev("JIRA.issues['ABC-2'].assigneeUser") === "bjones");
    ok("P2: so does the issues file", ev("JIRA_ISSUES.issues['ABC-3'].assigneeKey") === "JIRAUSER300");
    ok("P2: ids with odd characters are dropped", ev("JIRA_ISSUES.issues['ABC-5'].assigneeKey") === "" && ev("JIRA_ISSUES.issues['ABC-5'].assigneeUser") === "");
    const users = JSON.parse(ev("JSON.stringify(jiraUsers())"));
    ok("P3: everyone assigned in either file is listed once, with a count", users.map(u=>u.key).sort().join() === "JIRAUSER100,JIRAUSER200,JIRAUSER300,JIRAUSER999" && users.find(u=>u.key==="JIRAUSER200").count === 2, JSON.stringify(users.map(u=>[u.key,u.count]))); });

  // ---- P4, P5: link from the person's panel ----
  await sec(async ()=>{ const {w, d, ev, pid} = await page();
    const avery = pid("Avery"), bl = pid("Blake"); ev(`setWs("people"); select("person", "${bl}")`);
    const pick = () => d.querySelector("#f-jpick");
    ok("P4: an unlinked person's panel offers their likely Jira user, picked in advance", !!pick() && pick().value === "JIRAUSER200" && /suggested/.test(pick().selectedOptions[0].textContent), pick()?.value);
    ok("P4: an exact name match beats a looser one", (ev(`select("person", "${avery}")`), pick().value) === "JIRAUSER999", pick().value);
    ev(`select("person", "${bl}")`);
    ok("P4: but nothing is linked until you click Link", !ev(`personById("${bl}").jira`));
    d.querySelector("#f-jlink").click(); await wait(10);
    ok("P4: Link saves it", ev(`personById("${bl}").jira.key`) === "JIRAUSER200" && ev(`personById("${bl}").jira.user`) === "bjones");
    ok("P4: the panel then shows who they are in Jira", /Blake Jones \(bjones\)/.test(d.querySelector("#side .jperson").textContent), d.querySelector("#side .jperson")?.textContent);
    ok("P4: one Undo takes it back", !(ev("undo()"), ev(`personById("${bl}").jira`)));
    ev(`linkJira("${avery}", jiraUsers().find(u=>u.key==="JIRAUSER100")); linkJira("${pid("Blake")}", jiraUsers().find(u=>u.key==="JIRAUSER100"))`);
    ok("P5: linking a Jira user to someone else moves the link, never copies it", ev(`personById("${avery}").jira`) === null && ev(`S.people.filter(p=>p.jira && p.jira.key==="JIRAUSER100").length`) === 1);
    ev(`select("person", "${pid("Blake")}")`); d.querySelector("#f-junlink").click(); await wait(10);
    ok("P5: Unlink removes it", ev(`personById("${pid("Blake")}").jira`) === null);
    ok("no runtime errors (P4, P5)", w.errs.length === 0, w.errs.join(" | ")); });

  // ---- P6: People → Jira users ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`setWs("people")`);
    const sec6 = d.querySelector("#sec-jirapeople"), rows = () => [...sec6.querySelectorAll("tbody tr")];
    ok("P6: People lists everyone assigned in Jira", !sec6.hidden && rows().length === 4, String(rows().length));
    ok("P6: and says how many aren't linked", /4 of 4 not linked/.test(d.querySelector("#jiraPeopleHint").textContent), d.querySelector("#jiraPeopleHint").textContent);
    const riley = rows().find(r=>/Riley Chen/.test(r.textContent));
    riley.querySelector("[data-jadd]").click(); await wait(10);
    ok("P6: Add to team adds a Jira user as a person, already linked", ev(`S.people.find(p=>p.name==="Riley Chen")?.jira?.key`) === "JIRAUSER300");
    const blake = rows().find(r=>/Blake Jones/.test(r.textContent));
    ok("P6: an unlinked row suggests the likely team member", blake.querySelector("select").selectedOptions[0].textContent.startsWith("Blake"));
    ok("P6: and doesn't offer Add to team, so nobody ends up on the team twice", !blake.querySelector("[data-jadd]"));
    blake.querySelector("[data-jlink]").click(); await wait(10);
    ok("P6: and Link links them", ev(`S.people.find(p=>p.name==="Blake").jira.key`) === "JIRAUSER200");
    ev(`JIRA = null; JIRA_ISSUES = null; render()`);
    ok("P6: with no Jira files, the section is hidden", d.querySelector("#sec-jirapeople").hidden === true); });

  // ---- P7: adding issues from Jira uses the link, not the display name ----
  await sec(async ()=>{ const {ev, pid} = await page();
    ev(`linkJira("${pid("Avery")}", {key:"JIRAUSER100", user:"asmith", name:"Avery Smith"})`);
    ev(`addFromJira(["ABC-1", "ABC-4"], "lane:int")`);
    const own = k => ev(`JSON.stringify(S.bars.find(b=>b.jira===${JSON.stringify(k)}).owners.map(personName))`);
    ok("P7: the linked person is the assignee (from Jira) even when Jira shows a different name; nothing is copied into owners", own("ABC-1") === "[]" && ev(`personName(assigneeOf(S.bars.find(b=>b.jira==="ABC-1")).id)`) === "Avery", own("ABC-1"));
    ok("P7: an unlinked Jira user whose name happens to match isn't guessed", own("ABC-4") === "[]", own("ABC-4")); });

  // ---- P8, P9: the link shows up where it matters ----
  await sec(async ()=>{ const {d, ev, pid} = await page();
    const blake = pid("Blake"); ev(`linkJira("${blake}", {key:"JIRAUSER200", user:"bjones", name:"Blake Jones"}); S.bars[0].owners = ["${pid("Avery")}"]; select("bar", S.bars[0].id)`);
    ok("P8: an item's card shows Jira's assignee in its From Jira part (the plan's owners are its lead)", /Assignee/.test(d.querySelector("#side #f-jfacts")?.textContent || ""), d.querySelector("#side #f-jfacts")?.textContent);
    ev(`S.bars[0].owners = ["${blake}"]; render()`);
    ok("P8: and doesn't when they are", !/not an owner here/.test(d.querySelector("#side .jline")?.textContent || ""));
    ev(`JIRA.issues["ABC-2"].category = "todo"; JIRA.issues["ABC-2"].status = "Open"; S.bars[0].owners = []; S.bars[0].status = "notstarted"; S.bars[0].start = 0; setMe("${blake}"); UI.todayScope = "me"; sel = null; setWs("today")`);
    ok("P9: Mine on Today includes work Jira has assigned to you", /Should have started/.test(d.querySelector("#today").textContent) && d.querySelector("#today").textContent.includes(ev("itemLabel(workItem('bar:' + S.bars[0].id))")), d.querySelector("#today .tcol")?.textContent.slice(0,160)); });

  // ---- P10: linking is a quick update: it works read-only, but not while presenting ----
  await sec(async ()=>{ const {d, ev, pid} = await page();
    ev(`locked = true; setWs("people"); select("person", "${pid("Blake")}")`);
    ok("P10: read-only, the panel can still link", !!d.querySelector("#f-jlink") && /Blake Jones \(bjones\) · suggested/.test(d.querySelector("#side .jperson")?.textContent || ""), d.querySelector("#side .jperson")?.textContent);
    ok("P10: and People has the link buttons", !!d.querySelector("#sec-jirapeople [data-jlink]"));
    ev(`window.QS = []; window.qs0 = quickSave; quickSave = (what, fn) => { const c = JSON.parse(JSON.stringify(S)); fn(c); QS.push({what, user: c.people.find(p=>p.id==="${pid("Blake")}").jira?.user}); return Promise.resolve(true); }`);
    d.querySelector("#f-jlink").click(); await wait(20);
    ok("P10: the link is a quick update (no Start editing)", ev(`JSON.stringify(QS)`) === JSON.stringify([{what:"linked Blake to Jira user Blake Jones (bjones)", user:"bjones"}]), ev(`JSON.stringify(QS)`)); ev(`quickSave = qs0`);
    ev(`present = true; render()`);
    ok("P10: presenting, no link buttons", !d.querySelector("#sec-jirapeople [data-jlink], #sec-jirapeople [data-jadd]"));
    ok("P10: and linkJira refuses", await ev(`linkJira("${pid("Avery")}", {key:"JIRAUSER100"})`) === false); ev(`present = false`); });

  // ---- P11: suggestions are sensible ----
  await sec(async ()=>{ const {ev} = await page();
    const sc = (a, b) => ev(`nameScore(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
    ok("P11: same name scores highest; first name alone still suggests", sc("Avery Smith", "avery smith") === 100 && sc("Avery", "Avery Smith") >= 60 && sc("Avery S", "Avery Smith") > sc("Avery", "Avery Smith"));
    ok("P11: different people don't suggest each other", sc("Avery", "Blake Jones") < 60 && sc("", "Blake") === 0); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
