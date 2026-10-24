// 1.17: From Jira vs Added here at a glance. Jira items look like Jira's (outlined, with their key), plan items look
// like the plan's; sprint headers say which are Jira's; counts say what they count; a layer shows only Jira's work, and
// what it hides is counted. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const status = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-1":{summary:"Linked story", status:"In Progress", category:"inprogress", type:"Story"}, "ABC-2":{summary:"Linked task", status:"To Do", category:"todo", type:"Story"}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-21", end:"2026-10-02", goal:""}], rollups:{}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; w.STATUS = status;
  ev(`askWhoOnStart = ()=>{}; download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; setMe(S.people[0]?.id || null);
    try { localStorage.removeItem("sightline-layer"); } catch(e){}
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length); window.J = L[0].id; window.P = L[1].id; L[0].jira = "ABC-1"; L[1].jira = "";
    const withTasks = L[2]; withTasks.jira = ""; withTasks.epics = []; withTasks.datesFrom = "manual";
    withTasks.tasks = [{id:"tj1", label:"Jira-linked task", jira:"ABC-2", start:"2026-09-28", days:3, status:"inprogress", owners:[], dependsOn:[]}, {id:"tp1", label:"Plan task", start:"2026-10-01", days:2, status:"notstarted", owners:[], dependsOn:[]}];
    window.T = withTasks.id; window.TJ = "tj1"; window.TP = "tp1"; S = normalize(JSON.parse(JSON.stringify(S)), false);
    S.sprints[0].jira = 42;
    JIRA = parseJiraStatus(STATUS); setWs("timeline"); setZoom("weeks"); render();`);
  return {w, d: w.document, ev};
}
const bar = (d, id) => d.querySelector(`#gantt [data-key="bar:${id}"]`);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {d, ev} = await page();
    const j = bar(d, ev("J")), p = bar(d, ev("P"));
    ok("L1: an item from Jira looks like Jira's: outlined, with its key", j.classList.contains("jira") && j.querySelector(".jkey")?.textContent === "ABC-1");
    ok("L1: an item added here looks like the plan's, with no key", p.classList.contains("plan") && !p.querySelector(".jkey"));
    ok("L1: the Jira item is drawn on the page's surface, outlined in its workstream's color", j.style.backgroundColor === "var(--surface)" && !!j.style.getPropertyValue("--lc")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("setZoom('days'); render();"); await wait(20);
    const tj = d.querySelector(`#gantt [data-key="task:${ev("TJ")}"]`), tp = d.querySelector(`#gantt [data-key="task:${ev("TP")}"]`);
    ok("L2: in Days, a Jira-linked task is outlined with its key; a plan task is filled", !!tj && tj.classList.contains("jira") && tj.querySelector(".jkey")?.textContent === "ABC-2" && !!tp && tp.classList.contains("plan") && !tp.querySelector(".jkey")); });

  await sec(async ()=>{ const {d} = await page();
    const hs = [...d.querySelectorAll("#gantt .gsprint")];
    ok("L3: a sprint that follows Jira says so, with Jira's exact dates", hs[0].classList.contains("jira") && /From Jira: Sep 21 – Oct 2/.test(hs[0].title), hs[0].title);
    ok("L3: the plan's own timeboxes say they aren't Jira sprints", hs[1].classList.contains("plan") && /not a Jira sprint/.test(hs[1].title)); });

  await sec(async ()=>{ const {d} = await page();
    const t = d.querySelector("#legend").textContent;
    ok("L4: the key explains From Jira and Added here", /From Jira/.test(t) && /Added here/.test(t));
    const tags = [...d.querySelectorAll("#gantt .bar .tag")].map(x=>x.textContent);
    ok("L5: progress never shows as a bare percentage", !tags.some(x=>/^\d+%$/.test(x)), tags.filter(x=>/%/.test(x)).join(","));
    ok("L5: it says what it counts", tags.some(x=>/^\d+\/\d+ (tasks|items)$/.test(x)), tags.join(" | ")); });

  await sec(async ()=>{ const {d, ev} = await page();
    d.querySelector("#lyJira").click(); await wait(20);
    ok("L6: Jira only hides what was added here and keeps what comes from Jira", !bar(d, ev("P")) && !!bar(d, ev("J")));
    ok("L6: a plan initiative holding Jira-linked work stays, as its holder", !!bar(d, ev("T")));
    const strip = d.querySelector("#hiddenStrip");
    ok("L6: and says how much it hides, with a way back", !strip.hidden && /added here (is|are) hidden/.test(strip.textContent) && !!d.querySelector("#hsEveryone"), strip.textContent);
    d.querySelector("#hsEveryone").click(); await wait(20);
    ok("L6: Show everyone brings it back", !!bar(d, ev("P")) && d.querySelector("#hiddenStrip").hidden);
    ev("setLayer('jira'); S.meta.planId = 'another-plan'; layerMemo = null; render();");
    ok("L6: the choice is kept per plan", !!bar(d, ev("P"))); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("barById(P).parked = true; render();");
    ok("L7: parked initiatives are counted, not silently gone", /1 initiative is parked: switched off for now/.test(d.querySelector("#hiddenStrip").textContent));
    ok("L8: a saved view keeps the layer", ev("normViewDef({layer:'jira'}).layer") === "jira" && ev("normViewDef({}).layer") === undefined); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
