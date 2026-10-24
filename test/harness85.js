// check-amendments (the sync's offline checker) gives the same verdict as the page's checker for every rule: one change
// per rule, both checkers, compared. Fails on the build before this (there's no check-amendments command).
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path"); const os = require("os"); const {spawnSync} = require("child_process");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const SYNC = process.env.SIGHTLINE_SYNC || path.join(__dirname, "..", "tools", "sightline-jira-sync.py");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 60000).unref?.();
const P = JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8"));
P.deliverables = [{id:"dv-a", name:"Alpha", stage:"planned", target:"2027-H1", jira:["ABC-1"]}, {id:"dv-b", name:"Beta", stage:"idea"}];
P.proposals = [{id:"prop-1", server:"https://jira.example.com", key:"ABC-2", field:"points", value:5, seen:{value:"", at:""}, why:"", review:{state:"proposed", by:"", at:""}}];
P.people = P.people && P.people.length ? P.people : [{id:"person-1", name:"Avery Stone"}];
const LANE = P.lanes[0].id, PERSON = P.people[0].id;
// initiatives and tasks: a plain one, one dated by its tasks, one linked to Jira, one holding another
const kidsOf = id => P.bars.some(x=>x.parent === id);
const plainBars = P.bars.filter(x=>!(x.tasks||[]).length && !kidsOf(x.id) && !x.parent && x.kind !== "waiting" && !x.parked);
const BP = plainBars[0], BJ = plainBars[1]; BP.jira = ""; BP.epics = []; BP.label = "Plain one"; BJ.jira = "ABC-1";
const BT = plainBars[2], BK = plainBars[3]; plainBars[4].parent = BK.id;
BT.datesFrom = "tasks"; BT.tasks = [{id:"task-t1", label:"First task", start:P.meta.start, days:3, owners:[], status:"notstarted"}]; const TK = BT.tasks[0];
const isoAt = w => { const d = new Date(P.meta.start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.round(w * 7)); return d.toISOString().slice(0, 10); };
const monday = n => { const d = new Date(P.meta.start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); };
const iset = (type, id, field, prev, value) => ({op:"set", type, id, field, prev, value});
const ST = {kind:"sightline-jira-status", version:1, generatedAt:"2026-09-28T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
  issues:{"ABC-1":{summary:"One", status:"To Do", category:"todo", type:"Story", assigneeKey:"U1", assignee:"Avery", sprintId:42}, "ABC-2":{summary:"Two", status:"To Do", category:"todo", type:"Story"}},
  sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}], releases:[{id:"7", name:"v2.0", date:"2026-11-02", project:"ABC"}]};
