// Save as you go: edit without Start editing; each change saves on its own a moment later, through the quick-update
// path, so two people editing at once both land; Undo works on saved changes; someone else's lock pauses it.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 60000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(opts = {}){
  const handle = opts.handle || makeHandle("plan.json", opts.text || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file !== false){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id); window.ME = S.people[0].id; window.OTHER = S.people[1].id;");
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const bars = handle => JSON.parse(handle._text).bars;

  await sec(async ()=>{ const {d, ev, handle} = await page(); ev("localStorage.removeItem('sightline-save-as-you-go'); render();"); await wait(20);
    ok("S1: read-only at first, with Save as you go offered", ev("editable()") === false && !!d.querySelector("#saygOn"));
    d.querySelector("#saygOn").click(); await wait(20);
    ok("S1: turned on, you can edit without Start editing", ev("editable()") === true && ev("file.holdLock") === false && /Saving as you go/.test(d.querySelector("#editstrip").textContent));
    const id = ev("S.bars[0].id"); ev(`commit(s=>{ s.bars[0].label = "Saved on its own"; })`); await wait(40);
    ok("S2: a change waits a moment", bars(handle).find(b=>b.id === id).label !== "Saved on its own" && /waiting to save/.test(d.querySelector("#editstrip").textContent));
    await wait(1700);
    ok("S2: then saves on its own", bars(handle).find(b=>b.id === id).label === "Saved on its own" && !ev("file.dirty"));
    ok("S2: with a change record, like any quick update", (JSON.parse(handle._text).changes || []).some(c=>/Saved on its own|title|label/i.test(c.what) || c.ops?.some(o=>o.field === "label")));
    ev("undo()"); await wait(250);
    ok("S3: Undo takes back a saved change", bars(handle).find(b=>b.id === id).label !== "Saved on its own"); });

  await sec(async ()=>{ const A = await page(); A.ev("localStorage.setItem('sightline-save-as-you-go', '1'); render();"); const B = await page({handle:A.handle}); B.ev("localStorage.setItem('sightline-save-as-you-go', '1'); render();"); await wait(20);
    const a = A.ev("S.bars[1].id"), b = B.ev("S.bars[2].id");
    A.ev(`commit(s=>{ s.bars[1].label = "Alice's"; })`); B.ev(`commit(s=>{ s.bars[2].label = "Bob's"; })`); await wait(2200);
    const f = bars(A.handle);
    ok("M1: two people saving as they go at once: both changes land", f.find(x=>x.id === a).label === "Alice's" && f.find(x=>x.id === b).label === "Bob's", `${f.find(x=>x.id === a).label} / ${f.find(x=>x.id === b).label}`); });

  await sec(async ()=>{ const at = new Date(Date.now() - 60000).toISOString(); const o = JSON.parse(plan); o.meta.lock = {by:"Casey", id:"someone-else", at};
    const {ev} = await page({text: JSON.stringify(o)}); ev("localStorage.setItem('sightline-save-as-you-go', '1'); render();"); await wait(20);
    ok("K1: while someone else has Start editing, Save as you go waits (read-only)", ev("editable()") === false); });

  await sec(async ()=>{ const {d, ev} = await page(); ev("localStorage.setItem('sightline-save-as-you-go', '1'); render();"); await wait(20);
    [...d.querySelectorAll("#editstrip button")].find(b=>b.textContent === "Turn off").click(); await wait(20);
    ok("O1: turning it off goes back to Start editing", ev("editable()") === false && !!ev("document.querySelector('#editstrip [data-act=\"Start editing\"]')")); });

  // The automatic file check runs every 15 seconds: a quick one must not flash "working…" or rewrite the header's status line.
  await sec(async ()=>{ const {d, w, ev} = await page(); await ev("startEditing(false)"); await wait(1200);
    const strip = d.querySelector("#editstrip"), first = strip.firstChild, seen = [];
    new w.MutationObserver(()=>seen.push(d.querySelector("#status").textContent)).observe(d.querySelector("#status"), {childList:true, characterData:true, subtree:true});
    await ev("refresh(false)"); await wait(50);
    ok("B1: a quick file check leaves the status line alone", seen.length === 0, JSON.stringify(seen));
    ok("B1: …and doesn't rebuild the edit strip", strip.firstChild === first && !/working/.test(strip.textContent));
    ev("stripKey = ''; statusAt = 0; renderEditStrip(); file.dirty = true; renderEditStrip()"); await wait(20);
    const st = d.querySelector("#status").textContent;
    ok("B2: the status line says the editing state, without the file-check details", /You're editing/.test(st) && !/·\s*·/.test(st) && !/local file checked|cloud sync|Check automatically/.test(st), st);
    ev("op.busy = true; op.busySince = Date.now() - 1000; renderEditStrip()"); await wait(20);
    ok("B3: an operation that takes a while still shows working…", /working/.test(strip.textContent));
    ev("op.busy = false; renderEditStrip()"); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
