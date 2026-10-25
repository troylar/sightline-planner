// Plan, Epics (was the Jira tab): epics sorted into Unsorted / On the board / Parked, switched with one control. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const epic = (k, summary, x = {}) => ({key:k, summary, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true, ...x});
// 12 epics from the search; one ("Search relevance") matches an initiative already in the sample plan.
const EPICS = [epic("ABC-1","Auth go/no-go isolation"), epic("ABC-2","Search relevance tuning"), ...Array.from({length:10}, (_, i) => epic(`ABC-${10 + i}`, `Other work ${i}`))];
const listing = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:at, jiraBase:"https://jira.example.com",
  searches:[{name:"Epics", jql:"project = ABC", total:EPICS.length, keys:EPICS.map(e=>e.key)}], issues:EPICS});
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", issues:{}, missing:[],
  rollups:{}});
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
  w.FIX = plan; w.LISTING = listing; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    S.meta.jiraBase = "https://jira.example.com/browse/";
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); L[0].label = "Search relevance"; L[0].chartName = ""; window.SR = L[0].id;
    window.QS = []; const q0 = quickSave; quickSave = (what, fn, ...r) => { QS.push(what); return q0(what, fn, ...r); };
    JIRA = parseJiraStatus(STATUS); JIRA_ISSUES = parseJiraIssues(LISTING); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
