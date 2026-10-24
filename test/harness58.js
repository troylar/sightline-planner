// Merging duplicate people (a first name typed in, then the same person added from Jira with their full name), and
// linking many Jira users in one save. Each check fails on the build before this.
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
  await sec(async ()=>{ const {d, ev, w} = await page();
    // "Avery" (typed) owns work and notes; "Avery Smith" came from Jira
    ev(`const a = S.people.find(p=>p.name==="Avery"); a.off = [{from:"2026-10-05", to:"2026-10-06", note:"trip"}]; a.capacity = 8;
      S.people.push({...mkPerson("person-avs", "Avery Smith", S.people.length), jira:{key:"JIRAUSER100", user:"asmith", name:"Avery Smith"}});
      S.notes.push({...S.notes[0], id:"note-m1", author:a.id}); S.bars[1].blocked = {since:"2026-09-20", reason:"x", waitingOn:a.id};
      S.meetings[0] && (S.meetings[0].attendees = [a.id, "person-avs"]); render();`);
    const aid = ev(`S.people.find(p=>p.name==="Avery").id`), owned = ev(`assignedCount("${aid}")`);
    ok("setup: Avery owns work", owned > 0);
    ev(`UI.planTab = "team"; setWs("plan"); render();`);
    ok("D1: the Team tab spots the duplicate, kept into the Jira-linked one", /Avery.*→\s*Avery Smith/.test(d.querySelector("#teamDupes")?.textContent || ""), d.querySelector("#teamDupes")?.textContent);
    d.querySelector(`#teamDupes [data-merge="${aid}"]`).click(); await wait(30);
    ok("M1: the duplicate is gone", !ev(`S.people.some(p=>p.id==="${aid}")`));
    ok("M2: their work moves to the one kept", ev(`assignedCount("person-avs")`) === owned);
    ok("M3: notes, blockers and meetings follow (no doubles)", ev(`S.notes.find(n=>n.id==="note-m1").author`) === "person-avs" && ev(`S.bars[1].blocked.waitingOn`) === "person-avs"
      && (!ev("!!S.meetings[0]") || ev(`JSON.stringify(S.meetings[0].attendees)`) === JSON.stringify(["person-avs"])));
    ok("M4: time off and capacity carry over; the Jira link stays", ev(`JSON.stringify(personById("person-avs").off.map(o=>o.from))`) === JSON.stringify(["2026-10-05"]) && ev(`personById("person-avs").capacity`) === 8 && ev(`personById("person-avs").jira.user`) === "asmith");
    ok("M5: no reference to the old id is left", !ev("JSON.stringify(S)").includes(`"${aid}"`));
    ok("M6: and the duplicate notice is gone", !d.querySelector("#teamDupes"));
    ok("no page errors", !w.errs.length, w.errs.join("; ")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`S.people.push({...mkPerson("person-b2", "Blake Jones", S.people.length)}, {...mkPerson("person-r2", "Riley", S.people.length + 1)}, {...mkPerson("person-r3", "Riley Chen", S.people.length + 2)}); render();`);
    const pairs = JSON.parse(ev("JSON.stringify(dupePeople())"));
    ok("D2: every single name with a fuller match is listed", pairs.some(([a, b])=>b === "person-b2") && pairs.some(([a, b])=>a === "person-r2" && b === "person-r3"), JSON.stringify(pairs));
    ev(`UI.planTab = "team"; setWs("plan"); render();`);
    d.querySelector("#mergeAll").click(); await wait(30);
    ok("D3: Merge all does them together, in one save", !ev(`S.people.some(p=>p.id==="person-r2")`) && ev(`S.people.filter(p=>/^Blake/.test(p.name)).length`) === 1 && ev(`S.changes.filter(c=>/merged/.test(c.what || c.summary || "")).length`) <= 1);
    ok("D4: names that are two different people aren't offered", !ev("JSON.stringify(dupePeople())").includes("person-r3")); });

  await sec(async ()=>{ const {d, ev} = await page();
    const pid = ev("S.people[0].id"); ev(`locked = true; UI.planTab = "team"; setWs("plan"); render();`);
    const nm = d.querySelector(`#t-team button[data-open="${pid}"]`);
    ok("C0: read-only, a name in Plan, Team opens their card", !!nm && (nm.click(), ev("sel && sel.id")) === pid);
    ev(`locked = false; sel = null; render();`);
    ok("C0: editing, there's an Open link beside the name box", !!d.querySelector(`#t-team .tname input`) && !!d.querySelector(`#t-team .tcard[data-open="${pid}"]`)); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`select("person", S.people.find(p=>p.name==="Riley")?.id || S.people[2].id); render();`);
    ok("C1: a person's card offers Merge into", !!d.querySelector("#f-pmerge") && !!d.querySelector("#f-pmergego")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`window.QS = []; quickSave = (what, fn) => { const c = JSON.parse(JSON.stringify(S)); fn(c); QS.push({what, n:c.people.filter(p=>p.jira).length}); return Promise.resolve(true); }; setWs("people"); render();`);
    const all = d.querySelector("#jpLinkAll");
    ok("L1: Link all suggested", !!all && /Link all \d+ suggested/.test(all.textContent), all?.textContent);
    all.click(); await wait(10);
    ok("L2: in one save", ev("QS.length") === 1 && ev("QS[0].n") >= 2, ev("JSON.stringify(QS)"));
    const one = d.querySelector("#sec-jirapeople [data-jlink]"), sl = one && one.closest("tr").querySelector("select");
    if (sl){ sl.value = [...sl.options].find(o=>o.value)?.value || ""; one.click(); } ok("L3: a Link button says it's working at once", !one || one.disabled && /Linking/.test(one.textContent)); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
