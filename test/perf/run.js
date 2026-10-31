// Performance harness: drives the built page in Chromium on synthetic plans and reports what's slow.
//   node test/perf/run.js [--sizes S,M] [--cpu 1,4] [--runs 5] [--only tl.,ui.find] [--html dist.html]
//                         [--out results.json] [--report report.html] [--compare baseline.json] [--budgets [file]]
//                         [--report-only]  (list missed budgets but exit 0, as CI does while the budgets settle)
// Playwright comes from node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright.
// Every number is from this machine: compare a run with a baseline taken on the same machine.
const fs = require("fs"), path = require("path"), os = require("os");
const {generate} = require("./gen.js");

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
const ROOT = path.join(__dirname, "..", "..");
const HTML = path.resolve(opt("html", path.join(ROOT, "dist", "sightline.html")));
const SIZES_RUN = String(opt("sizes", "S,M")).split(",");
const CPUS = String(opt("cpu", "1,4")).split(",").map(Number);
const RUNS = Number(opt("runs", 5));
const ONLY = opt("only", "") ? String(opt("only")).split(",") : null;
const OUT = opt("out", path.join(ROOT, "test", "perf", "results.json"));
const REPORT = opt("report", path.join(ROOT, "test", "perf", "report.html"));
const COMPARE = opt("compare", "");
const BUDGET_FILE = opt("budgets", false) === true ? path.join(__dirname, "budgets.json") : opt("budgets", false);
const BUDGETS = BUDGET_FILE ? JSON.parse(fs.readFileSync(BUDGET_FILE, "utf8")) : null;
const SEED = Number(opt("seed", 1));

let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.error("Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); process.exit(2); }

// In the page: helpers the scenarios use. Injected by the test runner only; the shipped page has none of this.
function pageLib(){
  const P = window.__perf = {events:[], longs:[]};
  new PerformanceObserver(l => P.longs.push(...l.getEntries().map(e => ({start:e.startTime, dur:e.duration})))).observe({type:"longtask", buffered:true});
  new PerformanceObserver(l => P.events.push(...l.getEntries().map(e => ({name:e.name, start:e.startTime, dur:e.duration, id:e.interactionId})))).observe({type:"event", durationThreshold:16, buffered:true});
  // from an input event's own time stamp to the end of the second frame after it: covers work the page defers to the next frame
  P.resp = []; P.watch = null;
  for (const type of ["pointerdown", "pointerup", "click", "keydown"]) addEventListener(type, e => { if (!P.watch || !P.watch.includes(type)) return; const t = e.timeStamp;
    requestAnimationFrame(() => requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => P.resp.push({type, ms:performance.now() - t}); c.port2.postMessage(0); })); }, {capture:true});
  P.paint = () => new Promise(r => requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }));
  P.idle = ms => new Promise(r => setTimeout(r, ms));
  P.timed = async fn => { const t0 = performance.now(); await fn(); await P.paint(); return {t0, ms:performance.now() - t0}; };
  P.fileHandle = (name, text) => { const h = {kind:"file", name, text, writes:0,
    async getFile(){ return new File([h.text], name, {type:"application/json", lastModified:Date.now()}); },
    async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; }, async isSameEntry(o){ return o === h; },
    async createWritable(){ let buf = ""; return {async write(t){ buf += typeof t === "string" ? t : await new Blob([t]).text(); }, async close(){ h.text = buf; h.writes++; }}; }};
    return h; };
  P.dirHandle = (name, files) => ({kind:"directory", name, async getFileHandle(n){ if (!(n in files)) { const e = new Error("not found"); e.name = "NotFoundError"; throw e; } return P.fileHandle(n, files[n]); }});
  // frames while something moves: the gaps between animation frames
  P.frames = async (step, n) => { const gaps = []; let last = performance.now();
    for (let i = 0; i < n; i++){ step(i); await new Promise(r => requestAnimationFrame(r)); const t = performance.now(); gaps.push(t - last); last = t; }
    const ms = gaps.reduce((a, b) => a + b, 0); return {fps:+(1000 * n / ms).toFixed(1), dropped:gaps.filter(g => g > 25).length, worstFrame:+Math.max(...gaps).toFixed(1)}; };
}

