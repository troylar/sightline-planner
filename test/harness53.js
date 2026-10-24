// From the ninth review (quality, performance, UX). Each check fails on the build before this.
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

  await sec(async ()=>{ const {ev} = await page({jira:false});
    const r = ev(`(()=>{ const base = clone(S), mine = clone(S), theirs = clone(S); mine.cardViews = [{id:"cv1", name:"Mine", rows:"lane", fields:[]}]; theirs.notes.push({id:"nT", lane:S.lanes[0].id, date:S.meta.start, text:"t", author:""});
      const m = mergePlans(base, mine, theirs); return JSON.stringify([(m.plan.cardViews || []).map(v=>v.id), m.plan.notes.some(n=>n.id==="nT")]); })()`);
    ok("Q1: a saved card view survives a teammate's save at the same time", r === JSON.stringify([["cv1"], true]), r); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ev(`S.meta.start = "2026-03-02"; S.meta.weeks = 30; S.sprints = Array.from({length:15}, (_, i)=>({id:"sp"+i, name:"S"+i, weeks:2, goal:""}));
      JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], issues:{}, rollups:{}, board:{id:7, name:"B", columns:[]},
        sprints:[{id:5, name:"Team S5", state:"active", start:"2026-07-20", end:"2026-07-31"}]}));`);
    const P = JSON.parse(ev("JSON.stringify(sprintProposal())")); let w = 0; const at = P.rows.findIndex(r=>{ if (r.jira) return true; w += r.weeks; return false; });
    ok("Q2: a gap of 20 weeks before Jira's first sprint keeps that sprint on its date", at >= 0 && w === 20, `${w} weeks before, rows ${P.rows.slice(0, 5).map(r=>r.name + "/" + r.weeks).join(",")}`); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    const r = ev(`(()=>{ const L = S.lanes[0]; const bs = S.bars.filter(b=>b.lane===L.id && isLeafBar(b) && !(b.tasks||[]).length && sideOf(b,"bar")==="plan").slice(0, 2); if (bs.length < 2) return "fixture";
      bs[0].start = 0; bs[0].span = 2; bs[1].start = 0; bs[1].span = 1; bs[1].dependsOn = []; L.until = dayToIso(startDay() + 20); S = normalize(JSON.parse(JSON.stringify(S)), false); render();
      const ok1 = commit(s=>{ const b = s.bars.find(x=>x.id===bs[1].id); b.dependsOn = [bs[0].id]; b.span = 2; });
      return String(ok1) + " " + (barEndDay(barById(bs[1].id)) <= startDay() + 20); })()`);
    ok("Q3: a change that the automatic scheduling would push into a blackout is refused", /^false true$/.test(r), r); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ok("Q4: a saved view's zoom and an edited update are named for older copies", ev(`(()=>{ const s = clone(S); s.views = [{id:"v", name:"v", def:{zoomN:2}}]; s.updates = [{id:"u", item:"bar:x", at:"2026-09-01T00:00:00Z", by:"", text:"x", edited:{by:"", at:"2026-09-02T00:00:00Z"}}]; const f = featuresIn(s); return f.includes("viewZoom") && f.includes("updateEdits") && KNOWN_FEATURES.includes("viewZoom"); })()`));
    ok("Q5: changing a saved view's zoom counts as changing it", ev(`defKey({...currentDef(), zoomN:2}) !== defKey({...currentDef(), zoomN:3})`)); });

  await sec(async ()=>{ const {ev} = await page({jira:false}); ev("setWs('timeline'); UI.filter = normFilter({}); render();");
    ev(`applyNav({ws:"plan", pt:"tags", plan:"p-another", f:JSON.stringify({lanes:["x"]})})`);
    ok("Q6: Back to another plan's place changes nothing here", ev("UI.ws") === "timeline" && JSON.stringify(ev("UI.filter.lanes")) === "[]"); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ok("Q7: an issue found only by a search keeps its updated date", ev(`parseJiraIssues(JSON.stringify({kind:"sightline-jira-issues", version:2, issues:[{key:"ABC-9", summary:"x", status:"s", category:"todo", updated:"2026-09-20T10:00:00.000+0000"}]})).issues["ABC-9"].updated`).startsWith("2026-09-20"));
    ev(`S.holidays = []; S.meta.start = "2027-11-29"; S.meta.weeks = 6; render(); addUsHolidays();`);
    ok("Q8: New Year's Day observed on Friday Dec 31 is added for a December plan", ev("S.holidays.some(x=>x.date === '2027-12-31')"), ev("JSON.stringify(S.holidays.map(x=>x.date))")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false});
    const st = (pts, who, cat, extra) => ({summary:"s", status: cat === "done" ? "Done" : "Open", category:cat, type:"Story", points:pts, assigneeKey:who, assignee:who ? who + " N." : "", sprintId:42, sprintState:"active", ...(extra || {})});
    ev(`JIRA = parseJiraStatus(${JSON.stringify(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://j.example.com", missing:[], rollups:{},
      issues:{"A-1":st(5,"U1","todo"), "A-2":st(8,"U1","todo",{resolution:"Won't Do", status:"Closed"}), "A-3":st(3,"U9","todo")}, sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}]}))});
      const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[0].capacity = 10; S.sprints = []; goWs("standup"); render();`); await wait(10);
    const B = JSON.parse(ev("JSON.stringify(burndownData(activeJiraSprint()))"));
    ok("U1: abandoned work is left out of the burndown, and said", B.total === 8 && B.abandoned === 1 && /1 abandoned left out/.test(d.querySelector("#suBurn")?.textContent || ""));
    ok("U2: capacity names work assigned to people not linked here, apart from unassigned", /Assigned to people not linked hereU9 N\./.test(d.querySelector("#suCap")?.textContent || "") && !!d.querySelector("#capLink") && /5\/10/.test(d.querySelector('#suCap [data-cap]')?.textContent || ""));
    ok("U3: Cards falls back to Jira's active sprint when the plan's sprints don't cover today", !/isn't in one of the plan's sprints/.test(d.querySelector("#standupWs").textContent) && !!d.querySelector("#standupWs #suBurn")); });

  await sec(async ()=>{ const {ev} = await page({jira:false}); ev("UI.filter = normFilter({}); render();");
    const r = ev(`(()=>{ const a = fitSpan().z; S.gates.push({id:"gX", gate:"Far gate", date:dayToIso(planEndDay() - 3), neededBy:"", blocks:"", owners:[]}); render(); return fitSpan().z >= planEndDay() - 3 && fitSpan().z >= a; })()`);
    ok("U4: Fit covers gates too", r === true); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev("S.bars[0].parked = true; S.bars[1].parked = true; setWs('timeline'); render();"); await wait(10);
    d.querySelector("#hsParkedOff").click(); await wait(10); ev("S.bars[1].parked = false; S.bars[2].parked = true; render();"); await wait(10);
    ok("U5: the parked note comes back when different work is parked, even at the same count", !!d.querySelector("#hsParked")); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ev(`S.lanes[1].until = dayToIso(startDay() + 7); S = normalize(JSON.parse(JSON.stringify(S)), false); window.asked = 0; window.confirm = ()=>{ asked++; return true; }; render();`);
    const r = ev(`moveLaneWork(S.lanes[0].id, S.lanes[1].id)`);
    ok("U6: moving a workstream's work somewhere it won't fit says so before asking", r === false && ev("asked") === 0 && /Can't move it there yet/.test(ev("document.querySelector('#status').textContent"))); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ev(`JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://j.example.com", missing:[], issues:{}, rollups:{}, releases:[{id:"101", name:"Winter 2026", project:"ABC", date:"2026-10-15", released:false}]}));`);
    ok("U7: Find knows Jira releases", ev(`JSON.stringify(findIndex().filter(x=>x.kind==="release").map(x=>x.id))`) === '["101"]');
    ev("goTo('release', '101')"); ok("U7: and opens one", ev("sel && sel.type") === "release"); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
