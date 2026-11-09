// A team's older pages keep reading what the new sync writes. The files come from the real sync (sync_sample_files.py),
// and the page is Sightline 1.187.1, built from its commit (bb74115), or SIGHTLINE_OLD_HTML. It fails if the sync's file
// formats are raised past what 1.187.1 reads, which step 3 (GitHub files) does on purpose: retire this check then.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), os = require("os"), path = require("path"), {execFileSync} = require("child_process");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 170000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const ROOT = path.join(__dirname, ".."), OLD = "bb74115";
function oldPage(tmp){
  if (process.env.SIGHTLINE_OLD_HTML) return fs.readFileSync(process.env.SIGHTLINE_OLD_HTML, "utf8");
  const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], {stdio:["ignore", "pipe", "pipe"], maxBuffer:1 << 30});
  try { git("cat-file", "-e", OLD + "^{commit}"); } catch(e){ git("fetch", "--quiet", "--depth=1", "origin", OLD); }   // CI checks out one commit
  const src = path.join(tmp, "old");
  fs.mkdirSync(src);
  execFileSync("tar", ["-x", "-C", src], {input: git("archive", OLD)});
  execFileSync("bash", [path.join(src, "build.sh")], {stdio:"ignore"});
  return fs.readFileSync(path.join(src, "dist", "sightline.html"), "utf8");
}
async function load(html){
  const dom = new JSDOM(html.replace(/<link[^>]+fonts[^>]+>/, ""), {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
    w.HTMLDialogElement.prototype.close = function(){ this.open = false; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
    w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  await wait(150);
  return dom.window;
}
(async()=>{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sightline-compat-"));
  try {
    execFileSync("python3", [path.join(__dirname, "sync_sample_files.py"), path.join(tmp, "jira")], {stdio:"ignore"});
    const ST = fs.readFileSync(path.join(tmp, "jira", "status.json"), "utf8"), IS = fs.readFileSync(path.join(tmp, "jira", "issues.json"), "utf8");
    ok("C1 the new sync's files name their tracker", JSON.parse(ST).tracker?.kind === "jira" && JSON.parse(IS).tracker?.kind === "jira");
    const pages = [["1.187.1", oldPage(tmp)], ["this build", fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(ROOT, "dist", "sightline.html"), "utf8")]];
    ok("C2 the older page is 1.187.1", /<meta name="sightline-version" content="1\.187\.1">/.test(pages[0][1]));
    for (const [name, html] of pages){
      const w = await load(html); w.ST = ST; w.IS = IS;
      const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
      w.DIR = {name:"jira", async getFileHandle(n){ const t = {"status.json": ST, "issues.json": IS}[n]; if (t == null) throw new Error("missing"); return {getFile: async ()=>({text: async ()=>t})}; },
        async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; }};
      X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{};`);
      await X(`jiraSeen = {}; readJiraDir(DIR)`); await wait(30);
      ok(`C3 ${name} reads the new sync's status file`, X("JIRA && JIRA.issues['ABC-1'] && JIRA.issues['ABC-1'].summary") === "Wire the export", X("document.getElementById('status').textContent"));
      ok(`C4 ${name} reads its search results`, X("JIRA_ISSUES && JIRA_ISSUES.keys.join()") === "ABC-2", X("document.getElementById('status').textContent"));
      ok(`C5 ${name}: no script errors`, !w.errs.length, w.errs.join(" | "));
      w.close();
    }
  } catch(e){ ok("no exception", false, String(e.stack || e).slice(0, 600)); }
  finally { fs.rmSync(tmp, {recursive:true, force:true}); }
  console.log(R.join("\n")); const n = R.length, f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
