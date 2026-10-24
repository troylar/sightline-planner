// Deactivating people: an inactive person keeps their history (owners, notes, Jira link) but leaves what looks
// ahead (owner pickers, rows, load, capacity), and older copies open such a plan read-only. Each check fails on the
// build before this.
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
  await sec(async ()=>{ const {d, ev, w} = await page({jira:false});
    const pid = ev("S.people[0].id"), name = ev("S.people[0].name"), owned = ev(`openOwned("${pid}")`);
    ok("setup: the first person owns open work", owned > 0, String(owned));
    ev(`setInactive("${pid}", true)`);
    ok("A1: deactivating marks them inactive, since today", ev(`JSON.stringify([personById("${pid}").inactive, personById("${pid}").inactiveFrom])`) === JSON.stringify([true, "2026-09-30"]));
    ok("A2: they keep what they own", ev(`openOwned("${pid}")`) === owned);
    ok("A3: they leave the team list (rows, load, capacity, Mine)", !ev(`team().some(p=>p.id==="${pid}")`));
    ok("A4: the plan names the feature, so older copies open it read-only", ev("JSON.stringify(featuresIn(S))").includes("inactive") && ev("KNOWN_FEATURES.includes('inactive')"));
    ok("A5: normalize keeps it, and only a real true", ev(`normalize(JSON.parse(JSON.stringify(S)), false).people.find(p=>p.id==="${pid}").inactive`) === true
      && ev(`normalize({...JSON.parse(JSON.stringify(S)), people:[{id:"x", name:"X", inactive:"yes"}]}, false).people[0].inactive`) === undefined);
    ev(`UI.rows = "people"; setWs("timeline"); render();`);
    ok("R1: with open work, they still get a row by person, flagged", /inactive: reassign their work/.test(d.querySelector(`[data-key="person:${pid}"]`)?.textContent || ""));
    ev(`UI.planTab = "team"; setWs("plan"); render();`);
    ok("T1: the Team tab lists them under Inactive, not the main table", !!d.querySelector(`#teamInactive [data-inactive="${pid}"]`) && ![...d.querySelectorAll("#t-team > table tbody tr")].some(r=>r.querySelector('input[aria-label="Name"]')?.value === name));
    ok("T2: with a note of what they still own", /still owns \d+ open item/.test(d.querySelector(`#teamInactive [data-inactive="${pid}"]`)?.textContent || ""));
    ev(`select("person", "${pid}"); render();`);
    ok("P1: their card says inactive, with Reactivate", /Inactive since/.test(d.querySelector("#f-pinactive")?.textContent || "") && d.querySelector("#f-pactive")?.textContent === "Reactivate");
    d.querySelector("#f-pactive").click(); await wait(10);
    ok("P2: Reactivate brings them back", !ev(`personById("${pid}").inactive`) && ev(`team().some(p=>p.id==="${pid}")`) && !ev("JSON.stringify(featuresIn(S))").includes("inactive"));
    ev(`UI.planTab = "team"; setWs("plan"); render();`);
    d.querySelector(`#t-team [data-deact="${pid}"]`).click(); await wait(10);
    ok("T3: Deactivate from the Team tab", ev(`!!personById("${pid}").inactive`));
    ok("no page errors", !w.errs.length, w.errs.join("; ")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false});
    const pid = ev("S.people[1].id"), nm = ev("S.people[1].name"); ev(`setInactive("${pid}", true)`);
    ev(`const b = S.bars.find(x=>x.lane); select("bar", b.id); render();`);
    const inp = d.querySelector("#side .opick input, #side input[role=combobox]");
    if (inp){ inp.value = nm.slice(0, 3); inp.dispatchEvent(new d.defaultView.Event("input")); await wait(10); }
    ok("O1: owner pickers leave them out", !!inp && ![...d.querySelectorAll("#side .oopt")].some(o=>o.textContent.includes(nm)), [...d.querySelectorAll("#side .oopt")].map(o=>o.textContent).join("|"));
    ok("O2: Everyone (for meetings) leaves them out", !ev("everyoneGroup().members").includes(pid)); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
