// Review 15: a reserved plan id can't reach the browser stores; merged snapshots aren't dropped at the limit; owner lists
// aren't broken by the amendment editor; the offline checker refuses NaN like the page; a refused edit save says so; the
// copied Markdown can't gain headings from the title; the deliverable bar includes its ship day. Fails on the build before this.
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
  const setup = `S.deliverables = [{id:"dv-bed", name:"Auto mode for Bedrock models", stage:"planned", target:"2027-H1"}, {id:"dv-chk", name:"Checkout", stage:"planned", target:"2026-Q4", jira:["ABC-10"]}];
    window.FILE = serialize(S, "p.json"); FileStore.read = async () => FILE; FileStore.writeIfUnchanged = async (hd, exp, text) => { FILE = text; return "ok"; };
    file.handle = {name:"p.json", queryPermission: async () => "granted", requestPermission: async () => "granted"}; file.holdLock = false; locked = false; file.baseText = FILE; file.baseHash = hashText(FILE);
    window.AMTEXT = ""; window.amFake = {name:"troy.amend.json", queryPermission: async () => "granted", requestPermission: async () => "granted", getFile: async () => ({text: async () => AMTEXT})};
    AM = {handle: amFake, name: amFake.name}; amTried = S.meta.planId; localStorage.removeItem(amKey()); UI.ws = "roadmap"; render();`;
  const amFile = changes => JSON.stringify({kind:"sightline-amendments", version:1, planId:"__PID__", batchId:"b1", createdAt:"2026-09-30T10:00:00Z", source:"Anteroom", basedOn:{planRevision:0}, changes});
  const load = async (ev, changes, raw) => { ev(`AMTEXT = ${JSON.stringify(raw || amFile(changes))}.replace("__PID__", S.meta.planId); AM.hash = ""; `); await ev("amRead(true)"); await wait(10); };


  await sec(async ()=>{ const {d, ev} = await page(); ev(setup);
    ok("V1 a plan id of __proto__ is replaced", ev(`normalize({...JSON.parse(JSON.stringify(S)), meta:{...S.meta, planId:"__proto__"}}, false).meta.planId`) !== "__proto__");
    ev(`window.PID0 = S.meta.planId; localStorage.removeItem(STORE_SEEN); S.meta.planId = "__proto__"; visitMarked.clear(); locked = false; markVisit();`);
    ok("V1b and even if one got through, nothing lands on every object", ev(`({}).cur === undefined && ({}).curDay === undefined`));
    ev(`S.meta.planId = PID0;`);
    const snaps = ev(`normalize({...JSON.parse(JSON.stringify(S)), snapshots:[...Array(14)].map((_, i)=>({id:"s" + i, name:"n" + i, takenAt:"2026-09-01T00:00:00Z", base:{}, info:{}}))}, false).snapshots.length`);
    ok("V2 a merge past 12 snapshots keeps them all", snaps === 14, String(snaps));
    await load(ev, [{id:"own", summary:"Owners", ops:[{op:"set", type:"deliverable", id:"dv-bed", field:"owners", prev:null, value:[ev("S.people[0].id")]}]}]);
    ev(`sel = {type:"amend", id:"x"}; render();`); await wait(20);
    const row = () => d.querySelector('[data-am="own"]');
    const before = row().className; row().querySelector('[data-amedit="own"]').click(); await wait(20); d.querySelector('[data-amsave="own"]').click(); await wait(20);
    ok("V3 saving the editor leaves an owner list as it was", row().className === before && /am-ready/.test(before), `${before} -> ${row().className}`);
    ev(`window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function(k){ if (/:edits$/.test(k)) throw new Error("full"); return __set.apply(this, arguments); };`);
    await load(ev, [{id:"nm", summary:"Name", ops:[{op:"set", type:"deliverable", id:"dv-bed", field:"name", prev:"Auto mode for Bedrock models", value:"Auto mode"}]}]); ev("render()"); await wait(20);
    d.querySelector('[data-amedit="nm"]').click(); await wait(20); d.querySelector("#amed-nm-0-value").value = "Changed"; d.querySelector('[data-amsave="nm"]').click(); await wait(20);
    ok("V5 a refused edit save says so and keeps the editor open", /Couldn't keep your edits/.test(ev("document.querySelector('#status')?.textContent || ''")) && !!d.querySelector("#amEdit-nm"));
    ev(`Storage.prototype.setItem = __set;`);
    const md = ev(`repText({title:"Plan\\n## Injected", status:"ontrack", sections:{}}, true)`);
    ok("V6 the Markdown title can't start a new heading", !/\n## Injected/.test(md) && /\\\\#\\\\# Injected|\\#\\# Injected/.test(md), md.split("\n")[0]);
    const tl = JSON.parse(ev(`(()=>{ const a = startDay(); JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com", missing:[], rollups:{},
        issues:{"A-1":{summary:"s", status:"To Do", category:"todo", type:"Story", sprintId:42, sprintState:"future", sprintStart:dayToIso(a + 28), sprintEnd:dayToIso(a + 41)}}, sprints:[], releases:[{id:"7", name:"v2", date:dayToIso(a + 14), project:"A"}]})); dropJiraMemos();
      S.deliverables = [{id:"dv-e", name:"Early ship", stage:"planned", release:"7", target:quarterOf(a + 14), jira:["A-1"]}]; const x = dvTimeline().items[0]; return JSON.stringify({s:x.s, ship:x.ship}); })()`));
    ok("V7 a deliverable's bar starts no later than its ship day", tl.s <= tl.ship, JSON.stringify(tl));
  });
  { const {spawnSync} = require("child_process"), os = require("os"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-nan-")), pf = path.join(dir, "p.json"), af = path.join(dir, "a.json");
    fs.writeFileSync(pf, JSON.stringify({meta:{planId:"p-nan1", start:"2026-09-07", weeks:12}, lanes:[], bars:[], people:[]}));
    fs.writeFileSync(af, '{"kind":"sightline-amendments","version":1,"planId":"p-nan1","batchId":"b","changes":[{"id":"a","ops":[{"op":"propose","key":"A-1","field":"points","value":NaN}]}]}');
    const r = spawnSync("python3", [process.env.SIGHTLINE_SYNC || path.join(__dirname, "..", "tools", "sightline-jira-sync.py"), "check-amendments", pf, af], {encoding:"utf8"});
    ok("V4 the offline checker refuses NaN, as the page's JSON.parse does", r.status === 2 && /NaN/.test(r.stdout), (r.stdout || r.stderr).slice(0, 120));
    fs.rmSync(dir, {recursive:true, force:true}); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
