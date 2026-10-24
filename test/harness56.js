// Cards readability and quick setup: the sprint header (tiles, working-day wording), the capacity heat map, linking
// Jira users from the Team tab without Start editing, adding sprints through a date, and the demo's extras
// (releases, pull requests, burndown notes). Each check fails on the build before this.
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
  const st = (pts, who, cat, res, sid) => ({summary:"s", status:"x", category:cat, type:"Story", points:pts, assigneeKey:who, assignee: who + " N.", sprintId:sid || 42, sprintState: (sid || 42) === 42 ? "active" : "future", resolvedAt:res || ""});
  const J2 = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"A-1":st(5,"U1","done","2026-09-29"), "A-2":st(8,"U1","todo"), "A-3":st(3,"U2","inprogress"), "A-4":st(20,"U2","todo")},
    sprints:[{id:42, name:"Planning 2026.S15 09/28-10/09", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Planning 2026.S16 10/12-10/23", state:"future", start:"2026-10-12", end:"2026-10-23"}]});
  const prep = `JIRA = parseJiraStatus(${JSON.stringify(J2)}); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[0].capacity = 10; goWs("standup"); render();`;

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    const hd = d.querySelector("#standupWs .sprinthead")?.textContent || "";
    ok("H1: the header names the sprint without its dates", d.querySelector("#standupWs .sprinthead h2")?.textContent === "Planning 2026.S15", hd.slice(0, 120));
    ok("H1: and says the working day plainly", /Working day 3 of 10/.test(hd) && /7 working days left/.test(hd), hd);
    ok("H2: tiles count the cards by state", [...d.querySelectorAll("#standupWs .sustat")].map(x=>x.textContent).join("|").includes("In progress"));
    ok("H3: the top bar agrees with Cards", /Planning 2026\.S15 · working day 3 of 10/.test(ev("scopeText()") || d.querySelector("#scope, .scope")?.textContent || ""), ev("scopeText()"));
    const cells = [...d.querySelectorAll("#suCap tr[data-cap] td.capc")];
    ok("C1: the heat map shades by load against capacity", cells.length >= 2 && cells[0].classList.contains("h3") && /^13\/10$/.test(cells[0].textContent), cells.map(c=>c.className + ":" + c.textContent).join(" "));
    ok("C2: no 'pts' on every number", !/\d pts/.test(d.querySelector("#suCap")?.textContent || ""));
    ok("C3: a legend explains the shades", /under 70%/.test(d.querySelector("#suCap .caplegend")?.textContent || ""));
    ok("C4: capacity is a quick update: the input is there read-only", ev("locked = true; render(); !!document.querySelector('#suCap input.capin')"));
    const B = d.querySelector("#suBurn")?.textContent || "";
    ok("B1: the burndown leads with points left and a verdict", /of 36 points left/.test(B) && !!d.querySelector("#suBurn .vchip"), B.slice(0, 120)); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); ev(`const u = {key:"U2", user:"u2", name:"B"}; locked = true; UI.planTab = "team"; setWs("plan"); render();`); await wait(10);
    const pick = d.querySelector("#t-team select[data-tjira]");
    ok("T1: the Team tab has a Jira user column, read-only too", /Jira user/.test(d.querySelector("#t-team thead")?.textContent || "") && !!pick);
    ok("T1: and shows the linked user", /A/.test(d.querySelector("#t-team .tjira .jlinked")?.textContent || ""));
    ev(`window.QS = []; quickSave = (what, fn) => { QS.push(what); return Promise.resolve(true); }`);
    pick.value = "U2"; pick.dispatchEvent(new d.defaultView.Event("change")); await wait(10);
    ok("T2: picking one links them with a quick update", ev("QS.length") === 1 && /linked .* to Jira user/.test(ev("QS[0]")), ev("JSON.stringify(QS)")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(`UI.planTab = "types"; setWs("plan"); render();`); await wait(10);
    const n0 = ev("S.sprints.length"), w = ev("S.sprints.reduce((a,o)=>a+o.weeks,0)"), end = ev(`dayToIso(wkDay(${w}) - 3)`);
    const target = ev(`dayToIso(isoToDay("${end}") + 30)`);
    const inp = d.querySelector("#sprintsTo"); ok("S1: an Add sprints through control", !!inp && !!d.querySelector("#sprintsToGo"));
    inp.value = target; inp.dispatchEvent(new d.defaultView.Event("input"));
    ok("S2: it says what it will add before adding", /Adds 3 sprints/.test(d.querySelector("#sprintsToHint").textContent), d.querySelector("#sprintsToHint").textContent);
    d.querySelector("#sprintsToGo").click(); await wait(10);
    ok("S3: it adds enough sprints to reach the date", ev("S.sprints.length") === n0 + 3 && ev(`dayToIso(wkDay(S.sprints.reduce((a,o)=>a+o.weeks,0)) - 3)`) >= target);
    ok("S3: named on from the last one", /\d$/.test(ev("S.sprints.at(-1).name")) && ev("S.sprints.at(-1).name") !== ev("S.sprints.at(-2).name"));
    inp.value = ev(`dayToIso(isoToDay("${end}") - 3)`); inp.dispatchEvent(new d.defaultView.Event("input"));
    ok("S4: a date already covered adds nothing", d.querySelector("#sprintsToGo").disabled && /already reach/.test(d.querySelector("#sprintsToHint").textContent)); });

  await sec(async ()=>{ const out = fs.mkdtempSync(path.join(require("os").tmpdir(), "sl-demo-"));
    require("child_process").execFileSync("python3", [path.join(__dirname, "..", "tools", "make-demo.py"), out, "--scenario", "store"], {stdio:"ignore"});
    const S0 = JSON.parse(fs.readFileSync(path.join(out, "jira", "status.json"), "utf8"));
    ok("D1: the demo has Jira releases", Array.isArray(S0.releases) && S0.releases.length === 4 && Object.values(S0.issues).some(j=>(j.releases || []).length));
    ok("D2: and pull requests for the active sprint", S0.dev && Object.values(S0.dev).some(x=>x.prs.some(p=>p.status === "OPEN" && /^https:/.test(p.url))));
    ok("D3: and burndown notes and dates", S0.burndown && Object.keys(S0.burndown).length === 1 && Object.values(S0.issues).every(j=>j.created && j.updated && j.jid));
    const P = JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8"));
    ok("D4: people have points per sprint", P.people.filter(p=>p.capacity).length >= 6);
    fs.rmSync(out, {recursive:true, force:true}); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
