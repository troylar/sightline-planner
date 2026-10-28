// J and K in a real browser (jsdom has no focus styles or layout): the row they land on on Today and in People load shows
// where you are with a tint and a 2px outline that stands out 3:1 against the panel, light and dark, and the screen
// reader hears the position. run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-nav.js.
// Playwright comes from node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
// The focused row's outline, and its contrast against the nearest opaque background behind the row
function ringOf(rowSel){
  const rgb = c => { const n = (c.match(/[\d.]+/g) || []).map(Number); return /^color\(srgb/.test(c) ? n.map((v, i)=>i < 3 ? v * 255 : v) : n; };
  const lum = ([r, g, b]) => [r, g, b].map(v=>{ v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i)=>a + v * [.2126, .7152, .0722][i], 0);
  const a = document.activeElement, row = a && a.closest(rowSel); if (!row) return null;
  const s = getComputedStyle(row); let p = row.parentElement, bg = [255, 255, 255];
  while (p){ const c = rgb(getComputedStyle(p).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] >= 1)){ bg = c.slice(0, 3); break; } p = p.parentElement; }
  const [x, y] = [lum(rgb(s.outlineColor).slice(0, 3)), lum(bg)].sort((m, n)=>n - m);
  return {width:parseFloat(s.outlineWidth), style:s.outlineStyle, contrast:Math.round((x + .05) / (y + .05) * 10) / 10, tint:rgb(s.backgroundColor)[3] > 0 || s.backgroundColor !== "rgba(0, 0, 0, 0)"};
}
(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const theme of ["light", "dark"]){
      const page = await b.newPage({viewport:{width:1400, height:800}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.evaluate(t=>localStorage.setItem("timeline-planner-theme", t), theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      for (const [ws, rowSel, name] of [["today", "li.trow", "a Today row"], ["people", ".lgrid > .p", "a People load row"]]){
        await page.evaluate(([FIX, ws])=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; sel = null; goWs(ws); render(); document.activeElement && document.activeElement.blur(); }, [FIX, ws]);
        await page.waitForTimeout(250); await page.keyboard.press("j"); await page.waitForTimeout(150);
        const r = await page.evaluate(ringOf, rowSel), live = await page.evaluate(()=>document.querySelector("#navLive")?.textContent || "");
        ok(`R1 ${theme}: J on ${name} outlines the whole row, 2px, at 3:1 or better, with a tint`, !!r && r.style === "solid" && r.width >= 2 && r.contrast >= 3 && r.tint, JSON.stringify(r));
        ok(`R2 ${theme}: …and a screen reader hears where it is`, /^1 of \d+: \S/.test(live), live);
      }
      await page.close();
    }
    ok("no page errors", !errs.length, errs.slice(0, 2).join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
