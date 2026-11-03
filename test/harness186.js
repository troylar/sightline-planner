// History files, read side (vision.md, The plan and its history): connecting the folder the plan is in, checking it really
// holds the open plan, and showing snapshots, status updates, item updates and Activity from the history files beside the
// plan's own. A quarter that can't be read is named wherever history is listed, never shown as empty.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
// An in-memory folder: files know which record they are (isSameEntry), and the folder asks for permission like a browser.
const FAKE = `window.mkDir = (name = "team") => { const kids = new Map(), perm = {state:"granted", onAsk:"granted", asked:0};
  const nf = n => { const e = new Error(n + " not found"); e.name = "NotFoundError"; return e; };
  const fileH = (n, rec) => ({kind:"file", name:n, rec, isSameEntry: async o => !!o && o.rec === rec, getFile: async () => ({size:new Blob([rec.text]).size, text: async () => rec.text}),
    createWritable: async () => { let buf = ""; return {write: async t => { buf += t; }, abort: async () => {}, close: async () => { rec.text = buf; }}; }});
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
      S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-hist02"; file.handle = null; locked = false; resetHistory(); render();`); await wait(20);
    X(FAKE);
    // The team folder holds the plan file; a second folder holds a different file with the same name.
    X(`window.TEAM = mkDir("Team plan"); TEAM.kids.set("plan.json", {text:"{}"}); window.OTHER = mkDir("Elsewhere"); OTHER.kids.set("plan.json", {text:"{}"});
      window.BAR = S.bars.find(b=>!b.parent && !(b.tasks || []).length && !S.bars.some(c=>c.parent === b.id)).id;
      S.snapshots = [{...snapOf("In the plan"), id:"s-plan", takenAt:"2026-10-20T10:00:00Z"}];
      S.reports = [{id:"r-plan", at:"2026-10-21T10:00:00Z", by:"", status:"ontrack", title:"Plan update", sections:{}}];
      S.updates = [{id:"u-plan", item:"bar:" + BAR, at:"2026-10-22T10:00:00Z", by:"", text:"Update kept in the plan"}];
      S.changes = [{id:"c-plan", at:"2026-10-23T10:00:00Z", by:"", what:"a change in the plan", ops:[]}];
      putFile(TEAM, S.meta.planId, "2026-Q1.json", quarter("2026-Q1", {snapshots:[{...snapOf("Q1 commit"), id:"s-old", takenAt:"2026-02-01T10:00:00Z"}],
        reports:[{id:"r-old", at:"2026-02-02T10:00:00Z", by:"", status:"atrisk", title:"Old update", sections:{}}],
        updates:[{id:"u-old", item:"bar:" + BAR, at:"2026-02-03T10:00:00Z", by:"", text:"Update from the history file"}, {id:"u-gone", item:"bar:" + BAR, at:"2026-02-04T10:00:00Z", by:"", text:"Removed update"}],
        changes:[{id:"c-old", at:"2026-02-05T10:00:00Z", by:"", what:"an old change", ops:[]}], removed:{"u-gone":{by:"", at:"2026-02-06T10:00:00Z"}}}));
      putFile(TEAM, S.meta.planId, "2026-Q2.json", "{not json");
      putFile(TEAM, S.meta.planId, "2026-Q3-LAPTOP.json", JSON.stringify({sightlineHistory:9, planId:S.meta.planId, quarter:"2026-Q3"}));
      window.PLANFILE = TEAM.getFileHandle("plan.json");`);
    X(`PLANFILE.then(hd=>{ window.PH = hd; })`); await wait(5);

    X(`file.handle = null; render(); renderActivity();`);
    ok("B1 with no shared plan file open, Activity offers no folder to connect", !d.querySelector("#histLine"));
    X(`file.handle = PH; window.showDirectoryPicker = async o => { window.pickOpts = o; return window.PICK; }; histRestore(); renderActivity();`); await wait(10);
    ok("B2 with the plan file open, Activity offers to connect the plan's folder", !!d.querySelector("#histConnect") && /kept in plan\.json/.test(txt("#histLine")), txt("#histLine"));

    X(`window.PICK = OTHER;`); await A(`connectHistFolder()`);
    ok("B3 a folder that doesn't hold the open plan file is refused, even with a file of the same name, and nothing is remembered", X(`hist.state`) === "off" && !X(`Object.keys(KV).length`) && /doesn't hold plan\.json/.test(txt("#status") || X(`$("#status") ? $("#status").textContent : ""`)), JSON.stringify([X(`hist.state`), X(`KV`)]));
    X(`window.PICK = TEAM;`); await A(`connectHistFolder()`); await wait(10);
    ok("B4 the folder the plan is in connects for reading and writing, and is remembered for this plan", X(`hist.state`) === "ready" && X(`pickOpts.mode`) === "readwrite" && X(`KV["histDir:p-hist02"] === TEAM`) === true, JSON.stringify([X(`hist.state`), X(`pickOpts`)]));

    X(`renderSnapshots()`);
    const snaps = [...d.querySelectorAll("#snapTable tr[data-snap]")].map(r=>[r.dataset.snap, !!r.querySelector("[data-snapdel]"), /history file/.test(r.textContent)]);
    ok("B5 Snapshots lists the history file's snapshot with the plan's, newest first; only the plan's own can be deleted here", JSON.stringify(snaps) === JSON.stringify([["s-plan", true, false], ["s-old", false, true]]), JSON.stringify(snaps));
    X(`renderReport()`);
    const reps = [...d.querySelectorAll("#repTable tr[data-rep]")].map(r=>r.dataset.rep);
    ok("B6 Status update lists saved updates from both, newest first", JSON.stringify(reps) === JSON.stringify(["r-plan", "r-old"]), JSON.stringify(reps));
    X(`UI.actBy = ""; renderActivity()`);
    const acts = [...d.querySelectorAll("#actList [data-change]")].map(r=>[r.dataset.change, !!r.querySelector("[data-undo]")]);
    ok("B7 Activity lists the history file's changes after the plan's, and says how many came from there; those can't be undone from here", JSON.stringify(acts.map(a=>a[0])) === JSON.stringify(["c-plan", "c-old"]) && acts[1][1] === false && /1 from the history files/.test(txt("#activityWs")), JSON.stringify(acts) + " " + txt("#activityWs").slice(0, 400));
    X(`select("bar", BAR)`); await wait(5);
    const ups = [...d.querySelectorAll("[data-upd]")].map(li=>[li.dataset.upd, !!li.querySelector("[data-uedit]"), !!li.querySelector("[data-udel]")]);
    ok("B8 an item's updates include the history file's, which can't be edited or deleted from here; a removed one stays out", JSON.stringify(ups) === JSON.stringify([["u-plan", true, true], ["u-old", false, false]]), JSON.stringify(ups));

    X(`renderActivity()`);
    const probs = [...d.querySelectorAll("#histProblems li")].map(li=>li.textContent);
    ok("B9 a quarter that can't be read is named with the reason in Activity, and the quarters that can are still read", probs.some(p=>/^2026-Q2: 2026-Q2\.json can't be used: it isn't valid JSON/.test(p)) && JSON.stringify(X(`hist.quarters`)) === JSON.stringify(["2026-Q1"]) && /1 quarter \(2026-Q1\)/.test(txt("#histRead")), JSON.stringify(probs) + txt("#histRead"));
    ok("B10 a file a newer copy wrote beside a quarter is named too, not silently left out", probs.some(p=>/^2026-Q3: 2026-Q3-LAPTOP\.json can't be used: a newer copy of Sightline wrote it/.test(p)), JSON.stringify(probs));
    X(`renderSnapshots(); renderReport();`);
    const notes = ["#snapWs", "#reportWs", "#activityWs"].map(s=>(d.querySelector(s + " .histmiss") || {}).textContent || "");
    X(`select("bar", BAR)`); await wait(5);
    const sideNote = (d.querySelector("[data-upd]") && d.querySelector("[data-upd]").closest(".field") || d).querySelector(".histmiss");
    ok("B11 Snapshots, Status update, Activity and an item's updates each say history from 2026-Q2 and 2026-Q3 may be missing", notes.every(t=>/couldn't be read \(2026-Q2, 2026-Q3\)/.test(t)) && !!sideNote && /2026-Q2, 2026-Q3/.test(sideNote.textContent), JSON.stringify(notes));

    X(`TEAM.kids.get("history").dir.get(S.meta.planId).dir.delete("2026-Q2.json");
      putFile(TEAM, S.meta.planId, "2026-Q4.json", quarter("2026-Q4", {updates:[{id:"u-plan", item:"bar:" + BAR, at:"2026-10-22T10:00:00Z", by:"", text:"A newer edit, from the history file", edited:{by:"", at:"2026-10-24T10:00:00Z"}}]}));`);
    d.querySelector("#histReload") ? (X(`renderActivity()`), d.querySelector("#histReload").click()) : null; await wait(20);
    X(`select("bar", BAR)`); await wait(5);
    const one = [...d.querySelectorAll("[data-upd]")].filter(li=>li.dataset.upd === "u-plan").map(li=>li.querySelector(".ut").textContent);
    ok("B12 Read again picks up new files; an entry in both the plan and a history file shows once, the newer edit", JSON.stringify(one) === JSON.stringify(["A newer edit, from the history file"]) && JSON.stringify(X(`hist.quarters`)) === JSON.stringify(["2026-Q1", "2026-Q4"]), JSON.stringify([one, X(`hist.quarters`)]));

    // Opening another plan: nothing from the first plan's folder is shown, and its own remembered folder is used.
    X(`window.P2 = mkDir("Second plan"); P2.kids.set("other.json", {text:"{}"}); P2.getFileHandle("other.json").then(hd=>{ window.PH2 = hd; });`); await wait(5);
    X(`S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-hist03"; file.handle = PH2; histRestore(); renderSnapshots(); renderActivity();`); await wait(10);
    ok("B13 another plan shows none of the first plan's history, and offers its own folder", !d.querySelector('#snapTable tr[data-snap="s-old"]') && !!d.querySelector("#histConnect") && X(`histList("snapshots").length`) === X(`(S.snapshots || []).length`), txt("#histLine"));

    // Back to the first plan in a new visit: the browser asks again before the folder is used.
    X(`TEAM.perm.state = "prompt"; TEAM.perm.onAsk = "granted"; hist.plan = ""; S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-hist02"; file.handle = PH; histRestore();`); await wait(10);
    X(`renderSnapshots(); renderActivity();`);
    ok("B14 a remembered folder waits for permission: history files aren't shown, and every list says so", X(`hist.state`) === "paused" && X(`histOn()`) === false && /aren't shown until you reconnect/.test(txt("#snapWs .histmiss")) && !!d.querySelector("#histReconnect") && X(`TEAM.perm.asked`) === 0, X(`hist.state`) + " " + txt("#snapWs .histmiss"));
    d.querySelector("#histReconnect").click(); await wait(20);
    ok("B15 one click on Reconnect asks once, checks the folder still holds the plan, and reads it", X(`TEAM.perm.asked`) === 1 && X(`hist.state`) === "ready" && X(`histOn()`) === true && X(`hist.quarters.length`) === 2, JSON.stringify([X(`TEAM.perm.asked`), X(`hist.state`)]));

    // The plan file moved out of the remembered folder.
    X(`TEAM.kids.delete("plan.json"); TEAM.kids.set("plan.json", {text:"{}"}); hist.plan = ""; histRestore();`); await wait(10);
    X(`renderActivity();`);
    ok("B16 a remembered folder that no longer holds the open plan file isn't read, and says so", X(`hist.state`) === "moved" && X(`histOn()`) === false && /no longer holds plan\.json/.test(txt("#histLine")) && /no longer holds this plan/.test(txt("#activityWs .histmiss")), txt("#histLine"));
    X(`TEAM.kids.set("plan.json", PH.rec); hist.plan = ""; histRestore();`); await wait(10);

    // A slow read for one plan must not land on the next one.
    X(`let go; window.slowList = new Promise(r=>{ go = r; }); window.GO = go; hist.readAt = 0; histRestore();`); await wait(5);
    X(`S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-hist03"; file.handle = PH2; histRestore();`); await wait(5);
    X(`window.slowList = null; GO();`); await wait(20);
    ok("B17 a read that finishes after another plan was opened is dropped", X(`hist.plan`) === "p-hist03" && X(`hist.by`) === null && X(`histList("updates").some(u=>u.id === "u-old")`) === false, JSON.stringify([X(`hist.plan`), X(`!!hist.by`)]));

    X(`S = normalize(JSON.parse(FIX), false); S.meta.planId = "p-hist02"; file.handle = PH; hist.plan = ""; histRestore();`); await wait(20);
    X(`renderActivity();`); ok("B18 (setup) back on the first plan, its history is read again", X(`hist.state`) === "ready" && X(`histOn()`) === true);
    d.querySelector("#histOff").click(); await wait(10); X(`renderActivity(); renderSnapshots();`);
    ok("B19 Disconnect forgets the folder for this plan and shows only the plan's own history", !("histDir:p-hist02" in X(`KV`)) && X(`histOn()`) === false && !!d.querySelector("#histConnect") && !d.querySelector('#snapTable tr[data-snap="s-old"]'));
    X(`file.handle = null; renderSnapshots();`);
    ok("B20 a plan in this browser only (no file) never shows history files", X(`histOn()`) === false && !d.querySelector('#snapTable tr[data-snap="s-old"]'));
    ok("B21 no page errors", !X(`errs.length`), X(`errs.join(" | ")`));
  } catch(e){ ok("harness completed", false, e.stack || e.message); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
