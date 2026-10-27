// Too early, counted: an open task that starts before what it waits for finishes joins the initiatives that do, in the
// "start before what they wait for finishes" banner, Present's "starts too early" count and its cycling, and Move them
// later. A done one isn't counted, and isn't moved: finished work keeps the dates it ran on. Fixed clock (Wed Oct 7, 2026); the sample plan with invented tasks.
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
    const task = (id, label, start, days, deps, status) => ({id, label, start, days, owners:[], jira:"", status:status || "notstarted", ...(deps ? {dependsOn:deps} : {})});
    w.TASKS = [task("a", "Adapter contract", "2026-10-12", 4), task("b", "Wire the adapter", "2026-10-13", 2, ["a"]), task("c", "Old spike", "2026-10-05", 1, ["d"], "done"), task("d", "Spike prep", "2026-10-05", 3)];
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX); p.bars.forEach(x=>{ x.dependsOn = []; });
        p.bars.find(x=>x.id === "c4").tasks = TASKS; S = normalize(p, false); S.meta.autoSchedule = false; file.handle = null; render();`);
    ok("T0 the setup: Wire the adapter starts before Adapter contract finishes, and no initiative clashes", T(`tooEarly(taskById("b").t, taskSpan(taskById("b").t, HS()).s)`) === true && T(`S.bars.filter(b=>depProblems(b).length).length`) === 0);
    ok("T1 only the open task counts; a done one that started early is history", JSON.stringify(T(`earlyTasks().map(x=>x.id)`)) === '["b"]', JSON.stringify(T(`earlyTasks()`)));
    const warn = $$("#banners .banner.warn span").map(e=>e.textContent).find(t=>/starts? before what (it waits|they wait) for finishes/.test(t)) || "";
    ok("T2 the banner counts it and names it", /^1 starts before what it waits for finishes: Wire the adapter/.test(warn), warn.slice(0, 120));
    const link = $$("#banners .banner.warn button.linkish").find(b=>b.textContent === "Wire the adapter");
    if (link) link.click(); await wait(20);
    ok("T3 its name opens the task", J(`sel`)?.type === "task" && J(`sel`)?.id === "b", JSON.stringify(J(`sel`)));
    ev(`sel = null; present = true; drawBanners();`);
    const chip = $$("#banners .review .rchip").map(e=>e.textContent).find(t=>/too early/.test(t)) || "";
    ok("T4 Present counts it in the banner's words: 1 starts too early", chip === "1starts too early", chip);
    ev(`cycleReview("dep");`);
    ok("T5 cycling the conflicts selects the task", J(`sel`)?.type === "task" && J(`sel`)?.id === "b");
    ev(`present = false; sel = null; render();`);
    ok("T6 for one, the button says Move it later", $("#fixDeps")?.textContent === "Move it later", $("#fixDeps")?.textContent);
    ev(`fixDeps();`);
    const st = $("#status")?.textContent || "";
    ok("T7 Move them later moves it after what it waits for, and nothing is left; the done task keeps its dates", T(`taskById("b").t.start`) === "2026-10-16" && T(`taskById("c").t.start`) === "2026-10-05" && T(`depClashes().length`) === 0 && /^Moved 1 item so it starts after what it waits for\./.test(st), `${T(`taskById("b").t.start`)} | ${st}`);
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
