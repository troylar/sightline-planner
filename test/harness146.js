// Selecting without redrawing the chart. Choosing an initiative, task, Jira story or milestone, or closing its panel, keeps
// the chart on screen and moves the highlight; the result must be exactly what a full redraw draws, for every such item, in
// Weeks at Fit, Weeks at one sprint (open shelves), rows by person, and Days. Anything else still draws in full. Fixed clock;
// fixtures/sample-plan.json and fixtures/shelf-plan.js. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), SHELF = require("./fixtures/shelf-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD("2026-10-07T14:00:00").getTime(); w.Date = class extends RD {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.Document.prototype.elementFromPoint = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document, ev = s=>w.eval(s);
    Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? 1100 : 0; }});
    await wait(150); w.FIX = FIX; ev(SHELF);
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; UI.shelfOpen = {}; goWs('timeline'); shelfPlan();
      commit(s => { const b = s.bars.find(x => x.id === 'm1'); b.tasks = [0, 1, 2].map(i => ({id:'tk' + i, label:'Task ' + i, start:dayToIso(startDay() + 7 * i), days:3, owners:[], jira:'', status:'notstarted'})); })`);
    // the page as a person sees it: every element, its attributes (class tokens in any order) and text
    ev(`window.__snap = () => { const walk = n => n.nodeType === 3 ? n.data : n.nodeType !== 1 ? "" : "<" + n.tagName + [...n.attributes].map(a => a.name === "class" ? [...n.classList].sort().join(".") : a.name + "=" + a.value).sort().join(" ") + ">" + [...n.childNodes].map(walk).join("") + "</>";
      return [walk(document.getElementById("gantt")), walk(document.getElementById("side")), document.body.className].join("\\n"); };
      window.__draws = 0; for (const f of ["renderGantt", "renderDays"]){ const real = window[f]; window[f] = function(){ __draws++; return real.apply(this, arguments); }; }`);
    const views = [["Weeks at Fit", "UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'"], ["Weeks at one sprint, shelves open", "UI.zoom = 'weeks'; UI.zoomN = 1; UI.zoomSp = '2026-10-05'; UI.rows = 'lanes'"],
      ["Weeks by person", "UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'people'"], ["Days", "UI.zoom = 'days'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'"],
      ["Days, one initiative's tasks", "UI.zoom = 'days'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; UI.focus = 'm1'"],
      ["Weeks, one initiative's tasks", "UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; UI.focus = 'm1'"]];
    let total = 0, keptAll = 0;
    for (const [name, set] of views){
      ev(`sel = null; ${set}; saveUI(); render()`);
      const items = JSON.parse(ev(`JSON.stringify([...new Set([...document.querySelectorAll("#gantt [data-sel]")].map(e => e.dataset.sel))])`));
      const bad = [], kinds = new Set(); let kept = 0;
      // one after another (A to B), then closing the panel, each compared with a full redraw of the same selection
      for (const k of [...items, null]){ const i = k ? k.indexOf(":") : -1;
        ev(k ? `__draws = 0; select(${JSON.stringify(k.slice(0, i))}, ${JSON.stringify(k.slice(i + 1))})` : "__draws = 0; document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
        const fast = ev("__snap()"), drew = ev("__draws");
        ev("chartAt = null; render()"); const full = ev("__snap()");
        if (!drew) kept++; if (k) kinds.add(k.slice(0, i));
        if (fast !== full){ const a = fast.split("<"), b = full.split("<"), j = a.findIndex((x, n) => x !== b[n]); { const x = (a[j] || "").split(" "), y = (b[j] || "").split(" "); bad.push(`${k || "Escape"}: ${x.filter(t => !y.includes(t)).join(" ").slice(0, 120)} vs ${y.filter(t => !x.includes(t)).join(" ").slice(0, 120)}`); } }
      }
      total += items.length + 1; keptAll += kept;
      ok(`E1 ${name}: selecting each of ${items.length} items (${[...kinds].join(", ")}) and then Escape looks exactly like a full redraw`, items.length > 3 && !bad.length, bad.slice(0, 3).join(" | "));
    }
    ev("UI.focus = null; saveUI()");
    ok("E2 most of those kept the chart instead of drawing it again", keptAll >= total * 0.75, keptAll + " of " + total);
    // what still draws in full
    ev("sel = null; UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; saveUI(); render(); __draws = 0; select('lane', S.lanes[0].id)");
    ok("F1 a kind of item without a kept highlight (a workstream) draws in full", ev("__draws") === 1);
    ev("sel = null; render(); __draws = 0; S.bars[0].label = 'Renamed in place'; commit(s => { s.bars[0].label = 'Renamed'; }); __draws = 0; select('bar', S.bars[0].id)");
    ok("F2 after an edit, selecting keeps the chart the edit just drew", ev("__draws") === 0 && /Renamed/.test(d.getElementById("gantt").textContent));
    ev("sel = null; render(); UI.filter = normFilter({...UI.filter, people:[S.people[0].id]}); __draws = 0; select('bar', S.bars[0].id)");
    ok("F3 a change the chart hasn't drawn yet (a filter set without drawing) draws in full", ev("__draws") === 1);
    ev("UI.filter = normFilter({}); sel = null; render(); UI.zoom = 'weeks'; UI.zoomN = 0; UI.shelfOpen = {}; saveUI(); render(); __draws = 0; select('story', 'ABC-101')");
    ok("F4 a story inside a folded shelf draws in full, opening its shelf", ev("__draws") === 1 && !!d.querySelector('.shelfrow [data-key="story:ABC-101"].selected'));
    ev("__draws = 0; document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
    ok("F4 …and closing it draws in full, folding it again", ev("__draws") === 1 && !d.querySelector('.shelfrow [data-key="story:ABC-101"]'));
    ev("sel = null; render(); chartAt = {...chartAt, today:chartAt.today - 1}; __draws = 0; select('bar', S.bars[0].id)");
    ok("F5 a chart drawn yesterday draws in full", ev("__draws") === 1);
    ev("sel = null; render(); goWs('today'); __draws = 0; select('bar', S.bars[0].id)");
    ok("F6 from another page, selecting draws the Timeline in full", ev("UI.ws") === "timeline" && ev("__draws") === 1);
    // a real click goes through the drag handler: one that never moves keeps the chart; a wiggle restores the plan and draws in full
    ev("w = window; Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || function(){}; Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || function(){}");
    ev("sel = null; UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; saveUI(); render()");
    const press = (moves) => ev(`(() => { const el = document.querySelector('#gantt .bar[data-sel="bar:m2"]'), r = {clientX:200, clientY:20, button:0, pointerId:1, bubbles:true};
      __draws = 0; const S0 = S; el.dispatchEvent(new MouseEvent("pointerdown", r)); for (let i = 1; i <= ${moves}; i++) el.dispatchEvent(new MouseEvent("pointermove", {...r, clientX:200 + i}));
      el.dispatchEvent(new MouseEvent("pointerup", r)); el.dispatchEvent(new MouseEvent("click", r)); return JSON.stringify({draws:__draws, same:S === S0, sel:sel && sel.type + ":" + sel.id, editable:editable()}); })()`);
    const c1 = JSON.parse(press(0)), fast1 = ev("__snap()"); ev("chartAt = null; render()");
    ok("P1 clicking an initiative opens it without drawing the chart again, and looks like a full redraw", c1.editable && c1.sel === "bar:m2" && c1.draws === 0 && c1.same && fast1 === ev("__snap()"), JSON.stringify(c1));
    ev("sel = null; render()"); const plan0 = ev("JSON.stringify(planOfRecord(S))"), c2 = JSON.parse(press(2));
    ok("P2 a wiggle under the drag threshold still restores the plan and draws in full", c2.sel === "bar:m2" && c2.draws >= 1 && !c2.same && ev("JSON.stringify(planOfRecord(S))") === plan0, JSON.stringify(c2));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
