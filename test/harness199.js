// The sync's files name their tracker and server (1.188.0, status format 2, issues format 3). This copy reads Jira's:
// an older file with no tracker is still Jira's, a file from another tracker is refused rather than read as Jira, a file
// naming two servers is refused, and a folder whose search results came from another server than its status file sets
// the results aside. The sample plan (every name invented).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const sync = fs.readFileSync(path.join(__dirname, "..", "tools", "sightline-jira-sync.py"), "utf8");
const pyConst = n => Number((sync.match(new RegExp("^" + n + " = (\\d+)", "m")) || [])[1]);
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const AT = "2026-10-07T08:00:00Z", BASE = "https://jira.example.com";
const ISSUE = {summary:"Wire the export", status:"In Progress", category:"inprogress"};
const status = (x = {}) => JSON.stringify({kind:"sightline-jira-status", version:2, snapshot:"aaaa1111bbbb2222", generatedAt:AT, jiraBase:BASE, tracker:{kind:"jira", server:BASE}, missing:[], issues:{"ABC-1":ISSUE}, ...x});
const listing = (x = {}) => JSON.stringify({kind:"sightline-jira-issues", version:3, snapshot:"aaaa1111bbbb2222", generatedAt:AT, jiraBase:BASE, tracker:{kind:"jira", server:BASE},
  searches:[{name:"Mine", jql:"project = ABC", total:1, truncated:false, keys:["ABC-2"]}], issues:[{key:"ABC-2", summary:"Found by the search"}], jql:"project = ABC", total:1, truncated:false, ...x});
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null; render();`);
    const read = (fn, text) => X(`(()=>{ try { return JSON.stringify(${fn}(${JSON.stringify(text)}).tracker); } catch(e){ return "REFUSED " + e.message; } })()`);

    ok("T1 the page reads the formats the sync writes", X("JIRA_FORMATS.status") === pyConst("STATUS_FORMAT") && X("JIRA_FORMATS.issues") === pyConst("ISSUES_FORMAT") && X("JIRA_FORMATS.status") === 2 && X("JIRA_FORMATS.issues") === 3);
    ok("T2 a status file in format 2 names its tracker and server", read("parseJiraStatus", status()) === JSON.stringify({kind:"jira", server:BASE, named:true}), read("parseJiraStatus", status()));
    ok("T3 a search file in format 3 does too", read("parseJiraIssues", listing()) === JSON.stringify({kind:"jira", server:BASE, named:true}), read("parseJiraIssues", listing()));
    const old = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:AT, jiraBase:BASE + "/browse/", missing:[], issues:{"ABC-1":ISSUE}});
    const oldList = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:AT, jiraBase:BASE, searches:[{name:"Mine", keys:["ABC-2"]}], issues:[{key:"ABC-2", summary:"x"}]});
    ok("T4 an older file, which names no tracker, is still read as Jira's", read("parseJiraStatus", old) === JSON.stringify({kind:"jira", server:BASE, named:false}) && read("parseJiraIssues", oldList) === JSON.stringify({kind:"jira", server:BASE, named:false})
      && X(`parseJiraStatus(${JSON.stringify(old)}).issues["ABC-1"].summary`) === "Wire the export", read("parseJiraStatus", old));
    const gh = read("parseJiraStatus", status({tracker:{kind:"github", server:"https://github.example.com"}, jiraBase:undefined}));
    ok("T5 a file from GitHub is refused in plain words, never read as Jira", /^REFUSED It comes from GitHub, and this copy of Sightline reads only Jira's files\. Get the latest Sightline/.test(gh)
      && /^REFUSED It comes from GitHub/.test(read("parseJiraIssues", listing({tracker:{kind:"github", server:"https://github.example.com"}})) || ""), gh);
    const odd = [read("parseJiraStatus", status({tracker:{kind:"tracker-x", server:BASE}})), read("parseJiraStatus", status({tracker:"jira"})), read("parseJiraStatus", status({tracker:{kind:"constructor", server:BASE}}))];
    ok("T6 a tracker this copy doesn't know, or a tracker that isn't named properly, is refused", odd.every(x=>/^REFUSED It comes from a tracker this copy of Sightline doesn't know\./.test(x)), JSON.stringify(odd));
    const two = [read("parseJiraStatus", status({tracker:{kind:"jira", server:"https://other.example.com"}})), read("parseJiraStatus", status({tracker:{kind:"jira"}})), read("parseJiraStatus", status({tracker:{kind:"jira", server:"http://jira.example.com"}}))];
    ok("T7 a file naming two servers, or no https server, is refused", /two different Jira servers/.test(two[0]) && /which Jira server/.test(two[1]) && /which Jira server/.test(two[2]), JSON.stringify(two));
    ok("T8 the same server written two ways (a /browse/ address, upper case) is one server",
      read("parseJiraStatus", status({jiraBase:"https://JIRA.example.com/browse/", tracker:{kind:"jira", server:BASE + "/"}})) === JSON.stringify({kind:"jira", server:BASE, named:true}));

    // A connected folder: both files are read; search results from another server are set aside, the status file kept.
    const dirOf = files => ({name:"jira", async getFileHandle(n){ if (!(n in files)) throw new Error("missing"); return {getFile: async ()=>({text: async ()=>files[n]})}; },
      async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; }});
    w.DIR = dirOf({"status.json": status(), "issues.json": listing({tracker:{kind:"jira", server:"https://other.example.com"}, jiraBase:"https://other.example.com"})});
    await X(`jiraSeen = {}; readJiraDir(DIR)`); await wait(20);
    ok("T9 a folder whose search came from another server keeps its status and sets the search aside, saying why", X("!!JIRA && !!JIRA.issues['ABC-1'] && JIRA_ISSUES === null") === true
      && /come from a different server than its status file/.test(X("document.getElementById('status').textContent") || ""), X("document.getElementById('status').textContent"));
    w.DIR = dirOf({"status.json": status(), "issues.json": listing()});
    await X(`jiraSeen = {}; readJiraDir(DIR)`); await wait(20);
    ok("T10 …and from the same server, both are read", X("!!JIRA && !!JIRA_ISSUES && JIRA_ISSUES.keys.join()") === "ABC-2");
    w.DIR = dirOf({"status.json": old, "issues.json": JSON.stringify({...JSON.parse(oldList), jiraBase:"https://other.example.com"})});
    await X(`jiraSeen = {}; readJiraDir(DIR)`); await wait(20);
    ok("T11 older files, which name no tracker, are read as before", X("!!JIRA && !!JIRA_ISSUES && JIRA_ISSUES.keys.join()") === "ABC-2");
    ok("T12 no script errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const n = R.length, f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
