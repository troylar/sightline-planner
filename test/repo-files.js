// The repository tracks no symbolic links: a worktree's linked node_modules once slipped into main with a change.
// A harness that gives the page a stand-in file handle switches off the 15-second shared-file check: on a loaded machine
// that check once fired mid-run, found no permission on the stand-in, unlinked it and dropped the edit lock.
// SIGHTLINE_REF checks a commit's tree instead of the index (to prove the check fails on the commit that had one).
const {execFileSync} = require("child_process"), path = require("path");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
const git = a => execFileSync("git", a, {cwd:path.join(__dirname, ".."), encoding:"utf8", maxBuffer:64 * 1024 * 1024});
try {
  const ref = process.env.SIGHTLINE_REF;
  const rows = (ref ? git(["ls-tree", "-r", ref]) : git(["ls-files", "-s"])).split("\n").filter(Boolean);
  const links = rows.filter(r=>/^120000\s/.test(r)).map(r=>r.split("\t")[1]);
  ok("R1 no tracked file is a symbolic link", !links.length, links.join(", "));
  ok("R2 nothing under node_modules is tracked", !rows.some(r=>/^node_modules(\/|$)/.test(r.split("\t")[1] || "")));
  const tests = rows.map(r=>r.split("\t")[1]).filter(f=>/^test\/[^/]+\.js$/.test(f || "") && f !== "test/repo-files.js");
  const text = f => ref ? git(["show", `${ref}:${f}`]) : require("fs").readFileSync(path.join(__dirname, "..", f), "utf8");
  const loose = tests.filter(f=>{ const s = text(f); return /file\.handle\s*=\s*\{/.test(s) && !/startAuto\s*=\s*\(\)\s*=>\s*\{\s*\}/.test(s); });
  ok("R3 every harness that sets a stand-in file handle switches off the shared-file check (stopAuto(); startAuto = ()=>{})", tests.length > 100 && !loose.length, loose.join(", ") || tests.length + " test files");
} catch(e){ R.push("FAIL  couldn't read the repository: " + e.message.split("\n")[0]); }
console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
