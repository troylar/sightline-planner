// Status update: a five-part draft from the plan, edited, copied and saved as a frozen copy in the shared file; the
// next draft's Changed compares with the last saved one. Fails on the build before this.
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
    const RD = w.Date, NOW = new RD(2026, 8, 30, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
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
    const F = () => JSON.parse(handle._text), val = k => d.querySelector("#rep-" + k)?.value || "";
    ev(`setMe(S.people[0].id); window.__copied = []; copyText = (t, what) => { __copied.push(t); return Promise.resolve(); };`);
    const leaf = ev(`(S.bars.find(b=>b.kind !== "waiting" && !b.parked && !(b.epics||[]).length && !S.bars.some(c=>c.parent === b.id || (c.dependsOn||[]).includes(b.id)) && !(b.dependsOn||[]).length && !(b.tasks||[]).length && b.status !== "done") || {}).id`);
    await ev(`quickSave("setup", s=>{ const b = s.bars.find(x=>x.id === "${leaf}"); b.blocked = {reason:"Waiting on the vendor", since:new Date().toISOString()};
      s.decisions.push({id:"dec-z", text:"Pick the auth provider", state:"open", owners:[], due:dayToIso(todayDay() + 3), item:""});
      s.milestones.push({id:"ms-z", date:"", owners:[], stretch:"", what:"Beta launch", dep:"", status:"commit", lane:s.lanes[0].id, at:dayToAt(todayDay() + 14), stretchAt:null}); })`); await wait(40);
    d.querySelector("#delivery-status").click(); await wait(20);
    ok("R1 Delivery has a Status update tab with five parts", !d.querySelector("#delivery-status").hidden && d.querySelector("#delivery-status").getAttribute("aria-selected") === "true" && ["ontrack","changed","risk","decisions","next"].every(k=>!!d.querySelector("#rep-" + k)));
    ok("R2 the draft lists what's blocked, the open decision and the next milestone", /blocked: Waiting on the vendor/.test(val("risk")) && /Pick the auth provider/.test(val("decisions")) && /Beta launch/.test(val("next")), val("risk").slice(0, 120));
    ok("R3 with nothing saved yet, it says Changed starts next time", /Nothing to compare with yet/.test(d.querySelector("#repBasis").textContent) && /First update/.test(val("changed")));
    ok("R4 a blocked item suggests At risk", d.querySelector("#repStatus").value === "atrisk", d.querySelector("#repStatus").value);
    const ta = d.querySelector("#rep-ontrack"); ta.value = "- Everything important is fine"; ta.dispatchEvent(new d.defaultView.Event("input")); ev("render()"); await wait(20);
    ok("R5 your edits are kept as you move around", val("ontrack") === "- Everything important is fine");
    d.querySelector("#repCopy").click(); d.querySelector("#repCopyMd").click(); await wait(10);
    const [txt, md] = ev("__copied");
    ok("R6 Copy gives plain text; Markdown has headings and whole-plan scope", /Status: At risk/.test(txt) && /Everything important is fine/.test(txt) && /Scope: Whole plan/.test(txt) && /### Decisions needed/.test(md) && /\*\*Status:\*\* At risk/.test(md) && /\*\*Scope:\*\* Whole plan/.test(md), txt.slice(0, 80));
    d.querySelector("#repSave").click(); await wait(80);
    const r1 = (F().reports || [])[0];
    ok("R7 Save keeps a frozen copy in the shared file", r1 && r1.sections.ontrack === "- Everything important is fine" && r1.status === "atrisk" && r1.info && Object.keys(r1.info.b).length > 0 && (F().meta.features || []).includes("reports"));
    ok("R8 and starts a fresh draft that compares with it", /since the last update/.test(d.querySelector("#repBasis").textContent) && !/Everything important/.test(val("ontrack")));
    const other = ev(`S.bars.find(b=>b.id !== "${leaf}" && b.kind !== "waiting" && !b.parked && !S.bars.some(c=>c.parent === b.id || (c.dependsOn||[]).includes(b.id)) && !(b.tasks||[]).length && b.status !== "done" && !(b.dependsOn||[]).length).id`);
    await ev(`quickSave("move", s=>{ s.bars.find(b=>b.id === "${other}").start += 1; })`); await wait(40);
    d.querySelector("#repRedo").click(); await wait(20);
    ok("R9 Changed then lists what moved since the last update", /moved later by 5 working days/.test(val("changed")), val("changed").slice(0, 160));
    d.querySelector("#repSave").click(); await wait(80);
    const reps = F().reports;
    ok("R10 only the newest saved update keeps the plan's picture", reps.length === 2 && !!reps[0].info && !reps[1].info);
    d.querySelector(`[data-repshow="${reps[1].id}"]`).click(); await wait(20);
    ok("R11 an older update can be shown as it was", /Everything important is fine/.test(d.querySelector("#repFrozen")?.textContent || ""));
    const N = JSON.parse(ev(`JSON.stringify(normalize({...JSON.parse(JSON.stringify(S)), reports:[...Array(30)].map((_, i)=>({id:"r" + i, at:new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), status:i ? "weird" : "offtrack", title:"t", sections:{ontrack:"x".repeat(5000)}, info:{b:{}}}))}, false).reports)`));
    ok("R12 a file's updates are checked: newest 26, known status, capped text, one picture", N.length === 26 && N[0].id === "r29" && N[0].status === "ontrack" && N[0].sections.ontrack.length === 4000 && !!N[0].info && !N[1].info);
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
