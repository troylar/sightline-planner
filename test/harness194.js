// A rewritten amendments file reaches an open page (issue 169): typing in a field that has nothing to do with the change
// doesn't stop the page reading it again and reporting it in the results file. Only the redraw waits, to the next poll
// after focus leaves the field (never on the leaving click), and any other redraw clears it. Editing that change in
// Sightline (its editor or its Jira placement), or dragging, still holds the read. Fixture: fixtures/batch-plan.js on the
// sample plan.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), batch = require("./fixtures/batch-plan.js"), {act} = batch;
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function fileHandle(name, text = ""){ const hd = {name, text, writes:0, failWrite:false, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFile(){ return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
  async createWritable(){ if (hd.failWrite) throw new Error("The disk is full"); let dr = ""; return {async write(v){ dr = v; }, async abort(){}, async close(){ hd.text = dr; hd.writes++; }}; }}; return hd; }
function folder(){ const dir = {name:"Assistant", files:new Map(), onGet:null, async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; },
  async getFileHandle(name, o = {}){ if (dir.onGet) await dir.onGet(name, o); if (!dir.files.has(name)){ if (!o.create){ const e = new Error("Missing"); e.name = "NotFoundError"; throw e; } dir.files.set(name, fileHandle(name)); } return dir.files.get(name); }}; return dir; }
