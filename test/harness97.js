// Timeline rows by epic (Weeks): Jira's parent links, nested, read-only. Top epics open one level down; a parent the
// sync didn't bring is named; plan-only work sits on No epic; Weeks and Days alike.
// Fails on the build before this.
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
  issues:{"ABC-5":{summary:"Top epic", status:"In Progress", category:"inprogress", type:"Epic", parent:"ZZZ-9"}, "ABC-1":{summary:"Placed epic", status:"In Progress", category:"inprogress", type:"Epic", parent:"ABC-5"},
    "ABC-2":story("Assigned story one", "JIRAUSER1", S42), "ABC-3":story("Assigned story two", "JIRAUSER1", S43), "ABC-4":story("Nobody's story", "", S42)},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}],
  rollups:{"ABC-1":{total:3, todo:3, children:["ABC-2","ABC-3","ABC-4"]}}});
async function page(opts = {}){
  const handle = makeHandle("plan.json", opts.text || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    if (opts.session) w.sessionStorage.setItem("sightline-session", opts.session);
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id);");
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = ""; L0.owners = []; window.EPIC = L0.id; S.people[1].jira = {key:"JIRAUSER1", user:"u1", name:"U One"}; window.P1 = S.people[1].id;
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); setWs("timeline"); setZoom("weeks"); UI.rows = "epics"; UI.epicOpen = {}; render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {d, ev} = await page(); await wait(30);
    const rows = () => [...d.querySelectorAll(".eprow")].map(r=>r.dataset.epic), row = k => d.querySelector(`.eprow[data-epic="${k}"]`);
    const stories = k => row(k) ? [...row(k).querySelectorAll("[data-peek-type=story]")].map(x=>x.dataset.peekId).sort().join(",") : "no row";
    ok("E1 By epic shows when Jira is connected", !d.querySelector("#rEpics").hidden && d.querySelector("#rEpics").getAttribute("aria-pressed") === "true");
    ok("E2 the top epic, then its child, nested", rows()[0] === "ABC-5" && rows()[1] === "ABC-1" && parseInt(row("ABC-1").querySelector(".eplabel").style.paddingLeft) > parseInt(row("ABC-5").querySelector(".eplabel").style.paddingLeft), rows().join(","));
    ok("E3 one level down starts collapsed: a summary, no stories", stories("ABC-1") === "" && !!row("ABC-1").querySelector(".epsum") && /3 items/.test(row("ABC-1").textContent), row("ABC-1").textContent.slice(0, 80));
    ok("E4 a parent the sync didn't bring is named", /parent ZZZ-9 not synced/.test(row("ABC-5").textContent) && /1 under it/.test(row("ABC-5").textContent));
    row("ABC-1").querySelector(".caret").click(); await wait(20);
    ok("E5 expanding shows its stories", stories("ABC-1") === "ABC-2,ABC-3,ABC-4", stories("ABC-1"));
    ok("E6 plan-only work sits on No epic", !!row("none") && row("none").querySelectorAll(".bar").length > 0 && /No epic/.test(row("none").textContent));
    ok("E7 read-only: no drag edges on epic rows", !d.querySelector(".eprow .h") );
    const el = row("ABC-1").querySelector("[data-peek-type=story]"); el.dispatchEvent(new d.defaultView.MouseEvent("pointerdown", {bubbles:true, clientX:10, clientY:10}));
    ok("E8 pressing an item doesn't start a drag", !ev("drag") && !ev("tdrag"));
    d.querySelector("#epCollapse").click(); await wait(20);
    ok("E9 Collapse all leaves the top rows", rows().join(",") === "ABC-5,none", rows().join(","));
    d.querySelector("#epExpand").click(); await wait(20);
    ok("E10 Expand all opens every level", rows().join(",") === "ABC-5,ABC-1,none" && stories("ABC-1") === "ABC-2,ABC-3,ABC-4", rows().join(","));
    ev(`setZoom("days"); render();`); await wait(20);
    ok("E11 Days: the same nested rows, with the stories", rows().join(",") === "ABC-5,ABC-1,none" && stories("ABC-1") === "ABC-2,ABC-3,ABC-4" && d.querySelector("#rEpics").getAttribute("aria-pressed") === "true", rows().join(",") + " " + stories("ABC-1"));
    ok("E12 Days: read-only too, with Expand all in the corner", !d.querySelector(".eprow .h") && !!d.querySelector(".gcorner #epCollapse"));
    d.querySelector("#epCollapse").click(); await wait(20);
    ok("E12b Days: Collapse all", rows().join(",") === "ABC-5,none", rows().join(","));
    ev(`UI.epicOpen = {"ABC-1":true}; setZoom("weeks"); render();`); await wait(20);
    ok("E13 a saved view keeps By epic", ev(`normViewDef({rows:"epics"}).rows`) === "epics");
    const key = () => d.dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"r", bubbles:true}));
    ev(`setRows("lanes")`); key(); const a = ev("UI.rows"); key(); const b = ev("UI.rows"); key(); const c = ev("UI.rows");
    ok("E14 R goes workstream, person, epic, workstream", [a, b, c].join(",") === "people,epics,lanes", [a, b, c].join(","));
    ok("E15 no page errors", !ev("errs.length"), ev("errs.join('|')"));
  });
  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(`UI.rows = "epics"; setWs("timeline"); render();`); await wait(20);
    ok("E16 without Jira: no By epic, workstream rows", d.querySelector("#rEpics").hidden && !d.querySelector(".eprow") && !!d.querySelector(".lane[data-lane]"));
  });
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
