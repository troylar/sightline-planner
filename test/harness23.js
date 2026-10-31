// The demo (tools/make-demo.py) loads and shows every part of the Jira tie-in. Keeps the demo honest as the page changes.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path"); const os = require("os"); const {execFileSync} = require("child_process");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
const out = fs.mkdtempSync(path.join(os.tmpdir(), "sl-demo-"));
execFileSync("python3", [path.join(__dirname, "..", "tools", "make-demo.py"), out], {stdio:"ignore"});
const read = f => fs.readFileSync(path.join(out, f), "utf8");
(async()=>{
  try {
    const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){ require("./today").pinDate(w, "2026-10-28");   // a weekday in the sample plan's S2: these checks read today against it
     
      w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
      w.showOpenFilePicker = async()=>[]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
      w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
      w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
      w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document, ev = s => w.eval(s); await wait(200);
    w.P = read("plan.json"); w.ST = read("jira/status.json"); w.IS = read("jira/issues.json");
    ev(`askWhoOnStart = ()=>{}; download = ()=>{}; stopAuto(); startAuto = ()=>{}; file.handle = {name:"plan.json"}; S = normalize(parseText(P), false); resetHistory(); setMe(S.people[0].id);
      JIRA = parseJiraStatus(ST); JIRA_ISSUES = parseJiraIssues(IS); render();`);
    const L = JSON.parse(ev("JSON.stringify(jiraEpicList().map(x=>({k:x.key, s:x.state, f:x.finished})))"));
    const has = (st, fin) => L.some(x=>x.s === st && x.f === fin);
    ok("D1: the demo has epics on the board, live and finished", has("on", false) && has("on", true));
    ok("D1: unsorted epics: live, finished and new", has("unsorted", false) && has("unsorted", true) && L.some(x=>x.s === "unsorted" && ev(`epicCounts("${x.k}")?.total === 0`)));
    ok("D1: and a parked one", has("parked", false));
    ev("UI.planTab = 'epics'; setWs('plan');");
    ok("D2: the health line is green and says watch", !!d.querySelector("#jiraWs .jhealth .hdot.ok") && /by watch/.test(d.querySelector("#jiraWs .jhealth").textContent));
    ok("D2: finished epics on the board are offered for parking", !!d.querySelector("#jiraParkDone"));
    ev("setWs('timeline'); setZoom('days'); render();");
    const all = JSON.parse(ev("JSON.stringify(S.bars.flatMap(b=>storiesOf(b)).map(x=>({d:x.drawn, r:x.real, w:!!x.when, st:x.state, sp:x.j.sprintId})))"));
    ok("D3: stories are drawn in Days", d.querySelectorAll('#gantt [data-key^="story:"]').length > 5);
    ok("D3: and some aren't, for each reason: a plan task, no sprint, a parking-lot sprint, abandoned", all.some(x=>x.r) && all.some(x=>!x.w && x.sp === 0) && all.some(x=>!x.w && x.sp === 99) && all.some(x=>x.st === "abandoned"));
    ok("D4: Jira locks the initiatives' dates and status", ev("S.bars.filter(b=>jiraLockOf(b)).length") >= 4);
    { const f = path.join(os.homedir(), ".config", "Sightline", "private-terms");      // kept outside the repo, like check-private.sh
      const terms = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").map(x=>x.trim()).filter(x=>x && !x.startsWith("#")) : [];
      const text = (read("plan.json") + read("jira/status.json") + read("jira/issues.json")).toLowerCase();
      ok("D5: everything is made up (none of your private terms)", !terms.some(t=>text.includes(t.toLowerCase()))); }
    // the big one: 100 epics at a made-up retailer, on a board with review and acceptance steps
    execFileSync("python3", [path.join(__dirname, "..", "tools", "make-demo.py"), path.join(out, "store"), "--scenario", "store"], {stdio:"ignore"});
    w.P2 = read("store/plan.json"); w.ST2 = read("store/jira/status.json"); w.IS2 = read("store/jira/issues.json");
    ev(`S = normalize(parseText(P2), false); JIRA = parseJiraStatus(ST2); JIRA_ISSUES = parseJiraIssues(IS2); render();`);
    const big = JSON.parse(ev("JSON.stringify((L => ({n:L.length, on:L.filter(x=>x.state==='on').length, fin:L.filter(x=>x.finished).length, parked:L.filter(x=>x.state==='parked').length}))(jiraEpicList()))"));
    ok("D6: the store demo has 100 epics, on the board, parked and finished", big.n === 100 && big.on > 20 && big.parked > 5 && big.fin > 10, JSON.stringify(big));
    ok("D6: its board's columns decide status: review and acceptance steps are in progress", ev(`jiraState("Step 2", "", "inprogress").state`) === "inprogress" && ev(`jiraState("Abandoned", "Won't Do", "done").state`) === "abandoned" && ev(`jiraState("In Production", "Done - Locked", "done").state`) === "done");
    ok("no page errors", !w.errs.length, w.errs.join("; "));
  } catch(e){ ok("crashed", false, String(e.message).slice(0,160)); }
  fs.rmSync(out, {recursive:true, force:true});
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
