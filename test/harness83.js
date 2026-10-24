// Before we commit (Sprint tab): goal, points against capacity and the exceptions for the sprint about to start, then
// Record sprint commitment, after which it shows what changed since. Fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; if (h.cross){ const c = h.cross; h.cross = null; h._text = c(h._text); } }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(fileText){
  const handle = makeHandle("plan.json", fileText || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    const RealDate = w.Date, now = new RealDate(2026, 8, 30, 10).getTime();
    w.Date = class extends RealDate { constructor(...args){ args.length ? super(...args) : super(now); } static now(){ return now; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(250);
  const ev = s => w.eval(s);
  w.document.querySelector("#link").click(); await wait(200);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb();");
  return {w, d: w.document, ev, handle};
}

(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {ev, d, handle} = await page();
    const F = () => JSON.parse(handle._text), box = () => d.querySelector("#suCommit"), line = id => box()?.querySelector(`[data-bwc="${id}"]`);
    const J = issues => `JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com", missing:[], rollups:{},
      issues:${JSON.stringify(issues)}, sprints:[{id:42, name:"Sprint 42", state:"active", start:dayToIso(todayDay() - 9), end:dayToIso(todayDay() + 1)}, {id:43, name:"Sprint 43", state:"future", start:dayToIso(todayDay() + 4), end:dayToIso(todayDay() + 17), goal:"Checkout refresh ready for QA"}]})); dropJiraMemos();`;
    const base = {"A-1":{summary:"One", status:"To Do", category:"todo", type:"Story", points:5, assigneeKey:"U1", assignee:"Avery", sprintId:43, sprintState:"future"},
      "A-2":{summary:"Two", status:"To Do", category:"todo", type:"Story", assigneeKey:"U1", assignee:"Avery", sprintId:43, sprintState:"future"},
      "A-3":{summary:"Three", status:"To Do", category:"todo", type:"Story", points:3, sprintId:43, sprintState:"future"},
      "A-4":{summary:"Four", status:"To Do", category:"todo", type:"Story", points:8, assigneeKey:"X9", assignee:"Pat Outsider", sprintId:43, sprintState:"future"}};
    ev(`setMe(S.people[0].id); S.people[0].jira = {key:"U1", name:"Avery"}; S.people[0].off = [{from:dayToIso(todayDay() + 7), to:dayToIso(todayDay() + 8)}];
      S.meta.capRates = [{from:dayToIso(todayDay() - 60), points:10}]; ${J(base)} UI.ws = "standup"; render();`); await wait(30);
    ok("C1 the Sprint tab opens with Before we commit, on the sprint about to start", !!box() && /Before we commit/.test(box().textContent) && /Sprint 43/.test(box().querySelector("header").textContent), box() ? box().querySelector("header").textContent : "none");
    ok("C2 the goal and points against capacity", /Goal: Checkout refresh ready for QA/.test(line("goal").textContent) && /16 pts planned against/.test(line("cap").textContent), line("cap").textContent);
    ok("C3 not estimated and not assigned, with their keys", /1 not estimated/.test(line("unest").textContent) && /A-2/.test(line("unest").textContent) && /1 not assigned/.test(line("unassigned").textContent) && /A-3/.test(line("unassigned").textContent));
    ok("C4 people with work who are out, and assignees not on the team", /out 2 of/.test(line("away").textContent) && /Pat Outsider \(1\)/.test(line("stranger").textContent), line("away").textContent);
    ok("C5 the sprint work that isn't on the plan", /4 in the sprint but not on the plan A-1, A-2, A-3, A-4 · Sort them/.test(line("unsorted").textContent), line("unsorted").textContent);
    d.querySelector("#bwcNote").value = "Blake is back Wednesday"; d.querySelector("#bwcRecord").click(); await wait(80);
    const c = (F().commitments || [])[0];
    ok("C6 Record sprint commitment keeps the sprint's issues, points, capacity and assumption", c && c.sprint === 43 && c.points === 16 && c.keys.length === 4 && c.note === "Blake is back Wednesday" && c.capacity > 0 && (F().meta.features || []).includes("commitments"), JSON.stringify(c).slice(0, 160));
    ev("render()"); await wait(20);
    ok("C7 afterwards it says what was committed, and no change yet", /committed/.test(box().querySelector("h3").textContent) && /No change in scope/.test(d.querySelector("#bwcDrift").textContent));
    const more = {...base, "A-5":{summary:"Five", status:"To Do", category:"todo", type:"Story", points:2, assigneeKey:"U1", sprintId:43, sprintState:"future"}, "A-1":{...base["A-1"], points:8}}; delete more["A-4"];
    ev(`${J(more)} render();`); await wait(20);
    ok("C8 then what changed: added, removed, re-estimated", /\+2 pts added \(1\)/.test(d.querySelector("#bwcDrift").textContent) && /−8 pts removed \(1\)/.test(d.querySelector("#bwcDrift").textContent) && /1 re-estimated/.test(d.querySelector("#bwcDrift").textContent), d.querySelector("#bwcDrift").textContent);
    d.querySelector('[data-bwcsp="42"]').click(); await wait(20);
    ok("C9 you can check the other sprint", /Sprint 42/.test(box().querySelector("header").textContent) && /Before we commit/.test(box().textContent));
    const N = JSON.parse(ev(`JSON.stringify(normalize({...JSON.parse(JSON.stringify(S)), commitments:[{sprint:43, at:"2026-09-01T00:00:00Z", keys:[["A-1", 3], ["bad key", 1]], points:3}, {sprint:43, at:"2026-08-01T00:00:00Z", keys:[], points:1}, {sprint:"x", at:"2026-09-01T00:00:00Z"}]}, false).commitments)`));
    ok("C10 a file's commitments are checked: one per sprint (newest), valid keys only", N.length === 1 && N[0].points === 3 && N[0].keys.length === 1);
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
