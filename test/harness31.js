// 1.22: tags. The plan's tags on anything (on Jira items they're kept by Jira key, so they follow the issue); Jira's
// labels come from the sync, read-only, and stay separate from plan tags; tags filter (show only / hide) and merge
// item by item. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Epic one", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true, labels:["search"]},
          "ABC-11":{summary:"A story", status:"In Progress", category:"inprogress", type:"Story", epic:"ABC-1", sprint:"Sprint 42", sprintId:42, sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09", labels:["spike", "search"]}},
  rollups:{"ABC-1":{total:1, todo:0, inprogress:1, done:0, unknown:0, points:0, pointsDone:0, unestimated:1, byState:{}, children:["ABC-11"], childrenCut:false}}});
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
  w.FIX = plan; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.P = L[0].id; window.E = L[1].id; L[1].jira = "ABC-1"; L[1].epics = ["ABC-1"];
    S.tags = [{id:"tq", name:"q4", color:"#7a4fb3"}, {id:"ts", name:"spike", color:"#1f8a70"}];
    JIRA = parseJiraStatus(STATUS); S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); setZoom("weeks"); render();`);
  return {w, d: w.document, ev};
}
const has = (d, id) => !!d.querySelector(`#gantt [data-key="bar:${id}"]`);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', P); render();"); await wait(10);
    const inp = d.querySelector("#f-tags #f-tagadd"); inp.value = "q4"; inp.dispatchEvent(new (d.defaultView.KeyboardEvent)("keydown", {key:"Enter", bubbles:true})); await wait(30);
    ok("T1: a tag can be added to a plan item from its card", JSON.stringify(ev("barById(P).tags")) === '["tq"]');
    ok("T1: and shows on the chart", !!d.querySelector(`#gantt [data-key="bar:${ev("P")}"] .tagdots i`));
    ev("select('bar', E); render();"); await wait(10);
    const inp2 = d.querySelector("#f-tags #f-tagadd"); inp2.value = "customer-facing"; inp2.dispatchEvent(new (d.defaultView.KeyboardEvent)("keydown", {key:"Enter", bubbles:true})); await wait(30);
    ok("T2: on a Jira item, a new tag is created and kept with its Jira key, not the plan item", ev("S.tags.some(t=>t.name==='customer-facing')") && ev("JSON.stringify(S.jiraItems.map(x=>x.id))") === '["ABC-1"]' && !ev("barById(E).tags"));
    ok("T3: Jira's labels show read-only, separate from the plan's tags", /Jira labels:\s*search/.test(d.querySelector("#f-tags").textContent) && !d.querySelector("#f-tags .labelpill .x")); });

  await sec(async ()=>{ const {ev} = await page();
    ev("barById(P).tags = ['tq']; render();");
    ev("UI.filter = normFilter({tags:['tq']}); render();");
    ok("F1: show only a tag keeps what has it", ev("barVisible(barById(P))") === true && ev("barVisible(barById(E))") === false);
    ev("UI.filter = normFilter({hideTags:['tq']}); render();");
    ok("F1: hiding a tag hides what has it", ev("barVisible(barById(P))") === false && ev("barVisible(barById(E))") === true);
    ev("UI.filter = normFilter({hideLabels:['spike']}); setZoom('days'); render();");
    ok("F2: a Jira label filters stories too", ev("storiesOf(barById(E)).filter(x=>x.drawn && storyVisible(x)).length") === 0);
    ev("UI.filter = normFilter({labels:['search']}); render();");
    ok("F2: and show only a label keeps what Jira labeled", ev("barVisible(barById(E))") === true && ev("barVisible(barById(P))") === false); });

  await sec(async ()=>{ const {ev} = await page();
    const r = ev(`(()=>{ const base = clone(S); base.jiraItems = [{id:"ABC-1", tags:[]}]; const mine = clone(base), theirs = clone(base);
      mine.jiraItems[0].tags = ["tq"]; theirs.jiraItems[0].tags = ["ts"];
      const m = mergePlans(base, mine, theirs); return JSON.stringify(m.plan.jiraItems[0].tags.slice().sort()); })()`);
    ok("M1: two people tagging the same Jira item both win", r === JSON.stringify(["tq","ts"]), r);
    ok("M2: a tag that isn't defined is dropped when the plan loads", ev("(()=>{ const x = clone(S); x.bars[0].tags = ['tq','nope']; return JSON.stringify(normalize(x, false).bars[0].tags); })()") === '["tq"]');
    ok("M3: a plan with tags says so, so older copies open it read-only", ev("featuresIn(S).includes('tags')") === true); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("barById(P).tags = ['tq']; UI.planTab = 'tags'; setWs('plan');"); await wait(10);
    const row = d.querySelector('#tagTable [data-tag="tq"]');
    ok("P1: Plan, then Tags lists them with how often they are used", !!row && row.querySelector("td.num").textContent === "1");
    d.querySelector('#tagTable [data-deltag="tq"]').click(); await wait(10);
    ok("P1: deleting a tag takes it off everything", !ev("S.tags.some(t=>t.id==='tq')") && !ev("barById(P).tags")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
