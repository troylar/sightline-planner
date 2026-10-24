// Deliverables v1: the Roadmap's rolling-wave columns, one-line ideas, targets that sharpen, Jira links with progress
// counted once, badges, releases, split, grouping Jira work, and older-copy safety. Each check fails on the build before
// this.
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
  const w = dom.window, ev = s => w.eval(s); await wait(250); ev("UI.rmHorizon = 'long';"); // These checks exercise the retained long-range view.
  if (opts.file){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id);");
  if (opts.jira !== false){ w.JS = JS; ev(`const L0 = S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.LANE = L0.lane; L0.epics = ["ABC-1"]; L0.jira = "";
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); UI.planTab = "epics"; setWs("plan"); render();`); }
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {d, ev, w} = await page(); ev(`window.prompt = () => ""; UI.ideaFrom = {[S.meta.planId]: "Planning topics", "p-other": "Something else"}; goWs("roadmap"); render();`); await wait(10);
    ok("C1: the columns get coarser further out", ev("roadmapCols().map(c=>c.label).join('|')") === "This quarter|Next quarter|H1 2027|H2 2027|2028|Later", ev("roadmapCols().map(c=>c.label).join('|')"));
    ok("K1: key 6 opens the Roadmap", ev(`goWs("timeline"); UI.ws`) === "timeline" && (d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"6", bubbles:true})), ev("UI.ws")) === "roadmap"); ev(`goWs("roadmap"); render();`); await wait(10);
    const inp = d.querySelector("#rmIdea"); inp.value = "Auto mode for Bedrock models"; d.querySelector("#rmAdd").dispatchEvent(new w.Event("submit", {cancelable:true})); await wait(20);
    const dv = () => ev("JSON.stringify(S.deliverables[0] || null)"), D = () => JSON.parse(dv());
    ok("I1: a one-line idea lands in Ideas to sort, stamped with the meeting", D() && D().stage === "idea" && /^Planning topics, /.test(D().source) && /Auto mode/.test(d.querySelector("#rmIdeas")?.textContent || ""), dv());
    ok("I2: no Start editing needed: it's a quick update", !ev("file.holdLock"));
    d.querySelector('#rmIdeas [data-target="2027-H1"]').click(); await wait(20);
    ok("T1: picking when makes it Planned, and it leaves Ideas to sort", D().stage === "planned" && D().target === "2027-H1" && !d.querySelector("#rmIdeas"));
    ok("T2: on the roadmap in its column", ev(`JSON.stringify(dvSpan(S.deliverables[0], roadmapCols()))`).includes('"a":2,"b":2'));
    ev(`setDvTarget(S.deliverables[0].id, "2027")`); await wait(10);
    ok("T3: a broad target is a wide card across its columns", ev(`(s => s.a + "-" + s.b)(dvSpan(S.deliverables[0], roadmapCols()))`) === "2-3" && /grid-column: 3 \/ 5/.test(d.querySelector("[data-dv]")?.getAttribute("style") || ""), d.querySelector("[data-dv]")?.getAttribute("style"));
    ev(`setDvTarget(S.deliverables[0].id, "2026-H2")`); await wait(10);
    ok("B1: a broad target coming into view needs detail: pick a quarter", ev(`JSON.stringify(dvBadges(S.deliverables[0]))`).includes("pick a quarter"));
    ev(`setDvTarget(S.deliverables[0].id, "2026-Q2")`); await wait(10);
    ok("B2: a target that has passed is at risk", ev(`dvBadges(S.deliverables[0]).some(b=>b[0] === "risk")`));
    ev(`linkDvJira(S.deliverables[0].id, ["ABC-10", "ABC-11"])`); await wait(10);
    const P = ev(`JSON.stringify(dvProgress(S.deliverables[0]))`);
    ok("J1: progress counts each linked issue once (an epic's story linked too isn't counted twice)", JSON.parse(P).of === 2, P);
    ok("J2: it's In Jira", ev(`dvBadges(S.deliverables[0]).some(b=>b[0] === "jira")`));
    ev(`JIRA = {...JIRA, releases:[{id:"20101", name:"2026.4", project:"ABC", date:"2026-11-12", released:false}]}; setDvRelease(S.deliverables[0].id, "20101")`); await wait(10);
    ok("R1: tied to a Jira release, its date comes from Jira and it sits in that quarter", D().release === "20101" && D().target === "2026-Q4" && /2026\.4 · Nov 12/.test(ev(`dvWhen(S.deliverables[0]).label`)));
    ev(`dvEdit(S.deliverables[0].id, "done", x=>{ x.stage = "done"; })`); await wait(10);
    ev(`dvEdit(S.deliverables[0].id, "wording", x=>{ x.line = "Customers get it."; })`); await wait(10);
    ok("R2: Done with a release asks for approval, then it's in the release notes", ev(`dvBadges(S.deliverables[0]).some(b=>b[1] === "Approve for notes")`) && (ev(`approveDv(S.deliverables[0].id, true)`), await wait(10), ev(`dvBadges(S.deliverables[0]).some(b=>b[0] === "ready")`)));
    ok("F1: the plan names the feature, so older copies open it read-only", ev("featuresIn(S).includes('deliverables') && KNOWN_FEATURES.includes('deliverables')"));
    ok("F2: normalize keeps what's set and checks it", ev(`(()=>{ const n = normalize({...JSON.parse(JSON.stringify(S)), deliverables:[{id:"x", name:"Y", stage:"weird", target:"2027-Q9", jira:["bad key","ABC-10"], kind:"odd"}]}, false).deliverables[0]; return JSON.stringify(n); })()`) === JSON.stringify({id:"x", name:"Y", stage:"idea", jira:["ABC-10"]}));
    ok("L1: Find and links reach a deliverable", ev(`findIndex().some(x=>x.kind === "deliverable")`) && ev(`navFind("deliverable", S.deliverables[0].id)`));
    ok("no page errors", !w.errs.length, w.errs.join("; ")); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`S.deliverables = [{id:"dv-a", name:"Big thing", stage:"planned", target:"2027", lane:S.lanes[0].id, kind:"new"}]; window.prompt = () => "Preview; GA"; goWs("roadmap"); render();`);
    ev(`splitDv("dv-a")`); await wait(20);
    ok("S1: Split makes the parts, each keeping the target and workstream", ev(`S.deliverables.filter(x=>x.from === "dv-a").map(x=>x.name + ":" + x.target + ":" + (x.lane === S.lanes[0].id)).join()`) === "Preview:2027:true,GA:2027:true");
    ok("S2: the original is kept as history, off the roadmap", ev(`S.deliverables.find(x=>x.id === "dv-a").stage`) === "split" && !d.querySelector('[data-dv="dv-a"]'));
    ev(`window.prompt = () => "Faster checkout"`); await ev(`groupIntoDeliverable(["ABC-11", "ABC-12"])`); await wait(20);
    ok("G1: Group into a deliverable makes one from picked Jira work", ev(`JSON.stringify(S.deliverables.find(x=>x.name === "Faster checkout")?.jira)`) === JSON.stringify(["ABC-11","ABC-12"]) && ev("UI.ws") === "roadmap"); });

  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
