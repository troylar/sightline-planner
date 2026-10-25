// One sprint, edge to edge. The zoom control's sprint picker fits the view to a chosen sprint (its first day at the left,
// its last at the right) in Weeks and Days, for sprints of any length; ‹ ›, [ and ] step whole sprints; "." goes to the
// sprint we're in, or the next one between sprints; Fit clears it; the choice is kept and a link can carry it. Fixed
// clocks; the timeboxes from fixtures/timebox-plan.js with Sprint 44 made three weeks long. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const TB = require("./fixtures/timebox-plan.js");
const FIX = (()=>{ const o = JSON.parse(TB(fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"))); o.sprints.find(s=>s.id === "tb-44").weeks = 3; o.meta.weeks = 14; return JSON.stringify(o); })();
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
async function open(iso){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate(iso + "T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s);
  Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? 1100 : 0; }});
  await wait(150); w.FIX = FIX;
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); resetHistory(); sel = null; UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; goWs('timeline'); render()");
  ev("window.went = []; const __sv = scrollViewTo; scrollViewTo = day => { window.went.push(day); return __sv(day); }");
  const key = k => d.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true}));
  const pick = () => d.querySelector("#zoomSprint"), day = iso => ev(`isoToDay('${iso}')`), last = () => ev("window.went[window.went.length - 1]");
  const choose = iso => { const s = pick(); s.value = String(day(iso)); s.dispatchEvent(new w.Event("change", {bubbles:true})); };
  return {w, d, ev, key, pick, day, last, choose, J:s=>JSON.parse(ev(`JSON.stringify(${s})`))};
}
(async()=>{
  try {
    // Wednesday Oct 7, in Sprint 42. The plan: lead (1 wk), 42 (2), gap (2), 43 (2), 44 (3), 45 (2), 46 (2) from Sep 21.
    const P = await open("2026-10-07"), {d, ev, key, pick, day, last, choose} = P;
    const opts = [...pick().options].map(o=>o.textContent);
    ok("P1 the zoom control has a sprint picker listing the plan's sprints with their dates, not the lead or the gap", pick() && opts.length === 6 && opts[0] === "Sprint: any" && /^Sprint 42 · Sep 28 – Oct 9 · now$/.test(opts[1]) && /^Sprint 44 · Nov 9 – Nov 27$/.test(opts[3]) && !opts.some(t=>/Before|No sprint/.test(t)), opts.join(" | "));
    ok("P1 …with a name for a screen reader", /Fit the view to a sprint/.test(pick().closest("label").textContent));
    choose("2026-11-09");
    ok("W1 choosing a three-week sprint shows exactly three weeks, from its first day", ev("zoomN()") === 1 && ev("zoomWeeks()") === 3 && last() === day("2026-11-09") && ev("UI.zoomSp") === "2026-11-09", `${ev("zoomWeeks()")} weeks, went ${last()}`);
    const lw = ev("UI.labelW.weeks"), avail = 1100 - lw - 2;
    ok("W1 …the chart is sized so those three weeks fill the screen", Math.abs(parseFloat(d.querySelector("#gantt").style.minWidth) - (lw + avail * 14 / 3)) < 0.01, d.querySelector("#gantt").style.minWidth);
    ok("W1 …and the picker and status say which", pick().value === String(day("2026-11-09")) && /Showing Sprint 44: Nov 9 to Nov 27/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
    key("]");
    ok("K1 ] steps to the next sprint, fitted to its own two weeks", ev("UI.zoomSp") === "2026-11-30" && ev("zoomWeeks()") === 2 && last() === day("2026-11-30"));
    key("["); key("[");
    ok("K2 [ steps back a whole sprint at a time, past the gap", ev("UI.zoomSp") === "2026-10-26", ev("UI.zoomSp"));
    key("["); key("[");
    ok("K3 at the plan's first sprint, [ stays and says so", ev("UI.zoomSp") === "2026-09-28" && /first sprint/.test(d.querySelector("#status").textContent), ev("UI.zoomSp"));
    choose("2026-12-14"); key("]");
    ok("K4 at the last, ] stays and says so", ev("UI.zoomSp") === "2026-12-14" && /last sprint/.test(d.querySelector("#status").textContent));
    const later = [...d.querySelectorAll("#gantt .ghead button")].find(b=>b.getAttribute("aria-label") === "Previous sprint");
    ok("B1 the ‹ › buttons become Previous and Next sprint", !!later && !!d.querySelector('#gantt .ghead button[aria-label="Next sprint"]'));
    later.click();
    ok("B1 …and step whole sprints", ev("UI.zoomSp") === "2026-11-30");
    key("."); await wait(20);
    ok("T1 . goes to the sprint we're in", ev("UI.zoomSp") === "2026-09-28" && last() === day("2026-09-28"));
    ev("setZoomN(2)");
    choose("2026-11-09");
    ok("N1 with two sprints chosen, the view is those two from the chosen one, each its own length", ev("zoomN()") === 2 && ev("zoomWeeks()") === 5 && last() === day("2026-11-09"), `${ev("zoomWeeks()")} weeks`);
    ev("setZoomN(1)");
    ok("N1 …back to one, still that sprint", ev("UI.zoomSp") === "2026-11-09" && ev("zoomWeeks()") === 3);
    ev("setZoom('days')");
    const DV = P.J("{colW:DV.colW, a:DV.colOf(isoToDay('2026-11-09')), z:DV.colOf(isoToDay('2026-11-27'))}"), availD = 1100 - ev("UI.labelW.days") - 2;
    ok("D1 Days fits the same sprint: its 15 working days fill the screen, from its first", DV.z - DV.a + 1 === 15 && Math.abs(DV.colW * 15 - availD) < 0.01 && last() === day("2026-11-09"), JSON.stringify(DV));
    key("]");
    ok("D2 ] in Days steps sprints too, while one is chosen", ev("UI.zoomSp") === "2026-11-30" && Math.abs(ev("DV.colW") * 10 - availD) < 0.01);
    ev("setZoom('weeks')"); ev("setZoomN(0)");
    ok("F1 Fit clears the chosen sprint", !ev("UI.zoomSp") && pick().value === "");
    ok("F1 …and with none chosen, [ and ] in Weeks don't step sprints", (key("]"), !ev("UI.zoomSp")));
    choose("2026-11-09");
    ok("L1 the choice is kept in this browser", JSON.parse(P.w.localStorage.getItem("timeline-planner-ui")).zoomSp === "2026-11-09");
    ok("L2 and the address carries it", /(^|&|#)sp=2026-11-09(&|$)/.test(ev("encodeNav(navState())")), ev("encodeNav(navState())"));
    ok("Z no page errors", !P.w.errs.length, P.w.errs.join(" | "));

    // A link with a sprint opens on it; between sprints, . goes to the next one.
    const Q = await open("2026-10-15");
    Q.ev(`applyNav(parseNav("#ws=timeline&plan=" + encodeURIComponent(S.meta.planId) + "&z=weeks&n=1&sp=2026-11-30"))`); await wait(30);
    ok("L3 a link with a sprint opens fitted to it", Q.ev("UI.zoomSp") === "2026-11-30" && Q.ev("zoomWeeks()") === 2 && Q.last() === Q.day("2026-11-30"), Q.ev("UI.zoomSp"));
    Q.key("."); await wait(20);
    ok("T2 between sprints, . goes to the next one", Q.ev("UI.zoomSp") === "2026-10-26", Q.ev("UI.zoomSp"));
    ok("T2 …and the picker marks it next", /Sprint 43 · Oct 26 – Nov 6 · next/.test([...Q.pick().options].map(o=>o.textContent).join("|")));
    Q.ev(`applyNav(parseNav("#ws=timeline&plan=" + encodeURIComponent(S.meta.planId) + "&z=weeks&n=1&sp=not-a-date"))`); await wait(30);
    ok("L4 a link with a bad sprint is ignored", !Q.ev("UI.zoomSp"));
    ok("Z2 no page errors", !Q.w.errs.length, Q.w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
