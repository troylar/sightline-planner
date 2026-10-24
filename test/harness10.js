// UX review 1: regression checks. Each one fails on the code as it was before the change.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
// "Today" is Wed Sep 23, 2026: day 3 of sprint S0 in the sample plan.
async function page(stored = {}){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    for (const [k,v] of Object.entries(stored)) w.localStorage.setItem(k, v);
    const RD = w.Date, NOW = new RD(2026, 8, 23, 10).getTime();
    w.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(NOW); } static now(){ return NOW; } };
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[]; w.showSaveFilePicker = async()=>null;
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>""; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(200);
  const ev = s => w.eval(s);
  w.FIX = plan; ev(`askWhoOnStart = ()=>{}; S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); sel = null; UI.filter = normFilter({}); setWs("timeline"); setZoom("weeks"); render();`);
  return {w, d: w.document, ev};
}
const cssHas = (d, ...bits) => [...d.styleSheets].some(ss=>[...ss.cssRules].some(r=>bits.every(b=>r.cssText.includes(b))));
const emoji = /\p{Extended_Pictographic}/u;
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  // ---- U1: the details panel doesn't follow you onto other pages ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev(`select("bar", S.bars[0].id)`);
    ok("setup: an initiative is open on the Timeline", d.body.classList.contains("hasSel"));
    d.querySelector("#tab-today").click();
    ok("U1a: picking another tab closes what was open", ev("sel") === null && !d.body.classList.contains("hasSel"));
    ev(`setWs("timeline"); select("bar", S.bars[0].id)`); d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"3", bubbles:true}));
    ok("U1a: so does its number key", ev("UI.ws") === "people" && ev("sel") === null, ev("UI.ws"));
    ok("U1b: a panel opened on Today, People, or Plan gets room beside the page on wide screens", cssHas(d, "1100px", "#ws-today", "margin-right"));
    ok("no runtime errors (U1)", w.errs.length === 0, w.errs.join(" | ")); });

  // ---- U2: one name for notes ----
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`select("bar", S.bars[0].id)`);
    const side = d.querySelector("#side").textContent, ph = d.querySelector("#sticky-in")?.placeholder || "";
    ok("U2: the panel calls them Notes, like the toolbar and the chart", /Notes/.test(side) && !/sticky/i.test(side + ph), ph);
    ok("U2: nothing on the page says post-it", !/post-it/i.test(d.querySelector("#notesBtn").title + d.querySelector("#legend").innerHTML)); });

  // ---- U3: gates needed on the same day share a chip ----
  await sec(async ()=>{ const {d, ev} = await page();
    const chips = () => [...d.querySelectorAll("#gantt .gaterow .flag.gate")];
    const days = ev(`new Set(gateItems().filter(g=>g.day!=null).map(g=>g.day)).size`), n = ev(`gateItems().filter(g=>g.day!=null).length`);
    ok("setup: some gates share a day", days < n, `${n} gates on ${days} days`);
    ok("U3a: one chip per day at Weeks zoom", chips().length === days, String(chips().length));
    const two = chips().find(c=>/\+1$/.test(c.textContent));
    ok("U3a: a shared chip names the first gate and counts the rest", !!two && /^Oct 16 .+ \+1$/.test(two.textContent), two && two.textContent);
    two.click(); await wait(10);
    const items = [...d.querySelectorAll("#addMenu:not([hidden]) button[role=menuitem]")];
    ok("U3b: clicking it lists both gates", items.length === 2, String(items.length));
    const want = items[1]?.textContent; items[1]?.click();
    ok("U3b: and picking one opens that gate", ev("sel && sel.type") === "gate" && ev("gateById(sel.id).gate") === want, want);
    ev(`sel = null; setZoom("days"); render()`);
    ok("U3c: Days zoom shares chips the same way", [...d.querySelectorAll("#gantt .gaterow .flag.gate")].length === days); });

  // ---- U4: the legend is a Key you open ----
  await sec(async ()=>{ const {d, w} = await page();
    const lg = d.querySelector("#legend"), tg = d.querySelector("#legendTg");
    ok("U4a: the legend starts folded behind a Key button", !!tg && lg.classList.contains("closed") && tg.getAttribute("aria-expanded") === "false");
    ok("U4a: folded, only the hint stays visible", cssHas(d, ".legend.closed > span:not(.tip)", "display: none"));
    tg.click();
    ok("U4b: Key opens it", !lg.classList.contains("closed") && tg.getAttribute("aria-expanded") === "true");
    ok("U4b: and it stays open next time", JSON.parse(w.localStorage.getItem("timeline-planner-ui") || "{}").legend === "open");
    const names = [...lg.querySelectorAll(":scope > span:not(.tip)")].map(s=>s.textContent.trim());
    ok("U4c: no two entries share a name", new Set(names).size === names.length, names.join(", ")); });

  // ---- U5: a cut-off title shows its short form ----
  await sec(async ()=>{ const {d, ev} = await page();
    const id = ev(`S.bars.find(b=>!b.chartName && suggestChartName(b) && b.kind==="work").id`), short = ev(`suggestChartName(barById("${id}"))`);
    const el = d.querySelector(`#gantt .bar[data-key="bar:${id}"]`), nm = el.querySelector(".nm"), tr = el.closest(".track");
    const rect = (x, y, wd, ht) => () => ({left:x, top:y, right:x+wd, bottom:y+ht, width:wd, height:ht});
    tr.getBoundingClientRect = rect(0, 0, 1000, 100); el.getBoundingClientRect = rect(0, 8, 160, 26);
    Object.defineProperty(nm, "scrollWidth", {get: () => nm.textContent.length * 7}); Object.defineProperty(nm, "clientWidth", {get: () => 140});
    ev("spillLabels()");
    ok("U5: a bar too short for its title shows the name before ' · ' instead of a cut-off title", nm.textContent === short, `${nm.textContent} / ${short}`);
    ok("U5: the full title is still there for screen readers", el.getAttribute("aria-label").includes(ev(`barById("${id}").label`))); });

  // ---- U6, U7: Today leads with what needs you, in the app's own icons ----
  await sec(async ()=>{ const {d} = await page();
    d.querySelector("#tab-today").click();
    const main = d.querySelector("#today .tcol:not(.side)"), heads = [...d.querySelectorAll("#today .tsec h3")].map(x=>x.textContent);
    ok("U6a: empty sections don't each get a card", !/Nothing here/.test(main.textContent), String((main.textContent.match(/Nothing here/g)||[]).length));
    ok("U6a: they're named on one line instead", /Nothing else is .*blocked/.test(main.querySelector(".tclear")?.textContent || ""), main.querySelector(".tclear")?.textContent);
    ok("U6b: the section with work in it still shows", /Should have started/.test(main.textContent));
    ok("U7: section titles use line icons, not emoji", heads.length && heads.every(t=>!emoji.test(t)) && d.querySelectorAll("#today .tsec h3 .ic svg").length === heads.length, heads.join(" | ")); });
  await sec(async ()=>{ const {d, ev} = await page();
    ev(`select("bar", S.bars.find(b=>isLeafBar(b)).id)`);
    const sum = d.querySelector("#side .qblock summary");
    ok("U7: Mark blocked uses the line icon", !!sum && !emoji.test(sum.textContent) && !!sum.querySelector(".ic svg"), sum && sum.textContent); });

  // ---- U8: working in this browser only is hard to miss ----
  await sec(async ()=>{ const {d} = await page();
    const chip = d.querySelector("#source");
    ok("U8: the chip offers to share", chip.classList.contains("local") && /Share…/.test(chip.textContent), chip.textContent);
    ok("U8: and is drawn as a warning", cssHas(d, ".chip.local {", "--warn")); });

  // ---- U9: risks show how serious they are, and their whole text ----
  await sec(async ()=>{ const {d, w, ev} = await page();
    ev(`UI.planTab = "risks"; setWs("plan")`);
    const rows = [...d.querySelectorAll("#t-risks tbody tr")], sev = rows.map(r=>r.querySelector("select"));
    ok("U9a: severity is colored by level", sev.length && sev.every((s,i)=>s.classList.contains("sev-" + ev(`S.risks[${i}].sev`))) && cssHas(d, "select.sev-high", "--bad"));
    const ta = rows[0].querySelector("textarea.celltext");
    ok("U9b: the risk wraps instead of scrolling in a one-line box", !!ta && ta.value === ev("S.risks[0].text") && cssHas(d, "textarea.celltext", "field-sizing: content"));
    const e = new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true}); ta.dispatchEvent(e);
    ok("U9b: Enter finishes the edit instead of starting a new line", e.defaultPrevented); });

  // ---- U10: the line by the tabs says something the buttons don't ----
  await sec(async ()=>{ const {d, ev} = await page();
    const t = () => d.querySelector("#scopeLine").textContent;
    ok("U10a: it shows where today falls in the sprint", /^S0 · working day 3 of 10$/.test(t()), t());
    ok("U10a: not the view the buttons already show", !/By lane|Weeks/.test(t()));
    ev(`UI.filter = normFilter({range:{type:"next4"}}); render()`);
    ok("U10b: filters still show there", /S0 · working day 3 of 10 · .*of \d+ initiatives/.test(t()), t()); });

  // ---- U11: meeting people and groups ----
  await sec(async ()=>{ const {w, d, ev} = await page();
    ev(`(()=>{ const p = S.people; S.groups = [{id:"g1", name:"Core", members:[p[0].id, p[1].id]}];
      S.meetings.push({id:"mt1", title:"Sync", date:S.meta.start, time:"", minutes:30, lane:"", owners:[], attendees:[p[0].id, p[1].id, p[2].id], groups:[], recur:{freq:"none"}});
      S = normalize(JSON.parse(serialize(S, "p.json")), false); render(); openMeeting("mt1"); })()`);
    const sel = d.querySelector("#f-mgrp"); sel.value = "g1"; sel.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(10);
    ok("U11: adding a group takes its members off the People list", ev(`S.meetings.find(m=>m.id==="mt1").attendees.length`) === 1 && ev(`S.meetings.find(m=>m.id==="mt1").groups.join()`) === "g1");
    ok("U11: nobody is lost: the meeting still has everyone", ev(`attendeesOf(S.meetings.find(m=>m.id==="mt1")).length`) === 3);
    ev(`(()=>{ const m = S.meetings.find(m=>m.id==="mt1"); m.attendees = [S.people[0].id, S.people[2].id]; render(); openMeeting("mt1"); })()`);
    ok("U11: people already in a group are pointed out, with a one-click fix", /1 of these is already in a group/.test(d.querySelector("#f-mdup")?.textContent || ""));
    d.querySelector("#f-mdup button").click(); await wait(10);
    ok("U11: and the fix takes them off People", ev(`S.meetings.find(m=>m.id==="mt1").attendees.join()`) === ev("S.people[2].id") && !d.querySelector("#f-mdup"));
    ok("U11: names in lists have space between them everywhere, not just in the hover card", cssHas(d, ".pk-ppl {", "gap") && !cssHas(d, ".peek .pk-ppl")); });

  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