const rows = (d, g) => [...d.querySelectorAll(`#jiraWs .egroup.${g} .erow`)].map(r=>r.dataset.epic);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  // ---- T1: where it lives ----
  await sec(async ()=>{ const {d, ev} = await page();
    ok("T1: the Plan tab's badge counts epics nobody has sorted", d.querySelector("#tab-plan #jiraBadge .vh")?.textContent === "12 to sort" && !d.querySelector("#tab-jira"));
    ev("openEpics()");
    ok("T1: Epics is a list under Plan", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics" && !!d.querySelector("#ws-plan [data-plan=epics] #jiraWs .egroup.uns"));
    ok("T1: the Manage list says how many epics are waiting", /Jira work/.test(d.querySelector('#plannav [data-pt="epics"]')?.textContent || "") && /12 to sort/.test(d.querySelector('#plannav [data-pt="epics"]').textContent));
    ev("setWs('timeline')"); d.querySelector("#jiraMenu").click();
    ok("T1: File, then Jira status, opens Plan, then Jira", ev("UI.ws") === "plan" && ev("UI.planTab") === "jira" && !d.querySelector("#dlgJira").open);
    ok("T1: Plan, then Jira holds all of the Jira setup", !!d.querySelector("#jiraSetupWs .jfolder") && !!d.querySelector("#jiraSetupWs #jiraMap, #jiraSetupWs .jsprints, #jiraSetupWs .jfolder"));
    ok("T1: and there's no separate settings gear", !d.querySelector("#settingsBtn") && !!d.querySelector('#plannav [data-pt="jira"]')); });

  // ---- T2: the three groups and the one-time sort ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("openEpics()");
    ok("T2: every epic starts unsorted", rows(d, "uns").length === 12 && rows(d, "on").length === 0);
    ok("T2: nothing on the page reads null", !/\bnull\b/.test(d.querySelector("#jiraWs").textContent) && (ev("goWs('settings')"), !/\bnull\b/.test(d.querySelector("#jiraSetupWs").textContent)) && (ev("openEpics()"), true));
    ok("T2: with many unsorted, it offers a one-time sort", /12 epics haven't been sorted/.test(d.querySelector("#jiraFirstSort")?.textContent || ""));
    d.querySelector('#jiraWs [data-on="ABC-2"]').click(); await wait(5);
    const items = [...d.querySelectorAll("#addMenu:not([hidden]) button[role=menuitem]")];
    ok("T3: On… offers a new initiative in each lane", items.filter(b=>b.dataset.lane).length === ev("S.lanes.length"));
    ok("T3: and suggests the existing initiative with the closest name", items.some(b=>b.dataset.bar === ev("SR")), items.map(b=>b.textContent).join(" | "));
    items.find(b=>b.dataset.bar === ev("SR")).click(); await wait(10);
    ok("T3: choosing it links the epic to that initiative", ev(`barById(SR).epics.includes("ABC-2")`) && rows(d, "on").join() === "ABC-2");
    ok("T3: as a quick update, so it works without Start editing", ev("QS.some(x=>/ABC-2 linked/.test(x))"));
    d.querySelector('#jiraWs [data-on="ABC-1"]').click(); await wait(5);
    const lane = ev("S.lanes[1].id"); [...d.querySelectorAll("#addMenu:not([hidden]) button[role=menuitem]")].find(b=>b.dataset.lane === lane).click(); await wait(10);
    const b1 = JSON.parse(ev(`JSON.stringify(S.bars.find(b=>(b.epics||[]).includes("ABC-1")))`));
    ok("T3: or makes a new initiative in the lane, named after the epic and linked to it", b1 && b1.lane === lane && b1.label === "ABC-1" && ev(`barTitle(barById("${b1 && b1.id}"))`) === "Auth go/no-go isolation" && b1.jira === "ABC-1", JSON.stringify(b1).slice(0,160));
    d.querySelector("#jiraParkRest").click(); await wait(10);
    ok("T2: Park the rest parks everything still unsorted, in one go", rows(d, "uns").length === 0 && ev("S.meta.jiraSkip.length") === 10 && !d.querySelector("#jiraFirstSort"));
    ok("T2: after that the badge is gone", d.querySelector("#jiraBadge").hidden === true); });

  // ---- T4: off and back on, without losing anything ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("openEpics()"); await ev(`epicOnNew("ABC-1", S.lanes[0].id)`); await ev(`epicOnLink("ABC-2", SR)`); ev("renderJiraWs()");
    const b1 = ev(`S.bars.find(b=>(b.epics||[]).includes("ABC-1")).id`);
    d.querySelector('#jiraWs .egroup.on [data-park="ABC-1"]').click(); await wait(10);
    ok("T4: parking an epic that has its own initiative parks the initiative: kept, not deleted", ev(`barById("${b1}").parked`) === true && ev(`!!barById("${b1}")`));
    ok("T4: it leaves the timeline and the work lists", ev(`!barVisible(barById("${b1}"))`) && !ev(`workItems().some(it=>it.key === "bar:${b1}")`));
    d.querySelector('#jiraWs .egroup.on [data-park="ABC-2"]').click(); await wait(10);
    ok("T4: parking an epic on an initiative that holds other work just lets go of the epic", !ev(`barById(SR).parked`) && !ev(`barById(SR).epics.includes("ABC-2")`) && ev(`S.meta.jiraSkip.includes("ABC-2")`));
    ok("T4: both show as parked", rows(d, "parked").sort().join() === "ABC-1,ABC-2");
    d.querySelector('#jiraWs .egroup.parked [data-on="ABC-1"]').click(); await wait(10);
    ok("T4: Back on brings the same initiative back", !ev(`barById("${b1}").parked`) && rows(d, "on").join() === "ABC-1" && !ev(`S.meta.jiraSkip.includes("ABC-1")`));
    ok("T4: the parked flag is saved in the plan", (ev(`barById("${b1}").parked = true`), ev(`normalize(JSON.parse(serialize(S, "p.json")), false).bars.find(b=>b.id==="${b1}").parked`)) === true); });

  // ---- T5: filter, and Show on the timeline ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev("openEpics()"); await ev(`epicOnNew("ABC-1", S.lanes[0].id)`); ev("renderJiraWs()");
    const f = d.querySelector("#jiraQ"); f.value = "other work 3"; f.dispatchEvent(new w.Event("input", {bubbles:true})); await new Promise(r=>setTimeout(r, 250));   // redraws after a short pause in typing
    ok("T5: the filter narrows every group", rows(d, "uns").join() === "ABC-13" && rows(d, "on").length === 0);
    ev("UI.jiraQ = ''; renderJiraWs()");
    [...d.querySelectorAll('#jiraWs .egroup.on .erow button')].find(b=>b.textContent === "Show").click(); await wait(5);
    ok("T5: Show opens the initiative on the timeline", ev("UI.ws") === "timeline" && ev("sel && sel.type") === "bar" && ev(`(barById(sel.id).epics||[]).includes("ABC-1")`));
    ok("no runtime errors (T5)", w.errs.length === 0, w.errs.join(" | ")); });

  // ---- T7: pick several, decide once ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev("openEpics()");
    const pick = k => { const c = d.querySelector(`#jiraWs .erow[data-epic="${k}"] .epick`); c.checked = true; c.dispatchEvent(new w.Event("change", {bubbles:true})); };
    pick("ABC-10"); pick("ABC-11"); pick("ABC-12");
    ok("T7: picking epics shows one bar for all of them", /3 picked/.test(d.querySelector("#jiraBatch")?.textContent || "") && d.querySelector("#jiraBatchOn").textContent === "Put 3 on the board");
    const n0 = ev("QS.length"); const sel = d.querySelector("#jiraBatchWs"); sel.value = ev("S.lanes[2].id");
    d.querySelector("#jiraBatchOn").click(); await wait(20);
    ok("T7: one click puts all three on the board, in that workstream, in one save", ev(`["ABC-10","ABC-11","ABC-12"].every(k=>S.bars.some(b=>(b.epics||[]).includes(k) && b.lane === S.lanes[2].id))`) && ev("QS.length") === n0 + 1);
    ok("T7: and the picks are cleared", !d.querySelector("#jiraBatch"));
    const all = d.querySelector("#jiraWs .egroup.uns .jall input"); all.checked = true; all.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("T7: Pick all picks every unsorted epic shown", /9 picked/.test(d.querySelector("#jiraBatch")?.textContent || ""), d.querySelector("#jiraBatch")?.textContent);
    d.querySelector("#jiraBatchPark").click(); await wait(20);
    ok("T7: Park parks them all at once", ev("S.meta.jiraSkip.length") === 9 && rows(d, "uns").length === 0);
    w.prompt = () => "Orchestration";
    const pk = d.querySelector('#jiraWs .erow[data-epic="ABC-13"] .epick'); pk.checked = true; pk.dispatchEvent(new w.Event("change", {bubbles:true}));
    const sel2 = d.querySelector("#jiraBatchWs"); sel2.value = "__new"; d.querySelector("#jiraBatchOn").click(); await wait(20);
    ok("T7: + New workstream makes the workstream and puts the epic in it", ev(`S.lanes.some(l=>l.name === "Orchestration")`) && ev(`S.bars.find(b=>(b.epics||[]).includes("ABC-13")).lane === S.lanes.find(l=>l.name === "Orchestration").id`)); });

  // ---- T8: lanes are called workstreams ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("setWs('timeline'); setZoom('weeks'); render()");
    ok("T8: the chart and its controls say workstream, not lane", /Workstream/.test(d.querySelector("#gantt .gcorner").textContent) && /By workstream/.test(d.querySelector("#rLanes").textContent));
    ev(`select("lane", S.lanes[0].id)`);
    ok("T8: so does a workstream's own panel", /Remove this workstream/.test(d.querySelector("#side").textContent) && !/\blane\b/i.test(d.querySelector("#side").textContent), d.querySelector("#side").textContent.slice(0,120));
    ok("T8: the plan file still says lanes, so older copies keep working", ev(`Object.keys(JSON.parse(serialize(S, "p.json"))).includes("lanes")`)); });

  // ---- T6: before the Jira folder is connected ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA = null; JIRA_ISSUES = null; openEpics()");
    ok("T6: with no Jira files, Epics offers to connect the folder right there", /Connect the jira folder next to your plan/.test(d.querySelector("#jiraWs").textContent) && !!d.querySelector("#jiraWs #jiraDirConnect2") && !!d.querySelector("#jiraWs #toSettings")); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
