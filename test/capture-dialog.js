// The capture form as a real modal, in a real browser (jsdom has no dialog focus): opened from To triage or with A then
// C, focus starts in "What was raised", Tab stays inside the form, Esc closes it without saving anything, and focus
// goes back to the button that opened it, even though the Roadmap redraws. Both themes.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/capture-dialog.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();

(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const theme of ["light", "dark"]){
      const page = await b.newPage({viewport:{width:1300, height:850}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.addInitScript(() => { const RD = Date, now = new RD("2026-10-07T14:00:00").getTime(); window.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } }; });
      await page.goto("file://" + HTML); await page.evaluate(t=>localStorage.setItem("timeline-planner-theme", t), theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      await page.evaluate(FIX=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); S.deliverables = []; goWs("roadmap"); UI.rmTriage = true; render(); }, FIX);
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      const n0 = await page.evaluate(()=>S.deliverables.length);
      await page.focus("#rmCapture"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const inDlg = () => page.evaluate(()=>{ const d = document.querySelector("#dlgCapture"); return !!d && d.open && d.contains(document.activeElement) ? document.activeElement.id || document.activeElement.tagName : null; });
      ok(`D1 ${theme}: To triage opens the form as a modal, with focus in What was raised`, await inDlg() === "capWhat");
      // the browser's own toolbar may take one Tab before focus wraps (focus shows as body): never a control behind the form
      const outside = () => page.evaluate(()=>{ const a = document.activeElement, d = document.querySelector("#dlgCapture"); return a && a !== document.body && !d.contains(a) ? (a.id || a.tagName) : ""; });
      const seen = [], out = [];
      for (let i = 0; i < 14; i++){ await page.keyboard.press("Tab"); seen.push(await inDlg() || "-"); const o = await outside(); if (o) out.push(o); }
      ok(`D2 ${theme}: Tab never reaches the page behind the form, and comes back round to What was raised`, !out.length && seen.filter(x=>x === "capWhat").length >= 1, out.join(",") + " / " + seen.join(","));
      await page.keyboard.type("Typed but not saved"); await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      const after = await page.evaluate(()=>({open:!!document.querySelector("#dlgCapture"), n:S.deliverables.length, focus:document.activeElement && document.activeElement.id}));
      ok(`D3 ${theme}: Esc closes it, saves nothing, and puts focus back on the button that opened it`, !after.open && after.n === n0 && after.focus === "rmCapture", JSON.stringify(after));
      await page.evaluate(()=>{ document.activeElement && document.activeElement.blur(); }); await page.keyboard.press("a"); await page.waitForTimeout(100); await page.keyboard.press("c"); await page.waitForTimeout(150);
      ok(`D4 ${theme}: A then C opens the same form`, await inDlg() === "capWhat");
      await page.keyboard.press("Escape"); await page.close();
    }
    ok("Z no page errors", !errs.length, errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