const SCENARIOS = [];
const def = (id, group, what, run, needs) => SCENARIOS.push({id, group, what, run, needs});
const ev = s => `(${s})()`;

// Each run returns {ms} (a response) or {fps, dropped, worstFrame} (motion), plus optional notes.
def("load.open", "Load", "Open the plan file and the Jira folder, to the first drawn Timeline", null);
def("jira.apply", "Jira", "A new Jira sync arrives and is drawn", async page => page.evaluate(async () => {
  const P = __perf, st = JSON.parse(P.statusText); st.generatedAt = new Date(Date.now() + P.n++ * 1000).toISOString();
  const k = Object.keys(st.issues).find(k => st.issues[k].type === "Story"); st.issues[k].summary += " (edited)";
  const dir = P.dirHandle("jira", {"status.json":JSON.stringify(st)});
  return P.timed(() => readJiraDir(dir, true));
}));
for (const [id, n, label] of [["tl.fit", 0, "Fit"], ["tl.this", 1, "This sprint"], ["tl.two", 2, "This + next"], ["tl.three", 3, "Next 3"]])
  def(id, "Timeline", "Weeks: switch to " + label, async page => page.evaluate(async n => { const P = __perf; zoomPreset(n === 0 ? 2 : 0); await P.paint(); return P.timed(() => zoomPreset(n)); }, n), "zoomPreset");
def("tl.zoomIn", "Timeline", "Weeks at Fit: zoom in one step", async page => page.evaluate(async () => { const P = __perf; zoomPreset(0); await P.paint(); const b = document.getElementById("zoomIn"); return P.timed(() => b.click()); }), "#zoomIn");
def("tl.zoomOut", "Timeline", "Weeks at Fit: zoom out one step", async page => page.evaluate(async () => { const P = __perf; zoomPreset(0); document.getElementById("zoomIn").click(); await P.paint(); const b = document.getElementById("zoomOut"); return P.timed(() => b.click()); }), "#zoomOut");
def("tl.scrollX", "Timeline", "Weeks at This + next: scroll sideways for 90 frames", async page => page.evaluate(async () => { const P = __perf; zoomPreset(2); await P.paint(); const g = document.getElementById("gscroll"); g.scrollLeft = 0; await P.paint();
  return P.frames(() => { g.scrollLeft += 24; }, 90); }), "#gscroll");
def("tl.scrollY", "Timeline", "Weeks at Fit: scroll down the workstreams for 90 frames", async page => page.evaluate(async () => { const P = __perf; zoomPreset(0); await P.paint(); const s = document.scrollingElement; s.scrollTop = 0; await P.paint();
  const r = await P.frames(() => { s.scrollTop += 30; }, 90); s.scrollTop = 0; return r; }));
def("tl.shelves", "Timeline", "Weeks at This + next: turn sprint shelves off and on", async page => page.evaluate(async () => { const P = __perf; zoomPreset(2); await P.paint();
  const a = await P.timed(() => { UI.shelves = false; render(); }); const b = await P.timed(() => { UI.shelves = true; render(); }); return {ms:Math.max(a.ms, b.ms), t0:a.t0}; }), "laneShelf");
def("days.open", "Days", "Switch the Timeline to Days", async page => page.evaluate(async () => { const P = __perf; setZoom("weeks"); await P.paint(); return P.timed(() => setZoom("days")); }), "setZoom");
def("days.scroll", "Days", "Days: scroll sideways across a quarter", async page => page.evaluate(async () => { const P = __perf; setZoom("days"); await P.paint(); const g = document.getElementById("gscroll");
  g.scrollLeft = 0; await P.paint(); const step = Math.max(8, (g.scrollWidth - g.clientWidth) / 4 / 90); const r = await P.frames(() => { g.scrollLeft += step; }, 90); setZoom("weeks"); await P.paint(); return r; }), "#gscroll");
// real input: the browser's own input-to-paint time (Event Timing), the measure behind Interaction to Next Paint
const inputTime = async (page, act, types) => { const from = await page.evaluate(types => { __perf.resp = []; __perf.watch = types; return performance.now(); }, types);
  await act(); await page.evaluate(() => __perf.paint().then(() => __perf.paint()).then(() => __perf.idle(60)));
  return page.evaluate(from => { const P = __perf; P.watch = null; const v = P.resp.map(x => x.ms).sort((a, b) => a - b);
    const e = P.events.filter(x => x.start >= from && x.id), by = {}; e.forEach(x => by[x.id] = Math.max(by[x.id] || 0, x.dur));
    return {t0:from, ms:v.length ? v[v.length - 1] : 0, median:v.length ? v[Math.floor(v.length / 2)] : 0, n:v.length, inp:Math.max(0, ...Object.values(by)), notes:v.length ? "" : "no input event seen"}; }, from); };
