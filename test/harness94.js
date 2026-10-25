// The menu: every page has one home under Work, Delivery, Product updates or Settings; it collapses to a rail whose pages
// fly out, remembered in this browser. Number keys and old links still land in the right place.
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
  await sec(async ()=>{ const {ev, d, w} = await page(); await wait(300); ev(`UI.navOpen = {}; UI.navRail = false; UI.ws = "today"; render();`); await wait(10);
    const pagesOf = g => [...d.querySelectorAll(`#snp-${g} .snp`)].map(b=>b.dataset.ws || b.dataset.section || b.dataset.updates).join();
    ok("R1 Work holds Today, Sprint, Sort Jira work and Jira change proposals", pagesOf("work") === "today,standup,epics,proposals", pagesOf("work"));
    ok("R2 Delivery holds every delivery page at one level", pagesOf("delivery") === "timeline,list,people,report,milestones,gates,decisions,risks,snapshots,activity", pagesOf("delivery"));
    ok("R2a Product updates holds Roadmap and the customer release notes", pagesOf("updates") === "roadmap,notes", pagesOf("updates"));
    ok("R2b Settings holds setup only", pagesOf("settings") === "details,tags,guide,team,calendar,meetings,types,jira", pagesOf("settings"));
    const all = [...d.querySelectorAll("#sidenav .snp")].map(b=>b.dataset.ws || b.dataset.section || b.dataset.updates);
    ok("R3 every page has exactly one home in the menu", all.length === new Set(all).size && !d.querySelector(".tabs, #plannav, #primaryNav, #tabMore"), all.join());
    ok("R3a each page belongs to the group it sits under", [...d.querySelectorAll("#sidenav .snp[data-section], #sidenav .snp[data-ws]")].every(b=>ev(`workspaceGroup(${JSON.stringify(b.dataset.section ? "plan" : b.dataset.ws)}, ${JSON.stringify(b.dataset.section || "")})`) === b.closest(".sngroup").dataset.group));
    d.querySelector("#work-sort").click(); await wait(10);
    ok("R4 Sort Jira work opens in Work and stays there", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics" && ev("workspaceGroup()") === "work" && d.querySelector("#work-sort").getAttribute("aria-current") === "page" && d.querySelector('.sngroup[data-group="work"]').classList.contains("here"));
    d.querySelector("#work-proposals").click(); await wait(10);
    ok("R4a Jira change proposals is a Work page", ev("UI.planTab") === "proposals" && ev("workspaceGroup()") === "work");
    d.querySelector("#set-calendar").click(); await wait(10);
    ok("R4b a Settings page opens Settings and opens its group", ev("UI.planTab") === "calendar" && ev("workspaceGroup()") === "settings" && d.querySelector("#tab-plan").getAttribute("aria-expanded") === "true" && d.querySelector("#set-calendar").getAttribute("aria-current") === "page");
    d.querySelector("#tab-plan").click(); await wait(5);
    ok("R4c the group you're in stays open when you click its heading", d.querySelector("#tab-plan").getAttribute("aria-expanded") === "true");
    d.querySelector("#nav-updates").click(); await wait(5);
    ok("R4d another group's heading folds it, and that's remembered", d.querySelector("#nav-updates").getAttribute("aria-expanded") === "false" && ev("UI.navOpen.updates") === false && ev("UI.ws") === "plan");
    d.querySelector("#tab-timeline").click(); await wait(10);
    ok("R5 Timeline is current; only one page is ever current", ev("UI.ws") === "timeline" && d.querySelectorAll('#sidenav [aria-current="page"]').length === 1);
    d.querySelector("#tab-timeline").focus(); d.querySelector("#sidenav").dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true}));
    ok("R5a Down moves to the next page in the menu", d.activeElement === d.querySelector("#tab-list"));
    d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"4", bubbles:true})); await wait(10);
    ok("R6 4 opens Settings, never a Delivery or Work page", ev("workspaceGroup()") === "settings" && ev("UI.ws") === "plan" && !["epics","proposals","report","milestones"].includes(ev("UI.planTab")), ev("UI.planTab"));
    d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"2", bubbles:true})); await wait(10);
    d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"\\", bubbles:true})); await wait(10);
    ok("R7 backslash collapses the menu to a rail, remembered in this browser", ev("UI.navRail") === true && d.body.classList.contains("navrail") && ev("JSON.parse(localStorage.getItem('timeline-planner-ui')).navRail") === true);
    d.querySelector("#nav-delivery").click(); await wait(5);
    ok("R7a in the rail, a group icon opens its pages as a flyout", d.querySelector('.sngroup[data-group="delivery"]').classList.contains("fly") && d.querySelector("#nav-delivery").getAttribute("aria-expanded") === "true" && d.activeElement === d.querySelector("#tab-timeline"));
    d.querySelector("#tab-timeline").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
    ok("R7b Esc closes the flyout and returns to its icon", !d.querySelector(".sngroup.fly") && d.activeElement === d.querySelector("#nav-delivery"));
    d.querySelector("#navToggle").click(); await wait(10);
    ok("R7c the toggle pins it open again", ev("UI.navRail") === false && !d.body.classList.contains("navrail") && d.querySelector("#navToggle").getAttribute("aria-label") === "Collapse the menu");
    ev("present = true; render()"); await wait(5);
    ok("R8 presenting hides the menu", d.querySelector("#sidenav").hidden && !d.body.classList.contains("hasnav")); ev("present = false; render()");
    ok("R9 no page errors", !w.errs.length, w.errs.join(" | "));
  });
  await sec(async ()=>{ const {ev} = await page(); await wait(300); ev(`applyNav({ws:"plan", pt:"epics", plan:S.meta.planId}); render();`); await wait(10);
    ok("R8 an old link to Manage, Jira work still lands there", ev("UI.ws") === "plan" && ev("UI.planTab") === "epics"); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
