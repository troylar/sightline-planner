// Finished epics: an epic whose stories are all done or abandoned (whatever its own status says) stays out of
// Unsorted and the to-sort counts, and finished epics on the board can be parked in one go. Each check fails on the
// build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const epic = s => ({summary:s, status:"In Progress", category:"inprogress", type:"Feature", isEpic:true});   // epics left "In Progress"
const roll = (done, open, abandoned = 0) => ({total:done + open, todo:open, inprogress:0, done, unknown:0, points:0, pointsDone:0, unestimated:done + open,
  byState: Object.assign({}, done ? {"Done|Done|done":[done, 0]} : {}, open ? {"Open||todo":[open, 0]} : {}, abandoned ? {"Closed|Won't Do|done":[abandoned, 0]} : {})});
const EP = {"ABC-1":epic("On the board, all done"), "ABC-2":epic("All done"), "ABC-3":epic("Still going"), "ABC-4":epic("Brand new"), "ABC-5":epic("Done and abandoned")};
for (let i = 0; i < 9; i++) EP[`ABC-${10 + i}`] = epic(`Other ${i}`);
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[], issues:{"ABC-1":EP["ABC-1"]},
  rollups:{"ABC-1":roll(4, 0), "ABC-2":roll(6, 0), "ABC-3":roll(2, 3), "ABC-4":roll(0, 0), "ABC-5":roll(1, 0, 1)}});
const listing = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:at, jiraBase:"https://jira.example.com",
  searches:[{name:"Epics", jql:"x", total:Object.keys(EP).length, keys:Object.keys(EP)}], issues:Object.entries(EP).map(([key, v])=>({key, ...v}))});
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
  w.FIX = plan; w.STATUS = status; w.LISTING = listing;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    S.bars.push({id:"bOn", lane:S.lanes[0].id, start:1, span:2, label:"On the board, all done", kind:"work", owners:[], jira:"ABC-1", epics:["ABC-1"], status:"inprogress", dependsOn:[], tasks:[], datesFrom:"manual"});
    S = normalize(JSON.parse(JSON.stringify(S)), false);
    JIRA = parseJiraStatus(STATUS); JIRA_ISSUES = parseJiraIssues(LISTING); UI.planTab = "epics"; setWs("plan");`);
  return {w, d: w.document, ev};
}
const rows = (d, g) => [...d.querySelectorAll(`#jiraWs .egroup.${g} .erow`)].map(r=>r.dataset.epic).sort().join();
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ok("F1: epics whose stories are all done or abandoned are finished, whatever their own status", rows(d, "fin") === "ABC-2,ABC-5", rows(d, "fin"));
    ok("F1: they aren't in Unsorted; live and brand-new epics are", !/ABC-2|ABC-5/.test(rows(d, "uns")) && /ABC-3/.test(rows(d, "uns")) && /ABC-4/.test(rows(d, "uns")), rows(d, "uns"));
    ok("F1: the Finished group starts closed", d.querySelector("#jiraWs .egroup.fin") && !d.querySelector("#jiraWs .egroup.fin").open);
    ok("F1: rows say how many stories are open", /2 open of 5 stories|3 open of 5 stories/.test(d.querySelector('#jiraWs [data-epic="ABC-3"]').textContent) && /no stories yet/.test(d.querySelector('#jiraWs [data-epic="ABC-4"]').textContent) && /all 2 stories done \(1 abandoned\)/.test(d.querySelector('#jiraWs [data-epic="ABC-5"]').textContent)); });

  await sec(async ()=>{ const {d, ev} = await page();
    const n = ev("jiraEpicList().filter(x=>x.state==='unsorted' && !x.finished).length");
    ok("F2: the to-sort badge doesn't count finished epics", d.querySelector("#jiraBadge .vh").textContent === `${n} to sort` && n === 11, `${d.querySelector("#jiraBadge").textContent} vs ${n}`);
    ok("F2: Park all names only the live ones", d.querySelector("#jiraParkRest")?.textContent === "Park all 11"); });

  await sec(async ()=>{ const {d, ev} = await page();
    const b = d.querySelector("#jiraParkDone");
    ok("F3: finished epics on the board are pointed out, with one button to park them", !!b && b.textContent === "Park 1 finished");
    b.click(); await wait(40);
    ok("F3: parking them parks their initiatives (kept, off the timeline)", ev("barById('bOn').parked") === true && ev("epicPlace('ABC-1').state") === "parked"); });

  await sec(async ()=>{ const {ev} = await page();
    ev("JIRA.rollups['ABC-2'] = {...JIRA.rollups['ABC-2'], children:['ABC-90'], childrenCut:true}; render();");
    ok("F4: an epic whose stories were only partly counted isn't called finished", ev("jiraEpicList().find(x=>x.key==='ABC-2').finished") === false);
    ev("JIRA = parseJiraStatus(STATUS.replace(/\"rollups\":\\{.*\\}\\}\\}$/, '\"rollups\":{}}')); render();");
    ok("F4: with an older sync (no counts for them) nothing is called finished", ev("jiraEpicList().some(x=>x.finished)") === false); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
