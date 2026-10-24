// 1.25: safety when Jira goes missing. A sync that loses most of the plan's items is kept back by the sync (the page
// says so and that nothing was removed), and an item missing from the sync still reads as itself, from a title
// remembered in this browser only. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const mk = (withIssue, guard) => JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[], sync:{by:"watch", every:15, plan:"plan.json"},
  issues: withIssue ? {"ABC-1":{summary:"Faceted search", status:"In Progress", category:"inprogress", type:"Story"}} : {"ABC-9":{summary:"Other", status:"Open", category:"todo", type:"Story"}}, rollups:{}, ...(guard ? {guard} : {})});
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
  w.FIX = plan; w.WITH = mk(true); w.WITHOUT = mk(false); w.GUARDED = mk(true, {at, found:3, previous:40, plan:"plan.json"}); w.BADGUARD = mk(true, {at:"x", found:"lots", previous:-2});
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    try { localStorage.removeItem("sightline-lastseen"); } catch(e){}
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.J = L[0].id; L[0].jira = "ABC-1"; L[0].label = "ABC-1";
    S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA = parseJiraStatus(GUARDED); UI.planTab = 'epics'; setWs('plan');"); await wait(10);
    const g = d.querySelector("#jiraWs #jiraGuard");
    ok("G1: when the sync kept the earlier files back, the page says so, and that nothing was removed", !!g && /only 3 of this plan's 40 Jira items/.test(g.textContent) && /Nothing was removed/.test(g.textContent) && /--accept-drop/.test(g.textContent), g && g.textContent);
    ok("G1: and the health dot is red", !!d.querySelector("#jiraWs .jhealth .hdot.bad"));
    ev("JIRA = parseJiraStatus(BADGUARD);");
    ok("G2: a malformed guard record is ignored", ev("JIRA.guard") === null); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("JIRA = parseJiraStatus(WITH); rememberTitles(); render();");
    ok("T1: with the issue in the sync, its title is Jira's", ev("barTitle(barById(J))") === "Faceted search");
    ev("JIRA = parseJiraStatus(WITHOUT); render();");
    ok("T2: when a sync misses it, it still reads as itself, marked", ev("barTitle(barById(J))") === "Faceted search (not in the last sync)", ev("barTitle(barById(J))"));
    ev("select('bar', J); render();"); await wait(10);
    ok("T2: its card shows the title it was last seen with", /Last seen as:\s*Faceted search/.test(d.querySelector("#side #f-jfacts").textContent));
    ok("T3: the remembered title is kept in this browser only, never in the plan file", !ev("serialize(S, 'p.json')").includes("Faceted search")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
