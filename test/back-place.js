// Back and Forward keep your place: the page, the chart and the details panel come back scrolled where you left them, on
// the Timeline, the List and Today, and between two items. Laid out in a real browser: jsdom has no scrolling.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/back-place.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const near = (a, b) => Math.abs(a - b) <= 3;

(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [], page = await b.newPage({viewport:{width:1400, height:700}}); page.on("pageerror", e=>errs.push(String(e)));
    await page.goto("file://" + HTML); await page.waitForTimeout(300);
    await page.evaluate(FIX=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null;
      // enough rows and weeks that the chart, the list and the page all have room to scroll
      for (let i = 0; i < 30; i++) S.bars.push({...clone(S.bars[0]), id:"bx" + i, label:"Extra initiative " + i, tasks:[], jira:"", epics:[]});
      goWs("timeline"); render(); }, FIX);
    await page.waitForTimeout(300);
    const at = () => page.evaluate(()=>{ const g = $("#gscroll"), s = $("#side"); return {ws:UI.ws, sel:sel && sel.id, gx:g ? g.scrollLeft : 0, gy:g ? g.scrollTop : 0, sy:s ? s.scrollTop : 0, wy:Math.round(scrollY)}; });
    const settle = () => page.waitForTimeout(450);

    // Timeline: an initiative open, the chart scrolled across and down, the panel scrolled; go to the List and come back
    await page.evaluate(()=>select("bar", S.bars[0].id)); await settle();
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollLeft = 300; g.scrollTop = 120; $("#side").scrollTop = 150; }); await settle();
    const t0 = await at();
    ok("B0 the chart and the panel have room to scroll", t0.gx === 300 && t0.gy > 60 && t0.sy > 60, JSON.stringify(t0));
    await page.evaluate(()=>goWs("list")); await settle();
    await page.goBack(); await settle(); const t1 = await at();
    ok("B1 Back to the Timeline: the same initiative is open", t1.ws === "timeline" && t1.sel === t0.sel, JSON.stringify(t1));
    ok("B2 Back to the Timeline: the chart is scrolled where it was, across and down", near(t1.gx, t0.gx) && near(t1.gy, t0.gy), JSON.stringify([t0, t1]));
    ok("B3 Back to the Timeline: the details panel is scrolled where it was", near(t1.sy, t0.sy), JSON.stringify([t0.sy, t1.sy]));

    // Forward to the List, scroll the page, go to Today, come back
    await page.goForward(); await settle();
    await page.evaluate(()=>window.scrollTo(0, 260)); await settle(); const l0 = await at();
    await page.evaluate(()=>goWs("today")); await settle();
    await page.goBack(); await settle(); const l1 = await at();
    ok("B4 the List has room to scroll the page", l0.ws === "list" && l0.wy > 150, JSON.stringify(l0));
    ok("B5 Back to the List: the page is scrolled where it was", l1.ws === "list" && near(l1.wy, l0.wy), JSON.stringify([l0, l1]));
    await page.goForward(); await settle(); const d1 = await at();
    ok("B6 Forward to Today: it opens at its own place (the top), not the List's", d1.ws === "today" && d1.wy < 40, JSON.stringify(d1));

    // Between two items on the Timeline: open one, scroll, open another (which scrolls to it), Back
    await page.evaluate(()=>{ goWs("timeline"); }); await settle();
    await page.evaluate(()=>select("bar", S.bars[1].id)); await settle();
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollLeft = 120; g.scrollTop = 40; }); await settle(); const i0 = await at();
    await page.evaluate(()=>goTo("bar", "bx28")); await settle(); const i1 = await at();
    await page.goBack(); await settle(); const i2 = await at();
    ok("B7 Back from the second item: the first is open and the chart is where it was", i2.sel === i0.sel && near(i2.gx, i0.gx) && near(i2.gy, i0.gy), JSON.stringify([i0, i1, i2]));

    // Back right after a scroll: the step you left still keeps it (Forward returns to it)
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollLeft = 200; g.scrollTop = 60; }); await settle();
    await page.evaluate(()=>goWs("list")); await settle();
    await page.evaluate(()=>window.scrollTo(0, 300)); await page.waitForTimeout(60);
    await page.goBack(); await settle(); await page.goForward(); await settle(); const q1 = await at();
    ok("B10 Back within a moment of scrolling: Forward still returns to that scroll", q1.ws === "list" && near(q1.wy, 300), JSON.stringify(q1));

    // A step whose chart kept its place without scrolling (another initiative selected on the same chart) still remembers it
    await page.goBack(); await settle();
    await page.evaluate(()=>{ UI.zoomN = 0; UI.zoomSp = null; fitKey = ""; render(); }); await settle();   // Fit: coming back re-fits the chart unless the step kept its place
    await page.evaluate(()=>select("bar", S.bars[2].id)); await settle();
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollLeft = 330; g.scrollTop = 90; }); await settle();
    await page.evaluate(()=>select("bar", S.bars[3].id)); await settle(); const k0 = await at();
    await page.evaluate(()=>goWs("list")); await settle(); await page.goBack(); await settle(); const k1 = await at();
    ok("B11 a step that never scrolled keeps the chart where it was on screen", k1.sel === k0.sel && near(k1.gx, k0.gx) && near(k1.gy, k0.gy), JSON.stringify([k0, k1]));

    // Two Backs in quick succession: the second step's place wins, not the first one's still settling
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollLeft = 410; g.scrollTop = 30; }); await settle(); const r0 = await at();
    await page.evaluate(()=>goWs("list")); await settle(); await page.evaluate(()=>window.scrollTo(0, 280)); await settle();
    await page.evaluate(()=>{ place.gscroll = [99999, 99999]; savePlace(); }); await settle();   // a place this step can't reach, so it's still settling at the second Back
    await page.evaluate(()=>goWs("today")); await settle();
    await page.evaluate(()=>history.back()); await page.waitForTimeout(40); await page.evaluate(()=>history.back()); await page.waitForTimeout(1300); const r1 = await at();
    await page.evaluate(()=>goWs("list")); await settle(); await page.goBack(); await settle(); const r2 = await at();
    ok("B12 two quick Backs land where the earlier page was, not where the one in between was, and it stays that way", r1.ws === "timeline" && near(r1.gx, r0.gx) && near(r1.gy, r0.gy) && near(r2.gx, r0.gx) && near(r2.gy, r0.gy), JSON.stringify([r0, r1, r2]));

    // A linked chain on screen, Find something outside it with the keyboard and press Enter, then one Back: the chain,
    // its zoom and the chart's scroll are back, and so is what was hidden
    await page.evaluate(()=>{ goWs("timeline"); setHiddenQuiet(["gate"]); select("bar", "c3"); render(); }); await settle();
    await page.click("#f-linked"); await settle();
    await page.evaluate(()=>{ const g = $("#gscroll"); g.scrollTop = 40; }); await settle();
    const chainAt = async () => ({...await at(), linked:await page.evaluate(()=>JSON.stringify(UI.filter.linked)), n:await page.evaluate(()=>zoomN()), hid:await page.evaluate(()=>hiddenKinds().join())});
    const c0 = await chainAt();
    await page.evaluate(()=>document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.keyboard.press("/"); await page.waitForTimeout(100); await page.keyboard.type("Extra initiative 5"); await page.waitForTimeout(100);
    const tag = await page.evaluate(()=>$("#findList .fhit.on .fout")?.textContent || "");
    await page.keyboard.press("Enter"); await settle();
    const v1 = await chainAt(), strip = await page.evaluate(()=>{ const s = $("#backStrip"); if (!s) return null; const r = s.getBoundingClientRect(), p = s.parentElement.getBoundingClientRect(); return {w:r.width, fits:r.right <= p.right + 1 && s.scrollWidth <= s.clientWidth + 1, text:s.textContent}; });
    ok("B13 Find marks the result outside the chain, and Enter shows it with a way back above the chart that fits", tag === "Outside linked work" && v1.sel === "bx5" && !!strip && strip.fits && /Back to where I was/.test(strip.text), JSON.stringify([tag, v1.sel, strip]));
    await page.goBack(); await settle(); const c1 = await chainAt();
    ok("B14 one Back puts the chain, its zoom, the chart's scroll and the selection back", c1.linked === c0.linked && c1.n === c0.n && c1.sel === c0.sel && near(c1.gy, c0.gy) && near(c1.gx, c0.gx), JSON.stringify([c0, c1]));
    ok("B15 …and what was hidden, and the visit's strip goes", c1.hid === "gate" && !(await page.$("#backStrip")), c1.hid);
    await page.evaluate(()=>{ setHiddenQuiet([]); linkedOff(); render(); }); await settle();

    // The place stays out of the address: a copied link opens clean
    const hash = await page.evaluate(()=>location.hash);
    ok("B8 the address doesn't carry scroll positions", !/scroll|place|gx=|wy=/.test(hash), hash);
    ok("B9 no page errors", !errs.length, errs.slice(0, 2).join(" | "));
    await page.close();
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  finally { await b.close(); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
