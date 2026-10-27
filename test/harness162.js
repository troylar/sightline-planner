// Only real changes change the file. Done editing with nothing changed hands the lock back and leaves the revision, the
// save time and the change log as they were; Save with nothing changed writes nothing; an edit undone back to the file's
// version counts as nothing; a quick update that changes nothing writes nothing. Real edits still save as before.
// The sample plan, opened through a fake file handle.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const plan = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
function makeHandle(name, text){ const h = {name, _text:text, writes:0,
  async getFile(){ const t = h._text; return {size:t.length, lastModified:Date.now(), text:async()=>t}; },
  async createWritable(){ let b = ""; return {write:async x=>{ b += x; }, close:async()=>{ h._text = b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; }}; return h; }
const handle = makeHandle("sample-plan.json", plan);
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester";
    w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.Element.prototype.scrollIntoView = ()=>{}; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), file = ()=>JSON.parse(handle._text), status = ()=>d.querySelector("#status")?.textContent || "";
  try {
    await wait(150); d.querySelector("#link").click(); await wait(150);
    const before = file(), w0 = handle.writes;
    ok("N0 the setup: the plan is open from its file, read-only", ev("S.bars.length") > 0 && ev("editable()") === false && w0 === 0);
    await ev("startEditing(false)"); await wait(50);
    ok("N0b Start editing writes only the lock (no new revision)", handle.writes === w0 + 1 && file().meta.lock?.id === ev("SESSION") && (file().meta.revision || 0) === (before.meta.revision || 0));
    await ev("doneEditing()"); await wait(50);
    const a = file();
    ok("N1 Done editing with nothing changed keeps the revision, the save time and the change log", a.meta.revision === before.meta.revision && a.meta.savedAt === before.meta.savedAt && JSON.stringify(a.changes || []) === JSON.stringify(before.changes || []), `rev ${a.meta.revision} was ${before.meta.revision}`);
    ok("N2 it hands the lock back, and says nothing needed saving", !a.meta.lock && ev("file.holdLock") === false && /^No changes to save\. Released sample-plan\.json/.test(status()), status());
    ok("N3 the file is exactly as it was before Start editing, byte for byte", handle._text === plan);
    await ev("startEditing(false)"); await wait(50); const w1 = handle.writes;
    await ev("save()"); await wait(50);
    ok("N4 Save with nothing changed writes nothing and keeps editing", handle.writes === w1 && ev("file.holdLock") === true && status() === "No changes to save.", status());
    const label = ev("S.bars[0].label");
    ev(`commit(s=>{ s.bars[0].label = "Changed"; })`); ev(`commit(s=>{ s.bars[0].label = ${JSON.stringify(label)}; })`);
    await ev("save()"); await wait(50);
    ok("N5 an edit changed back counts as nothing", handle.writes === w1 && (file().meta.revision || 0) === (before.meta.revision || 0));
    ev(`commit(s=>{ s.bars[0].label = "Changed for real"; })`); await ev("save()"); await wait(50);
    const r1 = file().meta.revision;
    ok("N6 a real edit still saves, with a new revision", handle.writes === w1 + 1 && file().bars[0].label === "Changed for real" && r1 === (before.meta.revision || 0) + 1, `rev ${r1}`);
    await ev("doneEditing()"); await wait(50);
    ok("N7 Done right after a save keeps that revision", file().meta.revision === r1 && !file().meta.lock && ev("file.holdLock") === false);
    const w2 = handle.writes;
    await ev(`quickSave("nothing", s=>{ s.bars[0].label = s.bars[0].label; })`); await wait(50);
    ok("N8 a quick update that changes nothing writes nothing", handle.writes === w2 && file().meta.revision === r1 && /^Nothing changed, so nothing was saved/.test(status()), status());
    await ev(`quickSave("renamed", s=>{ s.bars[0].label = "Quick rename"; })`); await wait(50);
    ok("N9 a real quick update still saves", handle.writes === w2 + 1 && file().bars[0].label === "Quick rename" && file().meta.revision === r1 + 1);
    // The file on disk no longer matches what was opened: Save never says "nothing to save" without checking it.
    await ev("startEditing(false)"); await wait(50); const good = handle._text;
    handle._text = good.slice(0, Math.floor(good.length / 2)); const w3 = handle.writes;
    await ev("save()"); await wait(50);
    ok("N10 a cut-off file on disk is not taken as saved: Save stops and shows the clash", handle.writes === w3 && !/No changes to save/.test(status()) && !!d.querySelector("#banners button") && /Overwrite with mine/.test(d.querySelector("#banners").textContent), status());
    [...d.querySelectorAll("#banners button")].find(b=>/Overwrite with mine/.test(b.textContent)).click(); await wait(80);
    ok("N11 and Overwrite with mine writes the plan back whole, though nothing was edited", handle.writes === w3 + 1 && (()=>{ try { return JSON.parse(handle._text).bars.length === ev("S.bars.length"); } catch(e){ return false; } })(), status());
    const w4 = handle.writes, real = handle.getFile; handle.getFile = async()=>{ const e = new Error("A requested file or directory could not be found."); e.name = "NotFoundError"; throw e; };
    await ev("save()"); await wait(50); handle.getFile = real;
    ok("N12 a missing file is never written or reported as nothing to save: it says the file is gone", handle.writes === w4 && !/No changes to save/.test(status()) && /moved, renamed or deleted/.test(d.querySelector("#banners").textContent), d.querySelector("#banners").textContent.slice(0, 120));
    ok("E1 no page errors", !JSON.parse(ev("JSON.stringify(errs)")).length, ev("errs.join('; ')"));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
