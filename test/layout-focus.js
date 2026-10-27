// The Focus path laid out in a real browser (jsdom has no layout): the current step takes the room the row has and is
// shown whole when it fits, ends in an ellipsis with its full name on hover only when it doesn't, and teammates' tasks
// are dimmed while teammates' work is shown. Light and dark, two widths.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-focus.js. Playwright comes from
// node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();

function setup(FIX){
  askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; goWs("timeline");
  const A = S.people.find(p=>p.name === "Avery").id, B = S.people.find(p=>p.name === "Blake").id, b = S.bars.find(x=>x.id === "m2"), st = dayToIso(nearWeekday(wkDay(b.start)));
  b.tasks = [{id:"fa", label:"Avery builds", start:st, days:4, owners:[A], status:"inprogress"}, {id:"fb", label:"Blake tests", start:st, days:3, owners:[B], status:"notstarted"}];
  UI.filter = normFilter({}); UI.zoom = "weeks"; UI.focus = null; UI.drill = null; render(); return A;
}
const crumb = () => { const c = document.querySelector("#drillPath .crumb.here"), n = c && (c.querySelector(".cname") || c);
  return c ? {clipped:n.scrollWidth > n.clientWidth + 1, ell:getComputedStyle(n).textOverflow, title:c.title, text:n.textContent, clip:c.scrollWidth > c.clientWidth + 1 || n.scrollWidth > n.clientWidth + 1} : null; };
(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const [w, theme] of [[1500, "light"], [1500, "dark"], [900, "light"]]){
      const page = await b.newPage({viewport:{width:w, height:900}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.evaluate(t=>localStorage.setItem("timeline-planner-theme", t), theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const A = await page.evaluate(setup, FIX);
      await page.evaluate(()=>focusOn("bar", "m2")); await page.waitForTimeout(150);
      const c = await page.evaluate(crumb), tag = `${w}px ${theme}`;
      if (w >= 1500) ok(`L1 ${tag}: with room on the row, the current step shows its whole name`, c && !c.clip && c.text === c.title, JSON.stringify(c));
      ok(`L2 ${tag}: the current step ends in an ellipsis if it must, with its full name on hover`, c && c.ell === "ellipsis" && c.title.length > 10, JSON.stringify(c));
      await page.evaluate(()=>{ S.bars.find(x=>x.id === "m2").label = "A very long initiative name ".repeat(12).trim(); render(); }); await page.waitForTimeout(100);
      const c2 = await page.evaluate(crumb), row = await page.evaluate(()=>{ const r = document.querySelector("#drillPath").getBoundingClientRect(); return {w:Math.round(r.width), sw:document.querySelector("#drillPath").scrollWidth, cw:document.querySelector("#drillPath").clientWidth}; });
      ok(`L3 ${tag}: a name too long for the row is cut with an ellipsis, and the row doesn't overflow`, c2 && c2.clipped && c2.ell === "ellipsis" && row.sw <= row.cw + 1, JSON.stringify([c2 && {clipped:c2.clipped}, row]));
      await page.evaluate(A=>{ focusOn("person", A); UI.drill.rest = true; drillApply(); }, A); await page.waitForTimeout(150);
      const dim = await page.evaluate(()=>[...document.querySelectorAll('#gantt [data-sel^="task:"]')].map(e=>({id:e.dataset.sel, o:getComputedStyle(e).opacity})));
      ok(`L4 ${tag}: with teammates' work on, the teammate's task is dimmed and the person's isn't`, dim.some(x=>x.id === "task:fb" && +x.o < 0.6) && dim.some(x=>x.id === "task:fa" && +x.o === 1), JSON.stringify(dim));
      if (w === 1500) await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `focus-after-${theme}.png`)});
      await page.close();
    }
    ok("no page errors", !errs.length, errs.slice(0, 2).join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
