// Order without dates, and what capacity leaves out. The List groups work By order: step 1 waits for nothing, each later
// step waits only on earlier ones, and work that waits on itself through a loop is set apart. Sprint view's capacity
// says which work its points don't count: Jira items with no estimate, and open tasks added here. Nothing is saved.
// Fixed clock (Wed Oct 7, 2026); the sample plan and invented Jira data (jira.example.com, ABC keys).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  try {
    await wait(150); w.FIX = FIX;
    const task = (id, label, start, deps) => ({id, label, start, days:2, owners:[], jira:"", status:"notstarted", ...(deps ? {dependsOn:deps} : {})});
    w.TASKS = {c2:[task("a", "Contract", "2026-10-08"), task("b", "Adapter", "2026-10-12", ["a"]), task("c", "Integrate", "2026-10-14", ["b"]), task("d", "Docs", "2026-10-12", ["a"])],
      c3:[task("e", "Shadow run", "2026-10-20")], c4:[task("x", "Loop one", "2026-10-20", ["y"]), task("y", "Loop two", "2026-10-22", ["x"])]};
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX);
        Object.entries(TASKS).forEach(([b, ts])=>{ p.bars.find(x=>x.id === b).tasks = ts; }); p.bars.forEach(x=>{ x.dependsOn = []; }); p.bars.find(x=>x.id === "c3").dependsOn = ["c2"];
        S = normalize(p, false); S.meta.autoSchedule = false; file.handle = null; render();`);
    const st = T(`Object.fromEntries([...orderSteps()].filter(([k])=>/^task:/.test(k)).map(([k, v])=>[k.slice(5), v]))`);
    ok("O1 a task that waits for nothing is step 1; each later one is one past the latest it waits for", st && st.a === 0 && st.b === 1 && st.d === 1 && st.c === 2, JSON.stringify(st));
    ok("O2 a task waits for what its initiative waits for, all of it (Shadow run's initiative waits for the one holding Integrate, step 3)", st && st.e === 3, JSON.stringify(st && st.e));
    ok("O3 work that waits on itself through a loop is set apart, not given a made-up step", st && st.x === -1 && st.y === -1);
    ev(`setWs("list"); setListLayout("order"); render();`); await wait(40);
    ok("O4 the List has a By order layout", !!$('[data-layout="order"][aria-pressed="true"]'));
    const groups = T(`listGroups(listModel(), "order").map(g=>[g.label, g.rows.map(r=>r.id)])`);
    const gl = (groups || []).map(g=>g[0]);
    ok("O5 every step says what it waits for; the loop comes after the steps, and waiting and unstaffed rows last, apart", gl[0] === "Step 1: waits for nothing" && gl.includes("Step 2: waits for step 1") && gl.includes("Step 3: waits for steps 1 to 2") && gl[gl.length - 2] === "In a loop: these wait for each other" && gl[gl.length - 1] === "Waiting and unstaffed", JSON.stringify(gl));
    const wg = (groups || []).find(g=>g[0] === "Waiting and unstaffed"), wIds = J(`S.bars.filter(b=>b.kind === "waiting").map(b=>b.id)`);
    ok("O5b no waiting or unstaffed row is in a step", wg && wIds.length && wIds.every(id=>wg[1].includes(id)) && (groups || []).filter(g=>g !== wg).every(g=>g[1].every(id=>!wIds.includes(id))), JSON.stringify(wg));
    const g2 = (groups || []).find(g=>/^Step 2:/.test(g[0])), g3 = (groups || []).find(g=>/^Step 3:/.test(g[0]));
    ok("O6 Adapter and Docs are step 2; Integrate is step 3", g2 && g2[1].includes("b") && g2[1].includes("d") && g3 && g3[1].includes("c"), JSON.stringify(groups && groups.slice(0, 4)));
    ok("O7 the page shows the step headings", /Step 1: waits for nothing/.test($("#listWs")?.textContent || "") && /In a loop/.test($("#listWs")?.textContent || ""));
    ok("O8 copying the List as markdown keeps the steps", /\*\*Step 2: waits for step 1\*\*/.test(T(`listMarkdown(listGroups(listModel(), "order"), "order")`) || ""));
    ev(`UI.filter = normFilter({bars:["c3"]}); render();`);
    const hid = T(`listGroups(listModel(), "order").map(g=>[g.label, g.rows.map(r=>r.id)])`);
    ok("O9 hiding what it waits for with filters doesn't change its step", /^Step 4:/.test((hid || []).find(g=>g[1].includes("e"))?.[0] || ""), JSON.stringify(hid));
    ev(`commit(s=>{ s.bars.find(x=>x.id === "c2").tasks.find(t=>t.id === "a").status = "done"; });`);
    ok("O10 steps show order, not what's ready: a done task still puts what waits for it in a later step", T(`orderSteps().get("task:b")`) === 1);
    ev(`UI.filter = normFilter({}); setListLayout("lane"); setWs("timeline"); render();`);

    // What capacity leaves out.
    const sp = (pts, who, cat, sid) => ({summary:"s", status:"x", category:cat, type:"Story", points:pts, assigneeKey:who, sprintId:sid || 42, sprintState:(sid || 42) === 42 ? "active" : "future", resolvedAt:""});
    w.JS = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
      issues:{"ABC-1":sp(5, "U1", "todo"), "ABC-2":sp(null, "U1", "todo"), "ABC-3":sp(null, "U2", "todo", 43), "ABC-4":{summary:"Epic", status:"x", category:"inprogress", type:"Epic", sprintId:42}},
      sprints:[{id:42, name:"Sprint 42", state:"active", start:"2026-09-28", end:"2026-10-09"}, {id:43, name:"Sprint 43", state:"future", start:"2026-10-12", end:"2026-10-23"}]});
    ev(`JIRA = parseJiraStatus(JS); const p = team(); p[0].jira = {key:"U1", user:"u1", name:"A"}; p[0].capacity = 10; p[1].jira = {key:"U2", user:"u2", name:"B"}; p[1].capacity = 10; goWs("standup"); render();`); await wait(40);
    const lo = $("#capLeftOut")?.textContent || "";
    const openHere = T(`(()=>{ const lo = isoToDay("2026-09-28"), hi = isoToDay("2026-10-23"); return S.bars.reduce((n, b)=>n + (b.tasks || []).filter(t=>t.status !== "done" && !t.jira && (x=>x.s <= hi && x.e >= lo)(taskSpan(t, HS()))).length, 0); })()`);
    ok("C1 capacity says what its points don't count: Jira items with no estimate (not epics), and open tasks added here", lo === `Not counted in these points: 2 Jira items with no estimate, ${openHere} open tasks added here (not in Jira).`, lo);
    ev(`commit(s=>{ s.bars.forEach(b=>{ b.tasks = []; }); }); JIRA.issues["ABC-2"].points = 3; JIRA.issues["ABC-3"].points = 2; dropJiraMemos(); render();`); await wait(40);
    ok("C2 when nothing is left out, the line goes", lo.length > 0 && !$("#capLeftOut") && !!$("#suCap"));
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
