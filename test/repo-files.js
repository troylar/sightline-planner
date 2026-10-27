// The repository tracks no symbolic links: a worktree's linked node_modules once slipped into main with a change.
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
} catch(e){ R.push("FAIL  couldn't read the repository: " + e.message.split("\n")[0]); }
console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
