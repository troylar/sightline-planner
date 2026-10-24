// Today's summary: what needs attention (chips that jump to their list), what's coming up, and where to go.
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
  await sec(async ()=>{ const {ev, d} = await page(); await wait(300);
    ev(`UI.ws = "today"; UI.todayScope = "team"; S.decisions = []; S.risks = []; S.bars.forEach(b=>{ delete b.blocked; }); S.milestones = []; S.deliverables = []; render();`); await wait(10);
    const sum = () => d.querySelector("#todaySum");
    ok("T1 Today opens with a summary", !!sum() && sum().compareDocumentPosition(d.querySelector("#today .tgrid")) & 4);
    ev(`const b = S.bars.find(x=>x.kind !== "waiting" && !x.parked && !(x.tasks||[]).length && !S.bars.some(c=>c.parent === x.id) && x.status !== "done"); b.blocked = {reason:"Vendor", waitingOn:"", since:new Date().toISOString()};
      S.decisions = [{id:"d1", text:"Pick one", state:"open", owners:[], due:dayToIso(todayDay() + 2), item:""}];
      S.milestones.push({id:"m9", date:"", owners:[], stretch:"", what:"Beta launch", dep:"", status:"commit", lane:S.lanes[0].id, at:dayToAt(todayDay() + 14), stretchAt:null});
      S.deliverables = [{id:"dv-1", name:"Thing", stage:"planned", target:quarterOf(todayDay())}]; render();`); await wait(10);
    const chips = [...sum().querySelectorAll(".tchip")].map(x=>x.textContent);
    ok("T2 attention chips count what's in the lists below", chips.includes("1 blocked") && chips.includes("1 decision due"), JSON.stringify(chips));
    ok("T3 coming up: the next milestone and this quarter's deliverables", /Beta launch/.test(sum().textContent) && /1 deliverable this quarter/.test(sum().textContent), sum().textContent.slice(0, 200));
    ev(`window.__scrolled = null; Element.prototype.scrollIntoView = function(){ __scrolled = this.dataset.tsec || this.id; };`);
    sum().querySelector('[data-tchip="Blocked"]').click(); await wait(5);
    ok("T4 a chip jumps to its list", ev("__scrolled") === "Blocked", String(ev("__scrolled")));
    [...sum().querySelectorAll(".tsum-acts button")].find(b=>b.textContent === "Roadmap").click(); await wait(10);
    ok("T5 Go to opens the Roadmap", ev("UI.ws") === "roadmap");
    ev(`UI.ws = "today"; S.bars.forEach(b=>{ delete b.blocked; }); S.decisions = []; render();`); await wait(10);
    ok("T6 the heading stays sensible with or without items (the fixture always has some that should have started)", /Nothing needs attention right now/.test(sum().textContent) || /Needs attention/.test(sum().textContent));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
