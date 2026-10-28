// Senior review 10: Save as you go never loses an edit, merges touch only people fields, team capacity syncs and counts
// holidays, read-only quick controls stay usable, and Cards/capacity say what they show. Each check fails on the build
// before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
const ST = (sid, st, start, end) => ({sprintId:sid, sprint:"Sprint " + sid, sprintState:st, sprintStart:start, sprintEnd:end});
const S42 = ST(42, "active", "2026-09-28", "2026-10-09"), S43 = ST(43, "future", "2026-10-12", "2026-10-23"), S40 = ST(40, "closed", "2026-08-31", "2026-09-11");
const story = (sum, who, sp, extra) => ({summary:sum, status:"To Do", category:"todo", type:"Story", assignee:who ? who + " N." : "", assigneeKey:who || "", labels:[], ...sp, ...(extra || {})});
const JS = JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Placed epic", status:"In Progress", category:"inprogress", type:"Epic"}, "ABC-2":story("Placed work", "JIRAUSER1", S42),
    "ABC-10":{summary:"Checkout", status:"To Do", category:"todo", type:"Epic"}, "ABC-11":story("Pay by card", "JIRAUSER1", S42), "ABC-12":story("Receipts", "JIRAUSER1", S43),
    "ABC-20":{summary:"Gift cards", status:"To Do", category:"todo", type:"Epic"}, "ABC-21":story("Balance page", "JIRAUSER9", S43),
    "ABC-30":{summary:"Old stuff", status:"To Do", category:"todo", type:"Epic"}, "ABC-31":story("Done long ago", "JIRAUSER1", S40),
    "ABC-40":{summary:"Parked with sprint work", status:"To Do", category:"todo", type:"Epic"}, "ABC-41":story("Still planned", "", S43),
    "ABC-50":{summary:"Wallet feature", status:"To Do", category:"todo", type:"Epic", parent:"ABC-10"}, "ABC-51":story("Wallet story", "JIRAUSER1", S42, {parent:"ABC-50"}),
    "ABC-90":story("Loose story", "JIRAUSER1", S42)},
  sprints:[{id:40, name:"Sprint 40", state:"closed", start:"2026-08-31", end:"2026-09-11"}, {id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}],
  rollups:{"ABC-1":{total:1, todo:1, children:["ABC-2"]}, "ABC-10":{total:2, todo:2, children:["ABC-11","ABC-12"]}, "ABC-20":{total:1, todo:1, children:["ABC-21"]}, "ABC-30":{total:1, todo:1, children:["ABC-31"]}, "ABC-40":{total:1, todo:1, children:["ABC-41"]}}});
