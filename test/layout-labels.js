// Labels stay readable while the Timeline scrolls sideways, laid out in a real browser (jsdom has no layout): a bar
// whose start is off to the left keeps its name at the chart's left edge, inside the bar, shrinking with an ellipsis
// to the part still showing; a milestone, gate or stretch label whose marker is off to the left does the same with ‹;
// scrolling never redraws the chart; print puts every label back where it starts; a tag (late, +1) is whole or hidden, never
// cut off, while scrolling and on the short bars of Fit. Two widths, and 150% text.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-labels.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();

// In the page: every bar and marker that crosses the chart's left edge, and how its label sits.
function crossing(){
  const sc = $("#gscroll"), g = $("#gantt"), lw = parseFloat(g.style.getPropertyValue("--lw")), edge = sc.getBoundingClientRect().left + lw, box = e => e.getBoundingClientRect();
  const bars = [...g.querySelectorAll(".track > .bar")].filter(b=>{ const r = box(b); return r.left < edge - 2 && r.right > edge + 40; }).map(b=>{
    const r = box(b), bin = b.querySelector(".bin"), q = box(bin), nm = b.querySelector(".nm");
    return {key:b.dataset.key, pinned:b.classList.contains("pinl"), inView:q.left >= edge - 1, inBar:q.right <= r.right + 0.5, shown:Math.round(box(nm).width), cut:nm.scrollWidth > nm.clientWidth + 1,
      fits:q.right - q.left <= r.right - edge + 0.5, aria:b.getAttribute("aria-label") || ""}; });
  const flags = [...g.querySelectorAll(".track > .flag")].filter(f=>f.classList.contains("pinl")).map(f=>{ const q = box(f), next = [...f.parentElement.querySelectorAll(":scope > .flag")].filter(o=>o !== f && Math.abs(box(o).top - q.top) < 4 && box(o).left >= q.left);
    const t = f.querySelector(":scope > .fl-t");
    return {text:f.textContent.slice(0, 40), named:!!t && box(t).width >= 14, mark:getComputedStyle(f, "::before").content, inView:q.left >= edge - 1, clear:next.every(o=>box(o).left >= q.right - 0.5)}; });
  // anything else crossing the edge is pinned or hidden: never a cut-off fragment like "ion test"
  const bits = [...g.querySelectorAll(".track > .flag, .track > .bar")].filter(e=>{ const r = box(e); return r.left < edge - 2 && r.right > edge + 2; })
    .filter(e=>!e.classList.contains("pinl") && getComputedStyle(e.querySelector(":scope > .bin") || e).visibility !== "hidden").map(e=>e.textContent.slice(0, 30));
  const tags = [...g.querySelectorAll(".tags > .tag")].filter(t=>getComputedStyle(t).visibility !== "hidden" && box(t).width && box(t).right > box(t.parentElement).right + 0.5 && box(t).left < box(t.parentElement).right - 0.5).map(t=>t.textContent);
  return {bars, flags, bits, tags, scrollLeft:sc.scrollLeft};
}
// Tags (late, +1, a workstream) shown only in part, like "lat": each must be whole or hidden.
function partTags(){ const box = e => e.getBoundingClientRect();
  return [...document.querySelectorAll("#gantt .tags > .tag")].filter(t=>getComputedStyle(t).visibility !== "hidden" && box(t).width).filter(t=>{ const c = box(t.parentElement), q = box(t); return q.right > c.right + 0.5 && q.left < c.right - 0.5; })
    .map(t=>`${t.textContent}@${Math.round(box(t.parentElement).right - box(t).left)}/${Math.round(box(t).width)}`); }
function setup([FIX, z]){
  askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = parseText(FIX); UI.zoom = z === "days" ? "days" : "weeks"; UI.rows = "lanes"; goWs("timeline");
  if (z !== "days") setZoomN(z, z); render();
  window.__draws = 0; const real = renderGantt; renderGantt = (...a) => { window.__draws++; return real(...a); };
}

