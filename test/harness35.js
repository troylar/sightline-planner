// Proposed changes (roadmap step 7): anyone proposes a change to a Jira item from its card; it records what it saw; it
// shows as pending on the item and in Plan > Proposals (a list to copy); the next sync marks it as in Jira now, or says
// Jira changed another way. Sightline never changes Jira. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const mk = (sprintId, labels) => JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-20":{summary:"A story", status:"In Progress", category:"inprogress", type:"Story", sprintId, sprint:"Sprint " + sprintId, sprintState: sprintId === 42 ? "active" : "future", sprintStart: sprintId === 42 ? "2026-09-28" : "2026-10-12", sprintEnd: sprintId === 42 ? "2026-10-09" : "2026-10-23", assignee:"Avery S.", assigneeKey:"JIRAUSER1", labels: labels || []}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}, {id:44, name:"Sprint 44", state:"future", start:"2026-10-26", end:"2026-11-06"}], rollups:{}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s => w.eval(s); await wait(200);
  w.FIX = plan; w.S42 = mk(42); w.S43 = mk(43); w.S44 = mk(44); w.LAB = mk(42, ["checkout"]);
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.J = L[0].id; L[0].jira = "ABC-20"; L[0].label = "ABC-20";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(S42); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {w, d, ev} = await page();
    ev("select('bar', J); render();"); await wait(10);
    const f = d.querySelector("#side #f-proposals");
    ok("P1: a Jira item's card offers Propose a change", !!f && /Propose a change/.test(f.textContent));
    const fs = d.querySelector("#f-pfield"); fs.value = "sprint"; fs.dispatchEvent(new w.Event("change")); d.querySelector("#f-pval").value = "43"; d.querySelector("#f-pwhy").value = "blocked on the API";
    d.querySelector("#f-propose").click(); await wait(30);
    const p = JSON.parse(ev("JSON.stringify(S.proposals[0])"));
    ok("P2: proposing records what should change, why, and what Jira said then", p.key === "ABC-20" && p.field === "sprint" && p.value.id === 43 && p.seen.value.id === 42 && p.why === "blocked on the API" && p.review.state === "proposed");
    ok("P2: and who proposed it", ev("S.proposals[0].added.by") === ev("meId()"));
    ok("P3: the item shows it's pending", /✎ 1/.test(d.querySelector(`#gantt [data-key="bar:${ev("J")}"]`).textContent));
    ok("P3: and the card lists it", /Move to sprint Sprint 43 \(now Sprint 42\)/.test(d.querySelector("#side #f-proposals").textContent) && /Proposed/.test(d.querySelector("#side #f-proposals").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page();
    await ev("propose('ABC-20', 'sprint', {id:43, name:'Sprint 43'}, 'why not')");
    ev("UI.planTab = 'proposals'; setWs('plan');"); await wait(10);
    ok("L1: Plan, then Proposals is the list for whoever maintains Jira", /ABC-20/.test(d.querySelector("#propList")?.textContent || "") && /Move to sprint Sprint 43/.test(d.querySelector("#propList").textContent));
    ok("L1: it can be copied as text", !!d.querySelector("#propCopy"));
    await ev("reviewProposal(S.proposals[0].id, 'approved')");
    ok("L2: approving records who and when", ev("S.proposals[0].review.state") === "approved" && ev("S.proposals[0].review.by") === ev("meId()"));
    ev("JIRA = parseJiraStatus(S43); renderProposals();"); await wait(10);
    ok("L3: once Jira has it, it's marked In Jira now and leaves the open list", ev("proposalState(S.proposals[0])") === "landed" && !/ABC-20/.test(d.querySelector("#proposalsWs").textContent.replace(/Proposals.*maintains Jira[^.]*\./, "")));
    ok("L3: and the item no longer shows it pending", ev("openProposals('ABC-20').length") === 0); });

  await sec(async ()=>{ const {ev} = await page();
    await ev("propose('ABC-20', 'sprint', {id:43, name:'Sprint 43'}, '')");
    ev("JIRA = parseJiraStatus(S44);");
    ok("C1: if Jira changed another way since, it says so (the proposal saw Sprint 42)", ev("proposalState(S.proposals[0])") === "changed");
    await ev("propose('ABC-20', 'labels+', 'checkout', '')");
    ev("JIRA = parseJiraStatus(LAB);");
    ok("C2: adding a label counts as in Jira once Jira has the label", ev("proposalState(S.proposals[1])") === "landed");
    ok("C3: a plan with proposals says so, so older copies open it read-only", ev("featuresIn(S).includes('proposals')") === true); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
