// "What changed" on Today: the plan's changes by others since your last visit, yesterday or this week (yours are
// summed up), and Jira's changes against a daily summary this browser keeps. Nothing goes into the plan file.
// Fails on the build before this.
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
    ev(`setMe(S.people[0].id); const other = S.people[1].id, b = S.bars[0], ago = h => new Date(Date.now() - h * 3600e3).toISOString();
      S.changes = [{id:"c1", by:other, at:ago(2), what:"moved the first thing", ops:[{op:"set", type:"bars", id:b.id, field:"start", value:1, prev:0}]},
                   {id:"c2", by:S.people[0].id, at:ago(1), what:"my own tweak", ops:[]},
                   {id:"c3", by:other, at:ago(24 * 20), what:"ancient history", ops:[]}];
      UI.sinceMode = "yesterday"; UI.ws = "today"; render();`); await wait(20);
    const box = () => d.querySelector("#tSince");
    ok("Y1 Today has a What changed panel", !!box());
    ok("Y2 it lists others' recent plan changes, not old ones", !!box().querySelector('[data-chg="c1"]') && !box().querySelector('[data-chg="c3"]') && !box().querySelector('[data-chg="c2"]'));
    ok("Y3 your own are summed up", /Plus 1 of your own/.test(box().textContent), box().textContent.slice(0, 200));
    box().querySelector('[data-chg="c1"] button').click(); await wait(20);
    ok("Y4 clicking a change opens its item", ev("UI.ws") === "timeline" && ev("sel && sel.type") === "bar", `${ev("UI.ws")} ${ev("JSON.stringify(sel)")}`);
    ev(`UI.ws = "today"; JIRA = parseJiraStatus(JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com", missing:[], rollups:{},
        issues:{"A-1":{summary:"One", status:"Done", category:"done", type:"Story", sprintId:42}, "A-2":{summary:"Two", status:"In Progress", category:"inprogress", type:"Story", sprintId:43}, "A-3":{summary:"Three", status:"To Do", category:"todo", type:"Story"}},
        sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}]})); render();`); await wait(20);
    ok("Y5 with no earlier sync seen, it says so", /seen a sync from before then/.test(box().textContent));
    const seen = JSON.parse(ev("localStorage.getItem(STORE_SEEN)"))[ev("S.meta.planId")];
    ok("Y6 it keeps a daily summary of the sync in this browser", seen && seen.jira && Object.keys(seen.jira).length === 1 && Object.values(seen.jira)[0].i["A-1"][0] === "done");
    ev(`seenPut(m=>{ m.jira["2000-01-01"] = {at:new Date(Date.now() - 8 * 864e5).toISOString(), i:{"A-1":["todo","To Do",42,"One"], "A-2":["inprogress","In Progress",42,"Two"]}, r:{}}; }); render();`); await wait(20);
    const t = box().textContent;
    ok("Y7 Jira changes: done, changed sprint, new", /Done in Jira \(1\)/.test(t) && /A-1 One/.test(t) && /Changed sprint \(1\)/.test(t) && /Sprint 42 → Sprint 43/.test(t) && /New in the sync \(1\)/.test(t), t.slice(0, 400));
    ok("Y8 Jira keys link to Jira", box().querySelector('[data-jk="A-1"] a')?.getAttribute("href") === ev("jiraUrl('A-1')") || !ev("jiraUrl('A-1')"));
    const v0 = ev("seenMine().visit"); ev(`visitMarked.clear(); markVisit();`);
    ok("Y9 reloading today doesn't move your last visit", ev("seenMine().visit") === v0);
    ev(`seenPut(m=>{ m.cur = "2026-09-20T09:00:00.000Z"; m.curDay = "2026-09-20"; }); visitMarked.clear(); markVisit();`);
    ok("Y9b the first visit on a new day makes the old one your last visit", ev("seenMine().visit") === "2026-09-20T09:00:00.000Z");
    d.querySelector('#tSince [data-since="week"]').click(); await wait(20);
    ok("Y10 the switch changes the window", ev("UI.sinceMode") === "week" && /since Monday/.test(box().textContent));
    ok("Y11 nothing is written into the plan", !ev("file.dirty") && !/timeline-planner-seen|"jira":\{"20/.test(handle._text));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
