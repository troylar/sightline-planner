// A lighter details panel: an initiative or task shows what you need first (warnings, updates, notes, title, status,
// owner, dates, its first three tasks) and folds the rest into Story (when none is written), Schedule, Waits for,
// Organize and More, each with a one-line summary. Open or closed is remembered per item type in this browser and
// never reaches the plan. A field that has to be focused opens its fold. The sample plan, with invented tasks.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), $ = s=>d.querySelector(s), $$ = s=>[...d.querySelectorAll(s)];
  const sum = id => $(`#${id} > summary .pfs`)?.textContent || "";
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX);
      const t = (id, label, start, days, deps) => ({id, label, start, days, owners:[], jira:"", status:"notstarted", ...(deps ? {dependsOn:deps} : {})});
      p.bars.find(x=>x.id === "c4").tasks = [t("a", "Adapter contract", "2026-11-02", 3), t("b", "Wire the adapter", "2026-11-05", 2, ["a"]), t("c", "Load test", "2026-11-09", 3, ["b"]), t("d", "Docs", "2026-11-12", 2), t("e", "Final review", "2026-11-16", 1, ["c"])];
      S = normalize(p, false); file.handle = null; UI.sideFold = {}; render(); select("bar", "c4");`); await wait(20);
    const folds = ["fold-schedule", "fold-deps", "itemOptions", "fold-more"];
    ok("F0 an initiative folds Schedule, Waits for, Organize and More, all closed to start", folds.every(id=>$("#" + id) && !$("#" + id).open), folds.map(id=>`${id}:${$("#" + id) ? ($("#" + id).open ? "open" : "closed") : "missing"}`).join());
    ok("F1 title, status and owner stay out of the folds", ["#f-label", "#f-status", "#f-owner"].every(q=>$(q) && !$(q).closest(".pfold")));
    ok("F2 warnings never fold away", $$("#side .msg").length > 0 && !$$("#side .msg").some(m=>m.closest(".pfold")));
    ok("F3 each fold says what's inside: the length, what it waits for (by name when one or two), the workstream", /\d+(\.\d+)? weeks?/.test(sum("fold-schedule")) && sum("fold-deps") === ev(`barById("c4").dependsOn.map(id=>chartLabel(barById(id))).join(", ")`) && sum("itemOptions").includes(ev(`S.lanes.find(l=>l.id === barById("c4").lane).name`)), [sum("fold-schedule"), sum("fold-deps"), sum("itemOptions")].join(" | "));
    ok("F4 the fields moved, not lost: dates in Schedule, links in Waits for, workstream and place in Organize, Delete in More",
      !!$("#fold-schedule #f-start") && !!$("#fold-schedule #f-span") && !!$("#fold-deps .deps") && !!$("#itemOptions #f-lane") && !!$("#itemOptions #f-parent") && [...$$("#fold-more button")].some(b=>b.textContent === "Delete item"));
    ok("F5 tags go in Organize and who added it in More", !!$("#itemOptions #f-tags") && !!$("#fold-more #f-addedby"));
    ok("F6 a story not written yet folds, and says so", !!$("#fold-story #f-storybox") && sum("fold-story") === "Not written yet");
    ok("F7 only the first three tasks show, then Show all", $$("#side .tasklist button[title]").length === 3 && /^Show all 5$/.test($("#f-alltasks")?.textContent || ""));
    $("#f-alltasks").click(); await wait(10);
    ok("F7a Show all lists every task", $$("#side .tasklist button[title]").length === 5 && !$("#f-alltasks"));
    const sched = $("#fold-schedule"); sched.open = true; sched.dispatchEvent(new w.Event("toggle")); await wait(10);
    ev(`select("bar", S.bars.find(b=>b.id !== "c4" && !b.parked).id)`); await wait(10);
    ok("F8 an opened fold stays open for the next initiative, in this browser", $("#fold-schedule")?.open === true && JSON.parse(w.localStorage.getItem("timeline-planner-ui")).sideFold["bar:schedule"] === true);
    ok("F8a and it never reaches the plan", !/sideFold|fold-schedule/.test(ev("JSON.stringify(planOfRecord(S))")));
    ev(`select("task", "b")`); await wait(10);
    ok("F9 a task keeps its own choices: its folds start closed", ["fold-schedule", "fold-deps", "itemOptions", "fold-more"].every(id=>$("#" + id) && !$("#" + id).open));
    ok("F9a a task's dates, links and initiative are in its folds; title and status are not", !!$("#fold-schedule #f-tstart") && !!$("#fold-deps #f-tdep") && !!$("#itemOptions #f-tbar") && !$("#f-tlabel").closest(".pfold") && !$("#f-tstatus").closest(".pfold"));
    ok("F9b with one or two, Waits for names them", sum("fold-deps") === "Adapter contract", sum("fold-deps"));
    ev(`commit(()=>{ taskById("b").t.dependsOn = ["a", "d", "e"]; }); select("task", "b")`); await wait(10);
    ok("F9c with three or more, it counts them", sum("fold-deps") === "3 items", sum("fold-deps"));
    ev(`undo(); select("bar", "c4")`); await wait(10);
    const nOut = ev(`tasksOutside(barById("c4")).length`);
    ok("F9d the dates warning reads as a sentence: 1 task falls outside", nOut === 1 && [...$$("#side .msg")].some(m=>/^1 task falls outside the planned dates\. Adjust it,/.test(m.textContent)), [...$$("#side .msg")].map(m=>m.textContent).join(" | "));
    ev(`select("bar", "c4"); focusSoon("#f-chart")`); await wait(20);
    ok("F10 a field that has to be focused opens its fold first", $("#itemOptions").open && d.activeElement === $("#f-chart"));
    ev(`commit(()=>{ barById("c4").story = "## Why\\nBecause."; }); select("bar", "c4")`); await wait(10);
    ok("F11 a written story stays on top, in full", !!$("#f-storybox") && !$("#f-storybox").closest(".pfold") && !$("#fold-story"));
    ok("E1 no page errors", !JSON.parse(ev("JSON.stringify(errs)")).length, ev("errs.join('; ')"));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
