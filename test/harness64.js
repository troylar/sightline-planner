// Senior review 11: Save as you go says Saved only when it saved (waits on a teammate's lock, backs off, backs up a change
// a teammate made impossible), team capacity rates merge by date, bulk placement is worked out again on a race, story
// picks survive filtering, zero capacity is shown, and PR coverage, unlinked assignees and big pickers read right. Each
// check fails on the build before this.
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
  const st = (pts, who, sid) => ({summary:"s", status:"x", category:"todo", type:"Story", points:pts, assigneeKey:who, assignee:who + " N.", sprintId:sid, sprintState: sid === 42 ? "active" : "future"});
  const J = extra => JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
    issues:{"A-1":st(8,"U1",42), "A-2":st(6,"U2",42)},
    sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}], ...(extra || {})});
  const prep = (x) => `JIRA = parseJiraStatus(${JSON.stringify(J(x))}); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[1].jira = {key:"U2", user:"u2", name:"B"}; p.forEach(q=>{ q.days = 5; q.off = []; }); S.holidays = []; UI.capAll = true; goWs("standup"); render();`;

  await sec(async ()=>{ const {ev} = await page({jira:false});
    const r = ev(`JSON.stringify(applyOps({...clone(S), meta:{...S.meta, capRates:[{from:"2026-10-01", points:10}]}}, [{op:"set", type:"meta", id:"meta", field:"capRates", prev:[], value:[{from:"2026-11-01", points:12}]}]).plan.meta.capRates)`);
    ok("C1: two people adding team capacity on different dates both keep theirs", r === JSON.stringify([{from:"2026-10-01", points:10}, {from:"2026-11-01", points:12}]), r);
    ok("C2: setting team capacity is worked out again on a race", ev(`(()=>{ let f; const q = quickSave; quickSave = (w, fn) => { f = fn; return Promise.resolve(true); }; setCapRate("2026-10-01", 9); quickSave = q; return !!(f && f.rerun); })()`));
    ok("B1: putting stories on the board is worked out again on a race, so a story is never placed twice", ev(`(()=>{ let f; const q = quickSave; quickSave = (w, fn) => { f = fn; return Promise.resolve(true); }; storiesOnSplit([[S.lanes[0].id, ["ZZ-1"]]]); quickSave = q; return !!(f && f.rerun); })()`)); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    // a real quick save against a fake shared file
    ev(`window.BACKUPS = 0; backup = () => { BACKUPS++; }; window.WROTE = 0; FileStore.writeIfUnchanged = async () => { WROTE++; return "ok"; };
      file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; localStorage.setItem(SAYG_KEY, "1");`);
    ev(`S.notes.push({id:"note-q", text:"old", author:"", lane:S.lanes[0].id, date:"2026-09-21"}); S = normalize(JSON.parse(JSON.stringify(S)), false);`);
    const nid = "note-q";
    ev(`const theirs = clone(S); theirs.notes = theirs.notes.filter(n=>n.id !== "${nid}"); window.FILE = serialize(theirs, "p.json"); FileStore.read = async () => FILE;
      window.OPS = [{op:"set", type:"notes", id:"${nid}", field:"text", prev:"old", value:"my edit"}];`);
    const r1 = await ev(`quickSave("edit", null, 0, OPS, false, true)`);
    ok("L1: a change to something a teammate deleted isn't silently lost: a backup, and a message", !!nid && r1 === true && ev("BACKUPS") === 1 && /removed/.test(ev("document.querySelector('#status')?.textContent || ''")), ev("document.querySelector('#status')?.textContent || ''"));
    ev(`const withLock = clone(S); withLock.meta.lock = {id:"other-tab", who:"Blake", at:new Date().toISOString()}; FILE = serialize(withLock, "p.json"); WROTE = 0;
      OPS = [{op:"set", type:"meta", id:"meta", field:"title", prev:S.meta.title, value:"Mine"}];`);
    const r2 = await ev(`quickSave("title", null, 0, OPS, false, true)`);
    ok("K1: Save as you go waits when a teammate has started editing, and says so", r2 === false && ev("WROTE") === 0 && /started editing/.test(ev("document.querySelector('#status')?.textContent || ''")));
    ev(`saygFails = 0; file.dirty = true; file.baseText = FILE; S.meta.title = "Mine"; window.QS0 = quickSave; quickSave = () => Promise.resolve(false);`); await ev("runSayg()");
    ok("K2: after a failed save it waits longer before trying again", ev("saygFails") === 1);
    ev(`quickSave = QS0; localStorage.removeItem(SAYG_KEY); file.handle = null;`); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep({devCover:{read:0, of:30}})); ev(`setCapRate("2026-09-01", 10); setAlloc(team()[1].id, 0)`); await wait(10);
    const c = [...d.querySelectorAll("#suCap tr[data-cap]")][1].querySelector("td.capc");
    ok("Z1: someone at 0% with assigned work shows against zero, as over", c.textContent === "6/0" && c.classList.contains("h4") && /no capacity/.test(c.getAttribute("aria-label")), c.textContent + " " + c.className);
    d.querySelector("#capRateEdit")?.click(); await wait(10);
    ok("R1: with one team figure, it can be removed", !!d.querySelector("#capRateOff")); ev("UI.capEditOpen = false; renderStandup();");
    ok("P1: no pull requests read at all still says coverage was partial", /read for only 0 of 30 of this sprint.s issues/.test(d.querySelector("#suPrs")?.textContent || ""));
    const card = d.querySelector('#standupWs [data-card="jira:A-2"]') || d.querySelector('#standupWs [data-card="jira:A-1"]');
    ok("A1: an issue not on the plan reads as a link to Jira, not a panel toggle", !!card && /Open A-\d in Jira \(new tab\)/.test(card.getAttribute("aria-label") || "") && !card.hasAttribute("aria-expanded")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep());
    ev(`for (let i = 0; i < 20; i++) S.people.push(mkPerson("px" + i, "Extra " + i, 30 + i)); const iss = {...JIRA.issues}; for (let i = 0; i < 20; i++) iss["U-" + i] = {...iss["A-1"], assigneeKey:"JU" + i, assignee:"Jira User " + i};
      JIRA = {...JIRA, issues:iss}; dropJiraMemos(); UI.planTab = "team"; setWs("plan"); render();`);
    const pk = d.querySelector("#t-team select.tjpick"), n0 = pk ? pk.options.length : 0;
    pk && pk.dispatchEvent(new d.defaultView.Event("focus"));
    ok("S1: a Jira user picker holds a few options until it's opened, then all", n0 > 0 && n0 <= 7 && pk.options.length > n0, `${n0} -> ${pk && pk.options.length}`);
    ok("W1: work items are the same, built directly", ev("workItems().length") === ev("S.bars.filter(b=>b.kind !== 'waiting' && !b.parked).reduce((a, b)=>a + (hasTasks(b) ? b.tasks.length : hasKids(b) ? 0 : 1), 0)")); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
