// Put back once, never in a loop. After a quick save the page reads the file again; a change a same-moment save overwrote
// is put back. When something keeps restoring an older file (another open copy, a sync tool), putting it back again would
// fight it forever, save after save. The page puts it back once, then stops, keeps a copy and says what to check.
// Synthetic plan: fixtures/sample-plan.json.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const plan = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
// A file that, like a sync tool restoring an older version, puts back `restore` shortly after each write (up to `times`).
function makeHandle(name, text){ const h = {name, _text:text, writes:0, restore:null, times:0,
  async getFile(){ const t = h._text; return {size:t.length, lastModified:Date.now(), text:async()=>t}; },
  async createWritable(){ let b = ""; return {write:async x=>{ b += x; }, close:async()=>{ h._text = b; h.writes++;
    if (h.restore && h.times > 0){ h.times--; const old = h.restore; setTimeout(()=>{ h._text = old; }, 150); } }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; }}; return h; }
const boot = () => new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert = ()=>{};
  w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
  w.Element.prototype.scrollIntoView = function(){}; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
async function run(setup){
  const dom = boot(), w = dom.window, d = w.document, ev = s=>w.eval(s);
  await wait(150); ev("askWhoOnStart = ()=>{}; window._dl = []; download = (t, n) => { _dl.push({n, t}); }");
  w.FIX = setup ? setup(plan) : plan; const hd = makeHandle("sample-plan.json", w.FIX); w.__h = hd;
  await ev("adopt(__h, true)"); await wait(40);
  const id = ev("S.bars[0].id");
  hd.restore = hd._text; return {w, d, ev, hd, id, J:s=>JSON.parse(ev(`JSON.stringify(${s})`))};
}
const nameIn = (t, id) => JSON.parse(t).bars.find(b=>b.id === id).chartName;
(async()=>{
  try {
    // A sync tool restores the older file after every write.
    const A = await run(); A.hd.times = 99;
    await A.ev(`quickSave("chart name", s=>{ s.bars.find(b=>b.id === ${JSON.stringify(A.id)}).chartName = "Renamed by me"; })`);
    ok("L0 setup: the first save wrote the change", A.hd.writes === 1);
    await wait(5600);
    ok("L1 the file keeps changing back: the change is put back once, never in a loop", A.hd.writes === 2, `writes ${A.hd.writes}`);
    const banner = A.d.querySelector("#banners") ? A.d.querySelector("#banners").textContent : "";
    ok("L2 …then it stops and says so, with what to check", /Your update \(chart name\) didn't stay saved/.test(banner) && /stopped trying/.test(banner) && /another open copy of this plan/.test(banner) && /OneDrive/.test(banner), banner.slice(0, 200));
    ok("L2 …and the status line says it isn't saved", /Not saved: your update \(chart name\) keeps being overwritten/.test(A.d.querySelector("#status").textContent), A.d.querySelector("#status").textContent);
    const mine = A.J("_dl").filter(x=>/mine/.test(x.n));
    ok("L3 …keeping a copy of my version", mine.length === 1 && nameIn(mine[0].t, A.id) === "Renamed by me", A.J("_dl.map(x=>x.n)").join(", "));
    const dis = A.d.querySelector("#putBackDismiss"); if (dis) dis.click();
    ok("L4 the notice can be dismissed", !/didn't stay saved/.test(A.d.querySelector("#banners").textContent));
    await wait(3200);
    ok("L5 and nothing more is written afterward", A.hd.writes === 2, `writes ${A.hd.writes}`);
    ok("L6 no page errors", !A.w.errs.length, A.w.errs.join(" | "));

    // One same-moment overwrite: still put back, and it stays.
    const B = await run(); B.hd.times = 1;
    await B.ev(`quickSave("chart name", s=>{ s.bars.find(b=>b.id === ${JSON.stringify(B.id)}).chartName = "Renamed by me"; })`);
    await wait(3600);
    ok("P1 a single overwrite is still put back, and stays", B.hd.writes === 2 && nameIn(B.hd._text, B.id) === "Renamed by me", `writes ${B.hd.writes}`);
    ok("P1 …with no warning and no backup", !/didn't stay saved/.test(B.d.querySelector("#banners").textContent) && !B.J("_dl").length && /Put back your update \(chart name\)/.test(B.d.querySelector("#status").textContent), B.d.querySelector("#status").textContent);

    // No other writer, but the change doesn't read back the same (here, a field the plan doesn't keep): nothing overwrote
    // it, so there is nothing to put back.
    const D = await run(); D.hd.times = 0;
    await D.ev(`quickSave("an unknown field", s=>{ s.bars.find(b=>b.id === ${JSON.stringify(D.id)}).notAField = "x"; })`);
    const w0 = D.hd.writes; await wait(5600);
    ok("D1 a change that doesn't read back the same, with nobody else writing, is never saved again", D.hd.writes === w0, `writes ${w0} then ${D.hd.writes}`);
    ok("D1 …and raises no warning", !/didn't stay saved/.test(D.d.querySelector("#banners").textContent) && !D.J("_dl").length);

    // The file says who saved it last: name them.
    const C = await run(p=>{ const o = JSON.parse(p); o.people = [...(o.people || []), {id:"person-sky", name:"Sky", initials:"SK", color:"#336699"}];
      o.changes = [...(o.changes || []), {id:"chg-sky", by:"person-sky", at:"2026-10-25T10:00:00Z", what:"a status", ops:[]}]; return JSON.stringify(o); });
    C.hd.times = 99;
    await C.ev(`quickSave("chart name", s=>{ s.bars.find(b=>b.id === ${JSON.stringify(C.id)}).chartName = "Renamed by me"; })`);
    await wait(5600);
    ok("N1 when the file names who saved it last, the notice names them", /last save was by Sky/.test(C.d.querySelector("#banners").textContent) && C.hd.writes === 2, C.d.querySelector("#banners").textContent.slice(0, 200));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
