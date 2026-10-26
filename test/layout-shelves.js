// Sprint shelf labels, laid out in a real browser (jsdom has no layout): at two text sizes and two label widths the
// label stays within two lines, nothing spills out of the label column, a shelf with nothing on screen takes one
// line, the row is no taller than its tiles or its label, and the Show menu's Spotlight lights up every shelf.
// Run by hand, not by run.sh (CI has no browser yet): node test/layout-shelves.js. Playwright comes from node_modules,
// or from PLAYWRIGHT=/path/to/node_modules/playwright. Every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), SHELF = require("./fixtures/shelf-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 100000).unref();

// In the page: draw the shelf plan at a zoom and label width, then measure every shelf label.
function setup([FIX, SHELF, zoom, lw]){
  askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = parseText(FIX);
  UI.zoom = "weeks"; UI.rows = "lanes"; UI.shelfOpen = {}; UI.spot = null; delete UI.shelves; UI.labelW.weeks = lw; goWs("timeline");
  eval(SHELF); shelfPlan();
  if (zoom === "fit") setZoomN(0, 0); else { setZoomN(1, 1); UI.zoomSp = zoom; }
  dropJiraMemos(); render();
}
function measure(){
  const box = e => e.getBoundingClientRect();
  return [...document.querySelectorAll(".shelfrow")].map(r=>{
    const lab = r.querySelector(".shlab"), st = lab.querySelector(".shstick"), l2 = lab.querySelector(".shl2"), L = box(lab), lh = parseFloat(getComputedStyle(l2).lineHeight);
    const l2b = getComputedStyle(l2).display === "none" ? null : box(l2);
    // what a person sees: the first line, the toggle, and the second line's pieces that fit on its one line
    const seen = [...lab.querySelectorAll(".shl1, .shl1 *")].concat(l2b ? [...l2.children].filter(x=>box(x).top < l2b.bottom - 1) : []).filter(x=>box(x).width);
    const spill = seen.filter(x=>{ const q = box(x); return q.left < L.left - 0.5 || q.right > L.right + 0.5 || q.bottom > L.bottom + 0.5; }).map(x=>x.className || x.tagName);
    const lines = new Set(seen.filter(x=>x.closest(".shl1t,.shl2") && x.tagName !== "B").map(x=>Math.round(box(x).top / 4))).size;
    const shelves = r.querySelector(".shelves"), grid = [...shelves.children].reduce((n, c)=>Math.max(n, box(c).bottom), box(shelves).top) - box(shelves).top + 8;   // the cells' own extent, margins in
    return {id:r.dataset.shelf, flat:lab.classList.contains("flat"), tiles:!!r.querySelector(".shtile"), stick:box(st).height, lh, lines, spill, row:box(r).height, most:Math.max(box(st).height + 12, grid)};
  });
}

(async()=>{
  const b = await pw.chromium.launch();
  try {
    const page = await b.newPage({viewport:{width:1440, height:1000}}), errs = [];
    page.on("pageerror", e=>errs.push(String(e)));
    await page.addInitScript(() => { const RD = Date, now = new RD("2026-10-07T14:00:00").getTime(); window.Date = class extends RD { constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; } }; });
    for (const ts of ["1", "1.5"]) for (const lw of [160, 300]) {
      await page.goto("file://" + HTML); await page.evaluate(v=>localStorage.setItem("timeline-planner-textsize", v), ts);
      await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const tag = `text ${ts * 100}%, label ${lw}px`;
      await page.evaluate(setup, [FIX, SHELF, "2026-10-05", lw]); await page.waitForTimeout(150);
      const one = await page.evaluate(measure), chat = one.find(x=>x.id === "chat"), rag = one.find(x=>x.id === "rag");
      ok(`T1 one sprint, ${tag}: each label is two lines at most`, one.length === 2 && one.every(x=>x.lines <= 2 && x.stick <= 2 * x.lh + 6), JSON.stringify(one.map(x=>[x.id, x.lines, Math.round(x.stick), x.lh])));
      ok(`T2 one sprint, ${tag}: nothing spills out of the label column`, one.every(x=>!x.spill.length), JSON.stringify(one.map(x=>x.spill)));
      ok(`T3 one sprint, ${tag}: a row is as tall as its tiles or its label, no taller`, chat.tiles && rag.tiles && one.every(x=>x.row <= x.most + 2), JSON.stringify(one.map(x=>[x.id, Math.round(x.row), Math.round(x.most)])));
      await page.evaluate(setup, [FIX, SHELF, "2026-10-19", lw]); await page.waitForTimeout(150);
      const none = await page.evaluate(measure);
      ok(`T4 nothing on screen, ${tag}: one compact line`, none.every(x=>x.flat && !x.tiles && x.stick <= x.lh + 6 && x.row <= Math.max(x.lh + 18, 46 * Number(ts))), JSON.stringify(none.map(x=>[x.id, Math.round(x.stick), Math.round(x.row)])));
      ok(`T4 …and nothing spills there either, ${tag}`, none.every(x=>!x.spill.length), JSON.stringify(none.map(x=>x.spill)));
    }
    // Spotlight from the Show menu, with the keyboard, in a real browser.
    await page.evaluate(setup, [FIX, SHELF, "2026-10-05", 160]); await page.keyboard.press("Escape");
    await page.click("#showBtn"); await page.focus('#showMenu [data-spot=""]'); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    const sp = await page.evaluate(()=>({spot:UI.spot, rows:[...document.querySelectorAll(".shelfrow")].map(r=>r.classList.contains("spot") && !!r.querySelector(".shtile.me")), lit:[...document.querySelectorAll(".shtile.me")].map(t=>t.dataset.key).sort()}));
    ok("P1 Spotlight from the Show menu, by keyboard, lights up the person on every shelf", sp.spot === "pb" && sp.rows.length === 2 && sp.rows.every(Boolean) && sp.lit.join() === "bar:lf1,story:ABC-102,story:ABC-105,story:ABC-201", JSON.stringify(sp));
    ok("Z no page errors", !errs.length, errs.join(" | "));
  } catch(e){ ok("layout check ran without throwing", false, e.stack); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