async function page(){
  const hd = fileHandle("plan.json"), dir = folder();
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{}; w.showDirectoryPicker = async()=>dir;
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){};
    w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = sample; w.HD = hd;
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); HD.text = serialize(S, HD.name); installPlan(S, HD.text, HD); amTried = S.meta.planId;
    whoAmI = (x, cb)=>cb(); askWhoOnStart = ()=>{}; askName = ()=>'Tester'; download = ()=>{}; render(); setMe(S.people[0].id);
    window.remembered = new Map(); kvSet = async(k, v)=>{ remembered.set(k, v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };`);
  await ev("assistantConnect()"); await wait(30);
  const send = (o = {}) => dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", batch(ev("S.meta.planId"), ev("S.meta.revision || 0"), ev("barById('m4').label"), o)));
  const tick = async()=>{ await ev("assistantTick()"); await wait(40); };
  const exportNow = async()=>{ ev("clearTimeout(assistantExportTimer)"); await ev("assistantExport()"); };
  const rows = () => JSON.parse(ev("JSON.stringify(amRows().map(r=>({id:r.c.id, group:r.group, status:r.r.status, after:r.after, needs:r.needs, why:r.r.reasons.join(' ')})))"));
  const show = async()=>{ ev("sel = {type:'amend', id:'x'}; render()"); await wait(5); };
  const results = () => JSON.parse(dir.files.get("sightline-assistant-results.json").text), context = () => JSON.parse(dir.files.get("sightline-assistant-view.json").text);
  return {w, ev, d, hd, dir, send, tick, rows, show, exportNow, results, context};
}


(async()=>{
  try {
    const {w, ev, d, dir, tick, results, exportNow} = await page();
    const P = () => [ev("S.meta.planId"), ev("S.meta.revision || 0"), ev("barById('m4').label")];
    const bad = [{id:"c1", summary:"A decision about a task nobody added", ops:[act("decision.add", {id:"dec-h", text:"Pick the adapter", item:"zz-nowhere"})]}];
    const good = [{id:"c1", summary:"A decision about the adapter work", ops:[act("decision.add", {id:"dec-h", text:"Pick the adapter", item:"m2"})]}];
    const put = changes => { const f = dir.files.get("sightline-amendments.json"); const t = batch(...P(), {changes, batchId:"batch-same"});
      if (f && f.getFile) f.text = t; else dir.files.set("sightline-amendments.json", fileHandle("sightline-amendments.json", t)); };
    let pollFn = null; const realSI = w.setInterval; w.setInterval = (fn, ms) => { pollFn = fn; return 0; }; ev("amPoll()"); w.setInterval = realSI;
    const poll = async()=>{ pollFn(); await wait(80); };
    ev("window.h194renders = 0; const h194r = render; render = function(){ h194renders++; return h194r.apply(this, arguments); }");
    const renders = () => ev("h194renders"), zero = () => ev("h194renders = 0");
    put(bad); ev("assistantTick()"); await wait(80); await exportNow();
    const st = () => JSON.parse(ev("JSON.stringify(AM && AM.file ? AM.file.changes.map(c=>amCheck(c, S).status) : null)"));
    ok("R1 the first file is read: its one change is invalid", JSON.stringify(st()) === '["invalid"]', JSON.stringify(st()));
    // Focus a text field elsewhere on the page and type into it.
    const box = d.createElement("input"); box.type = "text"; box.id = "h194box"; d.body.append(box); box.focus(); box.value = "half a word";
    ok("R2 (setup) a text field has focus", d.activeElement === box && ev("assistantInteractionBusy()") === true);
    zero(); put(good); await ev("assistantTick()"); await wait(80); await exportNow();
    ok("R3 the rewrite under the same batchId is read while the field has focus", JSON.stringify(st()) === '["ready"]', JSON.stringify(st()));
    const res = results(), ch = (res.changes || []).find(c=>c.id === "c1") || {};
    ok("R4 …and the results file reports the corrected change, not the old one", ch.status && ch.status !== "invalid", JSON.stringify(ch).slice(0, 300));
    ok("R5 …without a redraw: no render ran, and the field keeps focus and what was typed", renders() === 0 && d.activeElement === box && box.value === "half a word" && d.body.contains(box), "renders " + renders());
    const btn = d.createElement("button"); btn.id = "h194btn"; (d.getElementById("side") || d.body).append(btn);
    box.blur(); btn.focus(); await wait(30);
    ok("R6 leaving the field doesn't redraw at once, so the click that left it still lands on its button", renders() === 0 && d.body.contains(btn) && ev("AM.drawLater") === true, "renders " + renders());
    btn.blur(); await poll();
    ok("R6b …the next poll redraws exactly once with the new file", renders() === 1 && ev("AM.drawLater") === false, "renders " + renders());
    await poll();
    ok("R6c …and the poll after that doesn't redraw again", renders() === 1, "renders " + renders());
    // Any other redraw clears the pending one.
    box.focus(); put(bad); await ev("assistantTick()"); await wait(80); box.blur();
    ok("R6d (setup) another rewrite while typing leaves a redraw pending", ev("AM.drawLater") === true && JSON.stringify(st()) === '["invalid"]');
    zero(); ev("render()"); await poll();
    ok("R6e a redraw for some other reason clears it: the poll adds none", renders() === 1 && ev("AM.drawLater") === false, "renders " + renders());
    put(good); await ev("assistantTick()"); await wait(80);
    // Editing that change in Sightline still holds the read.
    ev("UI.amEditing = 'c1'; sel = {type:'amend', id:'c1'}"); const ed = d.createElement("div"); ed.id = "amEdit-c1"; d.body.append(ed);
    put(bad); await ev("assistantTick()"); await wait(80);
    ok("R7 while that change is being edited, a rewrite waits", JSON.stringify(st()) === '["ready"]', JSON.stringify(st()));
    ed.remove(); ev("UI.amEditing = null; sel = null"); await ev("assistantTick()"); await wait(80);
    ok("R8 …and is read once the edit is done", JSON.stringify(st()) === '["invalid"]', JSON.stringify(st()));
    // Choosing where a Jira issue goes (its own editor, no amEdit- element) holds the read too.
    ev("UI.amEditing = 'c1'; sel = {type:'amend', id:'c1'}"); const jd = d.createElement("select"); jd.id = "amjd-c1"; d.body.append(jd);
    put(good); await ev("assistantTick()"); await wait(80);
    ok("R8b while a Jira placement is being chosen, a rewrite waits", JSON.stringify(st()) === '["invalid"]', JSON.stringify(st()));
    jd.remove(); ev("UI.amEditing = null; sel = null"); await ev("assistantTick()"); await wait(80);
    ok("R8c …and is read once it's chosen", JSON.stringify(st()) === '["ready"]', JSON.stringify(st()));
    ok("R9 the guide says a rewrite under the same batchId is picked up", /reads it again when its contents change, even under the same batchId/.test(ev("String(assistantView().guide)")));
    ok("R10 no script errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const n = R.length, f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
