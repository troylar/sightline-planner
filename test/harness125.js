// An assistant's batch applies in order (docs/assistant-workflow.md, "Batches apply in order"): the panel checks each
// change after the ones before it, a change an earlier one enables says which, Apply ready stops at the first change that
// can't apply and says what happened, holds pass to what a held change enables, the results file describes the plan in
// this browser, prev given as a date works for milestone.move, a stretch date can be cleared, the page puts matching
// tools in the assistant folder, and the start-up failure screen mentions synced folders. Fixture: fixtures/batch-plan.js.
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
const byId = (rs, id) => rs.find(r=>r.id === id) || {};
(async()=>{
  try {
    // ---- the panel checks a batch in order ----
    let P = await page(); let {w, ev, d, hd, dir, send, tick, rows, show, exportNow, results} = P;
    send(); await tick(); await show();
    let rs = rows();
    ok("B1 change 1 is ready on its own", byId(rs, "c1").group === "ready" && byId(rs, "c1").after === null);
    ok("B1 change 2, which links to 1's task, is ready after change 1, never red", byId(rs, "c2").group === "ready" && byId(rs, "c2").after === 0, JSON.stringify(byId(rs, "c2")));
    ok("B1 change 6, which needs 1 and 2, is ready after change 2", byId(rs, "c6").group === "ready" && byId(rs, "c6").after === 1, JSON.stringify(byId(rs, "c6")));
    ok("B1 change 3, a value already there with a stale prev, is already in the plan", byId(rs, "c3").group === "completed" && byId(rs, "c3").status === "done");
    ok("B1 change 4, blocked by the plan itself, needs attention with its real reason", byId(rs, "c4").group === "attention" && /isn't in the plan/.test(byId(rs, "c4").why));
    ok("B1 change 5, independent of 4, is ready", byId(rs, "c5").group === "ready" && byId(rs, "c5").after === null);
    const row = id => d.querySelector(`[data-am="${id}"]`);
    ok("B2 the panel says which change each one follows, by number and summary", /Ready after change 1: Add the adapter task/.test(row("c2")?.textContent || "") && /Ready after change 2: Add the review task after it/.test(row("c6")?.textContent || ""));
    ok("B2 …with no Apply of its own, and not shown red", !row("c2").querySelector("[data-amapply]") && !row("c2").classList.contains("am-invalid") && !row("c2").querySelector(".amwhy"));
    ok("B2 Apply ready says it applies in order and stops at change 4, and why", d.querySelector("#amApplyAll")?.textContent === "Apply 2 ready as one update" && /stops at change 4: op 1: .*isn't in the plan/.test(d.querySelector("#amRunStop")?.textContent || ""), d.querySelector("#amApplyAll")?.textContent);
    ok("B2 change 5 is shown ready, waiting behind 4 for Apply ready", !!row("c5").querySelector("[data-amapply]") && /stops at change 4 first/.test(row("c5").querySelector("[data-amlater]")?.textContent || ""));
    ok("B2 unchanged polls reuse the check", ev("amRows() === amRows()") && (await tick(), ev("(()=>{ const a = amRows(); return a === amRows(); })()")));

    // ---- Apply ready ----
    const undo0 = ev("past.length + quickDone.length"), m4 = ev("barById('m4').label");
    d.querySelector("#amApplyAll").click(); await wait(80);
    ok("B3 Apply ready applies changes 1 and 2 in order", !!ev("taskById('task-ba-1')") && !!ev("taskById('task-ba-2')") && J(ev, "taskById('task-ba-2').t.dependsOn").includes("task-ba-1"));
    ok("B3 …stops at 4: nothing after it lands ahead of it", !ev("taskById('task-ba-3')") && ev("barById('m4').label") === m4);
    ok("B3 …as one update with one undo", ev("past.length + quickDone.length") === undo0 + 1);
    const said = ev("document.querySelector('#status').textContent");
    ok("B3 it says what applied, what was already there, what waits and why, and that it's saved", /^Applied changes 1 and 2; change 3 was already in the plan; change 4 waits: op 1: .*isn't in the plan\. Saved\./.test(said), said);
    ok("B3 already-there work isn't counted as applied", !/changes 1, 2 and 3/.test(said) && ev(`amReceipt('batch-ba', AM.file.changes[2])`) === "already");
    ok("B3 the quick update was saved to the shared file", JSON.parse(hd.text).bars.find(b=>b.id === "m2").tasks.some(t=>t.id === "task-ba-2"));
    await exportNow(); let res = results();
    ok("B4 the results file carries the same summary", res.lastApply && res.lastApply.summary === said.replace(/ \(via.*$/, "") && res.lastApply.saved === "saved" && res.planState === "saved");
    ok("B4 …and each change's outcome: applied, already in the plan, waiting", ["c1","c2"].every(id=>byId(res.changes, id).outcome === "applied") && byId(res.changes, "c3").outcome === "already-in-plan" && byId(res.changes, "c4").outcome === "waiting" && byId(res.changes, "c5").outcome === "waiting");
    rs = rows(); ok("B4 change 6 is now plainly ready", byId(rs, "c6").group === "ready" && byId(rs, "c6").after === null);
    ev("undo()"); await wait(40); rs = rows();
    ok("B5 undo takes all of it back, and 2 and 6 are ready after again", !ev("taskById('task-ba-1')") && !ev("taskById('task-ba-2')") && byId(rs, "c2").after === 0 && byId(rs, "c6").after === 1);

    // ---- skipping ----
    await show(); row("c1").querySelector("[data-amskip]").click(); await wait(10); rs = rows();
    ok("B6 skipping change 1 makes 2 and 6 say they need it", byId(rs, "c2").needs === 0 && byId(rs, "c6").needs === 0 && byId(rs, "c2").group === "attention", JSON.stringify([byId(rs, "c2"), byId(rs, "c6")]));
    ok("B6 …in words, with Reopen", /Needs change 1, which you skipped/.test(row("c2").textContent) && !!row("c6").querySelector('[data-amreopen="c1"]'));
    ok("B6 Apply ready now stops at once, at change 2", !d.querySelector("#amApplyAll"));
    await exportNow(); res = results();
    ok("B6 the results file says what it needs", byId(res.changes, "c2").needsSkipped === "c1" && byId(res.changes, "c2").status === "invalid");
    row("c6").querySelector('[data-amreopen="c1"]').click(); await wait(10); rs = rows();
    ok("B6 Reopen brings them back", byId(rs, "c1").group === "ready" && byId(rs, "c2").after === 0 && byId(rs, "c6").after === 1);

    // ---- editing mode, and the stale-red regression ----
    await ev("startEditing(false)"); await wait(30); await show();
    row("c1").querySelector("[data-amapply]").click(); await wait(60);
    ok("S1 applying change 1 while editing says it isn't saved", /Not saved yet: you're editing\./.test(ev("document.querySelector('#status').textContent")) && ev("file.dirty") === true);
    rs = rows(); ok("S1 change 2 is ready right away", byId(rs, "c2").group === "ready" && byId(rs, "c2").after === null);
    await exportNow(); res = results();
    ok("S1 the results file shows 1 applied and 2 ready, not red, and says it isn't saved", byId(res.changes, "c1").outcome === "applied" && byId(res.changes, "c2").status === "ready" && res.planState === "unsaved-edits" && res.lastApply.saved === "editing",
      JSON.stringify([byId(res.changes, "c1").outcome, byId(res.changes, "c2").status, res.planState]));
    await tick(); rs = rows(); ok("S1 …and stays so after the next read of the folder", byId(rs, "c2").group === "ready");
    ev("JIRA = {kind:'sightline-jira-status', version:1, generatedAt:'2026-10-07T08:00:00Z', sprints:[], releases:[], rollups:{}, issues:{}}; dropJiraMemos(); render()");
    rs = rows(); ok("S2 a Jira refresh keeps it right", byId(rs, "c2").group === "ready" && byId(rs, "c1").group === "completed");
    ev("undo()"); await wait(30); rs = rows(); ok("S2 so does undo", byId(rs, "c1").group === "ready" && byId(rs, "c2").after === 0);
    const C = batch.changes(); C[1] = {...C[1], ops:[act("task.add", {id:"task-ba-2", bar:"m2", start:"2026-10-07", days:1, label:"Review the adapter"}), act("task.link", {id:"task-ba-2", after:"task-other"})]};
    send({changes:C}); await tick(); rs = rows();
    ok("S2 a rewritten change with the same id is checked as rewritten", byId(rs, "c2").group === "attention" && /isn't in the plan/.test(byId(rs, "c2").why));
    ok("S2 no page errors", !w.errs.length, w.errs.join(" | "));

    // ---- holds ----
    P = await page(); ({w, ev, d, hd, dir, send, tick, rows, show, exportNow, results} = P);
    const H = () => [{id:"h1", summary:"Add a task, retire a gate", ops:[act("task.add", {id:"task-h1", bar:"m5", start:"2026-10-05", label:"Held task"}), act("gate.del", {id:"gate-7"})]},
      {id:"h2", summary:"Add one after it", ops:[act("task.add", {id:"task-h2", bar:"m5", start:"2026-10-07", label:"After the held task"}), act("task.link", {id:"task-h2", after:"task-h1"})]},
      {id:"h3", summary:"Rename", ops:[act("initiative.set", {id:"m4", field:"label", value:"Renamed on its own"})]}];
    send({changes:H(), batchId:"batch-h"}); await tick(); await exportNow(); res = results();
    ok("H1 at review level nothing applies, and each ready change, enabled or not, waits for review", !ev("taskById('task-h1')") && ["h1","h2","h3"].every(id=>byId(res.changes, id).held && byId(res.changes, id).held.code === "review"));
    ev("amSetLevel('routine')"); await tick(); await exportNow(); res = results();
    ok("H2 at routine level, a change with a delete waits for review", !ev("taskById('task-h1')") && byId(res.changes, "h1").held && /deletes something/.test(byId(res.changes, "h1").held.reason));
    ok("H2 …and what it enables waits with it, saying why", !ev("taskById('task-h2')") && byId(res.changes, "h2").readyAfter === "h1" && /needs change 1, which waits: It deletes something/.test(byId(res.changes, "h2").held?.reason || ""), JSON.stringify(byId(res.changes, "h2").held));
    ok("H2 …while an independent change applies on its own", ev("barById('m4').label") === "Renamed on its own");
    ev("amSetPaused(true)"); send({changes:H().slice(0, 2), batchId:"batch-h2"}); await tick(); await exportNow(); res = results();
    ok("H3 paused: what a change enables is held as paused too", ["h1","h2"].every(id=>(byId(res.changes, id).held || {}).code === "paused"));
    ev("amSetPaused(false); amSetLevel('all')");
    send({changes:H().slice(0, 2), batchId:"batch-h3", createdAt:new Date(Date.now() - 3 * 3600 * 1000).toISOString()}); await tick(); await exportNow(); res = results();
    ok("H4 expired: both held as expired, nothing applied", ["h1","h2"].every(id=>(byId(res.changes, id).held || {}).code === "expired") && !ev("taskById('task-h1')"));
    send({changes:H().slice(0, 2), batchId:"batch-h4", basedOn:ev("S.meta.revision || 0") - 1}); await tick(); await exportNow(); res = results();
    ok("H5 stale revision: both held, nothing applied", ["h1","h2"].every(id=>(byId(res.changes, id).held || {}).code === "stale_context") && !ev("taskById('task-h1')"));
    send({changes:H().slice(0, 2), batchId:"batch-h5"}); await tick();
    ok("H6 at all, a change and what it enables apply on their own, in order", !!ev("taskById('task-h1')") && J(ev, "taskById('task-h2').t.dependsOn").includes("task-h1") && !ev("S.gates.some(g=>g.id === 'gate-7')"));
    const big = H()[0]; big.ops = [act("task.add", {id:"task-h9", bar:"m5", start:"2026-10-05", label:"Nine"}), ...Array.from({length:12}, (_, i)=>act("initiative.set", {id:["m1","m2","m3","c1","c2","c3","c4","c5","c6","r1","r2","r3"][i], field:"label", value:"Size " + i}))];
    const after9 = {id:"h9b", summary:"After nine", ops:[act("task.add", {id:"task-h9b", bar:"m5", start:"2026-10-06", label:"After nine"}), act("task.link", {id:"task-h9b", after:"task-h9"})]};
    ev("amSetLevel('routine')"); send({changes:[{...big, id:"h9"}, after9, ...Array.from({length:4}, (_, k)=>({id:"hz" + k, summary:"More", ops:Array.from({length:10}, (_, i)=>act("initiative.set", {id:["u1","u2","u3","u4","u5","f1","f2","f3","p1","p2"][i], field:"label", value:`Z${k}-${i}`}))}))], batchId:"batch-h6"}); await tick(); await exportNow(); res = results();
    ok("H7 size is counted on the working copies: a big batch waits, enabled changes included", (byId(res.changes, "h9b").held || {}).code === "review" && /touches about/.test(byId(res.changes, "h9").held?.reason || ""), JSON.stringify(byId(res.changes, "h9b").held));

    // ---- already done, prev and clearing ----
    const run = (id, args) => J(ev, `runAction(clone(S), ${JSON.stringify(id)}, ${JSON.stringify(args)})`);
    ok("D1 a gate's blocks set from empty, re-sent with a stale prev, is already done", (()=>{ ev(`S.gates[0].blocks = ""`); const a = run("gate.set", {id:"gate-1", field:"blocks", value:"Auth exchange", prev:""});
      ev(`S.gates[0].blocks = "Auth exchange"`); const b = run("gate.set", {id:"gate-1", field:"blocks", value:"Auth exchange", prev:""}); return a.ok && !a.nochange && b.ok && b.nochange; })());
    ok("D1 …a different value with a stale prev is changed since", run("gate.set", {id:"gate-1", field:"blocks", value:"Other", prev:""}).code === "stale");
    ok("D1 …clearing one already clear is done, whatever prev says", (ev(`S.gates[0].blocks = ""`), run("gate.set", {id:"gate-1", field:"blocks", value:"", prev:"Old text"}).nochange === true));
    const iso = ev("amWeekIso(S, S.milestones.find(m=>m.id === 'ms1').at)");
    ok("D2 milestone.move takes prev as a date, as the context gives it", run("milestone.move", {id:"ms1", day:"2026-10-12", prev:iso}).ok === true, JSON.stringify(run("milestone.move", {id:"ms1", day:"2026-10-12", prev:iso})));
    ok("D2 …a wrong date is changed since, and the date it's already at is done", run("milestone.move", {id:"ms1", day:"2026-10-12", prev:"2026-09-01"}).code === "stale" && J(ev, `(()=>{ const p = clone(S); runAction(p, "milestone.move", {id:"ms1", day:"2026-10-12"}); return runAction(p, "milestone.move", {id:"ms1", day:"2026-10-12", prev:"2026-09-01"}); })()`).nochange === true);
    send({changes:[{id:"p1", summary:"Part done, part blocked", ops:[act("gate.set", {id:"gate-2", field:"blocks", value:ev("S.gates[1].blocks")}), act("task.link", {id:"task-h1", after:"task-nowhere"})]}], batchId:"batch-p"}); await tick(); rs = rows();
    ok("D3 a change with one operation done and one blocked needs attention, not done", byId(rs, "p1").group === "attention" && byId(rs, "p1").status === "invalid");
    ok("D4 clearing a stretch date: stretch true, day null", (()=>{ const p = J(ev, `(()=>{ const p = clone(S); runAction(p, "milestone.move", {id:"ms2", day:null, stretch:true}); return p.milestones.find(m=>m.id === "ms2"); })()`); return p.stretchAt === null && p.at === 1 * ev("S.milestones.find(m=>m.id === 'ms2').at"); })());
    ok("D4 …only a stretch date can be cleared", /Only a stretch date/.test(run("milestone.move", {id:"ms2", day:null}).reason || ""));
    ok("D4 …and clearing one already clear is done", run("milestone.move", {id:"ms1", day:null, stretch:true}).nochange === true);
    const feats = J(ev, "featuresIn(planOfRecord(S))");
    ev(`runAction(S, "milestone.move", {id:"ms2", day:null, stretch:true})`);
    ok("D5 none of this adds to the plan's format: a copy that opened it before still opens it", JSON.stringify(J(ev, "featuresIn(planOfRecord(S))")) === JSON.stringify(feats) && J(ev, "normalize(JSON.parse(JSON.stringify(planOfRecord(S))), false).milestones.find(m=>m.id === 'ms2').stretchAt") === null);

    // ---- tools in the folder ----
    const tools = J(ev, "BUNDLED_TOOLS"), distDir = path.dirname(DIST);
    ok("T1 the page carries both tools, stamped for its version", tools.files.length === 2 && tools.version === ev("APP_VERSION") && tools.files.every(f=>f.text.includes(`\nPAGE_VERSION = "${tools.version}"\n`)));
    ok("T1 …as the exact bytes of the built copies, with their hashes", tools.files.every(f=>{ const p = path.join(distDir, f.name); return !fs.existsSync(p) || fs.readFileSync(p).equals(Buffer.from(f.text, "utf8")); }) &&
      tools.files.every(f=>crypto.createHash("sha256").update(Buffer.from(f.text, "utf8")).digest("hex") === f.sha256));
    await show(); d.querySelector("#assistantFiles").open = true;
    ok("T2 the panel offers Put assistant tools in this folder, with the safety note", !!d.querySelector("#amToolsPut") && /never run a tool that holds a Jira token from a shared folder/.test(d.querySelector("#amToolsHelp").textContent) && /not that the page itself is genuine/.test(d.querySelector("#amToolsHelp").textContent));
    d.querySelector("#amToolsPut").click(); await wait(60);
    const names = ["sightline-app.py", "sightline-app.py.sha256", "sightline-jira-sync.py", "sightline-jira-sync.py.sha256"];
    ok("T2 one click puts both tools and their checksums in the folder", names.every(n=>dir.files.has(n)) && /Put 4 of 4 files/.test(d.querySelector("#amToolsMsg")?.textContent || ""), d.querySelector("#amToolsMsg")?.textContent);
    ok("T2 …byte for byte, with sha256sum-style checksums", tools.files.every(f=>dir.files.get(f.name).text === f.text && dir.files.get(f.name + ".sha256").text === `${f.sha256}  ${f.name}\n`));
    await exportNow(); let cx = P.context();
    ok("T3 the context names the tool version the page expects, and that the folder's copies match", cx.tools && cx.tools.expectedVersion === tools.version && cx.tools.files.every(f=>f.inFolder === "same"));
    d.querySelector("#amToolsPut").click(); await wait(40);
    ok("T3 putting them again says they already match", /already match/.test(d.querySelector("#amToolsMsg")?.textContent || ""));
    // a file Sightline doesn't recognize is kept; an older copy is replaced only when the person says so
    dir.files.get("sightline-app.py").text = "print('my own script')\n"; dir.files.delete("sightline-app.py.sha256");
    dir.files.get("sightline-jira-sync.py").text = tools.files[1].text.replace(`PAGE_VERSION = "${tools.version}"`, 'PAGE_VERSION = "1.100.0"');
    const appWrites = dir.files.get("sightline-app.py").writes;
    d.querySelector("#amToolsPut").click(); await wait(40);
    ok("T4 an older copy asks first, naming its version, and nothing is written yet", /sightline-jira-sync\.py \(Sightline 1\.100\.0\)/.test(d.querySelector("#amToolsConfirm")?.textContent || "") && dir.files.get("sightline-jira-sync.py").text.includes('"1.100.0"'));
    await exportNow(); cx = P.context();
    ok("T4 the context says the folder's copies are different, and which version", cx.tools.files.find(f=>f.name === "sightline-jira-sync.py").inFolder === "different" && cx.tools.files.find(f=>f.name === "sightline-jira-sync.py").folderVersion === "1.100.0" && cx.tools.files.find(f=>f.name === "sightline-app.py").inFolder === "different");
    d.querySelector("#amToolsReplace").click(); await wait(60);
    const msg = d.querySelector("#amToolsMsg")?.textContent || "";
    ok("T4 Replace them replaces the older copy", dir.files.get("sightline-jira-sync.py").text === tools.files[1].text);
    ok("T4 …keeps the file it doesn't recognize, and doesn't write a checksum for it", dir.files.get("sightline-app.py").text === "print('my own script')\n" && dir.files.get("sightline-app.py").writes === appWrites && !dir.files.has("sightline-app.py.sha256"));
    ok("T4 …and reports a partial install", /kept sightline-app\.py, sightline-app\.py\.sha256/.test(msg) && /Only part of the tools were installed/.test(msg), msg);
    dir.files.delete("sightline-app.py"); let n = 0; dir.onGet = async(name, o)=>{ if (name === "sightline-app.py" && !o.create && ++n === 2) dir.files.set("sightline-app.py", fileHandle("sightline-app.py", "print('arrived meanwhile')\n")); };
    d.querySelector("#amToolsPut").click(); await wait(60); dir.onGet = null;
    ok("T5 a file that appears between the check and the write is kept, and said", dir.files.get("sightline-app.py").text === "print('arrived meanwhile')\n" && /changed while installing/.test(d.querySelector("#amToolsMsg")?.textContent || ""), d.querySelector("#amToolsMsg")?.textContent);
    dir.files.delete("sightline-app.py"); dir.files.delete("sightline-app.py.sha256"); dir.onGet = async(name, o)=>{ if (name === "sightline-app.py.sha256" && o.create){ dir.files.set(name, Object.assign(fileHandle(name), {failWrite:true})); } };
    d.querySelector("#amToolsPut").click(); await wait(60); dir.onGet = null;
    ok("T5 a write that fails is reported, with what did land", dir.files.get("sightline-app.py").text === tools.files[0].text && /Put 1 of 4 files/.test(d.querySelector("#amToolsMsg")?.textContent || "") && /couldn't write sightline-app\.py\.sha256 \(The disk is full\)/.test(d.querySelector("#amToolsMsg")?.textContent || ""), d.querySelector("#amToolsMsg")?.textContent);
    ok("T6 no page errors", !w.errs.length, w.errs.join(" | "));

    // ---- the start-up failure screen ----
    const off = new JSDOM(html, {virtualConsole:new VirtualConsole()}), bf = off.window.document.querySelector("#bootfail");
    const ps = bf ? [...bf.querySelectorAll("p")].map(p=>p.textContent) : [];
    ok("F1 when the code is blocked, the first step is to wait for a synced folder", /^If this file is in OneDrive or another synced folder, wait for the sync to finish, then reload\./.test(ps[0] || ""), ps[0]);
    ok("F1 …and the checksum guidance stays", ps.some(t=>/sha256sum -c sightline\.html\.sha256/.test(t)) && ps.some(t=>/Content Security Policy/.test(t)));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
function J(ev, s){ return JSON.parse(ev(`JSON.stringify(${s})`)); }