const barBox = page => page.evaluate(async () => { zoomPreset(2); await __perf.paint(); const g = document.getElementById("gscroll");
  const dep = new Set(S.bars.flatMap(y => y.dependsOn || []));
  const plain = x => { const b = S.bars.find(y => y.id === x.dataset.peekId); return b && !b.jira && !(b.epics || []).length && !(b.dependsOn || []).length && !dep.has(b.id) && !x.classList.contains("jlock") && x.getBoundingClientRect().width > 60 ? b : null; };
  const all = [...document.querySelectorAll('#gscroll [data-peek-type="bar"]')];
  for (const x of all.filter(plain).slice(0, 30)){ const bar = plain(x); x.scrollIntoView({block:"center", inline:"center"}); await __perf.paint();
    const r = x.getBoundingClientRect(), r0 = g.getBoundingClientRect(), wk = r.width / bar.span;
    if (r.left > r0.left + 20 && r.left + Math.min(40, r.width / 3) + wk * 1.2 < Math.min(innerWidth, r0.right) - 20 && r.top > 0 && r.bottom < innerHeight)
      return {x:r.left + Math.min(40, r.width / 3), y:r.top + r.height / 2, id:bar.id, wk, start:bar.start}; }
  return {miss:all.length + " bars drawn, " + all.filter(plain).length + " plain, none fits on screen"}; });
def("ui.panelOpen", "Interactions", "Click an initiative to open its panel", async page => { await page.keyboard.press("Escape"); const b = await barBox(page); if (!b || b.miss) return {skip:"no bar on screen" + (b ? ": " + b.miss : "")};
  const r = await inputTime(page, () => page.mouse.click(b.x, b.y), ["pointerdown", "pointerup", "click"]); const open = await page.evaluate(id => !!sel && sel.id === id, b.id); return open ? r : {skip:"the panel didn't open"}; });
def("ui.panelClose", "Interactions", "Press Escape to close the panel", async page => { const b = await barBox(page); if (!b || b.miss) return {skip:"no bar on screen" + (b ? ": " + b.miss : "")}; await page.mouse.click(b.x, b.y); await page.waitForTimeout(100);
  return inputTime(page, () => page.keyboard.press("Escape"), ["keydown"]); });
def("ui.drag", "Interactions", "Drag an initiative a week later and drop it", async page => { await page.keyboard.press("Escape"); const b = await barBox(page); if (!b || b.miss) return {skip:"no bar on screen" + (b ? ": " + b.miss : "")};
  const wk = b.wk;
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  const moves = await page.evaluate(() => { __perf.mf = []; let last = performance.now(), on = true; const tick = () => { if (!on) return; const t = performance.now(); __perf.mf.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); __perf.stopMf = () => on = false; return 0; });
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + wk * i / 12, b.y);
  const r = await inputTime(page, () => page.mouse.up(), ["pointerup"]);
  // the drop's own work can run after the event: count the longest task that starts within 100 ms of it
  const f = await page.evaluate(({t0, id, start}) => { __perf.stopMf(); const g = __perf.mf.slice(1); const lt = __perf.longs.filter(x => x.start >= t0 && x.start < t0 + 100);
    return {worstFrame:+Math.max(0, ...g).toFixed(1), dropped:g.filter(x => x > 25).length, after:Math.max(0, ...lt.map(x => x.dur)), moved:S.bars.find(y => y.id === id).start !== start}; }, {t0:r.t0, id:b.id, start:b.start});
  if (!f.moved) return {skip:"the bar didn't move: " + await page.evaluate(id => JSON.stringify({editable:editable(), locked, hold:file.holdLock, status:document.getElementById("status")?.textContent?.slice(0, 120), b:S.bars.find(y => y.id === id)?.start}), b.id) + " from " + b.start + " wk " + b.wk};
  r.ms = Math.max(r.ms, f.after);
  await page.keyboard.press("Escape"); await page.evaluate(() => typeof undo === "function" && undo());
  return {...r, worstFrame:f.worstFrame, dropped:f.dropped}; });
