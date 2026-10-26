// Where a scenario's time goes: a CPU profile of one run, summed by function.
//   node test/perf/profile.js M tl.two [cpu] [--html dist.html]   writes test/perf/profile-<size>-<id>.cpuprofile too
const fs = require("fs"), path = require("path");
const [size = "M", id = "tl.two", cpu = "4"] = process.argv.slice(2).filter(a => !a.startsWith("--") && !/\.html$/.test(a));
const {SCENARIOS, openPage, load, pw} = require("./run.js");
const {generate} = require("./gen.js");
(async () => {
  const browser = await pw.chromium.launch(), g = generate(size, 1);
  const {ctx, page, cdp} = await openPage(browser, Number(cpu), g);
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", {interval:200});
  const s = SCENARIOS.find(x => x.id === id); if (!s) throw new Error("No scenario " + id);
  if (id !== "load.open"){ await load(page, g); await page.evaluate(() => { goWs("timeline"); setZoom("weeks"); }); await s.run(page); }   // one warm-up run
  await cdp.send("Profiler.start");
  const r = id === "load.open" ? await load(page, g) : await s.run(page);
  const {profile} = await cdp.send("Profiler.stop");
  await ctx.close(); await browser.close();
  const out = path.join(__dirname, `profile-${size}-${id}.cpuprofile`); fs.writeFileSync(out, JSON.stringify(profile));
  // self time per function, and total time (self plus callees) per function, from the sampled call tree
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
  const dt = new Map(); profile.samples.forEach((sid, i) => dt.set(sid, (dt.get(sid) || 0) + (profile.timeDeltas[i] || 0) / 1000));
  const self = {}, total = {}, name = n => (n.callFrame.functionName || "(anonymous)") + (n.callFrame.lineNumber >= 0 && n.callFrame.url.includes("sightline") ? ":" + (n.callFrame.lineNumber + 1) : "");
  for (const [sid, ms] of dt){ let n = byId.get(sid); self[name(n)] = (self[name(n)] || 0) + ms; const seen = new Set();
    while (n){ const k = name(n); if (!seen.has(k)){ total[k] = (total[k] || 0) + ms; seen.add(k); } n = byId.get(parent.get(n.id)); } }
  const top = (o, k) => Object.entries(o).filter(([n]) => !/^\((root|program|idle)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${n}`).join("\n");
  console.log(`${size} ${id} at ${cpu}x: ${r.ms != null ? r.ms.toFixed(0) + " ms" : JSON.stringify(r)}\n\nSelf time:\n${top(self, 18)}\n\nTotal time:\n${top(total, 22)}\n\nProfile: ${out}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