async function page(opts = {}){
  const handle = makeHandle("plan.json", opts.text || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:opts.url || "https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    if (opts.session) w.sessionStorage.setItem("sightline-session", opts.session);
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.BroadcastChannel = globalThis.BroadcastChannel; w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id);");
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = "";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); UI.planTab = "epics"; setWs("plan"); render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const st = (pts, who, sid) => ({summary:"s", status:"x", category:"todo", type:"Story", points:pts, assigneeKey:who, assignee:who + " N.", sprintId:sid, sprintState: sid === 42 ? "active" : "future"});
  const J = extra => JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"A-1":st(8,"U1",42), "A-2":st(6,"U2",42), "A-9":st(3,"U2",42)},
    sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}], ...(extra || {})});
  const prep = (x) => `JIRA = parseJiraStatus(${JSON.stringify(J(x))}); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[1].jira = {key:"U2", user:"u2", name:"B"}; p.forEach(q=>{ q.days = 5; q.off = []; }); S.holidays = []; UI.capAll = true; goWs("standup"); render();`;

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ok("S1: team capacity is part of what saves and merges", ev(`(() => { const a = clone(S), b = clone(S); b.meta.capRates = [{from:"2026-09-01", points:10}]; return diffPlans(a, b).some(o=>o.field === "capRates"); })()`));
    // a Save as you go write that fails keeps the edit
    ev(`localStorage.setItem(SAYG_KEY, "1"); stopAuto(); startAuto = ()=>{}; file.handle = {name:"p.json"}; file.holdLock = false; file.baseText = serialize(S, "p.json"); file.baseHash = hashText(file.baseText); S.meta.title = "My edit"; file.dirty = true;
      window.qs0 = quickSave; quickSave = () => { S = normalize(JSON.parse(file.baseText), false); return Promise.resolve(false); };`);
    await ev("runSayg()"); await wait(10);
    ok("S2: a failed Save as you go write keeps the edit, still unsaved", ev("S.meta.title") === "My edit" && ev("file.dirty") === true);
    ev(`coalesceKey = "pn:x"; window.CALLS = 0; quickSave = () => { CALLS++; file.dirty = false; return Promise.resolve(true); };`); await ev("runSayg()");
    ok("S3: a field left focused still saves after the pause", ev("CALLS") === 1 && ev("coalesceKey") === null);
    ev(`file.dirty = true; quickSave = () => Promise.resolve(false);`); await ev("setSayg(false)"); await wait(10);
    ok("S4: turning it off with a change pending keeps it on until that saves", ev("saygOn()") === true);
    ev(`file.dirty = true; quickSave = () => { file.dirty = false; return Promise.resolve(true); };`); await ev("setSayg(false)"); await wait(10);
    ok("S4: and turns off once it has saved", ev("saygOn()") === false && ev("file.dirty") === false);
    ev(`localStorage.removeItem(SAYG_KEY); file.handle = null; quickSave = qs0;`); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    const a = ev("S.people[0].id"), b = ev("S.people[1].id");
    ev(`S.notes.push({id:"note-z", text:"${a}", author:"${a}", on:"", color:"yellow", at:0, lane:""}); S = normalize(JSON.parse(JSON.stringify(S)), false); S.notes.find(n=>n.id==="note-z").text = "${a}"; setMe("${a}"); window.QF = null; quickSave = (w, fn) => { QF = fn; commit(fn); return Promise.resolve(true); };`);
    await ev(`mergePeople([["${a}", "${b}"]], true)`); await wait(10);
    ok("M1: a merge changes people fields only, not text that happens to match", ev(`S.notes.find(n=>n.id==="note-z").text`) === a && ev(`S.notes.find(n=>n.id==="note-z").author`) === b, ev(`JSON.stringify(S.notes.find(n=>n.id==="note-z"))`));
    ok("M2: a retry works the merge out again on the latest file", ev("QF && QF.rerun") === true);
    ok("M3: merging away yourself keeps you as the one kept", ev("meId()") === b);
    ev(`S.people.push({...mkPerson("pa", "Alex Lee", 50), jira:{key:"J1", user:"a1", name:"Alex Lee"}}, {...mkPerson("pb", "Alex Lee", 51), jira:{key:"J2", user:"a2", name:"Alex Lee"}});`);
    ok("M4: two Jira users with one name aren't offered as duplicates", !ev("JSON.stringify(dupePeople())").includes('"pa"') && !ev("JSON.stringify(dupePeople())").includes('"pb"')); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep()); ev(`setCapRate("2026-09-01", 10)`); await wait(10);
    const c0 = () => [...d.querySelectorAll("#suCap tr[data-cap]")][0].querySelector("td.capc").textContent;
    ok("C1: setup", c0() === "8/10", c0());
    ev(`S.holidays = [{date:"2026-10-05", name:"Company day"}]; render();`);
    ok("C2: a company holiday takes a day off everyone's share", c0() === "8/9", c0());
    ev(`S.holidays = []; S.meta.capRates = [{from:"2026-10-01", points:20}]; render();`);
    ok("C3: a figure set mid-sprint applies to that sprint", c0() === "8/20", c0());
    ev(`team()[2].jira = null; render();`);
    ok("C4: with a team figure, people without a Jira user are shown too, with what they can take", !!d.querySelector(`#suCap tr[data-cap="${ev("team()[2].id")}"] td.capc.h0`));
    ok("C5: each cell says its state in words", /within capacity|over by/.test(d.querySelector("#suCap td.capc[aria-label]")?.getAttribute("aria-label") || "")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep({dev:{"A-1":{prs:[{title:"x", url:"https://b.example.com/1", status:"OPEN", author:"a", repo:"r", updated:"2026-09-29T00:00:00Z", reviewers:1, approved:0}], branches:1, at:"2026-09-30T08:00:00Z"}}, devCover:{read:1, of:3}}));
    ok("P0: the pull request list has a Repository column", /Repository/.test(d.querySelector("#suPrs thead")?.textContent || "") && d.querySelector("#suPrs td.prrepo")?.textContent === "r");
    ok("P0: an older file without the repo gets it from the PR's address", ev(`parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", issues:{}, missing:[], dev:{"A-1":{prs:[{title:"x", url:"https://b.example.com/projects/PAY/repos/web-ui/pull-requests/3", status:"OPEN"}], branches:1}}})).dev["A-1"].prs[0].repo`) === "PAY/web-ui");
    ok("P1: partial pull request data says so", /read for 1 of 3 of this sprint.s issues/.test(d.querySelector("#suPrs")?.textContent || ""));
    ev(`window.open = u => { window.OPENED = u; }; S.meta.jiraBase = "https://jira.example.com/browse/"; render();`);
    const btn = [...d.querySelectorAll("#suPrs button.linkish")].find(b=>b.textContent === "A-1"); if (btn) btn.click();
    ok("P2: the PR's issue opens in Jira when it isn't on the plan", ev("window.OPENED || ''") === "https://jira.example.com/browse/A-1", ev("window.OPENED || ''"));
    ev(`UI.filter = normFilter({people:[team()[1].id]}); render();`);
    const keys = [...d.querySelectorAll("#standupWs .sucard")].map(c=>c.dataset.card);
    ok("F1: a person filter keeps their Jira issues that aren't on the plan", keys.includes("jira:A-2") && keys.includes("jira:A-9") && !keys.includes("jira:A-1"), keys.join(" ")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false, url:"https://local.test/timeline-planner.html"}); ev(`JIRA = null; goWs("standup"); render();`);
    ok("E1: no Jira sprint: one line says what to set up", /No active Jira sprint/.test(d.querySelector("#suNoWidgets")?.textContent || "") || /isn't in one of the plan's sprints/.test(d.querySelector("#standupWs").textContent));
    ev(`JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", issues:{}, missing:[], page:{version:"99.0.0", file:"sightline-new.html"}})); newerShown = ""; render();`);
    ok("N1: a newer page under another name says to open it, not refresh", !!d.querySelector("#newerOpen") && /Open sightline-new\.html/.test(d.querySelector("#newerOpen").textContent) && !d.querySelector("#newerRefresh")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep()); ev(`locked = true; UI.planTab = "team"; setWs("plan"); render();`); await wait(10);
    const pid = ev("team()[0].id");
    ok("Q1: read-only, the quick controls in Team stay usable", d.querySelector(`#talloc-${pid}`)?.disabled === false && d.querySelector("#t-capRatePts")?.disabled === false && d.querySelector("#t-capRateFrom")?.disabled === false);
    ok("Q2: while ordinary fields stay locked", ![...d.querySelectorAll("#t-team input[aria-label=Initials]")].some(i=>!i.disabled)); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
