// 1.23: cards in two parts. A Jira item's card starts with From Jira (every Jira fact, read-only, with when it was
// synced), then Added here (the plan's fields); a plan item's card is all the plan's. Each check fails on the build
// before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const st = (k, x = {}) => ({summary:`Story ${k}`, status:"In Progress", category:"inprogress", type:"Story", epic:"ABC-1", sprint:"Sprint 42", sprintId:42, sprintState:"active", sprintStart:"2026-09-28", sprintEnd:"2026-10-09", points:3, assignee:"Avery S.", labels:["search"], ...x});
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"The epic", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}, "ABC-11":st("ABC-11"), "ABC-12":st("ABC-12", {status:"Done", category:"done"}), "ABC-20":st("ABC-20", {summary:"A linked task", epic:""})},
  rollups:{"ABC-1":{total:2, todo:0, inprogress:1, done:1, unknown:0, points:6, pointsDone:3, unestimated:0, byState:{}, children:["ABC-11","ABC-12"], childrenCut:false}}});
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
    S.meta.jiraBase = "https://jira.example.com/browse/";
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.E = L[0].id; window.P = L[1].id; window.T = L[2].id;
    L[0].jira = "ABC-1"; L[0].epics = ["ABC-1"]; L[1].jira = ""; L[2].jira = ""; L[2].tasks = [{id:"tj", label:"ABC-20", jira:"ABC-20", start:"2026-09-28", days:3, status:"inprogress", owners:[], dependsOn:[]}];
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(STATUS); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
const order = (d, a, b) => { const x = d.querySelector(a), y = d.querySelector(b); return !!x && !!y && !!(x.compareDocumentPosition(y) & 4); };
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('task', 'tj'); render();"); await wait(10);
    const f = d.querySelector("#side #f-jfacts");
    ok("C1: a Jira item's card starts with From Jira, then Added here", order(d, "#side #f-jfacts", "#side #f-addhd"));
    ok("C1: From Jira has every Jira fact", !!f && ["A linked task","Assignee","Avery S.","Sprint 42 (Sep 28 – Oct 9)","Points","Story","search","synced"].every(t=>f.textContent.includes(t)), f && f.textContent);
    ok("C1: and nothing in it can be edited", f && !f.querySelector("input, select, textarea"));
    ok("C1: the plan's fields are under Added here", order(d, "#side #f-addhd", "#side #f-addedby") && order(d, "#side #f-addhd", "#side #f-tags")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', E); render();"); await wait(10);
    const f = d.querySelector("#side #f-jfacts");
    ok("C2: an initiative made from an epic shows the epic's stories and sprints as Jira's", !!f && /Stories\s*1 of 2 done, 1 in progress/.test(f.textContent) && /Sprints\s*Sep 28 – Oct 9/.test(f.textContent), f && f.textContent); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("select('bar', P); render();"); await wait(10);
    ok("C3: a plan item's card has no From Jira part and starts with who added it", !d.querySelector("#side #f-jfacts") && !d.querySelector("#side #f-addhd") && !!d.querySelector("#side #f-addedby")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("setZoom('days'); render(); select('story', 'ABC-11'); render();"); await wait(10);
    ok("C4: a story's card is From Jira, then Added here with its tags and switch", !!d.querySelector("#side #f-jfacts") && order(d, "#side #f-jfacts", "#side #f-tags") && !!d.querySelector("#side #f-story-sw")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA = parseJiraStatus(STATUS.replace(/\"ABC-20\":\\{[^}]*\\}/, '\"ABC-99\":{\"summary\":\"x\",\"status\":\"Open\",\"category\":\"todo\"}')); select('task', 'tj'); render();"); await wait(10);
    ok("C5: a Jira item that wasn't in the last sync says so, and says nothing is lost", /wasn't in the last sync/.test(d.querySelector("#side #f-jfacts")?.textContent || "") && /Everything added here is kept/.test(d.querySelector("#side #f-jfacts").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("S.tags = [{id:'tq', name:'q4', color:'#7a4fb3'}]; barById(E).tags = ['tq']; select('bar', E); render();"); await wait(10);
    d.querySelector('#f-tags .tagpill .x').click(); await wait(30);
    ok("C6: removing a tag from a Jira item's card takes it off, wherever it was kept", !ev("barById(E).tags") && !ev("(S.jiraItems || []).some(x=>x.tags.includes('tq'))")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
