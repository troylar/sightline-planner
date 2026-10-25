// Sprint shelves. In Weeks, by workstream, a workstream's Jira stories sit on a shelf per sprint as tiles sized by points
// on one scale (a minimum, a cap past 13), instead of a bar each; one-story initiatives become loose stories and stay in
// the plan. Not estimated is its own strip; status reads without color; canceled is left out; no sprint is Unscheduled;
// summaries are honest; folded at Fit, tiles at one sprint, a choice per workstream beats the zoom; arrows move within
// a shelf; a spotlight lights up one person. Fixed clock; the plan from fixtures/shelf-plan.js. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), SHELF = require("./fixtures/shelf-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
async function open(){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{ w.alerted = true; }; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s);
  Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? 1100 : 0; }});
  await wait(150); w.FIX = FIX; ev(SHELF);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; UI.shelfOpen = {}; UI.spot = null; delete UI.shelves; goWs('timeline'); shelfPlan()");
  return {w, d, ev, J:s=>JSON.parse(ev(`JSON.stringify(${s})`))};
}
(async()=>{
  try {
    const {w, d, ev, J} = await open(), row = () => d.querySelector('.shelfrow[data-shelf="chat"]');
    const tile = k => d.querySelector(`.shelfrow [data-key="${k}"]`), cells = () => [...row().querySelectorAll(".shcell")];
    const plan0 = ev("JSON.stringify(planOfRecord(S))");
    ok("A1 a workstream with Jira stories gets a shelf row under it, in Weeks", !!row() && row().previousElementSibling?.dataset.lane === "chat");
    ok("A1 …and the one-story initiatives in a sprint aren't drawn as bars there", !d.querySelector('#gantt .lane[data-lane="chat"] .bar[data-key="bar:lf1"]') && !d.querySelector('#gantt .lane[data-lane="chat"] .bar[data-key="bar:lf2"]'));
    ok("A2 one with no sprint stays a bar", !!d.querySelector('#gantt .lane[data-lane="chat"] .bar[data-key="bar:lf4"]'));
    ok("A3 the plan is untouched: shelves are display only", ev("JSON.stringify(planOfRecord(S))") === plan0 && J("S.bars.map(b=>b.id)").includes("lf1"));
    // Fit: summaries only, one per sprint with stories, at the sprint's own columns.
    ok("F1 at Fit the shelves are folded to a summary per sprint", cells().length === 2 && cells().every(c=>c.classList.contains("shmini")) && !row().querySelector(".shtile"), cells().length + " cells");
    ok("F1 …each spans its sprint's own weeks", cells()[0].style.gridColumn === "3 / span 2" && cells()[1].style.gridColumn === "7 / span 2", cells().map(c=>c.style.gridColumn).join(" | "));
    const s1 = cells()[0].getAttribute("aria-label");
    ok("S1 the summary is honest: estimated points, done (estimated points), the unestimated count", /^API v2, S1: 8 stories · 35 pts estimated, 7 done \(estimated points\) · 1 not estimated/.test(s1), s1);
    ok("S2 canceled is left out of every count", !/Old offset shim/.test(row().textContent) && !/43 pts/.test(s1));
    ok("S3 the row says capacity is unknown, never a load against it", (cells()[0].click(), /capacity unavailable/.test(row().textContent)));
    // Expanded by hand at Fit: the manual choice beats the zoom.
    ok("E1 opening a workstream's shelves by hand shows the tiles, even at Fit", ev("UI.shelfOpen.chat") === true && !!tile("story:ABC-101"));
    ok("E1 …and the label's button says what it does now", row().querySelector(".shtog").getAttribute("aria-expanded") === "true" && /Show summaries only/.test(row().querySelector(".shtog").textContent));
    const wd = k => parseFloat(tile(k).style.width);
    ok("W1 widths follow points on one scale: 118 px, plus 11 a point", wd("story:ABC-101") === 118 + 5 * 11 && wd("story:ABC-102") === 118 + 3 * 11 && wd("bar:lf1") === 118 + 3 * 11, [wd("story:ABC-101"), wd("story:ABC-102")].join(","));
    ok("W2 zero points is a real estimate: the minimum width, shown as 0 pt", wd("story:ABC-105") === 118 && /0 pt/.test(tile("story:ABC-105").textContent));
    ok("W3 past 13 points the width stops growing and the tile is marked big", wd("story:ABC-103") === 118 + 13 * 11 && tile("story:ABC-103").classList.contains("shbig") && /21 pt/.test(tile("story:ABC-103").textContent));
    const u = tile("story:ABC-104");
    ok("U1 not estimated sits in its own labeled strip, with no width from points", !!u.closest(".shstrip") && !u.style.width && /Not estimated \(1\)/.test(u.closest(".shstrip").textContent) && /Not estimated\./.test(u.getAttribute("aria-label")));
    const lb = k => tile(k).getAttribute("aria-label");
    ok("C1 status reads without color: a symbol on the tile, the real status name in its label", /●/.test(tile("story:ABC-101").textContent) && /◐/.test(tile("story:ABC-102").textContent) && /○/.test(tile("story:ABC-103").textContent) && /In Review \(in progress\)/.test(lb("story:ABC-102")), lb("story:ABC-102"));
    ok("C2 blocked comes from the plan and says so", tile("bar:lf1").classList.contains("shblk") && /⛔/.test(tile("bar:lf1").textContent) && /blocked in the plan/.test(lb("bar:lf1")));
    ok("C3 the label carries the full facts: key, summary, points, assignee", /^ABC-101: Cursor paging for lists\. Done\. 5 points\. Avery Stone\. In /.test(lb("story:ABC-101")), lb("story:ABC-101"));
    ok("C3 …and unassigned is shown as unassigned", /unassigned/.test(tile("story:ABC-106").querySelector(".who").textContent) && /Unassigned\./.test(lb("story:ABC-106")));
    ok("H1 a hostile summary is drawn as text", tile("story:ABC-106").querySelector(".tt").textContent === "<img src=x onerror=alert(1)> literal title" && !row().querySelector("img") && !w.alerted);
    // Grouped by initiative, stable order.
    const g1 = [...cells()[0].querySelectorAll(".shgrp h5 .shgn")].map(x=>x.textContent);
    ok("G1 tiles group under their initiative, loose stories last", g1.length === 2 && g1[1] === "Not on an initiative" && g1[0] === ev("chartLabel(barById('c3'))"), g1.join(" | "));
    ok("G2 a one-story initiative under a parent sits with its parent", tile("bar:lf3").closest(".shgrp").querySelector(".shgn").textContent === ev("chartLabel(barById('c4'))"));
    const order = [...cells()[0].querySelector(".shgrp .shelf").querySelectorAll(".shtile")].map(t=>t.dataset.key.split(":")[1]);
    ok("G3 a stable reading order: in progress, not started, done, then by key", order.join(",") === "ABC-102,ABC-103,ABC-106,ABC-101,ABC-105,ABC-104", order.join(","));
    ok("N1 a story with no sprint is in the Unscheduled count, not on a shelf", /Unscheduled: 1 story/.test(row().querySelector(".shlab").textContent) && !tile("story:ABC-109"));
    row().querySelector('[data-key="shnone:chat"]').click();
    ok("N1 …and opens to show it", !!tile("story:ABC-109"));
    // Keyboard: one tab stop per shelf, arrows move, Enter opens the panel.
    const shelf = cells()[0].querySelector(".shgrp .shelf"), tabs = () => [...shelf.querySelectorAll(".shtile")].filter(t=>t.tabIndex === 0);
    ok("K1 one tab stop per shelf", tabs().length === 1 && tabs()[0].dataset.key === "story:ABC-102");
    tabs()[0].focus(); tabs()[0].dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true}));
    ok("K2 arrows move along the shelf, and the tab stop follows", d.activeElement.dataset.key === "story:ABC-103" && tabs()[0] === d.activeElement);
    d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", {key:"End", bubbles:true}));
    ok("K2 …End goes to the last tile, past the Not estimated strip's label", d.activeElement.dataset.key === "story:ABC-104");
    d.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
    ok("K3 Enter opens the story's panel", J("sel").type === "story" && J("sel").id === "ABC-104");
    ok("K3 …and focus comes back to the tile after the redraw", d.activeElement?.dataset.key === "story:ABC-104");
    tile("bar:lf1").click();
    ok("K4 a one-story initiative opens as itself", J("sel").type === "bar" && J("sel").id === "lf1" && tile("bar:lf1").classList.contains("selected"));
    // Spotlight.
    const sp = row().querySelector(".shspot select"); sp.value = "pb"; sp.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("P1 a spotlight lights up one person's tiles and dims the rest", row().classList.contains("spot") && tile("story:ABC-102").classList.contains("me") && tile("bar:lf1").classList.contains("me") && !tile("story:ABC-101").classList.contains("me"));
    ok("P1 …with their points and unknowns", /Blake Ito: 3 stories, 6 pts/.test(row().querySelector(".shme").textContent), row().querySelector(".shme").textContent);
    // Zoom: one sprint opens the shelves; Fit folds them unless chosen by hand.
    ev("UI.shelfOpen = {chat:false}; saveUI(); render()");
    ok("Z0 a selected story opens its folded shelf, so it's on screen", !!tile("bar:lf1") && tile("bar:lf1").classList.contains("selected"));
    await ev("propose('ABC-120', 'sprint', {id:3, name:'S3'}, 'later')"); await wait(20); ev("render()");
    ok("Z0 …with a pending proposal shown on its tile", /✎ 1/.test(tile("bar:lf1").textContent), tile("bar:lf1").textContent);
    ev("S.proposals = []; sel = null; UI.shelfOpen = {}; saveUI(); render()");
    ok("Z1 back to the zoom's choice, Fit folds them", !!cells()[0].classList.contains("shmini"));
    const pick = d.querySelector("#zoomSprint"); pick.value = String(ev("isoToDay('2026-10-05')")); pick.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("Z2 one sprint shows the tiles", !!tile("story:ABC-101") && !cells()[0].classList.contains("shmini"));
    row().querySelector('[data-key="shtog:chat"]').click();
    ok("Z3 and a workstream folded by hand stays folded there", ev("UI.shelfOpen.chat") === false && cells().every(c=>!c.querySelector(".shtile")));
    ok("Z3 …remembered in this browser", JSON.parse(w.localStorage.getItem("timeline-planner-ui")).shelfOpen.chat === false);
    // Off switch, other views, filters.
    ev("UI.shelves = false; render()");
    ok("O1 Show → On sprint shelves off draws the bars again", !row() && !!d.querySelector('#gantt .bar[data-key="bar:lf1"]'));
    ev("UI.shelves = true; setZoom('days')");
    ok("O2 Days keeps its own story rows: no shelves there", !d.querySelector(".shelfrow"));
    ev("setZoom('weeks'); UI.rows = 'people'; render()");
    ok("O3 rows by person keep their bars", !d.querySelector(".shelfrow"));
    ev("UI.rows = 'lanes'; UI.shelfOpen = {chat:true}; setFilter(f=>{ f.people = ['pa']; })");
    ok("O4 a person filter applies to the tiles, and the summary says filters apply", !!tile("story:ABC-101") && !tile("story:ABC-102") && /filters apply/.test(row().textContent));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
