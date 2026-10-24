// Sync health: the page says when the Jira sync last ran, how it runs, and when it's late or made for another plan.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const NOW = Date.UTC(2026, 8, 30, 14);
const status = (minsAgo, sync) => JSON.stringify({kind:"sightline-jira-status", generatedAt:new Date(NOW - minsAgo * 60000).toISOString(), jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Search", status:"In Progress", category:"inprogress", type:"Feature", isEpic:true}}, rollups:{}, board:{id:7, name:"Team board", columns:[]}, ...(sync ? {sync} : {})});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date;
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){}; w.Element.prototype.setPointerCapture=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.MK = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b)); L[0].epics = ["ABC-1"]; UI.planTab = "epics";`);
  return {w, d: w.document, ev};
}
const show = (ev, mins, sync) => { ev(`JIRA = parseJiraStatus(MK(${mins}, ${JSON.stringify(sync || null)})); setWs("plan");`); };
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page(); show(ev, 5, {by:"watch", every:15, plan:"team.json"});
    const t = d.querySelector("#jiraWs .jhealth")?.textContent || "";
    ok("H1: Epics says when and how Jira last synced", /Synced 5 min ago by watch \(every 15 min\) from jira\.example\.com · board Team board/.test(t), t);
    ok("H1: on time: no warning, and a green dot", !d.querySelector("#jiraOverdue") && !!d.querySelector(".jhealth .hdot.ok")); });

  await sec(async ()=>{ const {d, ev} = await page(); show(ev, 90, {by:"watch", every:15, plan:"team.json"});
    const o = d.querySelector("#jiraOverdue")?.textContent || "";
    ok("H2: a sync that's more than twice its interval late says so, with the interval, the age and what to check", /every 15 min/.test(o) && /2 h ago/.test(o) && /signed in/.test(o) && !!d.querySelector(".jhealth .hdot.bad"), o); });

  await sec(async ()=>{ const {d, ev} = await page(); show(ev, 30 * 60, {by:"sync", every:0, plan:"team.json"});
    ok("H3: a sync run by hand a while ago suggests keeping it current", !!d.querySelector("#jiraHandOld") && !!d.querySelector(".jhealth .hdot.warn") && /Synced 1 d ago by hand/.test(d.querySelector(".jhealth").textContent), d.querySelector(".jhealth")?.textContent); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("file.handle = {name:'copy-of-team.json'};"); show(ev, 5, {by:"watch", every:15, plan:"team.json"});
    ok("H4: Jira files made for another plan (a copied or renamed folder) are flagged", (t => t.includes("team.json") && t.includes("copy-of-team.json"))(d.querySelector("#jiraOtherPlan")?.textContent || "")); });

  await sec(async ()=>{ const {d, ev} = await page(); show(ev, 5, null);
    ok("H5: an older sync without this information still shows when it ran, with no warnings", /Synced 5 min ago/.test(d.querySelector(".jhealth")?.textContent || "") && !d.querySelector("#jiraOverdue, #jiraOtherPlan, #jiraHandOld"));
    ev("JIRA = parseJiraStatus(MK(5, {by:'<b>x</b>', every:99999, plan:'x'.repeat(500)}));");
    ok("H5: untrusted sync info is checked", ev("JSON.stringify([JIRA.sync.by, JIRA.sync.every, JIRA.sync.plan.length])") === JSON.stringify(["", 0, 200])); });

  await sec(async ()=>{ const {d, ev} = await page(); show(ev, 90, {by:"watch", every:15, plan:"team.json"}); ev("setWs('settings')");
    ok("H6: Plan, then Jira shows the same health", !!d.querySelector("#jiraSetupWs #jiraOverdue")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
