// Customer release notes: a release's deliverables grouped by kind; Final lists Done, approved ones; approval clears when
// the wording changes; copy as text or Markdown, and print. Each check fails on the build before this.
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
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`JIRA = {...JIRA, releases:[{id:"20101", name:"2026.4", project:"ABC", date:"2026-11-12", released:false}]};
      S.deliverables = [
        {id:"d1", name:"Loyalty points", line:"Earn points on every order.", kind:"new", stage:"done", release:"20101", target:"2026-Q4"},
        {id:"d2", name:"Faster checkout", line:"Checkout takes half the steps.", kind:"improved", stage:"done", release:"20101", target:"2026-Q4"},
        {id:"d3", name:"Gift card fix", kind:"fixed", stage:"planned", release:"20101", target:"2026-Q4"},
        {id:"d4", name:"Elsewhere", stage:"done", release:"999", target:"2026-Q4"}];
      window.CLIP = ""; navigator.clipboard = {writeText: t => { CLIP = t; return Promise.resolve(); }}; UI.rnFinal = true; sel = {type:"release", id:"20101"}; UI.ws = "roadmap"; render();`); await wait(10);
    ok("F1: Final lists nothing until someone approves", /No Done, approved deliverables/.test(d.querySelector("#relNotes")?.textContent || "") && /2 done but not approved · 1 not done yet/.test(d.querySelector("#rnLeft")?.textContent || ""));
    d.querySelector('#relNotes [data-approve]') && null; d.querySelector("#rnDraft").click(); await wait(10);
    ok("D1: Draft shows everything for the release, grouped, marked", ["New","Improved","Fixed"].every(k=>d.querySelector("#relNotes").textContent.includes(k)) && /not done/.test(d.querySelector("#relNotes").textContent) && !/Elsewhere/.test(d.querySelector("#relNotes").textContent));
    d.querySelector('#relNotes [data-approve="d1"]').click(); await wait(20);
    ok("A1: Approve records who and when", ev(`!!S.deliverables.find(x=>x.id === "d1").approved`));
    d.querySelector("#rnFinal").click(); await wait(10);
    ok("F2: Final now lists the approved one", /Loyalty points/.test(d.querySelector("#relNotes").textContent) && !/Faster checkout/.test(d.querySelector("#relNotes .rnbody").textContent));
    d.querySelector("#rnCopy").click(); await wait(10);
    ok("C1: Copy as text", ev("CLIP").startsWith("2026.4 (Nov 12, 2026)") && /Draft: this release isn't out yet\./.test(ev("CLIP")) && /\nNew\n• Loyalty points: Earn points on every order\./.test(ev("CLIP")), ev("CLIP"));
    d.querySelector("#rnCopyMd").click(); await wait(10);
    ok("C2: Copy as Markdown", /^## 2026\.4 \(Nov 12, 2026\)/.test(ev("CLIP")) && /### New\n\n- \*\*Loyalty points\*\*: Earn points on every order\./.test(ev("CLIP")), ev("CLIP"));
    ev(`dvEdit("d1", "reword", x=>{ x.line = "Earn points on every order, even in store."; })`); await wait(10);
    ok("A2: changing the wording clears the approval", ev(`!S.deliverables.find(x=>x.id === "d1").approved`));
    ev(`approveDv("d1", true)`); await wait(10); ev(`window.print = () => { window.PRINTED = document.querySelector("#printNotes")?.textContent; }; sel = {type:"release", id:"20101"}; render();`);
    d.querySelector("#rnPrint").click(); await wait(10);
    ok("P1: Print prints just the notes", /2026\.4/.test(ev("window.PRINTED || ''")) && /Loyalty points/.test(ev("window.PRINTED || ''")) && ev(`document.body.classList.contains("printing-notes")`));
    ok("A3: only Done work can be approved", (ev(`approveDv("d3", true)`), await wait(10), ev(`!S.deliverables.find(x=>x.id === "d3").approved`)));
    ev(`sel = {type:"deliverable", id:"d2"}; render();`);
    ok("P2: a Done deliverable's card offers Approve for release notes", !!d.querySelector("#f-dvapprovego")); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
