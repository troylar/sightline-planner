// A lighter menu: four pinned pages on top (Today, Sprint, Timeline, Capacity) until someone changes them, groups that
// start closed, and counts only where something needs you. Pins are this browser's: pin from a group, from the
// keyboard (P), unpin from the top, at most five; they never reach the plan. The sample plan, no file linked.
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
  const pins = () => $$("#snpins .snk").map(b=>b.querySelector(".snl").textContent).join();
  const status = () => $("#status")?.textContent || "";
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; UI.navRail = false; delete UI.navPins; UI.navOpen = {}; goWs("timeline"); render();`); await wait(20);
    ok("P0 four pages are pinned on top until you change them: Today, Sprint, Timeline, Capacity", !$("#snpins").hidden && pins() === "Today,Sprint,Timeline,Capacity", pins());
    ok("P1 groups start closed, and the one you're in stays closed when its page is pinned", $$(".sngroup.open").length === 0, $$(".sngroup.open").map(g=>g.dataset.group).join());
    ok("P2 one current page: the pinned Timeline", $$('#sidenav [aria-current="page"]').length === 1 && $("#pin-tab-timeline").getAttribute("aria-current") === "page");
    $("#pin-tab-people").click(); await wait(10);
    ok("P3 a pinned page opens like its menu page", ev("UI.ws") === "people" && $("#pin-tab-people").getAttribute("aria-current") === "page");
    ev(`UI.planTab = "milestones"; goWs("plan")`); await wait(10);
    ok("P4 a page that isn't pinned opens its group and is the current page there", $('.sngroup[data-group="delivery"]').classList.contains("open") && $("#delivery-milestones").getAttribute("aria-current") === "page" && $$('#sidenav [aria-current="page"]').length === 1);
    ok("P5 plain tallies are gone (no milestone, gate or decision counts)", !$$("#sidenav .snc").length && !/\d/.test($("#delivery-gates").textContent + $("#delivery-decisions").textContent + $("#delivery-milestones").textContent.replace(/⚠ \d+/, "")));
    const high = ev(`S.risks.filter(r=>r.sev === "high").length`);
    ok("P5a counts that need you stay: Risks says how many are high", high > 0 && $("#delivery-risks").textContent.includes(`${high} high`), $("#delivery-risks").textContent);
    $("#pin-tab-timeline").click(); await wait(10);
    const dhd = $("#nav-delivery");
    ok("P6 a closed group shows a dot when something inside needs you, and says so", !$('.sngroup[data-group="delivery"]').classList.contains("open") && !dhd.querySelector(".sndot").hidden && /needs attention/.test(dhd.getAttribute("aria-label") || ""), dhd.getAttribute("aria-label"));
    $("#delivery-risks").parentElement.querySelector(".snpinx").click(); await wait(10);
    ok("P7 pinning a page from its group adds it at the end, with what needs you", pins() === "Today,Sprint,Timeline,Capacity,Risks" && $("#pin-delivery-risks").textContent.includes(`${high} high`) && /^Pinned Risks/.test(status()), pins());
    ok("P7a and it's remembered in this browser", JSON.stringify(JSON.parse(w.localStorage.getItem("timeline-planner-ui")).navPins) === JSON.stringify(["tab-today","tab-standup","tab-timeline","tab-people","delivery-risks"]));
    ok("P7c pin buttons say pinned or not (aria-pressed), and the pages announce P", $("#delivery-gates").parentElement.querySelector(".snpinx").getAttribute("aria-pressed") === "false" && $("#pin-tab-today").parentElement.querySelector(".snpinx").getAttribute("aria-pressed") === "true"
      && $("#delivery-gates").getAttribute("aria-keyshortcuts") === "P" && $("#pin-tab-today").getAttribute("aria-keyshortcuts") === "P" && /\(P\)/.test($("#delivery-gates").parentElement.querySelector(".snpinx").title));
    ok("P7d the pinned rows sit under a Pinned label", $("#snpins").firstElementChild?.textContent === "Pinned");
    ok("P7b the page's own pin button now reads Unpin", $("#delivery-risks").parentElement.querySelector(".snpinx").getAttribute("aria-pressed") === "true" && /^Unpin Risks/.test($("#delivery-risks").parentElement.querySelector(".snpinx").getAttribute("aria-label")));
    ev("render()"); await wait(10); const row = $("#pin-delivery-risks"); ev("render()"); await wait(10);
    ok("P7e a redraw with nothing new in the menu leaves the pinned rows as they are", $("#pin-delivery-risks") === row && $("#pin-delivery-risks").getAttribute("aria-current") === null);
    const low = ev(`S.risks.findIndex(r=>r.sev !== "high")`);
    ev(`commit(s => { s.risks[${low}].sev = "high"; })`); await wait(10);
    ok("P7f a new high risk updates the pinned Risks count right away", $("#pin-delivery-risks").textContent.includes(`${high + 1} high`), $("#pin-delivery-risks").textContent);
    ev(`commit(s => { s.risks[${low}].sev = "low"; })`); await wait(10);
    $("#delivery-gates").parentElement.querySelector(".snpinx").click(); await wait(10);
    ok("P8 a sixth pin is refused, and it says why", !pins().includes("Gates") && /up to 5 pages/.test(status()), status());
    $("#pin-tab-standup").parentElement.querySelector(".snpinx").click(); await wait(10);
    ok("P9 unpinning from the top removes it there; it's still in its group", pins() === "Today,Timeline,Capacity,Risks" && !!$("#snp-work #tab-standup") && /still in its group/.test(status()), pins());
    $("#delivery-gates").dispatchEvent(new w.KeyboardEvent("keydown", {key:"p", bubbles:true})); await wait(10);
    ok("P10 P pins the page you're on in the menu, from the keyboard", pins() === "Today,Timeline,Capacity,Risks,Gates", pins());
    $("#pin-delivery-gates").dispatchEvent(new w.KeyboardEvent("keydown", {key:"P", bubbles:true})); await wait(10);
    ok("P10a and P on a pinned page unpins it", pins() === "Today,Timeline,Capacity,Risks", pins());
    ok("P11 pins never reach the plan", !/navPins|snpins/.test(ev("JSON.stringify(planOfRecord(S))")));
    ev(`UI.navRail = true; render()`); await wait(10);
    ok("P12 the collapsed menu (the rail) shows group icons only, no pins", $("#snpins").hidden);
    ev(`UI.navRail = false; UI.navPins = []; render()`); await wait(10);
    ok("P13 with nothing pinned the pinned area goes away and the group you're in opens", $("#snpins").hidden && $('.sngroup[data-group="delivery"]').classList.contains("open"));
    ok("E1 no page errors", !JSON.parse(ev("JSON.stringify(errs)")).length, ev("errs.join('; ')"));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
