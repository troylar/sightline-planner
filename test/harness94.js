// Workspaces sit under three jobs with contextual tabs. Old workspace links and Plan sections still work.
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
  await sec(async ()=>{ const {ev, d} = await page(); await wait(300); ev(`UI.ws = "today"; render();`); await wait(10);
    const vis = () => [...d.querySelectorAll(".tabs [role=tab][data-ws]")].filter(t=>!t.hidden).map(t=>t.dataset.ws).join();
    ok("R1 Work offers Today, Sprint and Sort Jira work without More", vis() === "today,standup" && !d.querySelector("#work-sort").hidden && d.querySelector("#tabMore").hidden, vis());
    d.querySelector("#nav-delivery").click(); await wait(5);
    ok("R2 Delivery offers Timeline and People", vis() === "timeline,people", vis());
    ok("R2a Delivery also offers status, decisions and risks", [...d.querySelectorAll('.tabs [data-section]')].filter(t=>!t.hidden).map(t=>t.dataset.section).join() === "report,decisions,risks");
    d.querySelector('#tab-timeline').focus(); d.querySelector('.tabs').dispatchEvent(new d.defaultView.KeyboardEvent('keydown', {key:'End', bubbles:true})); await wait(10);
    ok("R2b keyboard navigation reaches Delivery sections", ev("UI.ws") === "plan" && ev("UI.planTab") === "risks");
    d.querySelector('#tab-people').click(); await wait(10);
    ok("R3 People remains accessible within Delivery", ev("UI.ws") === "people" && !d.querySelector("#tab-people").hidden && d.querySelector("#moreMenu").hidden);
    d.querySelector("#nav-work").click(); await wait(5);
    d.querySelector("#tab-today").focus(); d.querySelector(".tabs").dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"End", bubbles:true})); await wait(10);
    ok("R4 End reaches the direct Work sorting tab", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics" && d.activeElement === d.querySelector("#work-sort") && d.querySelector("#work-sort").getAttribute("aria-selected") === "true", ev("UI.ws"));
    d.querySelector(".tabs").dispatchEvent(new d.defaultView.KeyboardEvent("keydown", {key:"ArrowLeft", bubbles:true})); await wait(10);
    ok("R4a ArrowLeft returns from sorting to Sprint", ev("UI.ws") === "standup" && d.activeElement === d.querySelector("#tab-standup"));
    await ev("startEditing(false)"); await wait(40); ev("render()"); await wait(10);
    ok("R5 editing retains the same contextual navigation", vis() === "today,standup" && !d.querySelector("#work-sort").hidden && d.querySelector("#tabMore").hidden, vis());
    ev(`UI.ws = "plan"; UI.planTab = "epics"; render();`); await wait(10);
    const groups = [...d.querySelectorAll("#plannav .pgroup")].map(g=>g.querySelector(".pglabel").textContent + ":" + [...g.querySelectorAll("[data-pt]")].map(b=>b.dataset.pt).join("|"));
    ok("R6 Settings excludes Delivery sections", groups.join(" ") === "Lists:tags Team:team|calendar|meetings|types Jira:epics|proposals|jira Assistant:guide", groups.join(" "));
    ok("R7 configuration is named Settings", /Sort Jira work/.test(d.querySelector('[data-pt="epics"]').textContent) && /Jira connection/.test(d.querySelector('[data-pt="jira"]').textContent) && d.querySelector("#tab-plan").childNodes[0].textContent === "Settings");
    d.querySelector('#delivery-status').click(); await wait(10);
    const deliveryGroups = [...d.querySelectorAll('#plannav .pgroup')].map(g=>g.querySelector('.pglabel').textContent + ':' + [...g.querySelectorAll('[data-pt]')].map(b=>b.dataset.pt).join('|'));
    ok("R7a Delivery keeps its supporting lists without duplicate shortcuts", deliveryGroups.join(' ') === 'Lists:milestones|gates Reports:snapshots|activity', deliveryGroups.join(' '));
  });
  await sec(async ()=>{ const {ev} = await page(); await wait(300); ev(`applyNav({ws:"plan", pt:"epics", plan:S.meta.planId}); render();`); await wait(10);
    ok("R8 an old link to Manage, Jira work still lands there", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics"); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
