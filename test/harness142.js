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
let GW = 1100;
async function open(iso, fresh){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate(iso + "T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s);
  Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? GW : 0; }});
  await wait(150); w.FIX = FIX;
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); resetHistory(); sel = null; UI.zoom = 'weeks'; goWs('timeline')");
  ev(fresh ? "presetLoaded = false; delete UI.zoomN; delete UI.zoomPreset; UI.zoomSp = null; render()" : "presetLoaded = true; UI.zoomN = 0; UI.zoomSp = null; render()");
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
    const later = [...d.querySelectorAll("#zoomBar button")].find(b=>b.getAttribute("aria-label") === "Previous sprint");
    ok("B1 the ‹ › buttons become Previous and Next sprint", !!later && !!d.querySelector('#zoomBar button[aria-label="Next sprint"]'));
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

    // In Days with no sprint chosen, . goes to this week, not the start of the sprint we're in (1.121.0 to 1.175.3 went to the sprint)
    const W = await open("2026-11-04");   // a Wednesday in Sprint 43's second week (Oct 26 – Nov 6)
    W.ev("setZoom('days'); UI.zoomSp = null; render(); window.dwent = []; const __ds = dayScrollTo; dayScrollTo = (day, o) => { window.dwent.push(day); return __ds(day, o); }");
    W.key("."); await wait(20);
    const dw = W.J("window.dwent");
    ok("T3 in Days, . goes to this week's Monday, not the sprint's first day", !W.ev("UI.zoomSp") && dw[dw.length - 1] === W.day("2026-11-02"), JSON.stringify({went:dw, monday:W.day("2026-11-02"), sprint:W.day("2026-10-26")}));

    // One-click presets: This sprint, This + next, Next 3 and Fit, from the sprint we're in (or the next between sprints).
    const F = await open("2026-10-07"), pb = k => F.d.querySelector(`.zpresets [data-preset="${k}"]`), pressed = () => [...F.d.querySelectorAll(".zpresets .zp")].filter(b=>b.getAttribute("aria-pressed") === "true").map(b=>b.dataset.preset).join(",");
    ok("Q1 the zoom control has This sprint, This + next, Next 3 and Fit, with Fit pressed at Fit", ["1","2","3","0"].map(k=>pb(k)?.getAttribute("aria-label")).join("|") === "This sprint|This + next|Next 3|Fit" && pressed() === "0", pressed());
    ok("Q1 …short on the button (1, 2, 3, Fit), with the full name and shortcut in the tooltip", ["1","2","3","0"].map(k=>pb(k)?.textContent).join("|") === "1|2|3|Fit" && pb(2).title === "This + next (Shift+2)");
    // 1.124.1: the zoom controls sit in the toolbar, so the timeline's header is as short as before them
    const zb = F.d.querySelector("#zoomBar"), corner = F.d.querySelector("#gantt .gcorner");
    ok("T1 the zoom controls are one group in the toolbar: ‹ sprint › | 1 2 3 Fit | − +", !!zb && zb.closest("#wsbar") && zb.getAttribute("role") === "group" && [...zb.children].filter(x=>!x.classList.contains("vh")).map(x=>x.id || x.className).join(" ") === "pgPrev sprpick pgNext zsep zpresets zsep zoomOut zoomIn", [...zb.children].map(x=>x.id || x.className).join(" "));
    ok("T2 the corner is just the row label again", !corner.querySelector("button, select") && corner.textContent.trim() === "Workstream", corner.textContent);
    ok("T3 − and + and the paging keep their names for screen readers", zb.querySelector("#zoomIn").getAttribute("aria-label") === "Zoom in: one sprint fewer" && zb.querySelector("#pgPrev").getAttribute("aria-label") && zb.querySelector("#zoomLab").getAttribute("aria-live") === "polite");
    F.ev("goWs('people')");
    ok("T4 the group is only there on Timeline", zb.hidden === true);
    F.ev("goWs('timeline')");
    const fits = (n, weeks) => { const lw = F.ev("UI.labelW.weeks"), avail = GW - lw - 2, mw = parseFloat(F.d.querySelector("#gantt").style.minWidth);
      return F.ev("zoomWeeks()") === weeks && Math.abs(mw - (lw + avail * 14 / weeks)) < 0.01 && F.last() === F.day("2026-09-28") && F.ev("UI.zoomSp") === "2026-09-28" && pressed() === String(n); };
    const res = [];
    for (const width of [1100, 760]){ GW = width;
      pb(1).click(); res.push(fits(1, 2)); pb(2).click(); res.push(fits(2, 6)); pb(3).click(); res.push(fits(3, 9)); }
    ok("Q2 each preset fits whole sprints edge to edge from the sprint we're in, at two widths (a gap between them is shown, not counted)", res.every(Boolean), res.join(","));
    GW = 1100; pb(0).click();
    ok("Q3 Fit goes back to the whole plan, and is pressed", !F.ev("zoomN()") && !F.ev("UI.zoomSp") && pressed() === "0");
    const shift = (code, from = F.d) => from.dispatchEvent(new F.w.KeyboardEvent("keydown", {key:code === "Digit2" ? "@" : "!", code, shiftKey:true, bubbles:true}));
    shift("Digit2");
    ok("Q4 Shift+2 picks This + next", F.ev("zoomN()") === 2 && F.ev("UI.zoomSp") === "2026-09-28" && pressed() === "2");
    shift("Digit0");
    ok("Q4 …and Shift+0 Fit", !F.ev("zoomN()"));
    F.d.dispatchEvent(new F.w.KeyboardEvent("keydown", {key:"!", code:"Digit1", shiftKey:true, bubbles:true}));
    ok("Q4 the physical key counts, whatever symbol Shift makes: Shift+Digit1 sent as \"!\" picks This sprint", F.ev("zoomN()") === 1 && pressed() === "1");
    ok("Q4 each button names its shortcut on hover", pb(2).title === "This + next (Shift+2)" && pb(0).title === "Fit (Shift+0)", pb(2).title);
    shift("Digit0");
    const t = F.d.querySelector("#title"); t.focus(); shift("Digit1", t);
    ok("Q5 the keys do nothing while typing in a field", !F.ev("zoomN()"));
    t.blur(); F.d.dispatchEvent(new F.w.KeyboardEvent("keydown", {key:"2", code:"Digit2", bubbles:true}));
    ok("Q5 …and plain number keys still change pages", F.ev("UI.ws") === "timeline");
    pb(2).click(); F.ev("zoomOut()");
    ok("Q6 − still works from a preset, as a fine step from the same sprint", F.ev("zoomN()") === 3 && F.ev("UI.zoomSp") === "2026-09-28" && F.ev("UI.zoomPreset") == null);
    F.ev("window.__draws = 0; window.__render = render; render = function(){ __draws++; return __render.apply(this, arguments); }");
    const draws = [1, 2, 0, 0].map(k => { F.ev("__draws = 0"); pb(k).click(); return F.ev("__draws") + ":" + F.ev("UI.zoomPreset"); });
    F.ev("render = __render");
    ok("Q13 a preset draws the page once, and is remembered (This sprint, This + next, Fit, Fit again)", draws.join(",") === "1:1,1:2,1:0,1:0", draws.join(","));
    ok("Q7 no page errors", !F.w.errs.length, F.w.errs.join(" | "));
    // First open: a plan with timeboxes opens on This + next.
    const G = await open("2026-10-07", true);
    ok("Q8 the first time, a plan with timeboxes opens on This + next", G.ev("zoomN()") === 2 && G.ev("UI.zoomSp") === "2026-09-28" && G.d.querySelector('.zpresets [data-preset="2"]').getAttribute("aria-pressed") === "true");
    // A remembered preset follows the calendar: a later visit anchors it to that day's sprint.
    G.ev("UI.zoomPreset = 1; UI.zoomN = 1; UI.zoomSp = '2026-11-09'; presetLoaded = false; render()");
    ok("Q9 a remembered preset opens on that day's sprint", G.ev("zoomN()") === 1 && G.ev("UI.zoomSp") === "2026-09-28");
    G.ev(`UI.zoomPreset = 3; presetLoaded = false; applyNav(parseNav("#ws=timeline&plan=" + encodeURIComponent(S.meta.planId) + "&z=weeks&n=1&sp=2026-11-30")); render()`); await wait(30);
    ok("Q10 a link with a sprint wins over a remembered preset", G.ev("UI.zoomSp") === "2026-11-30" && G.ev("zoomN()") === 1, G.ev("UI.zoomSp"));
    const H = await open("2026-10-15");
    H.d.querySelector('.zpresets [data-preset="2"]').click();
    ok("Q11 between sprints, the presets start at the next one", H.ev("UI.zoomSp") === "2026-10-26" && H.ev("zoomN()") === 2, H.ev("UI.zoomSp"));
    ok("Q12 no page errors", !G.w.errs.length && !H.w.errs.length, [...G.w.errs, ...H.w.errs].join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
