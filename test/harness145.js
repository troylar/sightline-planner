// The performance harness's own checks (test/perf): the generator is seeded and sized as documented, every part of its plans
// survives the page's reading (nothing dropped, so the harness measures what it says), its names are invented, XL is said
// to be past the Jira file limits, and the budgets and the check that reads them agree with the scenarios.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const {generate, SIZES} = require("./perf/gen.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    ok("G1 the same seed and day give the same plan; a different seed or day a different one", JSON.stringify(generate("M", 1, "2026-10-28")) === JSON.stringify(generate("M", 1, "2026-10-28")) && JSON.stringify(generate("M", 1, "2026-10-28")) !== JSON.stringify(generate("M", 2, "2026-10-28")) && JSON.stringify(generate("M", 1, "2026-10-28")) !== JSON.stringify(generate("M", 1, "2026-11-04")));
    const sz = Object.fromEntries(Object.keys(SIZES).map(s => [s, generate(s, 1, "2026-10-28")]));
    const count = g => ({lanes:g.plan.lanes.length, bars:g.plan.bars.length, tasks:g.plan.bars.reduce((n, b) => n + b.tasks.length, 0), stories:Object.values(g.status.issues).filter(i => i.type === "Story").length});
    const want = {S:[5, 30, 150, 300], M:[12, 120, 800, 2000], L:[25, 400, 3000, 8000], XL:[40, 1000, 8000, 25000]};
    ok("G2 each size has the documented workstreams, initiatives, plan tasks and Jira stories", Object.entries(want).every(([s, w]) => JSON.stringify(Object.values(count(sz[s]))) === JSON.stringify(w)), JSON.stringify(Object.fromEntries(Object.entries(sz).map(([s, g]) => [s, count(g)]))));
    ok("G3 the time spans: 26, 52 and 104 weeks; XL asks for 156 and gets the 104 a plan can hold", sz.S.weeks === 26 && sz.M.weeks === 52 && sz.L.weeks === 104 && sz.XL.weeks === 104 && sz.XL.asked.weeks === 156);
    const L = sz.L.plan;
    ok("G4 the hard shapes are there: long labels, 8 milestones on one day, 20-deep chains, parked, stories off, unestimated, no sprint, abandoned",
      L.bars.some(b => b.label.length > 200) && Object.values(L.milestones.reduce((m, x) => (m[x.at] = (m[x.at] || 0) + 1, m), {})).some(n => n >= 8)
      && L.bars.filter(b => b.dependsOn.length).length >= 19 * Math.floor(L.bars.length / 25) - 5 && L.bars.some(b => b.parked) && L.bars.some(b => (b.storiesOff || []).length)
      && Object.values(sz.L.status.issues).some(i => i.type === "Story" && i.points == null) && Object.values(sz.L.status.issues).some(i => i.type === "Story" && !i.sprintId)
      && Object.values(sz.L.status.issues).some(i => i.resolution === "Won't Do") && sz.L.status.sprints.some(s => s.state === "future" && s.end < sz.L.today));
    const FIRST = new Set(["Avery","Blake","Casey","Devon","Emery","Finley","Gray","Harper","Indigo","Jules","Kai","Logan","Morgan","Noel","Oakley","Parker","Quinn","Reese","Sage","Tatum","Umi","Vale","Wren","Yael","Zion"]);
    ok("G5 every person is an invented name from the generator's lists, and every Jira link is jira.example.com", sz.XL.plan.people.every(p => FIRST.has(p.name.split(" ")[0])) && [sz.S, sz.XL].every(g => g.plan.meta.jiraBase === "https://jira.example.com/browse/" && g.status.jiraBase === g.plan.meta.jiraBase));
    ok("G6 XL's Jira file is past the page's limits (5 MB, 9,000 issues), which the harness reports; L's is within them",
      JSON.stringify(sz.XL.status).length > 5 * 1024 * 1024 && Object.keys(sz.XL.status.issues).length > 9000 && JSON.stringify(sz.L.status).length < 5 * 1024 * 1024 && Object.keys(sz.L.status.issues).length < 9000
      && /over 5 MB: loaded in memory/.test(fs.readFileSync(path.join(__dirname, "perf", "run.js"), "utf8")));

    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD("2026-10-28T10:00:00").getTime(); w.Date = class extends RD {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    await wait(150); const w = dom.window, ev = s=>w.eval(s);
    for (const s of ["S", "M", "L"]){
      w.PLAN = JSON.stringify(sz[s].plan); w.STATUS = JSON.stringify(sz[s].status);
      const got = JSON.parse(ev(`(() => { const p = parseText(PLAN), j = parseJiraStatus(STATUS); return JSON.stringify({lanes:p.lanes.length, bars:p.bars.length, tasks:p.bars.reduce((n, b) => n + b.tasks.length, 0),
        milestones:p.milestones.length, notes:p.notes.length, decisions:p.decisions.length, risks:p.risks.length, people:p.people.length, weeks:p.meta.weeks, sprints:p.sprints.length,
        deps:p.bars.reduce((n, b) => n + b.dependsOn.length, 0), off:p.bars.reduce((n, b) => n + (b.storiesOff || []).length, 0), parked:p.bars.filter(b => b.parked).length,
        issues:Object.keys(j.issues).length, rollups:Object.keys(j.rollups).length, jsprints:j.sprints.length}); })()`));
      const P = sz[s].plan, St = sz[s].status;
      const exp = {lanes:P.lanes.length, bars:P.bars.length, tasks:P.bars.reduce((n, b) => n + b.tasks.length, 0), milestones:P.milestones.length, notes:P.notes.length, decisions:P.decisions.length, risks:P.risks.length,
        people:P.people.length, weeks:P.meta.weeks, sprints:P.sprints.length, deps:P.bars.reduce((n, b) => n + b.dependsOn.length, 0), off:P.bars.reduce((n, b) => n + (b.storiesOff || []).length, 0),
        parked:P.bars.filter(b => b.parked).length, issues:Object.keys(St.issues).length, rollups:Object.keys(St.rollups).length, jsprints:St.sprints.length};
      ok(`R1 ${s}: the page reads every part of the plan and the Jira file, dropping nothing`, JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(Object.fromEntries(Object.entries(exp).filter(([k, v]) => got[k] !== v).map(([k, v]) => [k, [v, got[k]]]))));
    }
    ok("R2 no page errors", !w.errs.length, w.errs.join(" | "));

    // budgets: every entry names a scenario the runner has, at sizes it knows, with a number to meet; known ceilings name budgets
    const run = fs.readFileSync(path.join(__dirname, "perf", "run.js"), "utf8"), ids = new Set([...run.matchAll(/def\("([a-z]+\.[A-Za-z]+)"/g)].map(m => m[1]));
    for (const [, id] of run.matchAll(/\["(tl\.[a-z]+)", \d, "/g)) ids.add(id);
    for (const [, id] of run.matchAll(/\["(page\.[a-z]+)", "/g)) ids.add(id);
    for (const f of ["budgets.json", "budgets-ci.json"]){
      const B = JSON.parse(fs.readFileSync(path.join(__dirname, "perf", f), "utf8")), bad = [];
      for (const [id, b] of Object.entries(B.budgets || {})){ if (!ids.has(id)) bad.push(id + " isn't a scenario"); if (!(b.ms > 0) === !(b.fps > 0)) bad.push(id + " needs ms or fps"); if (!(b.sizes || []).every(s => SIZES[s])) bad.push(id + " size"); if (![1, 4].includes(b.cpu)) bad.push(id + " cpu"); }
      for (const k of Object.keys(B.known || {})){ const [s, c, id] = k.split("/"); const b = (B.budgets || {})[id]; if (!b || !b.sizes.includes(s) || b.cpu !== +c) bad.push(k + " has no budget"); }
      ok(`B1 ${f}: every budget is a real scenario with a limit, and every known ceiling has a budget`, !bad.length && Object.keys(B.budgets || {}).length > 0, bad.join("; "));
    }
    ok("B2 every scenario in the runner has a budget in budgets.json", [...ids].every(id => JSON.parse(fs.readFileSync(path.join(__dirname, "perf", "budgets.json"), "utf8")).budgets[id]), [...ids].filter(id => !JSON.parse(fs.readFileSync(path.join(__dirname, "perf", "budgets.json"), "utf8")).budgets[id]).join(", "));
    ok("B3 the harness isn't shipped: test/ stays out of the package", !JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).files.some(f => f.startsWith("test")));
    dom.window.close();
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length;
  console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
