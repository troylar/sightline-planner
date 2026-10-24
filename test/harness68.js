// Senior review 12: deliverables are safe to share (split and delete use the latest file, owners are quick updates),
// progress is honest (the team's status map, each issue once or marked approximate, missing work said), limits refuse
// rather than drop, capacity says when load is unknown, and older copies open a plan with deliverables read-only. Each
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
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = "";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); UI.planTab = "epics"; setWs("plan"); render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const shared = `window.BACKUPS = 0; backup = () => { BACKUPS++; }; FileStore.writeIfUnchanged = async (hd, exp, text) => { window.FILE = text; return "ok"; };
    file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; locked = false;
    FileStore.read = async () => FILE;`;
  await sec(async ()=>{ const {ev} = await page();
    ev(`S.deliverables = [{id:"dv-a", name:"Thing", stage:"planned", target:"2027", owners:[]}]; window.FILE = serialize(S, "p.json"); ${shared}`);
    // a teammate sharpens the target while the split prompt is open
    ev(`const t = JSON.parse(FILE); t.deliverables[0].target = "2027-Q2"; FILE = serialize(normalize(t, false), "p.json"); window.prompt = () => "A; B";`);
    ev(`splitDv("dv-a")`); await wait(60);
    ok("S1: split builds the parts from the latest file, not what was on screen", ev(`JSON.stringify(normalize(JSON.parse(FILE), false).deliverables.filter(x=>x.from === "dv-a").map(x=>x.target))`) === JSON.stringify(["2027-Q2","2027-Q2"]), ev("FILE.length"));
  });
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`S.deliverables = [{id:"dv-b", name:"Other", stage:"idea"}]; window.FILE = serialize(S, "p.json"); ${shared} UI.ws = "roadmap"; sel = {type:"deliverable", id:"dv-b"}; render();`);
    ev(`const t = JSON.parse(FILE); t.deliverables[0].note = "teammate's note"; FILE = serialize(normalize(t, false), "p.json"); window.confirm = () => true;`);
    d.querySelector("#f-dvdel").click(); await wait(60);
    ok("D1: Delete stops if someone changed it since you opened it", ev(`normalize(JSON.parse(FILE), false).deliverables.length`) === 1 && /changed it since you opened it/.test(ev("document.querySelector('#status')?.textContent || ''")));
  });
  await sec(async ()=>{ const {d, ev, w} = await page();
    ev(`S.deliverables = [{id:"dv-c", name:"Owned", stage:"idea"}]; window.QS = []; quickSave = (what, fn) => { QS.push(what); const c = clone(S); fn(c); S = c; return Promise.resolve(true); }; UI.ws = "roadmap"; sel = {type:"deliverable", id:"dv-c"}; render();`);
    const nm = ev("S.people[0].name"); const inp = d.querySelector("#f-dvown"); inp.value = nm.slice(0, 3); inp.dispatchEvent(new w.Event("input")); inp.focus(); inp.dispatchEvent(new w.Event("focus")); await wait(10);
    const opt = [...d.querySelectorAll("#f-dvown-list .oopt")].find(o=>o.textContent.includes(nm)); if (opt) opt.click(); await wait(20);
    ok("O1: owners on a deliverable are a quick update (no Start editing)", !!opt && ev("QS.some(x=>/owners/.test(x))") && ev(`JSON.stringify(S.deliverables[0].owners)`) === JSON.stringify([ev("S.people[0].id")]), ev("JSON.stringify(QS)")); });
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`S.meta.jiraStatusMap = {"QA Complete":"done"}; JIRA = {...JIRA, rollups:{...JIRA.rollups, "ABC-70":{total:3, todo:1, inprogress:2, done:0, byState:{"QA Complete||inprogress":[2, 0], "To Do||todo":[1, 0]}}}};
      S.deliverables = [{id:"dv-p", name:"P", stage:"planned", target:"2027", jira:["ABC-70", "ABC-11", "ZZZ-9"]}]; goWs("roadmap"); render();`);
    const P = JSON.parse(ev(`JSON.stringify(dvProgress(S.deliverables[0]))`));
    ok("P1: a counts-only epic uses the team's status map (QA Complete is done here)", P.done >= 2, JSON.stringify(P));
    ok("P2: mixing counts with listed issues says it's approximate, and missing work is counted", P.partial === true && P.missing === 1, JSON.stringify(P));
    ok("P3: the card says so: ≈ and 1 missing", /≈/.test(d.querySelector('[data-dv="dv-p"] .dvprog')?.textContent || "") && /1 missing/.test(d.querySelector('[data-dv="dv-p"] .dvprog')?.textContent || ""), d.querySelector('[data-dv="dv-p"] .dvprog')?.textContent);
    ok("P4: no Jira files: it says not in the last sync, never 0/0", ev(`(()=>{ const J = JIRA; JIRA = null; const t = progText(dvProgress(S.deliverables[0])); JIRA = J; return t; })()`) === "3 not in the last sync"); });
  await sec(async ()=>{ const {ev} = await page();
    ok("L1: a plan with two deliverables sharing an id is refused", ev(`(()=>{ try { assertUniqueIds({deliverables:[{id:"a"},{id:"a"}]}); return false; } catch(e){ return /Duplicate id/.test(e.message); } })()`));
    ok("L2: more deliverables than a plan holds is refused, not dropped on reload", ev(`(()=>{ let r; const q = quickSave; quickSave = (w, fn) => { const c = clone(S); c.deliverables = Array.from({length:DV_MAX}, (_, i)=>({id:"x" + i, name:"x", stage:"idea"})); r = fn(c); return Promise.resolve(false); }; dvSave("add", s=>{ s.deliverables.push({id:"y", name:"y", stage:"idea"}); }); quickSave = q; return r === NOCHANGE; })()`));
    ok("L3: grouping more issues than a deliverable links is refused up front", ev(`(()=>{ let r = "x"; groupIntoDeliverable(Array.from({length:DV_MAX_KEYS + 1}, (_, i)=>"ABC-" + (i + 1))).then(v=>{ r = v; }); return true; })()`) && /links up to/.test(ev("document.querySelector('#status')?.textContent || ''")));
    ok("M1: a chart drag's undo step stays within the memory budget", ev(`(()=>{ past = []; const big = "x".repeat(Math.ceil(HISTORY_BYTES / 3)); for (let i = 0; i < 10; i++) pushSnap(big + i); return past.reduce((a, x)=>a + x.length, 0) <= HISTORY_BYTES + big.length; })()`));
    ok("F1: an older copy that doesn't know deliverables opens such a plan read-only", ev(`(()=>{ S.deliverables = [{id:"d1", name:"x", stage:"idea"}]; const p = JSON.parse(serialize(S, "p.json")); const known = KNOWN_FEATURES.slice(); KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf("deliverables"), 1); const t = tooNew(p); KNOWN_FEATURES.splice(0, KNOWN_FEATURES.length, ...known); return !!t && t.unknown.includes("deliverables"); })()`)); });
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`S.meta.capRates = [{from:"2026-09-01", points:10}]; for (let i = 0; i < 10; i++) S.people.push(mkPerson("pu" + i, "U " + i, 40 + i)); JIRA = {...JIRA, sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}]}; UI.capAll = false; goWs("standup"); render();`);
    ok("C1: capacity says whose load is unknown instead of calling them within", /not linked to Jira, so their load is unknown/.test(d.querySelector("#suCap .capsum")?.textContent || ""), d.querySelector("#suCap .capsum")?.textContent);
    ev(`UI.ideaFrom = {"p-other": "Another plan's meeting"}; goWs("roadmap"); render();`);
    ok("I1: an idea's source doesn't carry over from another plan", d.querySelector("#rmFrom").value !== "Another plan's meeting");
    ev(`S.deliverables = Array.from({length:25}, (_, i)=>({id:"i" + i, name:"Idea " + i, stage:"idea"})); render();`);
    ok("I2: many ideas get one When picker each, not a button per column", d.querySelectorAll("#rmIdeas select.ideawhen").length === 25 && !d.querySelector("#rmIdeas [data-target]"));
    ev(`sel = {type:"deliverable", id:"i0"}; render();`);
    ok("K1: the Jira key box suggests only as you type", d.querySelectorAll("#f-dvkeys option").length === 0);
    ev(`S.deliverables = S.deliverables.filter(x=>x.id !== "i0"); render();`);
    ok("K2: a deliverable deleted elsewhere leaves no empty panel", ev("sel") === null && !/Deliverable/.test(d.querySelector("#side")?.textContent || ""));
    ev(`UI.planTab = "types"; setWs("plan"); render();`);
    ok("W1: Timeboxes wording is consistent", /Add timeboxes through/.test(d.querySelector("#t-sprints")?.textContent || "") || !d.querySelector("#sprintsTo")); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
