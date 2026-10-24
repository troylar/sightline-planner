// Senior review 2 (Jira): regression checks. Each one fails on the code as it was before the fix.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 23, 14)).toISOString();
const iss = (k, x = {}) => ({key:k, summary:`Summary of ${k}`, status:"Open", category:"todo", type:"Feature", isEpic:true, ...x});
const listing = (issues, x = {}) => JSON.stringify({kind:"sightline-jira-issues", snapshot:"aaaa1111bbbb2222", jiraBase:"https://jira.example.com", generatedAt:at, jql:"project = ABC", total:issues.length, truncated:false, issues, ...x});
const status = (x = {}) => JSON.stringify({kind:"sightline-jira-status", snapshot:"aaaa1111bbbb2222", jiraBase:"https://jira.example.com", generatedAt:at, issues:{}, missing:[], ...x});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 23, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- F1: an epic linked through an initiative's epics isn't offered again ----
  await sec(async ()=>{ const {w, ev} = await page();
    w.L = listing([iss("ABC-10"), iss("ABC-11")]);
    ev(`S.bars[0].epics = ["ABC-10"]; S.bars[0].jira = ""; JIRA_ISSUES = parseJiraIssues(L)`);
    ok("F1: an epic already linked to an initiative isn't offered as new", ev("JSON.stringify(jiraNew())") === JSON.stringify(["ABC-11"]), ev("JSON.stringify(jiraNew())"));
    const n0 = ev("S.bars.length"); ev(`addFromJira(["ABC-10"], "lane:int")`);
    ok("F1: and adding it anyway doesn't duplicate it", ev("S.bars.length") === n0); });

  // ---- F2: owners only from a link, never a display name ----
  await sec(async ()=>{ const {ev} = await page();
    ok("F2: an issue with no Jira user key gets no owner, even when the display name matches", ev(`personForIssue({assignee:"Avery", assigneeKey:""})`) === null);
    ev(`linkJira(S.people.find(p=>p.name==="Avery").id, {key:"JIRAUSER1", user:"asmith", name:"Avery Smith"})`);
    ok("F2: a linked key still does", ev(`personForIssue({assignee:"Someone", assigneeKey:"JIRAUSER1"}).name`) === "Avery"); });

  // ---- F3: two people's skips and epic links both survive a merge ----
  await sec(async ()=>{ const {ev} = await page();
    const r = JSON.parse(ev(`(()=>{
      S.meta.jiraSkip = ["ABC-1", "ABC-9"]; S.bars[0].epics = ["ABC-50", "ABC-59"];
      file.baseText = serialize(S, "p.json"); const base = parseText(file.baseText);
      S = clone(base); S.meta.jiraSkip = ["ABC-1", "ABC-2"]; S.bars[0].epics = ["ABC-50", "ABC-51"];      // mine: +2 -9, +51 -59
      const theirs = clone(base); theirs.meta.jiraSkip = ["ABC-1", "ABC-9", "ABC-3"]; theirs.bars[0].epics = ["ABC-50", "ABC-59", "ABC-52"];   // theirs: +3, +52
      theirs.meta.revision = (base.meta.revision || 0) + 1;
      const okr = rebaseOnto(theirs, serialize(theirs, "p.json"));
      return JSON.stringify({okr, skip:S.meta.jiraSkip.slice().sort(), epics:S.bars[0].epics.slice().sort()}); })()`));
    ok("F3: skips added by both people are kept", r.okr && r.skip.includes("ABC-2") && r.skip.includes("ABC-3"), JSON.stringify(r));
    ok("F3: a skip I removed stays removed", !r.skip.includes("ABC-9"), JSON.stringify(r.skip));
    ok("F3: epics linked by both people on one initiative are kept, and one I unlinked stays unlinked", JSON.stringify(r.epics) === JSON.stringify(["ABC-50","ABC-51","ABC-52"]), JSON.stringify(r.epics)); });

  // ---- F4: every issue is reachable, and Select all works on what the filter shows ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    w.L = listing(Array.from({length:450}, (_, i) => iss(`ABC-${i + 1}`, {summary: i % 2 ? "Payments work" : "Search work"})));
    ev(`JIRA_ISSUES = parseJiraIssues(L); openJiraDialog()`); await wait(5);
    const body = d.querySelector("#jiraBody"), rows = () => [...body.querySelectorAll(".jdiffs .jdiff")], vis = () => rows().filter(r=>!r.hidden);
    ok("F4a: all 450 issues get a row, not the first 300", rows().length === 450, String(rows().length));
    const f = body.querySelector("#jiraFilter"); f.value = "payments"; f.dispatchEvent(new w.Event("input", {bubbles:true}));
    ok("F4b: the filter narrows the list", vis().length === 225, String(vis().length));
    const all = body.querySelector("#jiraAll"); all.checked = true; all.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("F4b: Select all picks only the rows shown", rows().filter(r=>r.querySelector("input").checked).length === 225 && /Select all 225 shown/.test(all.closest("label").textContent));
    ok("F4b: Add says how many it will add", body.querySelector("#jiraAdd").textContent === "Add 225 picked", body.querySelector("#jiraAdd").textContent); });

  // ---- F6: an unknown status isn't counted as to do ----
  await sec(async ()=>{ const {d, w, ev} = await page();
    w.ST = status({issues:{"ABC-10":{summary:"E", status:"Open", category:"todo", type:"Feature", isEpic:true}}, rollups:{"ABC-10":{total:5, todo:1, inprogress:0, done:3, unknown:1, points:0, pointsDone:0, unestimated:5}}});
    ev(`JIRA = parseJiraStatus(ST); S.bars[0].epics = ["ABC-10"]; select("bar", S.bars[0].id)`);
    ok("F6: counts with an unknown status are read", ev("JIRA.rollups['ABC-10'] && JIRA.rollups['ABC-10'].unknown") === 1);
    ok("F6: and the panel says so", /1 with a status Jira didn't give a category/.test(d.querySelector("#side .field.epics")?.textContent || ""));
    ok("F6: the counts say when and whose view they're from", /Counted by the Jira sync .* Only issues the person running the sync can see/.test(d.querySelector("#side .field.epics")?.textContent || "")); });

  // ---- F7: the two files must belong together ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    w.L = listing([iss("ABC-10")]); w.ST_OLD = status({snapshot:"cccc3333dddd4444", generatedAt:new Date(Date.UTC(2026, 8, 23, 15)).toISOString()}); w.ST_OTHER = status({jiraBase:"https://other-jira.example.com", snapshot:"aaaa1111bbbb2222"});
    ev(`JIRA_ISSUES = parseJiraIssues(L); JIRA = parseJiraStatus(ST_OLD); openJiraDialog()`);
    ok("F7a: files from different sync runs are flagged", /from an earlier sync/.test(d.querySelector("#jiraPair")?.textContent || "") && d.querySelector("#jiraPair").classList.contains("warn"));
    ok("F7a: but you can still add", !!d.querySelector("#jiraAdd"));
    w.ST_NEWER_ISSUES = status({snapshot:"eeee5555ffff6666", generatedAt:new Date(Date.UTC(2026, 8, 23, 13)).toISOString()});
    ev(`JIRA = parseJiraStatus(ST_NEWER_ISSUES); openJiraDialog()`);
    ok("F7a: and it names the file that's actually older", /The status file is from an earlier sync/.test(d.querySelector("#jiraPair")?.textContent || ""), d.querySelector("#jiraPair")?.textContent);
    ev(`JIRA = parseJiraStatus(ST_OTHER); openJiraDialog()`);
    ok("F7b: files from different Jira servers are refused", /different Jira servers/.test(d.querySelector("#jiraPair")?.textContent || "") && !d.querySelector("#jiraAdd"));
    ev(`JIRA = parseJiraStatus(${JSON.stringify(status())}); openJiraDialog()`);
    ok("F7c: a matching pair says nothing", !d.querySelector("#jiraPair"));
    ok("no runtime errors (F7)", w.errs.length === 0, w.errs.join(" | ")); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
