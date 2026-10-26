// A Markdown summary of a results file, for the CI job's page: worst first, flags on top.
const fs = require("fs");
const {meta, results, flags} = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = [`### Performance: ${meta.version} (${meta.machine})`, ""];
if (flags.length) out.push("**Flagged:**", ...flags.map(f => `- ${f.fail ? "FAIL" : "known"}: ${f.text}`), "");
out.push("| Size | CPU | Scenario | Median | 95th / dropped | Long tasks | DOM nodes |", "|---|---|---|---:|---:|---:|---:|");
for (const r of [...results].filter(r => !r.skip).sort((a, b) => (b.median || 0) - (a.median || 0)))
  out.push(`| ${r.size} | ${r.cpu}x | ${r.id} | ${r.median != null ? r.median + " ms" : r.fps + " fps"} | ${r.p95 != null ? r.p95 + " ms" : r.dropped + " dropped"} | ${r.longTasks.count} (max ${r.longTasks.maxMs} ms) | ${r.nodes} |`);
console.log(out.join("\n"));