const set = (id, field, prev, value) => ({op:"set", type:"deliverable", id, field, prev, value});
const CASES = {
  "add-ok":[{op:"add", type:"deliverable", id:"dv-new", value:{name:"New", target:"2027-Q2", lane:LANE, owners:[PERSON], jira:["abc-2"]}}],
  "add-bad-id":[{op:"add", type:"deliverable", id:"new", value:{name:"New"}}],
  "add-bad-field":[{op:"add", type:"deliverable", id:"dv-x", value:{name:"X", color:"red"}}],
  "add-no-name":[{op:"add", type:"deliverable", id:"dv-y", value:{line:"No name"}}],
  "add-same":[{op:"add", type:"deliverable", id:"dv-b", value:{name:"Beta"}}],
  "add-clash":[{op:"add", type:"deliverable", id:"dv-b", value:{name:"Other"}}],
  "add-twice":[{op:"add", type:"deliverable", id:"dv-z", value:{name:"Z"}}, {op:"add", type:"deliverable", id:"dv-z", value:{name:"Z"}}],
  "add-then-set":[{op:"add", type:"deliverable", id:"dv-w", value:{name:"W"}}, set("dv-w", "target", null, "2027")],
  "set-ok":[set("dv-a", "target", "2027-H1", "2027-Q1")],
  "set-stale":[set("dv-a", "target", "2026-Q4", "2027-Q1")],
  "set-done":[set("dv-a", "target", "2026-Q4", "2027-H1")],
  "set-no-prev":[{op:"set", type:"deliverable", id:"dv-a", field:"target", value:"2027"}],
  "set-bad-target":[set("dv-a", "target", "2027-H1", "2027-Q9")],
  "set-jira":[set("dv-a", "jira", null, ["ABC-2"])],
  "set-release-bad":[set("dv-a", "release", null, "99")],
  "set-release-ok":[set("dv-a", "release", null, "7")],
  "set-lane-bad":[set("dv-a", "lane", null, "nope")],
  "set-owners-bad":[set("dv-a", "owners", null, ["nobody"])],
  "set-name-null":[set("dv-a", "name", "Alpha", null)],
  "set-date-bad":[set("dv-a", "date", null, "2027-02-30")],
  "link-ok":[{op:"link", type:"deliverable", id:"dv-a", jira:["ABC-2"]}],
  "link-done":[{op:"link", type:"deliverable", id:"dv-a", jira:["abc-1"]}],
  "unlink-done":[{op:"unlink", type:"deliverable", id:"dv-a", jira:["ABC-2"]}],
  "link-bad":[{op:"link", type:"deliverable", id:"dv-a", jira:["nope"]}],
  "missing-dv":[set("dv-gone", "name", "x", "y")],
  "propose-ok":[{op:"propose", key:"ABC-1", field:"status", value:"Done", why:"shipped"}],
  "propose-field":[{op:"propose", key:"ABC-1", field:"summary", value:"x"}],
  "propose-sprint-bad":[{op:"propose", key:"ABC-1", field:"sprint", value:"Sprint 99"}],
  "propose-sprint-ok":[{op:"propose", key:"ABC-1", field:"sprint", value:"Sprint 42"}],
  "propose-user-bad":[{op:"propose", key:"ABC-1", field:"assignee", value:"ghost"}],
  "propose-points-text":[{op:"propose", key:"ABC-1", field:"points", value:"5"}],
  "propose-open":[{op:"propose", key:"ABC-2", field:"points", value:5}],
  "bad-op":[{op:"move", type:"deliverable", id:"dv-a"}],
  "in-label":[iset("initiative", BP.id, "label", "Plain one", "Renamed")],
  "in-start":[iset("initiative", BP.id, "start", isoAt(BP.start), monday(Math.floor(BP.start) + 1))],
  "in-start-stale":[iset("initiative", BP.id, "start", monday(40), monday(2))],
  "in-weeks":[iset("initiative", BP.id, "weeks", BP.span, BP.span + 1)],
  "in-weeks-bad":[iset("initiative", BP.id, "weeks", BP.span, 0.3)],
  "in-status":[iset("initiative", BP.id, "status", BP.status, "atrisk")],
  "in-status-bad":[iset("initiative", BP.id, "status", BP.status, "blocked")],
  "in-lane-bad":[iset("initiative", BP.id, "lane", BP.lane, "nope")],
  "in-jira-status":[iset("initiative", BJ.id, "status", BJ.status, "done")],
  "in-jira-label":[iset("initiative", BJ.id, "label", BJ.label, "Label is ours")],
  "in-derived-start":[iset("initiative", BT.id, "start", isoAt(BT.start), monday(3))],
  "in-derived-status":[iset("initiative", BT.id, "status", BT.status, "done")],
  "in-kids-weeks":[iset("initiative", BK.id, "weeks", BK.span, 3)],
  "in-missing":[iset("initiative", "bar-none", "label", "x", "y")],
  "in-start-outside":[iset("initiative", BP.id, "start", isoAt(BP.start), "2001-01-01")],
  "in-add":[{op:"add", type:"initiative", id:"bar-new", value:{label:"New one", lane:LANE, start:monday(2), weeks:3}}],
  "in-add-missing":[{op:"add", type:"initiative", id:"bar-new2", value:{label:"No lane", start:monday(2), weeks:3}}],
  "in-add-bad-id":[{op:"add", type:"initiative", id:"new", value:{label:"x", lane:LANE, start:monday(2), weeks:3}}],
  "in-add-dup":[{op:"add", type:"initiative", id:"bar-dup", value:{label:"x", lane:LANE, start:monday(2), weeks:3}}, {op:"add", type:"initiative", id:"bar-dup", value:{label:"x", lane:LANE, start:monday(2), weeks:3}}],
  "in-add-task":[{op:"add", type:"initiative", id:"bar-n3", value:{label:"With a task", lane:LANE, start:monday(2), weeks:2}}, {op:"add", type:"task", id:"task-n3", value:{initiative:"bar-n3", label:"First", start:monday(2), days:3}}],
  "in-delete":[{op:"del", type:"initiative", id:BP.id}],
  "tk-days":[iset("task", TK.id, "days", TK.days, TK.days + 2)],
  "tk-days-bad":[iset("task", TK.id, "days", TK.days, 2.5)],
  "tk-start-weekend":[iset("task", TK.id, "start", TK.start, (()=>{ const d = new Date(monday(3) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 5); return d.toISOString().slice(0, 10); })())],
  "tk-label":[iset("task", TK.id, "label", TK.label, "Task renamed")],
  "tk-add":[{op:"add", type:"task", id:"task-new", value:{initiative:BP.id, label:"New task", start:monday(2), days:2}}],
  "tk-add-kids":[{op:"add", type:"task", id:"task-k", value:{initiative:BK.id, label:"No", start:monday(2), days:2}}],
  "tk-done-already":[iset("task", TK.id, "label", "whatever", TK.label)],
  "bad-type":[{op:"set", type:"bar", id:"x", field:"label", prev:"a", value:"b"}]};
