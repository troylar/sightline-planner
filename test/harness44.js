// Tags can be made on the fly while typing. Updates can be edited and deleted: your own straight away, someone else's after a question (a courtesy, not a
// lock); an edit says who edited it and when; deleting takes a second click. Each check fails on the build before this.
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
  const prep = `window.B = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && sideOf(b,"bar")==="plan").id; window.ME = S.people[0].id; window.OTHER = S.people[1].id;
    S.updates = [{id:"u1", item:"bar:" + B, at:"2026-09-29T10:00:00.000Z", by:ME, text:"Mine"}, {id:"u2", item:"bar:" + B, at:"2026-09-28T10:00:00.000Z", by:OTHER, text:"Theirs"}];
    S = normalize(JSON.parse(JSON.stringify(S)), false); setMe(ME); setWs("timeline"); select("bar", B);`;
  const upd = id => `S.updates.find(u=>u.id==="${id}")`;

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    d.querySelector('[data-uedit="u1"]').click(); await wait(5);
    const ta = d.querySelector('[data-upd="u1"] textarea'); ta.value = "Mine, corrected"; [...d.querySelectorAll('[data-upd="u1"] button')].find(b=>b.textContent === "Save").click(); await wait(20);
    ok("E1: your own update can be edited", ev(upd("u1") + ".text") === "Mine, corrected");
    ok("E1: and says it was edited, and by whom", ev(upd("u1") + ".edited.by") === ev("ME") && /edited/.test(d.querySelector('[data-upd="u1"] .uh')?.textContent || "")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep + " window.confirm = ()=>false;"); await wait(10);
    d.querySelector('[data-uedit="u2"]').click(); await wait(5);
    ok("E2: someone else's asks first (and No leaves it alone)", !d.querySelector('[data-upd="u2"] textarea') && ev(upd("u2") + ".text") === "Theirs");
    ev("window.confirm = ()=>true"); d.querySelector('[data-uedit="u2"]').click(); await wait(5);
    const ta = d.querySelector('[data-upd="u2"] textarea'); ta.value = "Theirs, fixed"; [...d.querySelectorAll('[data-upd="u2"] button')].find(b=>b.textContent === "Save").click(); await wait(20);
    ok("E2: Yes lets you, and records that you edited it", ev(upd("u2") + ".text") === "Theirs, fixed" && ev(upd("u2") + ".by") === ev("OTHER") && ev(upd("u2") + ".edited.by") === ev("ME")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(prep); await wait(10);
    d.querySelector('[data-udel="u1"]').click(); await wait(10);
    ok("D1: deleting takes a second click", !!ev(upd("u1")) && /Click again/.test(d.querySelector('[data-udel="u1"]').textContent));
    d.querySelector('[data-udel="u1"]').click(); await wait(20);
    ok("D1: then it's gone", !ev(upd("u1")) && !!ev(upd("u2")));
    ev("undo()"); await wait(20); ok("D1: and Undo brings it back", !!ev(upd("u1"))); });

  await sec(async ()=>{ const {ev} = await page({jira:false});
    ok("S1: the edited stamp is kept when the plan is saved and read back", ev(`normalize({...clone(S), updates:[{id:"u9", item:"bar:" + S.bars[0].id, at:"2026-09-29T10:00:00.000Z", by:"", text:"x", edited:{by:"", at:"2026-09-30T10:00:00.000Z"}}]}, false).updates[0].edited?.at`) === "2026-09-30T10:00:00.000Z"); });

  const tprep = `window.B = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && sideOf(b,"bar")==="plan").id; S.tags = [{id:"tq", name:"q4", color:"#7a4fb3"}, {id:"tr", name:"risky", color:"#1f8a70"}];
    S = normalize(JSON.parse(JSON.stringify(S)), false); setWs("timeline"); select("bar", B);`;
  const typeIn = (d, v) => { const i = d.querySelector("#f-tagadd"); i.value = v; i.dispatchEvent(new (d.defaultView.Event)("input", {bubbles:true})); return i; };
  const key = (d, el, k) => el.dispatchEvent(new (d.defaultView.KeyboardEvent)("keydown", {key:k, bubbles:true}));
  const tagsOn = ev => ev("JSON.stringify((S.bars.find(b=>b.id===B).tags||[]).map(id=>S.tags.find(t=>t.id===id)?.name).sort())");

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(tprep); await wait(10);
    typeIn(d, "ri"); await wait(5);
    const opts = [...d.querySelectorAll("#f-tagsug .tagopt")].map(o=>o.textContent);
    ok("T1: typing shows matching tags, and a way to make a new one", opts[0] === "risky" && opts.some(o=>/Create tag “ri”/.test(o)) && d.querySelector("#f-tagadd").getAttribute("aria-expanded") === "true", opts.join(" | "));
    typeIn(d, "launch"); await wait(5); key(d, d.querySelector("#f-tagadd"), "Enter"); await wait(30);
    ok("T2: Enter on a new name creates the tag and adds it", ev("S.tags.some(t=>t.name==='launch')") && JSON.parse(tagsOn(ev)).includes("launch")); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(tprep); await wait(10);
    typeIn(d, "alpha,"); await wait(30);
    ok("T3: a comma adds what you typed", JSON.parse(tagsOn(ev)).includes("alpha"));
    const i = d.querySelector("#f-tagadd"), pe = new (d.defaultView.Event)("paste", {bubbles:true, cancelable:true}); Object.defineProperty(pe, "clipboardData", {value:{getData:()=>"beta, gamma"}}); i.dispatchEvent(pe); await wait(40);
    ok("T3: and pasting a list adds each", ["beta","gamma"].every(n=>JSON.parse(tagsOn(ev)).includes(n)), tagsOn(ev)); });

  await sec(async ()=>{ const {d, ev} = await page({jira:false}); ev(tprep); await wait(10);
    const i = typeIn(d, "q"); await wait(5); key(d, i, "ArrowDown"); key(d, i, "ArrowUp"); key(d, i, "Enter"); await wait(30);
    ok("T4: arrows and Enter pick an existing tag, no duplicate made", JSON.parse(tagsOn(ev)).includes("q4") && ev("S.tags.filter(t=>t.name.toLowerCase()==='q4').length") === 1); });

  await sec(async ()=>{ const {w} = await page({jira:false}); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
