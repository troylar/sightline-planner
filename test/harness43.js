// Removing a workstream safely (the review's recommendation): its card says what it holds; End it (the usual way,
// nothing deleted) today or when its work ends; Move its work to another workstream (everything, with ids, dates and
// links) and remove it; only an empty one can be deleted. Each check fails on the build before this.
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
  const prep = `window.A = S.lanes[1].id; window.B = S.lanes[0].id; S.notes.push({id:"nL", lane:A, date:S.meta.start, text:"lane note", author:""});
    S.meetings.push({id:"mL", lane:A, title:"Sync", date:S.meta.start}); S.milestones.push({id:"msL", lane:A, what:"Ship", at:3, status:"commit"});
    S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); render();`;

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep + " select('lane', A);"); await wait(10);
    const t = d.querySelector("#side #f-lremove")?.textContent || "";
    ok("R1: a workstream's card says what it holds before anything's removed", /It holds \d+ initiatives?.*1 note.*\d+ milestones?.*1 meeting/.test(t), t.slice(0, 160));
    ok("R1: and offers End and Move, not a plain delete, while it has work", !!d.querySelector("#f-lendtoday") && !!d.querySelector("#f-lmove") && !d.querySelector("#f-ldel")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep + " select('lane', A);"); await wait(10);
    d.querySelector("#f-lendtoday").click(); await wait(10);
    ok("R2: End it today sets its end, and deletes nothing", ev("S.lanes.find(l=>l.id===A).until") === ev("dayToIso(todayDay())") && ev("S.bars.filter(b=>b.lane===A).length") > 0);
    ev("select('lane', A)"); await wait(10); const w = d.querySelector("#f-lendwork");
    if (w){ w.click(); await wait(10); }
    ok("R2: or when its work ends", !w || ev("S.lanes.find(l=>l.id===A).until") === ev("dayToIso(laneWorkEnd(A))")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep);
    const before = JSON.parse(ev("JSON.stringify({bars:S.bars.filter(b=>b.lane===A).map(b=>[b.id,b.start,b.span,(b.tasks||[]).length])})"));
    ev("window.confirm = ()=>true; select('lane', A);"); await wait(10); d.querySelector("#f-lmoveto").value = ev("B"); d.querySelector("#f-lmove").click(); await wait(10);
    const after = JSON.parse(ev("JSON.stringify({bars:S.bars.filter(b=>" + JSON.stringify(before.bars.map(x=>x[0])) + ".includes(b.id)).map(b=>[b.id,b.start,b.span,(b.tasks||[]).length, b.lane])})"));
    ok("R3: Move takes every initiative with its tasks and dates", after.bars.length === before.bars.length && after.bars.every((x, k)=>x[1] === before.bars[k][1] && x[2] === before.bars[k][2] && x[3] === before.bars[k][3] && x[4] === ev("B")));
    ok("R3: and its notes, milestones (dates kept) and meetings", ev("S.notes.find(n=>n.id==='nL').lane") === ev("B") && ev("S.milestones.find(m=>m.id==='msL').lane") === ev("B") && ev("S.milestones.find(m=>m.id==='msL').at") === 3 && ev("S.meetings.find(m=>m.id==='mL').lane") === ev("B"));
    ok("R3: then the empty workstream is gone", !ev("S.lanes.some(l=>l.id===A)"));
    ev("undo()"); ok("R3: and Undo puts it all back", ev("S.lanes.some(l=>l.id===A)") && ev("S.notes.find(n=>n.id==='nL').lane") === ev("A")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep);
    ev(`del("lane", A)`); ok("R4: a workstream with work in it isn't deleted outright", ev("S.lanes.some(l=>l.id===A)") && /still has work/.test(ev("document.querySelector('#status').textContent")));
    ev(`S.lanes.push({id:"empty1", name:"Empty", color:"#5c6878"}); render(); select('lane', 'empty1');`); await wait(10);
    const b = d.querySelector("#f-ldel"); ok("R4: an empty one can be", !!b && /It's empty/.test(d.querySelector("#f-lremove").textContent));
    b.click(); await wait(5); d.querySelector("#f-ldel").click(); await wait(10);
    ok("R4: after a second click", !ev("S.lanes.some(l=>l.id==='empty1')")); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
