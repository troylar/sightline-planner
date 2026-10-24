// Card views (Cards tab): rows by person, workstream or epic; fields on each card (points, epic, age, last update, last
// comment); quick filters (mine, unassigned, blocked, not estimated, recent, stale, someone's) that count what they hide;
// views saved for the team, as a feature older copies respect. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const at = new Date(Date.UTC(2026, 8, 30, 14)).toISOString();
const JS = JSON.stringify({kind:"sightline-jira-status", generatedAt:at, jiraBase:"https://jira.example.com", missing:[],
  issues:{"ABC-20":{summary:"Leaf story", status:"In Progress", category:"inprogress", type:"Story", sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-21", sprintEnd:"2026-10-02", assignee:"Avery S.", assigneeKey:"JIRAUSER1", labels:[]},
    "ABC-1":{summary:"Checkout epic", status:"In Progress", category:"inprogress", type:"Epic", labels:[]},
    "ABC-21":{summary:"Pay by card", status:"Done", category:"done", type:"Story", sprintId:42, sprint:"Sprint 42", sprintState:"active", sprintStart:"2026-09-21", sprintEnd:"2026-10-02", assignee:"Blake L.", assigneeKey:"JIRAUSER2", labels:[]},
    "ABC-22":{summary:"Gift cards", status:"To Do", category:"new", type:"Story", sprintId:43, sprint:"Sprint 43", sprintState:"future", sprintStart:"2026-10-05", sprintEnd:"2026-10-16", assignee:"", labels:[]}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-21", end:"2026-10-02"}], rollups:{"ABC-1":{children:["ABC-21","ABC-22"]}}});
async function page(){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s => w.eval(s); await wait(200);
  w.FIX = plan; w.JS = JS;
  ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); setMe(S.people[0].id);
    const L = S.bars.filter(b=>isLeafBar(b) && !(b.tasks||[]).length && b.lane); window.J = L[0].id; L[0].jira = "ABC-20"; window.E = L[1].id; L[1].epics = ["ABC-1"]; L[1].jira = "";
    window.P = L.find(b=>b !== L[0] && b !== L[1] && peopleOf(b).length && wkDay(b.start) <= todayDay() && barEndDay(b) >= todayDay())?.id;
    S.people[1].jira = {key:"JIRAUSER2", name:"Blake L."};
    S = normalize(JSON.parse(JSON.stringify(S)), false); JIRA = parseJiraStatus(JS); setWs("timeline"); render();`);
  return {w, d: w.document, ev};
}
const row = (d, id) => d.querySelector(`#standupWs .surow[data-person="${id}"]`);
const col = (r, i) => r ? r.querySelectorAll(".sucol")[i] : null;
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const cards = d => [...d.querySelectorAll("#standupWs .sucard")];

  await sec(async ()=>{ const {d, ev} = await page(); ev("UI.cards = {}; goWs('standup')"); await wait(10);
    ok("V1: Cards has rows, quick filters, fields and saved views", !!d.querySelector("#cardsBar") && d.querySelectorAll("#cardsBar .qchip").length === 7 && !!d.querySelector("#cardsFields") && !!d.querySelector("#cardsView"));
    [...d.querySelectorAll("#cardsBar .seg button")].find(b=>/Workstream/.test(b.textContent)).click(); await wait(10);
    ok("V2: rows by workstream", /Workstream/.test(d.querySelector("#standupWs .suhead").textContent) && [...d.querySelectorAll("#standupWs .surow:not(.suhead) .suwho b")].some(b=>S_LANES(ev).includes(b.textContent)));
    [...d.querySelectorAll("#cardsBar .seg button")].find(b=>/Epic/.test(b.textContent)).click(); await wait(10);
    ok("V2: and by epic", /Epic/.test(d.querySelector("#standupWs .suhead").textContent) && /ABC-1/.test(d.querySelector("#standupWs .sugrid").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("JIRA.issues['ABC-21'].points = 3; UI.cards = {}; goWs('standup')"); await wait(10);
    const n0 = cards(d).length; d.querySelector('#cardsBar [data-quick="unest"]').click(); await wait(10);
    ok("Q1: a quick filter narrows the cards, and says how many it hides", cards(d).length < n0 && /\d+ hidden by quick filters/.test(d.querySelector("#cardsQHidden")?.textContent || ""));
    d.querySelector('#cardsQHidden button').click(); await wait(10);
    ok("Q1: Clear brings them back", cards(d).length === n0);
    ev("setCards({by: S.people[1].id})"); await wait(10);
    ok("Q2: someone's stories only", cards(d).length >= 1 && cards(d).every(c=>!!c.closest('[data-person="' + ev("S.people[1].id") + '"]'))); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev(`const j = JIRA.issues["ABC-21"]; j.points = 5; j.created = "2026-09-10"; j.updated = "2026-09-20T10:00:00.000+0000"; j.commentedAt = "2026-09-28"; UI.cards = {fields:["points","created","updated","comment"]}; goWs('standup')`); await wait(10);
    const t = d.querySelector('#standupWs [data-card="story:ABC-21"] .sufields')?.textContent || "";
    ok("F1: cards show the fields you pick: points and how old, from Jira", /5 pts/.test(t) && /20 days old/.test(t) && /updated 10 days ago/.test(t) && /comment 2 days ago/.test(t), t); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("UI.cards = {rows:'lane', fields:['points'], quick:['blocked']}; goWs('standup')"); await wait(10);
    ev("window.prompt = ()=>'Blocked by workstream'"); d.querySelector("#cardsSave").click(); await wait(10);
    ok("S1: Save view keeps the layout for the team, not your quick filters", ev("S.cardViews.length") === 1 && ev("S.cardViews[0].rows") === "lane" && JSON.stringify(ev("S.cardViews[0].fields")) === '["points"]' && !ev("(S.cardViews[0].quick || []).length") && ev("featuresIn(S).includes('cardViews')"));
    ev("setCards({rows:'person', fields:[], quick:['mine'], view:''})"); await wait(10); const sel_ = d.querySelector("#cardsView"); sel_.value = ev("S.cardViews[0].id"); sel_.dispatchEvent(new (d.defaultView.Event)("change")); await wait(10);
    ok("S2: choosing it puts the layout back and leaves your quick filters alone", ev("cardUI().rows") === "lane" && JSON.stringify(ev("cardUI().fields")) === '["points"]' && JSON.stringify(ev("cardUI().quick")) === '["mine"]');
    ok("S3: it survives saving and reading the plan", ev("normalize(JSON.parse(JSON.stringify(S)), false).cardViews[0].name") === "Blocked by workstream"); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
function S_LANES(ev){ return JSON.parse(ev("JSON.stringify(S.lanes.map(l=>l.name))")); }
