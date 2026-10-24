// Amendments v1.1, editing before applying: your edits stay in this browser, bound to the change as the assistant wrote
// it; the checker and Apply use the edited version; a rewritten change drops your edit visibly. Fails on the build before this.
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
    const chg = [{id:"add1", summary:"Add Wallet", ops:[{op:"add", type:"deliverable", id:"dv-wal", value:{name:"Walet support", target:"2027-Q1"}}]},
                 {id:"move", summary:"Move Bedrock", ops:[{op:"set", type:"deliverable", id:"dv-bed", field:"target", prev:"2027-H1", value:"2027-Q3"}]}];
    await load(ev, chg); ev(`sel = {type:"amend", id:"x"}; render();`); await wait(20);
    const rowOf = id => d.querySelector(`[data-am="${id}"]`);
    ok("A1 each waiting change has Edit", !!rowOf("add1").querySelector('[data-amedit="add1"]') && !!rowOf("move").querySelector('[data-amedit="move"]'));
    rowOf("add1").querySelector('[data-amedit="add1"]').click(); await wait(20);
    const nm = d.querySelector("#amed-add1-0-name");
    ok("A2 the editor shows the values it would write", nm && nm.value === "Walet support" && d.querySelector("#amed-add1-0-target").value === "2027-Q1");
    nm.value = "Wallet support"; d.querySelector("#amed-add1-0-target").value = "2027-Q2"; d.querySelector('[data-amsave="add1"]').click(); await wait(20);
    ok("A3 saved edits show as Edited by you, and the lines follow them", /Edited by you/.test(rowOf("add1").textContent) && /Wallet support · Q2 2027/.test(rowOf("add1").textContent), rowOf("add1").textContent.slice(0, 160));
    ok("A4 the assistant's file is untouched", /Walet support/.test(ev("AMTEXT")));
    rowOf("move").querySelector('[data-amedit="move"]').click(); await wait(20);
    d.querySelector("#amed-move-0-value").value = "2027-Q9"; d.querySelector('[data-amsave="move"]').click(); await wait(20);
    ok("A5 an edit is checked as strictly as the assistant's own", rowOf("move").classList.contains("am-invalid") && /target must be like/.test(rowOf("move").textContent));
    d.querySelector('[data-amorig="move"]').click(); await wait(20);
    ok("A6 Use the assistant's version puts it back", rowOf("move").classList.contains("am-ready") && !/Edited by you/.test(rowOf("move").textContent));
    rowOf("add1").querySelector('[data-amapply="add1"]').click(); await wait(80);
    const saved = JSON.parse(ev("FILE")).deliverables.find(x=>x.id === "dv-wal");
    ok("A7 Apply writes the edited version", saved && saved.name === "Wallet support" && saved.target === "2027-Q2", JSON.stringify(saved));
    ok("A8 and the original change counts as applied", ev(`amReceipt("b1", AM.file.changes.find(c=>c.id === "add1"))`) === "applied" || /In the plan/.test(rowOf("add1").textContent));
    const re = [{id:"move", summary:"Move Bedrock", ops:[{op:"set", type:"deliverable", id:"dv-bed", field:"target", prev:"2027-H1", value:"2027-Q4"}]}];
    rowOf("move").querySelector('[data-amedit="move"]').click(); await wait(20); d.querySelector("#amed-move-0-value").value = "2027-Q2"; d.querySelector('[data-amsave="move"]').click(); await wait(20);
    await load(ev, re); ev("render()"); await wait(20);
    ok("A9 if the assistant rewrites the change, your edit stops applying, and it says so", /rewrote this change/.test(rowOf("move").textContent) && /Q4 2027/.test(rowOf("move").textContent) && !/Edited by you/.test(rowOf("move").textContent), rowOf("move").textContent.slice(0, 200));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