def("ui.find", "Interactions", "Type a word in Find (the slowest key)", async page => { await page.evaluate(() => { openFind(); }); const box = page.locator("#findIn"); if (!(await box.count())) return {skip:"no Find box"};
  await box.fill(""); await page.waitForTimeout(50); const r = await inputTime(page, () => box.pressSequentially("export", {delay:30}), ["keydown"]); await box.fill(""); await page.keyboard.press("Escape"); return r; }, "openFind");
def("ui.filter", "Interactions", "Filter to one person, then clear the filter", async page => page.evaluate(async () => { const P = __perf, id = S.people[3].id;
  const a = await P.timed(() => setFilter(f => { f.people = [id]; })); const b = await P.timed(() => setFilter(f => { f.people = []; })); return {ms:Math.max(a.ms, b.ms), t0:a.t0}; }), "setFilter");
def("ui.view", "Interactions", "Switch Timeline to List and back", async page => page.evaluate(async () => { const P = __perf; const a = await P.timed(() => goWs("list")); const b = await P.timed(() => goWs("timeline")); return {ms:Math.max(a.ms, b.ms), t0:a.t0}; }), "goWs");
def("ui.undo", "Interactions", "Undo an edit (Ctrl+Z)", async page => { await page.evaluate(async () => { const b = S.bars.find(x => !x.jira && !(x.epics || []).length) || S.bars[0]; commit(() => { b.label += " edited"; }); await __perf.paint(); document.activeElement?.blur?.(); });
  return inputTime(page, () => page.keyboard.press("Control+z"), ["keydown"]); }, "undo");
def("ui.save", "Interactions", "Save an edit to the plan file", async page => page.evaluate(async () => { const P = __perf, h = file.handle; if (!h) return {skip:"no file handle"};
  const b = S.bars[1]; commit(() => { b.label += " saved"; }); await P.paint(); const w = h.writes; const r = await P.timed(() => save()); return {...r, notes:h.writes > w ? "" : "no write"}; }), "save");
for (const [id, ws, label] of [["page.today", "today", "Today"], ["page.sprint", "standup", "Sprint"], ["page.cards", "cards", "Cards"], ["page.list", "list", "List"], ["page.roadmap", "roadmap", "Roadmap"], ["page.capacity", "people", "Capacity"]])
  def(id, "Pages", "Open " + label + " from the Timeline", async page => page.evaluate(async ws => { const P = __perf;
    if (!document.querySelector(`[data-ws="${ws}"], [data-section="${ws}"]`)) return {skip:"not in this version"};
    goWs("timeline"); await P.paint(); const r = await P.timed(() => goWs(ws)); goWs("timeline"); await P.paint(); return r; }, ws));

async function metrics(cdp){ const {metrics} = await cdp.send("Performance.getMetrics"); return Object.fromEntries(metrics.map(m => [m.name, m.value])); }
async function openPage(browser, cpu, g){
  const ctx = await browser.newContext({viewport:{width:1440, height:900}, deviceScaleFactor:1});
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e))); page.on("dialog", d => d.dismiss().catch(() => {}));
  await page.addInitScript(pageLib);
  const cdp = await ctx.newCDPSession(page); await cdp.send("Performance.enable");
  await page.goto("file://" + HTML); await page.waitForFunction(() => typeof render === "function" && typeof adopt === "function");
  await cdp.send("Emulation.setCPUThrottlingRate", {rate:cpu});
  return {ctx, page, cdp, errors};
}
async function load(page, g){
  return page.evaluate(async ({plan, status}) => { const P = __perf; P.statusText = status; P.n = 1;
    try { UI.noWelcome = true; } catch(e){}
    const h = P.fileHandle("perf-plan.json", plan), dir = P.dirHandle("jira", {"status.json":status});
    // a plan past what a save may write opens read-only, so edits would time refusals: measure it in memory instead
    const tooBig = typeof overLimit === "function" && !!overLimit(plan, 0);
    const r = await P.timed(async () => { if (tooBig){ S = normalize(JSON.parse(plan), false); resetHistory(); render(); } else await adopt(h, true); if (status.length <= 5 * 1024 * 1024) await readJiraDir(dir, true); });
    try { setMe(S.people[0].id); if (!file.holdLock) await startEditing(); } catch(e){}
    let notes = "";
    if (tooBig){ notes = "past what a save may write (" + overLimit(plan, 0).replace(/^Not saved: /, "").split(/\.\s/)[0] + "): opened in memory, not as a file; "; }
    else if (!file.handle){        // past what this copy opens (an older build): measure the drawing only
      try { notes = "the plan file was refused (" + (document.querySelector(".banner, #linkProblem")?.textContent || "").trim().slice(0, 80) + "): loaded in memory; "; } catch(e){}
      S = normalize(JSON.parse(plan), false); resetHistory(); render(); }
    if (status.length > 5 * 1024 * 1024){ JIRA = JSON.parse(status); JIRA.rollupsTruncated = false; render(); notes += "the Jira file is over 5 MB: loaded in memory, past the page's own checks"; }
    return {...r, notes, linked:!!file.handle, bars:S.bars.length, issues:JIRA ? Object.keys(JIRA.issues).length : 0}; }, {plan:JSON.stringify(g.plan), status:JSON.stringify(g.status)});
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : 0; };

