// Standup (roadmap step 8, first view): this sprint's work by person, in To do / In progress / Done. Jira items sit with
// their Jira assignee and look like Jira items; plan items sit with their people. Same hides and filters as the timeline,
// always this sprint. Each check fails on the build before this.
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

  await sec(async ()=>{ const {w, d, ev} = await page();
    ok("S1: there's a Sprint tab (it was Cards, and Standup before that)", d.querySelector('#tab-standup[data-ws="standup"]')?.textContent === "Sprint");
    d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"5", bubbles:true})); await wait(20);
    ok("S1: and 5 opens it", ev("UI.ws") === "standup" && !d.querySelector("#ws-standup").hidden, ev("UI.ws"));
    ok("S1: 1-4 still go where they did", (d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"3", bubbles:true})), ev("UI.ws")) === "people");
    ev("goWs('standup')"); await wait(10);
    ok("S2: it names this sprint and its dates", /day \d+ of \d+/.test(d.querySelector("#standupWs .jhead").textContent) && /Sep 21/.test(d.querySelector("#standupWs .jhead").textContent));
    ok("S2: and has To do, In progress, Done", /To do.*In progress.*Done/.test(d.querySelector("#standupWs .suhead").textContent)); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("goWs('standup')"); await wait(10);
    const un = d.querySelector('#standupWs .surow[data-person="~Avery S."]'), card = d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]');
    ok("J1: a Jira item whose assignee isn't linked here gets a row with Jira's name, and a way to link them", !!un && col(un, 1).contains(card) && /Avery S\./.test(un.textContent) && /not linked here/.test(un.textContent) && !!un.querySelector("button.linkish"));
    ok("J1: it looks like a Jira item, with its key", card.classList.contains("jira") && /ABC-20/.test(card.querySelector(".jkey").textContent));
    const b = row(d, ev("S.people[1].id")), st = d.querySelector('#standupWs [data-card="story:ABC-21"]');
    ok("J2: an epic's story in this sprint sits with its Jira assignee, in Done when Jira says done", !!st && col(b, 2).contains(st) && st.classList.contains("jira"));
    ok("J2: a story in another sprint isn't on this board", !d.querySelector('#standupWs [data-card="story:ABC-22"]'));
    ok("J3: an item's plan people don't move a Jira item off its assignee's row", ![...d.querySelectorAll('#standupWs [data-card="bar:' + ev("J") + '"]')].some(c=>!un.contains(c))); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("goWs('standup')"); await wait(10);
    const pid = ev("P"), who = ev(`peopleOf(S.bars.find(b=>b.id===P))[0]`), c = d.querySelector('#standupWs [data-card="bar:' + pid + '"]');
    ok("A1: Cards is Jira's work: a plan-only item isn't on it, and the board says where it is", !c && /added here \(not in Jira\)/.test(d.querySelector("#suPlanOnly")?.textContent || ""));
    const jc = d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]'); jc.click(); await wait(10);
    ok("A2: clicking a card opens it", ev("sel && sel.id") === ev("J") && ev("UI.ws") === "standup");
    ev("setLayer('jira'); renderStandup();"); await wait(10);
    ok("V1: Jira only keeps the Jira items", !!d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]'));
    ev("setLayer('all'); UI.filter.range = {type:'custom', from:'2027-01-01', to:'2027-02-01'}; renderStandup();"); await wait(10);
    ok("V2: the timeline's date range doesn't empty the board; it's always this sprint", !!d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]')); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("goWs('standup')"); await wait(10);
    ok("R1: counts say what they count", [...d.querySelectorAll("#standupWs .suhead [role=columnheader][aria-label]")].length === 3 && [...d.querySelectorAll("#standupWs .suhead [aria-label]")].every(x=>/^(To do|In progress|Done), \d+ items?$/.test(x.getAttribute("aria-label"))) && [...d.querySelectorAll("#standupWs .suwho small")].every(x=>/items? in progress|nothing in progress|not linked here/.test(x.textContent)));
    ok("R2: each column is labeled, for when they stack on a phone", !!d.querySelector('#standupWs .sucol[data-label="In progress"]') && !!d.querySelector('#standupWs .sucol[data-label="Done"]'));
    d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]').click(); await wait(10);
    ok("R3: opening a card from Standup shows it beside the board, staying on Standup", ev("UI.ws") === "standup" && ev("sel && sel.id") === ev("J") && !d.querySelector("#ws-standup").hidden && d.querySelector("#side").classList.contains("floating") && d.body.classList.contains("hasSel"));
    ok("R3: and marks which card is open", d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]').getAttribute("aria-expanded") === "true" && d.querySelector('#standupWs [data-card="bar:' + ev("J") + '"]').getAttribute("aria-controls") === "side");
    ev("setMe(S.people[2].id); setLayer('mine'); UI.filter.lanes = S.lanes.filter(l=>l.id !== barById(J).lane).map(l=>l.id).slice(0, 1); goWs('standup')"); await wait(10);
    ok("R4: Standup says how much of this sprint the view hides, with a way to show it", /\d+ items? in this sprint hidden by your view or filters/.test(d.querySelector("#standupWs #suHidden")?.textContent || "") && !!d.querySelector("#suShowAll"));
    ok("R4: and not the timeline's whole-plan count", d.querySelector("#hiddenStrip").hidden); });

  await sec(async ()=>{ const {d, ev} = await page();
    ev("S.sprints = []; JIRA = null; goWs('standup')"); await wait(10);
    ok("E1: outside any sprint it says why it's empty", /No current sprint to show/.test(d.querySelector("#standupWs").textContent)); });

  await sec(async ()=>{ const {w, ev} = await page(); ev("goWs('standup')"); await wait(20); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
