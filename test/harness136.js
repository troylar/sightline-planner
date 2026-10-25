// Now on the plan: the sprint we're in is a band behind the bars with "· now" on its header, today is a line with a Today
// tab in the time header (inside the week in Weeks), between sprints the next one says when it starts, and outside the
// plan's dates the tab waits at the edge. Fixed clocks: mid-sprint, its weekend, between sprints, before and after the plan.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const TB = require("./fixtures/timebox-plan.js"), FIX = TB(fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"));
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
function open(iso){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate(iso + "T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s);
  return {w, d:w.document, ev, async load(){ await wait(150); w.FIX = FIX; ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); resetHistory(); sel = null; UI.zoom = 'weeks'; UI.zoomN = 0; goWs('timeline'); render()"); await wait(10); }};
}
const frac = el => { const m = /\* ([\d.e-]+)\)/.exec(el?.style.left || ""); return m ? +m[1] : NaN; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sprintCell = (d, name) => [...d.querySelectorAll(".gsprint")].find(x=>x.querySelector(".spn-a, .spn")?.textContent.startsWith(name));
const lum = hex => { const c = hex.match(/[0-9a-f]{2}/gi).map(x=>{ const v = parseInt(x, 16)/255; return v <= .03928 ? v/12.92 : ((v + .055)/1.055) ** 2.4; }); return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q)=>q - p); return (x + .05)/(y + .05); };
(async()=>{
  try {
    // mid-sprint: Wednesday Oct 7, in Sprint 42 (Sep 28 - Oct 9), the plan starting Monday Sep 21 for 13 weeks
    { const P = open("2026-10-07"), {d, ev} = P; await P.load();
      const bands = d.querySelectorAll("#gantt > .nowband"), now = d.querySelectorAll(".gsprint.now");
      ok("M1 Weeks: one band, for the sprint we're in, from its first week (after the one-week lead) for its two weeks", bands.length === 1 && near(frac(bands[0]), 1/13) && new RegExp(`\\* ${2/13}\\)`).test(bands[0].style.width), bands[0]?.style.left + " / " + bands[0]?.style.width);
      ok("M1 …behind everything: first in the chart, under the bars, never in the way of a click", d.querySelector("#gantt").firstElementChild === bands[0] && bands[0].getAttribute("aria-hidden") === "true" && /\.nowband\{[^}]*pointer-events:none;z-index:0\}/.test(html) && /\.bar\{[^}]*z-index:2\}/.test(html));
      ok("M2 its header says so in words: Sprint 42 · now", now.length === 1 && now[0] === sprintCell(d, "Sprint 42") && now[0].textContent.includes("Sprint 42 · now") && /sprint we're in/.test(now[0].title), now[0]?.textContent);
      const line = d.querySelector("#gantt > .today"), tab = d.querySelector(".ghead .gnow .todaylab");
      ok("M3 today is a line inside its week: Wednesday's middle, not the week's start", !!line && near(frac(line), 16.5/91) && Math.floor(16.5/7) === 2 && !near(frac(line) * 13, Math.round(frac(line) * 13)), line?.style.left);
      ok("M3 …with a Today tab in the time header, right above it", !!tab && tab.textContent === "Today" && !tab.classList.contains("edge") && near(parseFloat(tab.style.left)/100, 16.5/91));
      ok("M3 …and this week still in red in the week row", d.querySelectorAll(".gweek.tod").length === 1 && d.querySelector(".gweek.tod").textContent.startsWith(ev("wkDate(2)")));
      ev("UI.zoomN = 1; render()"); await wait(5); ev("window.went = null; scrollViewTo = day => { window.went = day; }");
      d.dispatchEvent(new P.w.KeyboardEvent("keydown", {key:".", bubbles:true})); await wait(20);
      ok("M4 . in Weeks stays in Weeks and scrolls to the sprint we're in", ev("UI.zoom") === "weeks" && ev("window.went") === ev("isoToDay('2026-09-28')"), ev("UI.zoom") + " " + ev("window.went"));
      ok("M4 …and the shortcut list no longer says it's for Days only", /\[\["\."\],"Jump to today"\]/.test(html));
      ev("setZoom('days')"); await wait(5);
      const db = d.querySelectorAll("#gantt > .nowband"), dl = d.querySelector("#gantt > .today"), cols = ev("DV.N"), i0 = ev("DV.colOf(isoToDay('2026-09-28'))"), i1 = ev("DV.colOf(isoToDay('2026-10-09'))"), it = ev("DV.colOf(isoToDay('2026-10-07'))");
      ok("M5 Days: the same band, across the sprint's ten working days", db.length === 1 && near(frac(db[0]), i0/cols) && new RegExp(`\\* ${(i1 - i0 + 1)/cols}\\)`).test(db[0].style.width), db[0]?.style.width);
      ok("M5 …the same header words, and a line through today's column", d.querySelector(".gsprint.now")?.textContent.includes("Sprint 42 · now") && !!dl && near(frac(dl), (it + .5)/cols) && d.querySelector(".ghead .gnow .todaylab")?.textContent === "Today");
      ok("M5 …where today's column keeps its tint", d.querySelectorAll(".colshade.tod").length > 0);
      ev("setZoom('weeks'); goWs('people')"); await wait(10);
      const hn = d.querySelectorAll("#load .hd.now"), ht = d.querySelectorAll("#load .hd.tod");
      ok("M6 People: the load grid marks the sprint's weeks and says which week is now", hn.length === 2 && ht.length === 1 && ht[0].classList.contains("now") && /now/.test(ht[0].textContent) && ht[0].textContent.startsWith(ev("wkDate(2)")), `${hn.length} ${ht.length} ${ht[0]?.textContent}`);
      ev("goWs('roadmap')"); await wait(10);
      ok("M7 Roadmap: the quarter we're in says now", d.querySelectorAll(".rmcol.now").length === 1 && /Q4 2026.*now/.test(d.querySelector(".rmcol.now").textContent), d.querySelector(".rmcol.now")?.textContent);
      ok("M8 they print: the band, header, tab and line keep their color on paper", /@media print\{\.nowband,\.gsprint\.now,\.todaylab,\.today,\.colshade\.tod\{-webkit-print-color-adjust:exact;print-color-adjust:exact\}\}/.test(html));
      const tok = (re) => [...html.matchAll(re)].map(m=>m[1]);
      const today = tok(/--today:(#[0-9a-f]{6})/gi), surf = tok(/--surface:(#[0-9a-f]{3,6})[;\s]/gi).map(x=>x.length === 4 ? "#" + x.slice(1).split("").map(c=>c + c).join("") : x);
      ok("M9 the line and the tab meet contrast in both themes (3:1 line on the chart, 4.5:1 tab text)", today.length === 3 && today.every((t, i)=>ratio(t, surf[i]) >= 4.5), today.map((t, i)=>ratio(t, surf[i]).toFixed(2)).join(" "));
      ok("M10 a sprint's name keeps the space before its number (the part that's split off to stay visible)", /\.spn-a\{[^}]*white-space:pre\}/.test(html) && sprintCell(d, "Sprint 42").querySelector(".spn-a").textContent === "Sprint ");
      ok("M9 …and the tab's text is the surface color on the today color", /\.todaylab\{[^}]*background:var\(--today\);color:var\(--surface\)/.test(html) && !/\.todaylab\{[^}]*font:/.test(html));
      ok("Z no page errors (mid-sprint)", !P.w.errs.length, P.w.errs.join(" | ")); }

    // the Saturday after the sprint's last day: still that sprint, until the next starts on Monday
    { const P = open("2026-10-10"), {d} = P; await P.load();
      ok("W1 the weekend after a sprint still belongs to it", d.querySelector(".gsprint.now") === sprintCell(d, "Sprint 42") && d.querySelectorAll("#gantt > .nowband").length === 1); }

    // between sprints: Thursday Oct 15, in the board's two-week gap before Sprint 43 (Oct 26)
    { const P = open("2026-10-15"), {d, ev} = P; await P.load();
      const next = sprintCell(d, "Sprint 43"), tag = next?.querySelector(".nowtag.next");
      ok("G1 between sprints there's no band and no sprint says now", !d.querySelector("#gantt > .nowband") && !d.querySelector(".gsprint.now") && !d.querySelector(".nowtag:not(.next)"));
      ok("G2 the next sprint says when it starts", !!tag && tag.textContent === `\u00a0· starts ${ev("fmtDay(isoToDay('2026-10-26'))")}` && /next sprint/.test(next.title), tag?.textContent);
      ok("G2 …and the line above the chart says we're between sprints, not in one called No sprint", d.querySelector("#scope")?.textContent.includes(`Between sprints · Sprint 43 starts ${ev("fmtDay(isoToDay('2026-10-26'))")}`) || ev("scopeText()").includes("Between sprints · Sprint 43 starts"), ev("scopeText()"));
      ok("G2 …and the gap row says nothing", !sprintCell(d, "No sprint")?.querySelector(".nowtag"));
      ok("G3 today's line and tab are still there", !!d.querySelector("#gantt > .today") && d.querySelector(".todaylab")?.textContent === "Today");
      ev("UI.zoomN = 1; render(); window.went = null; scrollViewTo = day => { window.went = day; }"); d.dispatchEvent(new P.w.KeyboardEvent("keydown", {key:".", bubbles:true})); await wait(20);
      ok("G4 . between sprints goes to the next one", ev("window.went") === ev("isoToDay('2026-10-26')"));
      ev("setZoom('days')"); await wait(5);
      ok("G5 Days: no band, the next sprint's start, today's line", !d.querySelector("#gantt > .nowband") && !!d.querySelector(".gsprint .nowtag.next") && !!d.querySelector("#gantt > .today"));
      ev("goWs('people')"); await wait(5);
      ok("G6 People: no sprint weeks marked, this week still is", !d.querySelector("#load .hd.now") && d.querySelectorAll("#load .hd.tod").length === 1);
      ok("Z no page errors (between sprints)", !P.w.errs.length, P.w.errs.join(" | ")); }

    // before the plan: Sep 1, three weeks before it starts
    { const P = open("2026-09-01"), {d, ev} = P; await P.load();
      const tab = d.querySelector(".ghead .gnow .todaylab");
      ok("O1 before the plan: no line, the tab waits at the left edge pointing back", !d.querySelector("#gantt > .today") && !!tab && tab.classList.contains("edge") && tab.classList.contains("before") && tab.textContent === `‹ Today, ${ev("fmtDay(todayDay())")}` && /before the plan starts/.test(tab.title));
      ok("O1 …no band, and the first sprint says when it starts", !d.querySelector("#gantt > .nowband") && /· starts Sep 28/.test(sprintCell(d, "Sprint 42")?.textContent || ""));
      ev("setZoom('days')"); await wait(5);
      ok("O2 Days the same", !d.querySelector("#gantt > .today") && d.querySelector(".todaylab")?.classList.contains("before")); }

    // after the plan: Jan 15 2027, past its Dec 18 end
    { const P = open("2027-01-15"), {d, ev} = P; await P.load();
      const tab = d.querySelector(".ghead .gnow .todaylab");
      ok("O3 after the plan: no line, the tab at the right edge pointing on", !d.querySelector("#gantt > .today") && !!tab && tab.classList.contains("after") && tab.textContent === `Today, ${ev("fmtDay(todayDay())")} ›` && /after the plan ends/.test(tab.title));
      ok("O3 …no band and no next sprint", !d.querySelector("#gantt > .nowband") && !d.querySelector(".nowtag"));
      ev("setZoom('days')"); await wait(5);
      ok("O4 Days the same", !d.querySelector("#gantt > .today") && d.querySelector(".todaylab")?.classList.contains("after"));
      ok("Z no page errors (outside the plan)", !P.w.errs.length, P.w.errs.join(" | ")); }
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