const amFile = (changes, pid) => JSON.stringify({kind:"sightline-amendments", version:1, planId:pid, batchId:"b1", createdAt:"2026-09-28T10:00:00Z", source:"test", basedOn:{planRevision:0}, changes});
(async()=>{
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;}; w.indexedDB = undefined;
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})}); w.CSS = {escape:s=>s}; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  w.PLAN = JSON.stringify(P); w.STS = JSON.stringify(ST);
  ev(`S = normalize(JSON.parse(PLAN), false); JIRA = parseJiraStatus(STS); render();`);
  const pid = ev("S.meta.planId");
  const plan = JSON.parse(ev("JSON.stringify(S)"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-am-")), pf = path.join(dir, "plan.json"), sf = path.join(dir, "status.json"), af = path.join(dir, "am.json");
  fs.writeFileSync(pf, JSON.stringify(plan)); fs.writeFileSync(sf, JSON.stringify(ST));
  const changes = Object.entries(CASES).map(([id, ops])=>({id, summary:id, ops}));
  fs.writeFileSync(af, amFile(changes, pid));
  const py = spawnSync("python3", [SYNC, "check-amendments", pf, af, "--status", sf, "--json"], {encoding:"utf8"});
  let out = null; try { out = JSON.parse(py.stdout); } catch(e){}
  ok("K0 check-amendments runs and prints JSON", !!out && Array.isArray(out.changes), (py.stderr || py.stdout || "").slice(0, 160));
  if (out){
    w.AMC = JSON.stringify(changes);
    const page = JSON.parse(ev(`JSON.stringify(Object.fromEntries(JSON.parse(AMC).map(c=>[c.id, amCheck(c, S).status])))`));
    const pyS = Object.fromEntries(out.changes.map(r=>[r.id, r.status]));
    const diff = Object.keys(CASES).filter(k=>page[k] !== pyS[k]).map(k=>`${k}: page ${page[k]}, sync ${pyS[k]}`);
    ok(`K1 the same verdict as the page for all ${Object.keys(CASES).length} rules`, !diff.length, diff.join("; "));
    const kinds = new Set(Object.values(page));
    ok("K2 the cases cover ready, changed, invalid and done", ["ready","changed","invalid","done"].every(k=>kinds.has(k)), [...kinds].join(","));
    ok("K3 it exits 1 when anything is invalid", py.status === 1 && out.ok === false && out.counts.invalid > 0);
    fs.writeFileSync(af, amFile([{id:"one", ops:CASES["set-ok"]}], "another-plan"));
    const p2 = spawnSync("python3", [SYNC, "check-amendments", pf, af, "--status", sf], {encoding:"utf8"});
    ok("K4 a file for another plan is refused, as on the page", p2.status === 2 && /another plan/.test(p2.stdout), p2.stdout.slice(0, 120));
    fs.writeFileSync(af, amFile([{id:"one", ops:CASES["set-ok"]}, {id:"two", ops:CASES["link-ok"]}], pid));
    const p3 = spawnSync("python3", [SYNC, "check-amendments", pf, af, "--status", sf], {encoding:"utf8"});
    ok("K5 all good: exit 0 and a readable summary", p3.status === 0 && /^READY   one/m.test(p3.stdout) && /2 ready, 0 changed since, 0 invalid/.test(p3.stdout), p3.stdout.slice(0, 200));
  }
  fs.rmSync(dir, {recursive:true, force:true});
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