(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const [w, ts, z = 2] of [[1200, "1"], [1600, "1"], [1440, "1.5"], [1440, "1", "days"]]) {
      const page = await b.newPage({viewport:{width:w, height:900}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.addInitScript(() => { const RD = Date, now = new RD("2026-10-07T14:00:00").getTime(); window.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } }; });
      await page.goto("file://" + HTML); await page.evaluate(v=>localStorage.setItem("timeline-planner-textsize", v), ts); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const tag = `${z === "days" ? "Days" : "Weeks"}, ${w}px, text ${ts * 100}%`;
      await page.evaluate(setup, [FIX, z]); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      const steps = [];
      for (let i = 0; i < 6; i++){ await page.evaluate(()=>{ $("#gscroll").scrollLeft += 130; }); await page.waitForTimeout(60); steps.push(await page.evaluate(crossing)); }
      const bars = steps.flatMap(s=>s.bars), flags = steps.flatMap(s=>s.flags);
      if (z !== "days"){
      ok(`B1 ${tag}: a bar whose start is off to the left keeps its name at the left edge, inside the bar`, bars.length >= 3 && bars.every(x=>x.pinned && x.inView && x.inBar && x.fits), JSON.stringify(bars.filter(x=>!(x.pinned && x.inView && x.inBar && x.fits)).slice(0, 2)) + ` of ${bars.length}`);
      ok(`B2 ${tag}: …readable, and cut with an ellipsis where only part of the bar shows`, bars.every(x=>x.shown >= 12) && bars.some(x=>x.cut), `${bars.filter(x=>x.cut).length} cut`);
      ok(`B3 ${tag}: the full name stays the bar's accessible name`, bars.every(x=>x.aria.length > 0)); }
      ok(`M1 ${tag}: a marker label whose marker is off to the left sticks at the edge with ‹, clear of its neighbors, with some of its name showing`, flags.length >= 1 && flags.every(f=>f.mark === '"‹"' && f.inView && f.clear && f.named), JSON.stringify(flags.filter(f=>!(f.mark === '"‹"' && f.inView && f.clear && f.named)).slice(0, 2)) + ` of ${flags.length}`);
      const bits = steps.flatMap(s=>s.bits);
      ok(`M2 ${tag}: nothing crossing the left edge shows a cut-off fragment: it's pinned, or hidden when too little is left`, !bits.length, JSON.stringify(bits.slice(0, 3)));
      const tags = steps.flatMap(s=>s.tags);
      ok(`T1 ${tag}: while scrolling, a tag is whole or hidden, never cut off`, !tags.length, tags.slice(0, 4).join(", "));
      ok(`R1 ${tag}: scrolling never redraws the chart`, await page.evaluate(()=>window.__draws) === 0, String(await page.evaluate(()=>window.__draws)));
      await page.emulateMedia({media:"print"}); await page.waitForTimeout(50);
      const printed = await page.evaluate(()=>[...document.querySelectorAll("#gantt .pinl, #gantt .pinl .bin")].every(e=>getComputedStyle(e).transform === "none"));
      ok(`P1 ${tag}: print puts every label back where it starts`, printed); await page.emulateMedia({media:"screen"});
      await page.evaluate(()=>{ $("#gscroll").scrollLeft = 0; }); await page.waitForTimeout(80);
      ok(`B4 ${tag}: scrolled back, nothing stays pinned or hidden`, await page.evaluate(()=>!document.querySelector("#gantt .pinl, #gantt .pingone") && [...document.querySelectorAll("#gantt .bin")].every(x=>!x.style.transform)));
      await page.close();
    }
    for (const rows of ["lanes", "people"]){   // Fit squeezes short bars hardest: the peer saw "late" cut to "lat" here
      const page = await b.newPage({viewport:{width:1200, height:900}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.addInitScript(() => { const RD = Date, now = new RD("2026-10-07T14:00:00").getTime(); window.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } }; });
      await page.goto("file://" + HTML); await page.waitForTimeout(300);
      await page.evaluate(setup, [FIX, 2]); await page.evaluate(rows=>{ UI.rows = rows; setZoomN(0, 0); render(); }, rows); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
      const part = await page.evaluate(partTags), m = await page.evaluate(()=>({late:[...document.querySelectorAll("#gantt .bar.late")].length, hidLate:[...document.querySelectorAll("#gantt .bar.late .tag.bad.tagcut")].length}));
      ok(`T2 Fit by ${rows === "people" ? "person" : "workstream"}, 1200px: a tag that doesn't fit a short bar is hidden whole, and the bar keeps its late ring`, !part.length && m.late >= 1 && (rows === "lanes" || m.hidLate >= 1), part.slice(0, 4).join(", ") + ` late ${m.late}, late tag hidden on ${m.hidLate}`);
      await page.close(); }
    ok("Z no page errors", !errs.length, errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
