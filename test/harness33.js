// 1.24: notes and dependencies on Jira items, by key. A note on a Jira item follows the issue (to another epic, say),
// is kept while a sync doesn't return it, and is listed until it's back. A plan item can wait for a Jira item: a
// warning if it would start before Jira says it finishes, and nothing moves. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const st = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", epic:"ABC-1", sprint:"Sprint 43", sprintId:43, sprintState:"future", sprintStart:"2026-10-12", sprintEnd:"2026-10-23", ...x});
const mk = (epicOf11) => JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Epic one", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}, "ABC-2":{summary:"Epic two", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true},
          ...(epicOf11 ? {"ABC-11":st("ABC-11", {epic:epicOf11})} : {})},
  rollups:{"ABC-1":{total:epicOf11 === "ABC-1" ? 1 : 0, todo:0, inprogress:epicOf11 === "ABC-1" ? 1 : 0, done:0, unknown:0, points:0, pointsDone:0, unestimated:0, byState:{}, children:epicOf11 === "ABC-1" ? ["ABC-11"] : [], childrenCut:false},
           "ABC-2":{total:epicOf11 === "ABC-2" ? 1 : 0, todo:0, inprogress:epicOf11 === "ABC-2" ? 1 : 0, done:0, unknown:0, points:0, pointsDone:0, unestimated:0, byState:{}, children:epicOf11 === "ABC-2" ? ["ABC-11"] : [], childrenCut:false}}});
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
  w.FIX = plan; w.A1 = mk("ABC-1"); w.A2 = mk("ABC-2"); w.GONE = mk(null);
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.E1 = L[0].id; window.E2 = L[1].id; window.P = L[2].id;
    L[0].jira = "ABC-1"; L[0].epics = ["ABC-1"]; L[1].jira = "ABC-2"; L[1].epics = ["ABC-2"]; L[2].jira = ""; L[2].epics = []; L[2].start = 1; L[2].span = 2; L[2].dependsOn = []; L[2].waitsFor = [];
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(A1); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("setZoom('days'); UI.dayZoom = 5; render(); select('story', 'ABC-11'); render();"); await wait(10);
    const ta = d.querySelector("#side #sticky-in"); ta.value = "Check with legal first"; d.querySelector("#side #sticky-add").click(); await wait(30);
    ok("N1: a note on a Jira story is kept by its Jira key", ev("S.notes.find(n=>n.text==='Check with legal first').on") === "jira:ABC-11");
    ev("JIRA = parseJiraStatus(A2); render();"); await wait(10);
    ok("N2: when the story moves to another epic in Jira, its note goes with it", ev("notesOn('jira:ABC-11').length") === 1 && ev("storiesOf(barById(E2)).some(x=>x.key==='ABC-11')") === true);
    ev("JIRA = parseJiraStatus(GONE); UI.planTab = 'epics'; setWs('plan');"); await wait(10);
    ok("N3: while a sync doesn't return the story, the note is kept and listed", ev("S.notes.some(n=>n.on==='jira:ABC-11')") && /Notes on Jira items not in the last sync \(1\)/.test(d.querySelector("#jiraOrphans")?.textContent || ""), d.querySelector("#jiraOrphans")?.textContent);
    ev("JIRA = parseJiraStatus(A1); renderJiraWs();"); await wait(10);
    ok("N3: and when it's back, it's back on its story, off the list", !d.querySelector("#jiraOrphans") && ev("notesOn('jira:ABC-11').length") === 1); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("commit(s=>{ s.notes.push({id:'nOld', lane:s.lanes[0].id, date:s.meta.start, text:'from before', author:'', on:'bar:' + E1}); }); select('bar', E1); render();"); await wait(10);
    ok("N4: a Jira item's card shows notes kept by key and notes from before, on the plan item", /from before/.test(d.querySelector("#side").textContent));
    d.querySelector("#side #sticky-in").value = "New one"; d.querySelector("#side #sticky-add").click(); await wait(30);
    ok("N4: new notes there are kept by the Jira key", ev("S.notes.find(n=>n.text==='New one').on") === "jira:ABC-1"); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', P); render();"); await wait(10);
    const inp = d.querySelector("#side #f-jdep-add"); inp.value = "abc-11"; inp.dispatchEvent(new (d.defaultView.KeyboardEvent)("keydown", {key:"Enter", bubbles:true})); await wait(10);
    ok("D1: a plan item can wait for a Jira item, by key", JSON.stringify(ev("barById(P).jiraDeps")) === '["ABC-11"]');
    ok("D2: it warns when it would start before Jira says that item finishes", /starts before ABC-11 is due to finish in Jira \(Oct 23\)/i.test(d.querySelector("#side #f-jdeps").textContent), d.querySelector("#side #f-jdeps").textContent);
    ev("setZoom('weeks'); render();"); await wait(10);
    ok("D2: and the bar says so", /Jira dep/.test(d.querySelector(`#gantt [data-key="bar:${ev("P")}"]`).textContent));
    const s0 = ev("barById(P).start"); ev("commit(s=>{ s.meta.title = s.meta.title + ' '; })");
    ok("D3: nothing moves to suit it", ev("barById(P).start") === s0 && ev("reschedule().moved") === 0);
    ev("JIRA = parseJiraStatus(GONE); select('bar', P); render();"); await wait(10);
    ok("D4: if the item isn't in the last sync, the dependency stays and says so", /ABC-11 isn't in the last sync/.test(d.querySelector("#side #f-jdeps").textContent) && JSON.stringify(ev("barById(P).jiraDeps")) === '["ABC-11"]'); });

  await sec(async ()=>{ const {ev} = await page();
    const r = ev(`(()=>{ const base = clone(S); const mine = clone(base), theirs = clone(base);
      mine.bars.find(b=>b.id===P).jiraDeps = ["ABC-11"]; theirs.bars.find(b=>b.id===P).jiraDeps = ["ABC-2"];
      return JSON.stringify(mergePlans(base, mine, theirs).plan.bars.find(b=>b.id===P).jiraDeps.slice().sort()); })()`);
    ok("M1: two people adding Jira dependencies to the same item both win", r === JSON.stringify(["ABC-11","ABC-2"]), r);
    ev("barById(P).jiraDeps = ['ABC-11'];");
    ok("M2: a plan using these says so, so older copies open it read-only", ev("featuresIn(S).includes('jiraRefs')") === true); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
