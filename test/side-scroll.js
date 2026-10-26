// The details panel keeps its scroll when it redraws (a button in it saves, copies or approves, and the page draws
// again), and starts at the top for a different item. Laid out in a real browser: jsdom has no scrolling.
// Run by hand, not by run.sh (CI has no browser yet): node test/side-scroll.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();

(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const [w, h] of [[1200, 640], [1500, 640]]) {          // the panel floats below 1400 px, and sits beside the chart above it
      const page = await b.newPage({viewport:{width:w, height:h}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const top = () => page.evaluate(()=>$("#side").scrollTop);
      await page.evaluate(FIX=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = parseText(FIX); goWs("timeline"); select("bar", S.bars[0].id); }, FIX);
      await page.keyboard.press("Escape"); await page.evaluate(()=>select("bar", S.bars[0].id)); await page.waitForTimeout(150);
      const room = await page.evaluate(()=>$("#side").scrollHeight - $("#side").clientHeight);
      await page.evaluate(()=>{ $("#side").scrollTop = 200; }); const was = await top();
      ok(`S0 ${w}px: the panel is long enough to scroll`, room > 200 && was === 200, `room ${room}, at ${was}`);
      await page.evaluate(()=>render());
      ok(`S1 ${w}px: a redraw keeps the panel where it was`, await top() === was, `at ${await top()}`);
      const btn = await page.evaluate(()=>{ const r = $("#side").getBoundingClientRect(), b = [...$("#side").querySelectorAll("button")].find(x=>{ const q = x.getBoundingClientRect(); return q.top > r.top + 40 && q.bottom < r.bottom - 10 && /^(Not started|In progress|Done)$/.test(x.textContent.trim()); }); if (!b) return null; b.dataset.probe = "1"; return b.textContent.trim(); });
      if (btn) { await page.click('#side [data-probe="1"]'); await page.waitForTimeout(150); }
      ok(`S2 ${w}px: clicking a button in the panel keeps it where it was`, !!btn && Math.abs(await top() - was) <= 2, `${btn}: at ${await top()}`);
      await page.evaluate(()=>select("bar", S.bars[1].id)); await page.waitForTimeout(100);
      ok(`S3 ${w}px: a different item starts at the top`, await top() === 0, `at ${await top()}`);
      await page.close();
    }
    ok("Z no page errors", !errs.length, errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
