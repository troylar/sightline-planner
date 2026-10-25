// Flags that fall close together on Weeks stay readable. Labels are packed by their width in pixels at the chart's scale
// (zoom, width, text size), not a fixed guess in weeks; a workstream's milestones use three rows at most, and past that a
// label is cut short where the next one starts, keeping its date, with the full text on hover and focus. Gates whose
// markers land within a few pixels share one flag. Synthetic plan: fixtures/sample-plan.json plus six invented milestones.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
// Six milestones in the API v2 workstream within three weeks, some on neighboring days, and one stretch date beside another milestone.
const SIX = [[3.0, "Contract draft"], [3.15, "Partner review of the paging rules"], [3.3, "Error codes agreed"], [3.6, "Sandbox open to two pilot teams"], [4.4, "Rate limits final"], [5.8, "Public preview announcement"]];
const plan = (()=>{ const o = JSON.parse(sample); o.milestones = o.milestones.filter(m=>m.lane !== "chat");
  SIX.forEach(([at, what], i)=>o.milestones.push({id:"ms-six-" + i, what, date:"", stretch:"", status:"commit", lane:"chat", at, stretchAt:i === 5 ? 4.5 : null}));   // the last one's stretch date lands beside "Rate limits final"
  o.gates = [...(o.gates || []), {id:"gate-a", gate:"Security review", neededBy:"Nov 30", blocks:"", owner:""}, {id:"gate-b", gate:"Legal review", neededBy:"Dec 1", blocks:"", owner:""}];
  return JSON.stringify(o); })();
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD("2026-10-07T14:00:00").getTime(); w.Date = class extends RD {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    await wait(150); const w = dom.window, d = w.document, ev = s=>w.eval(s);
    let CW = 1100; Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? CW : 0; }});
    w.FIX = plan; ev("askWhoOnStart = ()=>{}; stopAuto && stopAuto(); S = parseText(FIX); resetHistory(); UI.zoom = 'weeks'; UI.zoomN = 0; goWs('timeline'); render()");
    // Independently of the page: the chart's pixels per week, and a bold 11px label's width (no canvas here: the page's estimate)
    const scale = () => ev("textScale"), lw = () => ev("UI.labelW.weeks"), W = ev("S.meta.weeks");
    const wpx = zw => { const avail = Math.max(300, CW - lw() - 2); return zw > 0 && zw < W ? avail / zw : avail / W; };
    const ts = px => scale() === 1 ? px : Math.max(Math.min(px, 9), Math.round(px * scale() * 100) / 100);
    const labelPx = t => t.length * 6.8 * ts(11) / 11 + 18;
    const flags = () => [...d.querySelectorAll('#gantt .lane[data-lane="chat"] .flag')].map(el=>({el, at:parseFloat(el.style.left) / 100 * W, top:parseFloat(el.style.top), text:el.textContent, clip:el.classList.contains("clip"), max:parseFloat(el.style.maxWidth) || null}));
    const check = (name, zw) => {
      const F = flags(), px = wpx(zw), rows = [...new Set(F.map(f=>f.top))].sort((a, b)=>a - b);
      const bad = [];
      rows.forEach(t=>{ const r = F.filter(f=>f.top === t).sort((a, b)=>a.at - b.at);
        r.forEach((f, i)=>{ const nx = r[i + 1]; if (!nx) return; const gap = (nx.at - f.at) * px, need = f.clip ? f.max : labelPx(f.text);
          if (need > gap + 0.5 && !(f.clip && f.max <= labelPx(f.el.querySelector(".fl-d").textContent) + 1)) bad.push(`${f.text.slice(0, 24)}: needs ${need.toFixed(0)}px, has ${gap.toFixed(0)}px`); }); });
      ok(`${name}: no label runs into the next one on its row, stretch markers included`, F.length === 7 && F.some(f=>f.el.classList.contains("stretch")) && !bad.length, bad.join("; ") || `${F.length} flags, ${rows.length} rows`);
      ok(`${name}: three rows at most`, rows.length <= 3, String(rows.length));
      return {rows:rows.length, clips:F.filter(f=>f.clip).length};
    };
    const a = check("A full plan, text 100%", 0);
    ok("A …a cut-short label keeps its date; its hover card and screen-reader label have it all, with no native tooltip", flags().filter(f=>f.clip).every(f=>f.el.querySelector(".fl-d") && !f.el.title && f.el.dataset.peekType === "ms" && /^Milestone: /.test(f.el.getAttribute("aria-label")) && f.el.getAttribute("aria-label").includes(f.el.querySelector(".fl-t").textContent) && f.el.getAttribute("aria-label").includes(f.el.querySelector(".fl-d").textContent)) && a.clips > 0, `${a.clips} cut short`);
    ok("A …and opens up in full on hover or focus", /\.flag\.clip:hover,\.flag\.clip:focus-visible\{max-width:none!important/.test(html));
    ev("setTextSize(1.5)"); const b = check("B full plan, text 150%", 0);
    { const seen = []; let more = false; for (let n = 1; n <= ev("maxZoomN()") && !more; n++){ ev("setTextSize(1)"); ev(`setZoomN(${n})`); const s1 = flags(), r1 = new Set(s1.map(f=>f.top)).size, c1 = s1.filter(f=>f.clip).length;
        ev("setTextSize(1.5)"); const s2 = flags(), r2 = new Set(s2.map(f=>f.top)).size, c2 = s2.filter(f=>f.clip).length; seen.push(`${n}: ${r1}/${c1} -> ${r2}/${c2}`); more = r2 > r1 || c2 > c1; }
      ev("setZoomN(0)"); ev("setTextSize(1.5)");
      ok("B bigger text takes more room: at some zoom, more rows or more labels cut short", more, seen.join(", ")); }
    ev("setTextSize(1)"); ev("setZoomN(1)"); const zw = ev("zoomWeeks()"); const c = check("C one sprint across the screen, text 100%", zw);
    ok("C zoomed in, the same flags need less: fewer rows, fewer cut short", c.rows <= a.rows && c.clips < a.clips, `rows ${c.rows}, cut ${c.clips}; zoom ${zw} weeks`);
    ev("setTextSize(1.5)"); check("D one sprint across the screen, text 150%", zw); ev("setTextSize(1)"); ev("setZoomN(0)");
    CW = 520; d.defaultView.dispatchEvent(new w.Event("resize")); await wait(260);
    check("E after the window narrows, packed again for the new width", 0);
    ok("E …the chart was redrawn at the new scale", Math.abs(ev("WPX") - wpx(0)) < 0.5, `${ev("WPX")} vs ${wpx(0)}`);
    CW = 1100; d.defaultView.dispatchEvent(new w.Event("resize")); await wait(260);
    // Two gates a day apart: their own flags when there's room, one flag when the markers would touch.
    const gflags = () => [...d.querySelectorAll("#gantt .gaterow .flag, #gantt .gaterow button")].map(x=>x.textContent).filter(t=>/Security review|Legal review/.test(t));
    ev("setZoomN(1)"); const apart = gflags();
    ev("setZoomN(0)"); CW = 420; d.defaultView.dispatchEvent(new w.Event("resize")); await wait(260); const close = gflags();
    ok("G gates a day apart share one flag (+1) only when their markers would touch", apart.length === 2 && close.length === 1 && / \+1$/.test(close[0]), `zoomed: ${apart.join(" | ")}; narrow: ${close.join(" | ")}`);
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
