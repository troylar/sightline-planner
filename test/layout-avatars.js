// Owner avatars laid out in a real browser (jsdom has no layout): on every story bar the avatar sits whole inside the bar's
// right end and the name stops before it, however narrow the bar; when a bar's name is pinned at the chart's left edge
// while scrolling, it still stops before the avatar. Days and Weeks by person, two widths, and once with a wide fallback
// font (as on Linux), where three-letter initials once grew past the room the bar keeps for them.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-avatars.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/shelf-plan.js; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), SHELF = require("./fixtures/shelf-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();

function setup([FIX, SHELF, zoom, rows]){
  askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = parseText(FIX); UI.shelfOpen = {}; UI.spot = null; delete UI.shelves; goWs("timeline");
  eval(SHELF); shelfPlan(); UI.zoom = zoom === "fit" ? "weeks" : zoom; UI.rows = rows; if (zoom === "weeks"){ setZoomN(1, 1); UI.zoomSp = "2026-10-05"; } else if (zoom === "fit") setZoomN(0, 0); dropJiraMemos(); render();
}
function measure(){
  const box = e => e.getBoundingClientRect();
  return [...document.querySelectorAll("#gantt .tbar.story, #gantt .bar.story")].filter(b=>box(b).width).map(b=>{
    const r = box(b), a = b.querySelector(":scope > .oav"), q = a && box(a), nm = b.querySelector(".bin") || b.querySelector(".nm"), n = nm && box(nm);
    return {key:b.dataset.key, w:Math.round(r.width), has:!!a, whole:!!q && q.left >= r.left - 0.5 && q.right <= r.right + 0.5 && q.width >= 14, clear:!q || !n || !n.width || n.right <= q.left + 0.5, seen:!!a && getComputedStyle(a).visibility !== "hidden" && getComputedStyle(a).display !== "none"};
  });
}
(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const [w, zoom, rows, wide] of [[1200, "days", "lanes"], [1600, "days", "lanes"], [1200, "weeks", "people"], [1600, "weeks", "people"], [1200, "fit", "people"], [1200, "fit", "people", true], [1200, "days", "lanes", true]]){
      const page = await b.newPage({viewport:{width:w, height:900}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.addInitScript(() => { const RD = Date, now = new RD("2026-10-07T14:00:00").getTime(); window.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } }; });
      if (wide) await page.route(/fonts\./, r=>r.abort());
      await page.goto("file://" + HTML); if (wide) await page.addStyleTag({content:"*{font-family:'DejaVu Sans',Verdana,sans-serif !important}"}); await page.waitForTimeout(300);
      await page.evaluate(setup, [FIX, SHELF, zoom, rows]); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      if (zoom === "fit") await page.evaluate(()=>[...document.querySelectorAll("#gantt .bar.story")].slice(0, 4).forEach((b, i)=>{ b.style.width = [44, 32, 26, 60][i] + "px"; }));   // squeeze some bars: padding sits outside the width, so the narrowest a bar draws is about 38px
      const tag = `${zoom === "days" ? "Days" : zoom === "fit" ? "Weeks by person at Fit (narrow bars)" : "Weeks by person"}, ${w}px${wide ? ", wide font" : ""}`, m = await page.evaluate(measure), bad = m.filter(x=>!(x.has && x.whole && x.clear && x.seen));
      ok(`V1 ${tag}: every story bar shows its avatar whole at the right end, with the name stopping before it`, m.length >= 4 && !bad.length && (zoom !== "fit" || Math.min(...m.map(x=>x.w)) <= 40), JSON.stringify(bad.slice(0, 2)) + ` of ${m.length}, narrowest ${Math.min(...m.map(x=>x.w))}px`);
      if (zoom === "weeks"){
        const pinned = [];
        for (let i = 0; i < 5; i++){ await page.evaluate(()=>{ $("#gscroll").scrollLeft += 90; }); await page.waitForTimeout(60);
          pinned.push(...(await page.evaluate(measure)).filter(x=>x.has)); }
        const pb = pinned.filter(x=>!(x.clear && x.whole));
        ok(`V2 ${tag}: scrolled sideways, a pinned name still stops before the avatar`, pinned.length >= 4 && !pb.length, JSON.stringify(pb.slice(0, 2)));
      }
      await page.close();
    }
    ok("Z no page errors", !errs.length, errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
