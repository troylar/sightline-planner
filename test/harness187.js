// History files, moving history out (vision.md, Moving history out never loses it): saves while editing copy entries older
// than 30 days to their quarter's file, and a later save takes them out of the plan file once a later read still shows them.
// Deletions and edits reach the files too, a missing file is named, and a file this copy can't fully read is never written.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
// An in-memory folder: files know which record they are (isSameEntry), and the folder asks for permission like a browser.
const QN = ["Jan to Mar", "Apr to Jun", "Jul to Sep", "Oct to Dec"], histQNameJS = q => { const m = /^(\d{4})-Q([1-4])$/.exec(q); return m ? `${QN[m[2] - 1]} ${m[1]}` : q; };
const FAKE = `window.mkDir = (name = "team") => { const kids = new Map(), perm = {state:"granted", onAsk:"granted", asked:0};
  const nf = n => { const e = new Error(n + " not found"); e.name = "NotFoundError"; return e; };
  const fileH = (n, rec) => ({kind:"file", name:n, rec, queryPermission: async () => "granted", requestPermission: async () => "granted", isSameEntry: async o => !!o && o.rec === rec, getFile: async () => ({size:new Blob([rec.text]).size, lastModified:rec.mod || 0, text: async () => rec.text}),
    createWritable: async () => { let buf = ""; return {write: async t => { buf += t; }, abort: async () => {}, close: async () => { rec.text = buf; rec.mod = Date.now(); }}; }});
  const dirH = (n, map) => ({kind:"directory", name:n, kids:map, perm,
    queryPermission: async () => perm.state, requestPermission: async () => { perm.asked++; perm.state = perm.onAsk; return perm.state; },
    values: async function*(){ if (window.slowList) await window.slowList; for (const [k, v] of map) yield v.dir ? {kind:"directory", name:k} : fileH(k, v); },
    getDirectoryHandle: async (k, o) => { let v = map.get(k); if (!v){ if (!(o && o.create)) throw nf(k); v = {dir:new Map()}; map.set(k, v); } if (!v.dir) throw new Error(k + " is a file"); return dirH(k, v.dir); },
    getFileHandle: async (k, o) => { let v = map.get(k); if (!v){ if (!(o && o.create)) throw nf(k); v = {text:""}; map.set(k, v); } if (v.dir) throw new Error(k + " is a folder"); return fileH(k, v); }});
  return dirH(name, kids); };
  window.putFile = (dir, planId, name, text) => { if (!dir.kids.get("history")) dir.kids.set("history", {dir:new Map()}); const h = dir.kids.get("history").dir; if (!h.get(planId)) h.set(planId, {dir:new Map()}); h.get(planId).dir.set(name, {text}); };
  window.quarter = (q, o) => JSON.stringify({sightlineHistory:1, planId:S.meta.planId, quarter:q, snapshots:[], reports:[], updates:[], changes:[], removed:{}, ...o}) + "\\n";`;
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const A = async s => { try { return await w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const txt = sel => { const el = d.querySelector(sel); return el ? el.textContent : ""; };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); stopHeartbeat(); window.KV = {}; kvGet = async k => window.KV[k]; kvSet = async (k, v) => { window.KV[k] = v; return true; }; kvDel = async k => { delete window.KV[k]; return true; };
      S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-move01"; file.handle = null; locked = false; resetHistory(); render();`); await wait(20);
    X(FAKE);
    X(`window.DL = []; download = (text, name) => DL.push({text, name}); window.DAY = 864e5; window.daysAgo = n => new Date(Date.now() - n * DAY).toISOString();
      window.TEAM = mkDir("Team plan"); TEAM.kids.set("plan.json", {text:"{}"}); TEAM.getFileHandle("plan.json").then(hd=>{ window.PH = hd; });
      window.BAR = S.bars.find(b=>!b.parent && !(b.tasks || []).length && !S.bars.some(c=>c.parent === b.id)).id;
      window.BAR2 = S.bars.find(b=>b.id !== BAR && !b.parent).id;
      window.HFILES = () => { const h = TEAM.kids.get("history"); const p = h && h.dir.get("p-move01"); return p ? [...p.dir.keys()].sort() : []; };
      window.HREAD = name => JSON.parse(TEAM.kids.get("history").dir.get("p-move01").dir.get(name).text);
      window.PLANFILE = () => JSON.parse(PH.rec.text);
      window.edit = n => commit(s=>{ s.meta.title = "Plan " + n; });
      window.later = () => { hist.wrote.forEach((t, q)=>hist.wrote.set(q, t - HIST_SETTLE - 1000)); const h = TEAM.kids.get("history"), p = h && h.dir.get("p-move01"); if (p) p.dir.forEach(r=>{ if (r.mod) r.mod -= HIST_SETTLE + 1000; }); };   // as if five minutes had passed since this page wrote
      window.showDirectoryPicker = async () => TEAM;
      window.prime = async (o = {}) => { S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-move01"; delete S.meta.histParts; delete S.meta.histGone;
        S.snapshots = [{...snapOf("Old one"), id:"s-old1", takenAt:daysAgo(60)}, {...snapOf("Old two"), id:"s-old2", takenAt:daysAgo(50)}, {...snapOf("Old but newest"), id:"s-new", takenAt:daysAgo(31)}];
        S.reports = [{id:"r-old", at:daysAgo(70), by:"", status:"ontrack", title:"Old update", sections:{}}, {id:"r-new", at:daysAgo(2), by:"", status:"ontrack", title:"New update", sections:{}}];
        S.updates = [{id:"u-1", item:"bar:" + BAR, at:daysAgo(80), by:"", text:"First"}, {id:"u-2", item:"bar:" + BAR, at:daysAgo(40), by:"", text:"Second"}, {id:"u-3", item:"bar:" + BAR, at:daysAgo(35), by:"", text:"Latest, though old"},
          {id:"u-4", item:"bar:" + BAR2, at:daysAgo(90), by:"", text:"Only update on another item"}];
        S = normalize(JSON.parse(serialize(S, "plan.json")), false); PH.rec.text = serialize(S, "plan.json"); file.handle = PH; file.baseText = PH.rec.text; file.baseHash = hashText(PH.rec.text); file.holdLock = o.lock !== false; file.dirty = false; locked = false; resetHistory();
        TEAM.kids.delete("history"); if (o.before) o.before(); KV["histDir:p-move01"] = TEAM; hist.plan = ""; DL.length = 0; await histRestore(); await hist.flushing; render(); };
      window.saveNow = async n => { edit(n); const r = await writeMine(PH, true); await hist.flushing; return r; };`);
    await wait(5);
    await A(`prime()`);
    const mv = X(`JSON.stringify(histMovable(S).map(([k, x])=>x.id).sort())`);
    ok("M1 entries older than 30 days may move, except each item's latest update and the newest snapshot and status update", mv === JSON.stringify(["r-old", "s-old1", "s-old2", "u-1", "u-2"]), mv);

    const r1 = await A(`saveNow(1)`); const dl1 = X(`JSON.stringify(DL.map(x=>[x.name, JSON.parse(x.text).snapshots.length]))`), st1 = X(`$("#status").textContent`), meta1 = X(`JSON.stringify(PLANFILE().meta.histParts)`);
    const files1 = X(`JSON.stringify(HFILES())`), q1 = X(`histQuarter(daysAgo(60))`);
    const inPlan1 = X(`JSON.stringify([PLANFILE().snapshots.map(x=>x.id).sort(), PLANFILE().updates.map(x=>x.id).sort()])`);
    const held = X(`(()=>{ const h = HFILES().map(HREAD); return JSON.stringify(["snapshots", "reports", "updates"].map(k=>h.flatMap(f=>f[k].map(x=>x.id)).sort())); })()`);
    ok("M2 a save while editing copies them to their quarter's history file, and the plan file still has every one", r1 === true && JSON.parse(files1).includes(q1 + ".json") && held === JSON.stringify([["s-old1", "s-old2"], ["r-old"], ["u-1", "u-2"]]) && inPlan1 === JSON.stringify([["s-new", "s-old1", "s-old2"], ["u-1", "u-2", "u-3", "u-4"]]), files1 + " " + held + " " + inPlan1);
    ok("M3 the history file written is exactly what the plan held, entry for entry", X(`(()=>{ const f = HREAD(histQuarter(daysAgo(60)) + ".json"), p = PLANFILE(); return jeq(f.snapshots.find(x=>x.id === "s-old1"), p.snapshots.find(x=>x.id === "s-old1")) && jeq(f.updates.find(x=>x.id === "u-1"), p.updates.find(x=>x.id === "u-1")); })()`) === true);
    X(`renderActivity()`);
    ok("M4 Activity says what the save copied and that it leaves the plan file later", /copied 5 entries to/.test(txt("#histMove")) && /leave the plan file at a later save/.test(txt("#histMove")), txt("#histMove"));

    await A(`saveNow(2)`);
    ok("M5 the next save, with no later read of the files, still keeps them in the plan file", X(`HFILES().length`) === 1 && X(`PLANFILE().snapshots.length`) === 3 && X(`PLANFILE().updates.length`) === 4 && X(`PLANFILE().meta.histParts[histQuarter(daysAgo(60))]`) === 1, X(`JSON.stringify(PLANFILE().meta)`).slice(0, 300));
    X(`later(); hist.readStart = 0;`); await A(`saveNow(3)`);   // this save reads the files again (late enough), and copies nothing new
    ok("M6 (setup) a later read of the files still shows them", X(`hist.raw.snapshots.has("s-old1") && hist.readStart > 0`) === true);
    const r4 = await A(`saveNow(4)`);
    const pf = X(`JSON.stringify([PLANFILE().snapshots.map(x=>x.id).sort(), PLANFILE().reports.map(x=>x.id), PLANFILE().updates.map(x=>x.id).sort(), PLANFILE().meta.histParts, PLANFILE().meta.features])`);
    ok("M7 then a save takes them out of the plan file, keeps what the plan draws from, and records the quarter's files", r4 === true && JSON.stringify(JSON.parse(pf).slice(0, 3)) === JSON.stringify([["s-new"], ["r-new"], ["u-3", "u-4"]]) && JSON.parse(pf)[3][X(`histQuarter(daysAgo(60))`)] === 1 && JSON.parse(pf)[4].includes("histFiles1"), pf);
    ok("M8 the save that first copies history names the quarter it starts in the plan file (so every copy knows), downloads the file as it was, and says older copies open it read-only; only once", JSON.parse(dl1).length === 1 && /backup-before-history-files/.test(JSON.parse(dl1)[0][0]) && /older than .* will open it read-only/.test(st1) && JSON.parse(meta1)[X(`histQuarter(daysAgo(60))`)] === 0 && X(`DL.length`) === 1, dl1 + " " + st1 + " " + meta1);
    X(`renderSnapshots()`); const sl = [...d.querySelectorAll("#snapTable tr[data-snap]")].map(r=>[r.dataset.snap, /history file/.test(r.textContent)]);
    X(`select("bar", BAR)`); await wait(5); const ul = [...d.querySelectorAll("[data-upd]")].map(li=>li.dataset.upd);
    ok("M9 everything moved is still listed, from the history file", JSON.stringify(sl) === JSON.stringify([["s-new", false], ["s-old2", true], ["s-old1", true]]) && JSON.stringify(ul) === JSON.stringify(["u-3", "u-2", "u-1"]), JSON.stringify([sl, ul]));
    X(`KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf("histFiles1"), 1)`); const older = X(`!!tooNew(normalize(PLANFILE(), false))`); X(`KNOWN_FEATURES.push("histFiles1")`);
    ok("M10 a copy of Sightline that doesn't know history files opens the plan read-only", older === true && X(`!!tooNew(normalize(PLANFILE(), false))`) === false);

    // Deleting a moved entry's twin: an entry in both the plan and a file is deleted here.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`);
    X(`commit(s=>{ s.updates = s.updates.filter(u=>u.id !== "u-2"); })`);
    const gone = X(`JSON.stringify(S.meta.histGone && S.meta.histGone["u-2"])`);
    X(`select("bar", BAR)`); await wait(5); const ul2 = [...d.querySelectorAll("[data-upd]")].map(li=>li.dataset.upd);
    ok("M11 deleting an entry a history file also holds remembers to remove it there, and it doesn't come back from the file", /"q":"\d{4}-Q[1-4]"/.test(gone) && !ul2.includes("u-2"), gone + " " + JSON.stringify(ul2));
    const r5 = await A(`(async()=>{ const r = await writeMine(PH, true); await hist.flushing; return r; })()`);
    const rmw = X(`(()=>{ const f = HREAD(histQuarter(daysAgo(40)) + ".json"); return !!f.removed["u-2"] && f.removed["u-2"].at === S.meta.histGone["u-2"].at; })()`);
    ok("M12 the save writes that removal to the history file", r5 === true && rmw === true, String(rmw));
    X(`later(); hist.readStart = 0;`); await A(`saveNow(5)`); await A(`saveNow(6)`);
    ok("M13 once a later read shows the removal, the plan forgets it", !X(`PLANFILE().meta.histGone`) && !X(`S.meta.histGone`) && X(`!!HREAD(histQuarter(daysAgo(40)) + ".json").removed["u-2"]`) === true, X(`JSON.stringify(PLANFILE().meta.histGone)`));
    X(`select("bar", BAR)`); await wait(5);
    ok("M14 and the deleted update stays deleted: gone from the history file too, with its removal kept there", ![...d.querySelectorAll("[data-upd]")].some(li=>li.dataset.upd === "u-2") && X(`(f=>!f.updates.some(u=>u.id === "u-2") && !!f.removed["u-2"])(HREAD(histQuarter(daysAgo(40)) + ".json"))`) === true);

    // An edit to an entry a file holds is written there too.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`);
    X(`commit(s=>{ const u = s.updates.find(x=>x.id === "u-1"); u.text = "First, edited"; u.edited = {by:"", at:new Date().toISOString()}; })`);
    await A(`(async()=>{ await writeMine(PH, true); await hist.flushing; })()`);
    ok("M15 editing an entry the history file holds writes the edit there", X(`HREAD(histQuarter(daysAgo(80)) + ".json").updates.find(x=>x.id === "u-1").text`) === "First, edited", X(`HREAD(histQuarter(daysAgo(80)) + ".json").updates.find(x=>x.id === "u-1").text`));

    // Undo a delete that was already written: the entry is back in the plan, shown, and stays there.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`);
    X(`commit(s=>{ s.snapshots = s.snapshots.filter(x=>x.id !== "s-old1"); })`); await A(`(async()=>{ await writeMine(PH, true); await hist.flushing; })()`);
    X(`undo()`); X(`later(); hist.readStart = 0;`); await A(`saveNow(7)`); await A(`saveNow(8)`);
    X(`renderSnapshots()`);
    ok("M16 undoing a delete after its removal was written brings it back, and it stays in the plan file instead of moving", X(`!!HREAD(histQuarter(daysAgo(60)) + ".json").removed["s-old1"]`) === true && X(`PLANFILE().snapshots.some(x=>x.id === "s-old1")`) === true && X(`PLANFILE().snapshots.some(x=>x.id === "s-old2")`) === false && !!d.querySelector('#snapTable tr[data-snap="s-old1"]'), X(`JSON.stringify(PLANFILE().snapshots.map(x=>x.id))`));

    // A quarter the plan says has a file, gone missing.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`); await A(`saveNow(3)`);
    X(`window.Q1 = histQuarter(daysAgo(60)); TEAM.kids.get("history").dir.get("p-move01").dir.delete(Q1 + ".json"); hist.readStart = 0;`);
    X(`S.snapshots.push({...snapOf("Another old"), id:"s-old3", takenAt:daysAgo(45)}); file.dirty = true;`); await A(`saveNow(9)`);
    X(`renderActivity(); renderSnapshots();`);
    ok("M17 a recorded quarter whose file is gone is named, not shown as empty", [...d.querySelectorAll("#histProblems li")].some(li=>new RegExp(histQNameJS(X(`Q1`)) + ": its history file wasn't found").test(li.textContent)) && /couldn't be read/.test(txt("#snapWs .histmiss")), [...d.querySelectorAll("#histProblems li")].map(li=>li.textContent).join(" | "));
    ok("M18 and it isn't started again: what would go there stays in the plan file, and the page says why", !X(`HFILES()`).includes(X(`Q1`) + ".json") && X(`PLANFILE().snapshots.some(x=>x.id === "s-old3")`) === true && /stays in the plan file/.test(txt("#histMoveProblems")), X(`JSON.stringify(HFILES())`) + " " + txt("#histMoveProblems"));

    // A missing last part.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`); await A(`saveNow(3)`);
    X(`commit(s=>{ s.meta.histParts = {...s.meta.histParts, [histQuarter(daysAgo(60))]:2}; }); hist.readStart = 0;`); await A(`saveNow(10)`); X(`renderActivity()`);
    ok("M19 a missing last part of a quarter is named by its file", [...d.querySelectorAll("#histProblems li")].some(li=>/\.2\.json wasn't found/.test(li.textContent)), [...d.querySelectorAll("#histProblems li")].map(li=>li.textContent).join(" | "));

    // A part this copy can't fully read blocks writes to it, says so, and nothing leaves the plan.
    X(`window.Q1 = histQuarter(daysAgo(60));`); await A(`prime({before:()=>putFile(TEAM, "p-move01", Q1 + ".json", quarter(Q1, {snapshots:[{id:"s-x", name:"odd", takenAt:"not a date"}]}))})`); X(`hist.readStart = 0;`);
    await A(`saveNow(1)`); X(`renderActivity()`);
    ok("M20 a part with entries this copy can't read is never written over: new entries go in a part of their own, and the part is named", X(`HFILES().includes(Q1 + ".json") && HFILES().includes(Q1 + ".2.json") && TEAM.kids.get("history").dir.get("p-move01").dir.get(Q1 + ".json").text.includes("not a date")`) === true && /can't read/.test(txt("#histProblems")), X(`JSON.stringify(HFILES())`) + " " + txt("#histProblems"));
    X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`); await A(`saveNow(3)`);
    ok("M21 and nothing from that quarter leaves the plan file while part of it can't be read", X(`HFILES().length`) === 2 && X(`PLANFILE().snapshots.length`) === 3, X(`PLANFILE().snapshots.length`));

    // A removal that loses to a teammate's later edit is shown as kept.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`);
    X(`commit(s=>{ s.updates = s.updates.filter(u=>u.id !== "u-1"); }); window.Q8 = histQuarter(daysAgo(80)); { const f = HREAD(Q8 + ".json"); f.updates.find(x=>x.id === "u-1").edited = {by:"", at:new Date(Date.now() + 3600e3).toISOString()}; putFile(TEAM, "p-move01", Q8 + ".json", JSON.stringify(f)); }`);
    await A(`(async()=>{ await writeMine(PH, true); await hist.flushing; })()`); X(`renderActivity()`);
    ok("M22 a removal that a teammate's later edit outlasts is said to be still shown", /1 entry you deleted is still shown/.test(txt("#histKept")), txt("#histKept"));

    // No lock, no move: quick updates never touch the history files.
    await A(`prime({lock:false})`);
    await A(`quickSave("an update", s=>{ s.updates.push({id:"u-q", item:"bar:" + BAR, at:new Date().toISOString(), by:"", text:"Quick"}); })`); await wait(20);
    const quickFiles = X(`HFILES().length`), quickOk = X(`PLANFILE().updates.some(u=>u.id === "u-q")`);
    X(`file.holdLock = true; file.baseText = PH.rec.text; S = normalize(PLANFILE(), false);`); await A(`saveNow(11)`);
    ok("M23 quick updates (no edit lock) don't move history; the next save while editing does", !quickFiles && quickOk === true && X(`HFILES().length`) === 1, JSON.stringify([quickFiles, quickOk, X(`HFILES()`)]));

    // Teammates' history bookkeeping merges key by key.
    const mp = X(`(()=>{ const base = normalize(JSON.parse(FIX), false); const mine = clone(base), theirs = clone(base);
      mine.meta.histGone = {"u-a":{q:"2026-Q1", by:"", at:"2026-10-01T00:00:00Z"}}; mine.meta.histParts = {"2026-Q1":1};
      theirs.meta.histGone = {"u-b":{q:"2026-Q2", by:"", at:"2026-10-02T00:00:00Z"}}; theirs.meta.histParts = {"2026-Q2":2};
      const m = mergePlans(base, mine, theirs).plan; return JSON.stringify([Object.keys(m.meta.histGone).sort(), m.meta.histParts]); })()`);
    ok("M24 two people's history bookkeeping both survive a merge", mp === JSON.stringify([["u-a", "u-b"], {"2026-Q1":1, "2026-Q2":2}]), mp);

    // Save as a new shared plan would leave the files behind.
    X(`S.meta.histParts = {"2026-Q1":1}; file.holdLock = false; window.showSaveFilePicker = async () => { window.picked = true; throw Object.assign(new Error("x"), {name:"AbortError"}); };`); await A(`newSharedPlan()`);
    ok("M25 Save as a new shared plan is refused while older history is in files beside the plan, and says to copy the folder", !X(`window.picked`) && /copy the plan's whole folder/.test(X(`$("#status").textContent`)), X(`$("#status").textContent`));
    // Undo after a save that moved history out.
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`saveNow(2)`); await A(`saveNow(3)`);
    X(`undo()`); const un = X(`JSON.stringify([S.snapshots.map(x=>x.id).sort(), !!(S.meta.histParts || {})[histQuarter(daysAgo(60))], S.meta.title])`);
    await A(`(async()=>{ await writeMine(PH, true); await hist.flushing; })()`);
    ok("M27 undo after a save that moved history out undoes the edit, but doesn't put the moved entries back or forget their quarter", un === JSON.stringify([["s-new"], true, "Plan 2"]) && X(`PLANFILE().snapshots.length`) === 1 && !!X(`PLANFILE().meta.histParts`), un);
    // Review round 1.
    await A(`prime()`); await A(`saveNow(1)`); X(`disconnectHistFolder(); commit(s=>{ s.updates = s.updates.filter(u=>u.id !== "u-2"); });`);
    ok("R1 deleting an old entry records its removal even on a copy without the folder connected, once the plan names its quarter", X(`!!(S.meta.histGone || {})["u-2"]`) === true && X(`histOn()`) === false, X(`JSON.stringify(S.meta.histGone)`));
    await A(`prime()`); await A(`saveNow(1)`); X(`commit(s=>{ s.snapshots = s.snapshots.filter(x=>x.id !== "s-old1"); hist.raw.snapshots.delete("s-old1"); hist.sent.clear(); });`);
    ok("R2 and on a copy whose last read of the files doesn't have the entry yet", X(`!!(S.meta.histGone || {})["s-old1"]`) === true);
    await A(`prime()`); await A(`saveNow(1)`);
    X(`window.QQ = histQuarter(daysAgo(80)); { const f = HREAD(QQ + ".json"); const u = f.updates.find(x=>x.id === "u-1"); f.updates = f.updates.filter(x=>x.id !== "u-1"); putFile(TEAM, "p-move01", QQ + ".json", JSON.stringify(f)); putFile(TEAM, "p-move01", QQ + "-LAPTOP.json", quarter(QQ, {updates:[u]})); }`);
    X(`later(); hist.readStart = 0;`); await A(`readHistory()`); const there = X(`histThere("updates", S.updates.find(x=>x.id === "u-1"))`); await A(`hist.flushing`);
    ok("R3 an entry that's only in a sync service's conflict copy doesn't count as there: it stays in the plan file and is copied to the quarter's own file again", there === false && X(`HREAD(QQ + ".json").updates.some(u=>u.id === "u-1")`) === true && X(`PLANFILE().updates.some(u=>u.id === "u-1")`) === true, JSON.stringify([there, X(`HREAD(QQ + ".json").updates.map(u=>u.id)`)]));
    // A plan too big to save still moves history out.
    await A(`prime()`); X(`window.realOver = overLimit; overLimit = (t, ...a) => JSON.parse(t).snapshots.length > 1 ? "Not saved: the plan is too big." : realOver(t, ...a);`);
    const big1 = await A(`saveNow(1)`); await A(`hist.flushing`); const bigMsg = X(`$("#status").textContent`), bigFiles = X(`HFILES().length`);
    X(`later(); hist.readStart = 0;`); await A(`readHistory()`); const big2 = await A(`saveNow(2)`); X(`overLimit = realOver;`);
    ok("R4 a plan too big to save copies its older history anyway, says so, and the next save takes it out and fits", big1 === false && /being copied to the history files/.test(bigMsg) && bigFiles === 1 && big2 === true && X(`PLANFILE().snapshots.length`) === 1 && X(`PLANFILE().meta.histParts[histQuarter(daysAgo(60))]`) === 1, JSON.stringify([big1, bigMsg, bigFiles, big2]));
    // Reopening the plan right after a write doesn't skip the wait: the files' own times count.
    await A(`prime()`); await A(`saveNow(1)`); X(`hist.plan = "";`); await A(`histRestore()`); await A(`saveNow(2)`); await A(`saveNow(3)`);
    ok("R5 reopening the plan seconds after its history was written still waits before anything leaves the plan file", X(`PLANFILE().snapshots.length`) === 3, X(`PLANFILE().snapshots.length`));
    await A(`prime()`); await A(`saveNow(1)`); X(`later(); hist.readStart = 0;`); await A(`readHistory()`); await A(`hist.flushing`); const clean6 = X(`planUnchanged()`); const plain = await A(`(async()=>{ const r = await writeMine(PH, true); await hist.flushing; return r; })()`);
    ok("R6 Save with no edits still takes out what the files hold", clean6 === true && plain === true && X(`PLANFILE().snapshots.length`) === 1, JSON.stringify([clean6, plain, X(`PLANFILE().snapshots.length`)]));
    const mx = X(`(()=>{ const base = normalize(JSON.parse(FIX), false); base.meta.histParts = {"2026-Q1":1}; const mine = clone(base), theirs = clone(base);
      mine.meta.histParts = {"2026-Q1":2}; theirs.meta.histParts = {"2026-Q1":3, "2026-Q2":1}; return JSON.stringify(mergePlans(base, mine, theirs).plan.meta.histParts); })()`);
    ok("R7 a quarter's part count merges to the larger, since parts only grow", mx === JSON.stringify({"2026-Q1":3, "2026-Q2":1}), mx);
    // Review round 2: the status update cap.
    await A(`prime()`); await A(`saveNow(1)`);
    X(`commit(s=>{ for (let i = 0; i < 25; i++) s.reports.push({id:"r-w" + i, at:daysAgo(3 + i), by:"", status:"ontrack", title:"Week " + i, sections:{}}); }); repPut({status:"ontrack", sections:{ontrack:"Fine"}});`);
    const n26 = X(`S.reports.length`); await A(`saveReport()`);
    ok("R8 saving a status update when 27 are in a plan that keeps history in files keeps them all, and records no removal", n26 === 27 && X(`S.reports.length`) === 28 && !X(`(S.meta.histGone || {})["r-old"]`), JSON.stringify([n26, X(`S.reports.length`), X(`JSON.stringify(S.meta.histGone)`)]));
    X(`commit(s=>{ for (let i = 25; i < 200; i++) s.reports.push({id:"r-w" + i, at:daysAgo(3 + i), by:"", status:"ontrack", title:"Week " + i, sections:{}}); }); repPut({status:"ontrack", sections:{ontrack:"Again"}});`); await A(`saveReport()`);
    ok("R9 past the plan's cap, the oldest are trimmed from the plan but never removed from the history files", X(`S.reports.length`) === 104 && X(`Object.keys(S.meta.histGone || {}).length`) === 0, JSON.stringify([X(`S.reports.length`), X(`JSON.stringify(S.meta.histGone)`)]));
    ok("M26 no page errors", !X(`errs.length`), X(`errs.join(" | ")`));
  } catch(e){ ok("harness completed", false, e.stack || e.message); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