async function main(){
  const browser = await pw.chromium.launch({args:["--enable-precise-memory-info"]});
  const version = (fs.readFileSync(HTML, "utf8").match(/"version":"(\d+\.\d+\.\d+)"/) || [])[1] || "?";   // the newest release note is first
  const results = [];
  for (const size of SIZES_RUN){
    const g = generate(size, SEED);
    for (const cpu of CPUS){
      const runs = /^(L|XL)/.test(size) || /-[0-9.]+y$/.test(size) ? Math.min(RUNS, 3) : RUNS;
      const acc = {};
      const add = (s, r, m0, m1, nodes) => { const a = acc[s.id] ||= {samples:[], fps:[], dropped:[], worst:[], longs:[], layouts:[], recalcs:[], heap:[], nodes:[], notes:new Set(), skip:""};
        if (r.skip){ a.skip = r.skip; return; }
        if (r.ms != null) a.samples.push(r.ms); if (r.fps != null) a.fps.push(r.fps); if (r.dropped != null) a.dropped.push(r.dropped); if (r.worstFrame != null) a.worst.push(r.worstFrame);
        if (r.notes) a.notes.add(r.notes);
        a.layouts.push(m1.LayoutCount - m0.LayoutCount); a.recalcs.push(m1.RecalcStyleCount - m0.RecalcStyleCount); a.heap.push(m1.JSHeapUsedSize / 1048576); a.nodes.push(nodes); };
      for (let run = 0; run < runs; run++){
        const {ctx, page, cdp, errors} = await openPage(browser, cpu, g);
        try {
          const m0 = await metrics(cdp); const lr = await load(page, g); const m1 = await metrics(cdp);
          const nodes = await page.evaluate(() => document.getElementsByTagName("*").length);
          const lt = await page.evaluate(t0 => __perf.longs.filter(x => x.start >= t0), lr.t0);
          add(SCENARIOS[0], lr, m0, m1, nodes); acc["load.open"].longs.push(lt);
          if (!lr.linked) acc["load.open"].notes.add("no file handle, so Save isn't measured");
          for (const s of SCENARIOS.slice(1)){
            if (ONLY && !ONLY.some(o => s.id.startsWith(o))) continue;
            if (s.needs){ const ok = await page.evaluate(n => n.startsWith("#") ? !!document.querySelector(n) : typeof window[n] === "function" || (() => { try { return typeof eval(n) === "function"; } catch(e){ return false; } })(), s.needs).catch(() => false);
              if (!ok){ add(s, {skip:"not in this version"}); continue; } }
            await page.evaluate(() => { goWs("timeline"); setZoom("weeks"); }).catch(() => {});
            const a0 = await metrics(cdp); let r;
            try { r = await s.run(page); } catch(e){ r = {skip:"failed: " + String(e.message || e).split("\n")[0].slice(0, 160)}; }
            await page.evaluate(() => __perf.idle(250));
            const a1 = await metrics(cdp); const nd = await page.evaluate(() => document.getElementsByTagName("*").length);
            add(s, r || {skip:"no result"}, a0, a1, nd);
            if (r && r.t0 != null) acc[s.id].longs.push(await page.evaluate(t0 => __perf.longs.filter(x => x.start >= t0), r.t0));
            await page.evaluate(() => { __perf.longs = []; __perf.events = []; });
          }
          if (errors.length) acc["load.open"].notes.add("page errors: " + [...new Set(errors)].slice(0, 3).join(" | ").slice(0, 300));
        } finally { await ctx.close(); }
      }
      for (const s of SCENARIOS){ const a = acc[s.id]; if (!a) continue;
        const lt = a.longs.flat(), med = v => v.length ? +pct(v, 0.5).toFixed(1) : null;
        results.push({size, cpu, id:s.id, group:s.group, what:s.what, skip:a.samples.length || a.fps.length ? "" : a.skip,
          median:med(a.samples), p95:a.samples.length ? +pct(a.samples, 0.95).toFixed(1) : null, samples:a.samples.map(x => +x.toFixed(1)),
          fps:med(a.fps), dropped:med(a.dropped), worstFrame:a.worst.length ? +Math.max(...a.worst).toFixed(1) : null,
          longTasks:{count:+(lt.length / Math.max(1, a.longs.length)).toFixed(1), maxMs:lt.length ? +Math.max(...lt.map(x => x.dur)).toFixed(0) : 0},
          layouts:med(a.layouts), recalcs:med(a.recalcs), heapMB:med(a.heap), nodes:med(a.nodes), notes:[...a.notes].join("; ")});
      }
      console.log(`${size} at ${cpu}x CPU: done`);
    }
  }
  await browser.close();
  const meta = {version, html:path.basename(HTML), date:new Date().toISOString(), seed:SEED, runs:RUNS, chromium:browser.version(), machine:`${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model || "?"} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    sizes:Object.fromEntries(SIZES_RUN.map(s => { const g = generate(s, SEED); return [s, {asked:g.asked, weeks:g.weeks, planBytes:JSON.stringify(g.plan).length, statusBytes:JSON.stringify(g.status).length, issues:Object.keys(g.status.issues).length}]; }))};
  const flags = check(results);
  fs.writeFileSync(OUT, JSON.stringify({meta, results, flags}, null, 1) + "\n");
  fs.writeFileSync(REPORT, report(meta, results, flags));
  console.log(`Results: ${OUT}\nReport: ${REPORT}`);
  if (flags.length){ console.log(flags.length + " flagged:"); flags.forEach(f => console.log("  " + f.text)); }
  if (opt("report-only", false) && flags.some(f => f.fail)) console.log("Report only: a budget was missed, but this run doesn't fail. See the flags above and the report.");
  process.exit(flags.some(f => f.fail) && !opt("report-only", false) ? 1 : 0);
}

// Budgets and the baseline. A scenario fails a budget at the sizes and CPU the budget names; "known" entries are
// today's measured ceiling for a scenario already over budget, so CI still catches it getting worse.
function check(results){
  const flags = [], base = COMPARE ? JSON.parse(fs.readFileSync(COMPARE, "utf8")).results : null;
  for (const r of results){ if (r.skip) continue;
    const v = r.median != null ? r.median : r.fps, kind = r.median != null ? "ms" : "fps";
    if (base){ const b = base.find(x => x.size === r.size && x.cpu === r.cpu && x.id === r.id && !x.skip);
      const bv = b && (kind === "ms" ? b.median : b.fps);
      if (bv && (kind === "ms" ? v > bv * 1.2 && v - bv > 5 : v < bv / 1.2)) flags.push({...key(r), fail:true, text:`${r.size} ${r.cpu}x ${r.id}: ${v}${kind} vs baseline ${bv}${kind} (more than 20% worse)`}); }
    if (BUDGETS){ const bd = BUDGETS.budgets[r.id]; if (!bd || !(bd.sizes || []).includes(r.size) || bd.cpu !== r.cpu) continue;
      const known = (BUDGETS.known || {})[`${r.size}/${r.cpu}/${r.id}`];
      const over = kind === "ms" ? v > bd.ms : v < bd.fps, limit = kind === "ms" ? bd.ms : bd.fps;
      if (over){ const ceiling = known != null && (kind === "ms" ? v <= known * 1.2 : v >= known / 1.2);
        flags.push({...key(r), fail:!ceiling, text:`${r.size} ${r.cpu}x ${r.id}: ${v}${kind}, budget ${limit}${kind}` + (known != null ? ` (known: ${known}${kind}${ceiling ? "" : ", now worse"})` : "")}); } } }
  return flags;
}
const key = r => ({size:r.size, cpu:r.cpu, id:r.id});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
function report(meta, results, flags){
  const budgetOf = r => BUDGETS && BUDGETS.budgets[r.id];
  const score = r => r.skip ? -1 : r.median != null ? r.median / ((budgetOf(r) || {}).ms || 100) : 50 / Math.max(1, r.fps);
  const groups = [...new Set(results.map(r => r.size + " at " + r.cpu + "x CPU"))];
  const rows = g => results.filter(r => r.size + " at " + r.cpu + "x CPU" === g).sort((a, b) => score(b) - score(a)).map(r => `<tr${flags.some(f => f.id === r.id && f.size === r.size && f.cpu === r.cpu) ? ' class="flag"' : ""}><td>${esc(r.id)}</td><td>${esc(r.what)}</td>` +
    (r.skip ? `<td colspan="7" class="muted">${esc(r.skip)}</td>` : `<td class="n">${r.median != null ? esc(r.median) + " ms" : esc(r.fps) + " fps"}</td><td class="n">${r.p95 != null ? esc(r.p95) + " ms" : r.dropped != null ? esc(r.dropped) + " dropped" : ""}</td><td class="n">${esc(r.longTasks.count)} / ${esc(r.longTasks.maxMs)} ms</td><td class="n">${esc(r.layouts)} / ${esc(r.recalcs)}</td><td class="n">${esc(r.nodes)}</td><td class="n">${esc(r.heapMB != null ? r.heapMB.toFixed(0) : "")}</td><td>${esc(r.notes)}</td>`) + "</tr>").join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sightline performance</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1d2430;background:#fff}h1{font-size:20px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e3e6ea;vertical-align:top}th{font-weight:600;background:#f4f6f8}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.muted{color:#6b7480}.flag td{background:#fff1ef}ul{padding-left:20px}
@media (prefers-color-scheme:dark){body{background:#14181d;color:#e4e8ee}th{background:#1f252c}td,th{border-color:#2d343c}.flag td{background:#3a2220}.muted{color:#97a0ab}}</style>
<h1>Sightline performance: ${esc(meta.version)}</h1><p class="muted">${esc(meta.date)} · Chromium ${esc(meta.chromium)} · ${esc(meta.machine)} · seed ${esc(meta.seed)}, ${esc(meta.runs)} runs (3 at L and XL). Synthetic plans only.</p>
${flags.length ? `<h2>Flagged</h2><ul>${flags.map(f => `<li>${esc(f.text)}</li>`).join("")}</ul>` : ""}
<p class="muted">Worst first. A response is from the change to the next painted frame; for real clicks and keys it is the browser's own input-to-paint time. Long tasks: per run, count and the longest. Layouts / style recalcs: per scenario.</p>
${groups.map(g => `<h2>${esc(g)}</h2><table><tr><th>Scenario</th><th>What</th><th class="n">Median</th><th class="n">95th / dropped</th><th class="n">Long tasks</th><th class="n">Layouts / styles</th><th class="n">DOM nodes</th><th class="n">Heap MB</th><th>Notes</th></tr>${rows(g)}</table>`).join("")}
<h2>Sizes</h2><table><tr><th>Size</th><th>Asked</th><th class="n">Weeks</th><th class="n">Plan</th><th class="n">Jira file</th><th class="n">Issues</th></tr>${Object.entries(meta.sizes).map(([s, z]) => `<tr><td>${esc(s)}</td><td>${esc(JSON.stringify(z.asked))}</td><td class="n">${esc(z.weeks)}</td><td class="n">${esc((z.planBytes / 1048576).toFixed(2))} MB</td><td class="n">${esc((z.statusBytes / 1048576).toFixed(2))} MB</td><td class="n">${esc(z.issues)}</td></tr>`).join("")}</table></html>`;
}

module.exports = {SCENARIOS, openPage, load, pw};
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
