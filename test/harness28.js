// 1.19 foundation: one storage interface, a pure merge, plans from a newer Sightline open read-only, saves by an older
// copy are noticed, the read cap is 5 MB while writes stay under 2 MB, and undo history is capped by size.
// Each check fails on the build before this.
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

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev("startEditing(false)"); await wait(50);
    ev("commit(s=>{ s.bars[0].label = 'Changed'; })"); await ev("save()"); await wait(50);
    ok("F1: a save stamps which Sightline wrote it", JSON.parse(handle._text).meta.savedWith === ev("APP_VERSION"));
    ok("F1: the storage interface is one seam with a file and a browser backend", ev("typeof FileStore.read === 'function' && typeof FileStore.writeIfUnchanged === 'function' && typeof LocalStore.load === 'function' && activeStore() === FileStore") === true);
    const t0 = handle._text; const r = await ev(`FileStore.writeIfUnchanged(file.handle, ${JSON.stringify("not what's there")}, "x")`);
    ok("F1: it refuses to write over a file that changed since it was read", r === "changed" && handle._text === t0); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.features = ["someFutureThing"]; j.meta.savedWith = "9.0.0";
    const {d, ev} = await page(JSON.stringify(j));
    ok("N1: a plan with a part this copy doesn't know opens read-only", ev("editable()") === false && !!ev("tooNew()"));
    ok("N1: and says why", /saved by Sightline 9\.0\.0/.test(d.querySelector("#banners").textContent), d.querySelector("#banners").textContent.slice(0,120));
    const r = await ev("quickSave('x', s=>{ s.bars[0].label = 'y'; })");
    ok("N1: quick updates are refused too, so nothing is saved over what it can't see", r === false); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.schema = 99;
    const {ev} = await page(JSON.stringify(j));
    ok("N2: so is a plan with a newer format", ev("editable()") === false && ev("S.meta.schema") === 99); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.savedWith = "1.19.0";
    const {d, ev, handle} = await page(JSON.stringify(j, null, 2));
    const older = JSON.parse(handle._text); delete older.meta.savedWith; older.meta.revision = (older.meta.revision || 0) + 1; handle._text = JSON.stringify(older, null, 2);
    await ev("refresh(true)"); await wait(60);
    ok("O1: when an older copy saves over the plan, the page says so", /older copy of Sightline/.test(d.querySelector("#banners").textContent), d.querySelector("#banners").textContent.slice(0,160)); });

  await sec(async ()=>{ const {ev} = await page();
    const big = JSON.parse(plan); big.notes = Array.from({length:1800}, (_, i)=>({id:"n" + i, lane:big.lanes[0].id, date:big.meta.start, text:"x".repeat(1500), author:"", color:"yellow"}));
    const txt = JSON.stringify(big); ev(`window.BIG = ${JSON.stringify(txt)}`);
    ok("C1: a plan between 2 and 5 MB can be opened", txt.length > 2.2e6 && ev("(()=>{ try { return parseText(BIG).notes.length > 0; } catch(e){ return e.message; } })()") === true);
    ok("C1: but saving stays under 2 MB, so every copy can open it", ev("overLimit(BIG) > 0") === true); });

  await sec(async ()=>{ const {ev} = await page();
    const r = ev(`(()=>{ const base = clone(S), mine = clone(S), theirs = clone(S);
      mine.bars[0].label = "Mine"; mine.bars[1].label = "Also mine"; theirs.bars[0].label = "Theirs";
      const m = mergePlans(base, mine, theirs); return JSON.stringify([m.plan.bars[0].label, m.plan.bars[1].label, m.kept.length]); })()`);
    ok("M1: the merge is a pure function: a teammate's newer edit wins, my other edits land", r === JSON.stringify(["Theirs", "Also mine", 1]), r); });

  await sec(async ()=>{ const {ev} = await page();
    await ev("startEditing(false)"); await wait(30);
    ev("HISTORY_BYTES = JSON.stringify(S).length * 3.5; for (let i = 0; i < 10; i++) commit(s=>{ s.meta.title = 'T' + i; });");
    ok("H1: undo history stays within its memory budget (older steps kept as change records)", ev("past.reduce((a, x)=>a + histSize(x), 0)") <= ev("HISTORY_BYTES") && ev("past.length") === 10 && ev("past.slice(0, -1).every(x=>typeof x !== 'string')"), String(ev("past.length"))); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
