// Stories under epics: an epic's stories come from the Jira status file, show inside its initiative, and can be
// switched off for now (only that is stored in the plan). Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const st = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", epic:"ABC-1", sprint:"Sprint 42", sprintId:42, sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09", points:3, ...x});
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Search", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true},
    "ABC-11":st("ABC-11"), "ABC-12":st("ABC-12", {status:"Done", category:"done"}), "ABC-13":st("ABC-13", {sprint:"", sprintId:0, sprintState:"", sprintStart:"", sprintEnd:"", category:"todo", status:"Open", points:null}),
    "ABC-14":st("ABC-14", {status:"Closed", category:"done", resolution:"Won't Do"}), "ABC-15":st("ABC-15", {sprint:"Sprint 43", sprintId:43, sprintState:"future", sprintStart:"2026-10-12", sprintEnd:"2026-10-23", category:"todo", status:"Open"})},
  rollups:{"ABC-1":{total:5, todo:2, inprogress:1, done:2, unknown:0, points:12, pointsDone:6, unestimated:1, byState:{}, children:["ABC-11","ABC-12","ABC-13","ABC-14","ABC-15"], childrenCut:false}}});
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
  w.FIX = plan; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    S.meta.jiraBase = "https://jira.example.com/browse/";
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.A = L[0].id; L[0].epics = ["ABC-1"]; L[0].jira = "ABC-1";
    JIRA = parseJiraStatus(STATUS); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev} = await page();
    ok("S1: the status file's list of each epic's stories is read", ev("JIRA.rollups['ABC-1'].children.length") === 5);
    ok("S1: an initiative's stories come from its epics", ev("storiesOf(barById(A)).map(x=>x.key).join()") === "ABC-11,ABC-12,ABC-14,ABC-15,ABC-13", ev("storiesOf(barById(A)).map(x=>x.key).join()"));
    ok("S1: a story's dates come from its sprint; no sprint means not scheduled", ev("storiesOf(barById(A)).find(x=>x.key==='ABC-11').inPlan") === true && ev("storiesOf(barById(A)).find(x=>x.key==='ABC-13').when") === null);
    ok("S1: nothing is copied into the plan", ev("barById(A).tasks.length") === 0 && !ev("JSON.stringify(S)").includes("ABC-11")); });

  await sec(async ()=>{ const {ev} = await page();
    ok("S2: progress counts every story (abandoned ones aside)", ev("epicRollup(barById(A)).total") === 4 && ev("epicRollup(barById(A)).abandoned") === 1);
    await ev("storyOff(A, ['ABC-13'], false)");
    ok("S2: switching a story off stores only its key on the initiative", ev("JSON.stringify(barById(A).storiesOff)") === '["ABC-13"]');
    ok("S2: and it stops counting toward progress", ev("epicRollup(barById(A)).total") === 3 && ev("epicRollup(barById(A)).off") === 1 && ev("epicRollup(barById(A)).done") === 1);
    await ev("storyOff(A, ['ABC-13'], true)");
    ok("S2: back on counts it again, and leaves nothing behind", ev("epicRollup(barById(A)).total") === 4 && ev("barById(A).storiesOff") === undefined); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', A); render();"); await wait(20);
    const f = d.querySelector("#f-stories");
    ok("S3: the initiative's card lists its stories", !!f && /Jira stories \(4\)/.test(f.textContent), f && f.textContent.slice(0,80));
    ok("S3: grouped: in a sprint, and not scheduled here", /In a sprint \(3\)/.test(f.textContent) && /Not scheduled here \(1\)/.test(f.textContent));
    ok("S3: abandoned stories have their own group, with no switch", /Abandoned in Jira \(1\)/.test(f.textContent) && !f.querySelector('[data-sw="ABC-14"]'));
    f.querySelector('[data-sw="ABC-11"]').click(); await wait(30);
    const f2 = d.querySelector("#f-stories");
    ok("S3: Off for now moves it to its own group", /Off for now \(1\)/.test(f2.textContent) && /Jira stories \(3 of 4\)/.test(f2.textContent), f2.textContent.slice(0,120)); });

  await sec(async ()=>{ const {ev} = await page();
    const m = ev(`(()=>{ barById(A).storiesOff = ["ABC-11"]; file.baseText = serialize(S, "p.json"); const base = parseText(file.baseText);
      S = clone(base); S.bars.find(b=>b.id===A).storiesOff = ["ABC-11","ABC-12"]; window.mine = clone(S);
      const theirs = clone(base); theirs.bars.find(b=>b.id===A).storiesOff = ["ABC-11","ABC-13"]; theirs.meta.revision = (base.meta.revision || 0) + 1;
      rebaseOnto(theirs, serialize(theirs, "p.json")); return JSON.stringify(S.bars.find(b=>b.id===A).storiesOff.slice().sort()); })()`);
    ok("S4: two people switching off different stories both win", m === '["ABC-11","ABC-12","ABC-13"]', m);
    ok("S4: the list survives loading the plan", ev("normalize(JSON.parse(JSON.stringify(mine)), false).bars.find(b=>b.id===A).storiesOff.length") === 2); });

  await sec(async ()=>{ const {ev} = await page();
    ev("JIRA = parseJiraStatus((j => { delete j.rollups['ABC-1'].children; delete j.rollups['ABC-1'].childrenCut; return JSON.stringify(j); })(JSON.parse(STATUS)))");
    ok("S5: an older status file without stories still counts, and lists none", ev("storiesOf(barById(A)).length") === 0 && ev("epicRollup(barById(A)).total") === 5); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("sel = null; setZoom('days'); render();"); await wait(20);
    const keys = () => [...d.querySelectorAll('#gantt [data-key^="story:"]')].map(e=>e.dataset.key.slice(6)).sort().join();
    ok("T1: stories in a sprint are drawn inside their initiative in Days", keys() === "ABC-11,ABC-12,ABC-15", keys());
    ok("T1: a done story looks done", d.querySelector('[data-key="story:ABC-12"]').classList.contains("st-done"));
    ok("T1: no sprint, a later sprint outside the view, or abandoned: not drawn", !d.querySelector('[data-key="story:ABC-13"]') && !d.querySelector('[data-key="story:ABC-14"]'));
    const b0 = ev("JSON.stringify([barById(A).start, barById(A).span, barById(A).tasks.length])"); ev("render()");
    ok("T2: drawing them changes nothing in the plan", ev("JSON.stringify([barById(A).start, barById(A).span, barById(A).tasks.length])") === b0 && !ev("hasTasks(barById(A))") && !ev("serialize(S, 'p.json')").includes("ABC-11"));
    ok("T2: and Today doesn't offer them as work to mark done", !ev("JSON.stringify(workItems().map(w=>w.key))").includes("ABC-1"));
    const el = d.querySelector('[data-key="story:ABC-11"]');
    ok("T3: read-only: no resize handles", !el.querySelector(".h"));
    const before = ev("JSON.stringify(S)"); el.dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"Delete", bubbles:true}));
    ok("T3: Delete on a story does nothing to the plan", ev("JSON.stringify(S)") === before);
    el.click(); await wait(20);
    ok("T3: clicking opens the story's card", ev("sel && sel.type") === "story" && /Jira story/.test(d.querySelector("#side").textContent) && !!d.querySelector('#side a[href*="ABC-11"]') && !d.querySelector("#f-tstatus"));
    ok("T3: its From Jira part shows its sprint and dates", /Sprint\s*Sprint 42 \(Sep 28 – Oct 9\)/.test(d.querySelector("#side #f-jfacts").textContent), d.querySelector("#side #f-jfacts").textContent);
    ok("T3: hovering explains it comes from Jira", /From Jira; change it there/.test(ev("peekContent('story','ABC-11').textContent")));
    d.querySelector("#f-story-sw").click(); await wait(30);
    ok("T4: Off for now from its card hides it from the timeline", ev("JSON.stringify(barById(A).storiesOff)") === '["ABC-11"]' && keys() === "ABC-12,ABC-15", keys());
    ev("sel = null; UI.filter = normFilter({status:['done']}); render();");
    ok("T5: filters apply to stories", keys() === "ABC-12", keys());
    ev("UI.filter = normFilter({}); render();");
    ok("T6: Find lists stories", ev("findIndex().filter(x=>x.kind==='story').map(x=>x.id).sort().join()") === "ABC-11,ABC-12,ABC-13,ABC-14,ABC-15");
    ev("goTo('story','ABC-12')"); await wait(20);
    ok("T6: and goes to one", ev("sel.type + sel.id") === "storyABC-12"); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("const L = S.bars.filter(b=>isLeafBar(b) && b.id !== A); L[0].tasks = [{id:'t17', label:'Planned here', jira:'ABC-11', start:'2026-09-28', days:3, status:'inprogress', dependsOn:[]}]; sel = null; setZoom('days'); render();"); await wait(20);
    ok("T7: a story that's already a task in the plan shows once, as the task", !d.querySelector('[data-key="story:ABC-11"]') && !!d.querySelector('[data-key="task:t17"]'));
    ok("T7: its card row says so", ev("storiesOf(barById(A)).find(x=>x.key==='ABC-11').real") === true); });

  await sec(async ()=>{ const {ev} = await page();
    ev("barById(A).storiesOff = ['ABC-11','ABC-12','ABC-13','ABC-15']; render();");
    ok("T8: switching off every live story doesn't mark the initiative abandoned", ev("!!barById(A).abandoned") === false);
    ev("JIRA = null; setZoom('days'); render();");
    ok("T9: without Jira there are no stories and nothing breaks", ev("storiesOf(barById(A)).length") === 0 && ev("epicRollup(barById(A))") === null); });

  // ---- senior review 4 fixes ----
  await sec(async ()=>{ const {ev} = await page();
    const r = ev(`(()=>{ const theirs = clone(S); theirs.bars.find(b=>b.id===A).storiesOff = ["ABC-12"]; theirs.meta.jiraSkip = ["ABC-90"];
      const ops = [{op:"set", type:"bars", id:A, field:"storiesOff", value:["ABC-11"], prev:undefined}, {op:"set", type:"meta", id:"meta", field:"jiraSkip", value:["ABC-91"], prev:[]}];
      const p = applyOps(theirs, ops).plan; return JSON.stringify([p.bars.find(b=>b.id===A).storiesOff.slice().sort(), p.meta.jiraSkip.slice().sort()]); })()`);
    ok("R1: a quick update replayed after a clash keeps a teammate's switched-off story (and skips)", r === JSON.stringify([["ABC-11","ABC-12"],["ABC-90","ABC-91"]]), r);
    const r2 = ev(`(()=>{ const theirs = clone(S); theirs.bars.find(b=>b.id===A).storiesOff = ["ABC-11","ABC-12"];
      const p = applyOps(theirs, [{op:"set", type:"bars", id:A, field:"storiesOff", value:undefined, prev:["ABC-11"]}]).plan; return JSON.stringify(p.bars.find(b=>b.id===A).storiesOff); })()`);
    ok("R1: and a switch back on removes only that story", r2 === '["ABC-12"]', r2); });

  await sec(async ()=>{ const {ev} = await page();
    ev("UI.filter = normFilter({range:{type:'custom', from:'2026-10-12', to:'2026-10-23'}}); render(); const b = barById(A); b.start = 0; b.span = 1;");   // planned before the stories' sprint
    ok("R2: a date filter shows an initiative whose Jira story falls in the range", ev("barVisible(barById(A))") === true && ev("inRange(wkDay(barById(A).start), barEndDay(barById(A)), fRangeDays())") === false); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("barById(A).storiesOff = ['ABC-12']; select('bar', A); render();"); await wait(20);
    const t = d.querySelector(".epiclist")?.textContent || "";
    ok("R5: the epic row counts the same stories as the initiative", /0 of 3 done/.test(t) && /1 off for now/.test(t), t); });

  await sec(async ()=>{ const {ev} = await page();
    ev("barById(A).storiesOff = Array.from({length:2000}, (_, i) => 'ZZZ-' + (i + 1));");
    const r = await ev("storyOff(A, ['ABC-11'], false)");
    ok("R6: past the limit, switching off another says so instead of dropping an old one", r === false && ev("barById(A).storiesOff.length") === 2000 && ev("barById(A).storiesOff[0]") === "ZZZ-1" && /already has 2,000 stories off/.test(ev("$('#status').textContent"))); });

  await sec(async ()=>{ const {ev} = await page();
    // a capped story list whose status breakdown missed the switched-off story's status
    ev(`JIRA.rollups['ABC-1'] = {...JIRA.rollups['ABC-1'], childrenCut:true, total:1, todo:0, inprogress:1, done:0, byState:{"In Progress||inprogress":[1,3]}};
      JIRA.issues['ABC-12'].status = "Odd"; barById(A).storiesOff = ['ABC-12']; render();`);
    const r = ev("JSON.stringify(epicRollup(barById(A)))");
    ok("R7: counts never go below zero, and a story that wasn't counted isn't taken out", ev("epicRollup(barById(A)).total") === 1 && ev("epicRollup(barById(A)).done") === 0 && ev("epicRollup(barById(A)).off") === 0, r); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("barById(A).epics = ['ABC-1', 'ABC-2']; select('bar', A); render();"); await wait(20);
    ok("U1: a newly linked epic says its stories come with the next sync", /ABC-2: its stories show here after the next Jira sync/.test(d.querySelector("#f-stories-wait")?.textContent || "")); });

  await sec(async ()=>{ const {ev} = await page();
    // Bound rendering work independently of shared-runner CPU speed; keep time as a diagnostic.
    // 80 epics x 50 stories, all on the board, in the Days view.
    const sample = ev(`(()=>{ const L = S.bars.filter(b=>isLeafBar(b)); const J = JSON.parse(STATUS);
      for (let e = 0; e < 80; e++){ const ek = "BIG-" + (e + 1); J.issues[ek] = {summary:"Epic " + e, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}; const kids = [];
        for (let c = 0; c < 50; c++){ const k = "BIG-" + (1000 + e * 50 + c); kids.push(k); J.issues[k] = {summary:"Story " + k, status:"In Progress", category:"inprogress", type:"Story", epic:ek, sprint:"Sprint 42", sprintId:42, sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09", points:2}; }
        J.rollups[ek] = {total:50, todo:0, inprogress:50, done:0, unknown:0, points:100, pointsDone:0, unestimated:0, byState:{}, children:kids, childrenCut:false};
        S.bars.push({...clone(L[0]), id:"big" + e, label:"Big " + e, jira:"", epics:[ek], tasks:[], storiesOff:undefined}); }
      S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JSON.stringify(J)); setZoom("days");
      const original = storyIndex, issues = JIRA.issues; let builds = 0, reads = 0;
      JIRA.issues = new Proxy(issues, {get(target, key){
        if (String(key).startsWith('BIG-') && ++reads > 32000) throw new Error('Story issue read budget exceeded');
        return Reflect.get(target, key);
      }});
      storyIndex = function(){ if (!storyMemo || storyMemo.J !== JIRA) builds++; return original(); };
      try {
        const t0 = performance.now(); render(); render(); const ms = Math.round((performance.now() - t0) / 2);
        const nodes = [...document.querySelectorAll('#gantt .story[data-key^="story:BIG-"]')];
        return {ms, builds, reads, nodes:nodes.length, keys:new Set(nodes.map(x=>x.dataset.key)).size,
          days:UI.zoom === 'days' && document.querySelector('#gantt').classList.contains('days')};
      } finally { storyIndex = original; JIRA.issues = issues; }
    })()`);
    ok("P1: Days renders all 4,000 stories exactly once", sample.days && sample.nodes === 4000 && sample.keys === 4000, JSON.stringify(sample));
    ok("P2: each full render builds the story index once", sample.builds === 2, sample.builds + " builds across two renders");
    ok("P3: Jira issue reads stay within a linear rendering budget", sample.reads <= 2 * 4000 * 4, sample.reads + " reads; " + sample.ms + " ms per render (informational)"); });

  await sec(async ()=>{ const {d, ev} = await page();
    // after a browser restart: the folder is remembered but not readable until the browser asks again
    ev(`JIRA = null; JIRA_ISSUES = null; window.asked = 0; jiraDir = {name:"jira", queryPermission: async()=>"prompt", requestPermission: async()=>{ asked++; return "granted"; }};
      readJiraDir = async()=>{ JIRA = parseJiraStatus(STATUS); return true; }; UI.planTab = "epics"; setWs("plan");`); await wait(20);
    const btn = d.querySelector("#jiraWs #jiraReconnect");
    ok("C1: Epics offers one-click Reconnect when the browser forgot the folder's permission", !!btn && btn.textContent === "Reconnect jira" && /needs your OK/.test(d.querySelector("#jiraWs").textContent));
    btn.click(); await wait(40);
    ok("C1: one click asks the browser and shows the epics", ev("asked") === 1 && !!d.querySelector('#jiraWs [data-epic="ABC-1"]') && !d.querySelector("#jiraWs #jiraReconnect")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
