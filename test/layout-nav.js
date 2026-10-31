// J and K in a real browser (jsdom has no focus styles or layout): the row they land on on Today, in People load and on the Roadmap shows
// where you are with a tint and a 2px outline that stands out 3:1 against the panel, light and dark, and the screen
// reader hears the position. run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-nav.js.
// Playwright comes from node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), CARDS = require("./fixtures/cards-plan.js");
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
  // the outline's inner edge against where the row's text starts (the outline is drawn inside the row by outline-offset)
  const wk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {acceptNode:n=>n.textContent.trim() ? 1 : 3}), tn = wk.nextNode();
  let textLeft = null; if (tn){ const rg = document.createRange(); rg.selectNodeContents(tn); const rs = [...rg.getClientRects()]; textLeft = rs.length ? Math.min(...rs.map(r=>r.left)) : null; }
  if (textLeft == null){ const f = row.querySelector("input,textarea,select"); if (f) textLeft = f.getBoundingClientRect().left; }   // a row of fields: its first field
  const rr = row.getBoundingClientRect(), inner = rr.left - parseFloat(s.outlineOffset || 0) * (parseFloat(s.outlineOffset) > 0 ? 1 : 0) + Math.max(0, -parseFloat(s.outlineOffset || 0));
  return {width:parseFloat(s.outlineWidth), style:s.outlineStyle, contrast:Math.round((x + .05) / (y + .05) * 10) / 10, tint:rgb(s.backgroundColor)[3] > 0 || s.backgroundColor !== "rgba(0, 0, 0, 0)", clear:textLeft == null ? null : Math.round(textLeft - inner)};
}
(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const theme of ["light", "dark"]){
      const page = await b.newPage({viewport:{width:1400, height:800}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.clock.install({time:new Date("2026-10-28T12:00:00")});   // the Roadmap places deliverables by quarter against today; 2027-Q1 is ahead
      await page.goto("file://" + HTML); await page.evaluate(t=>localStorage.setItem("timeline-planner-theme", t), theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const ideas = [{id:"dv1", name:"Faster search", stage:"idea"}, {id:"dv2", name:"Shared filters", stage:"idea"}], card = [{id:"dv3", name:"Saved views", target:"2027-Q1"}];
      for (const [ws, rowSel, name, dvs, tab] of [["today", "li.trow", "a Today row"], ["people", ".lgrid > .lrow", "a People load row"], ["roadmap", "li[data-idea]", "a Roadmap idea", ideas], ["roadmap", ".dvcard", "a Roadmap deliverable", card], ["plan", "#t-decisions tbody tr", "a Decisions row", null, "decisions"], ["plan", ".cvcard", "a card on Cards", null, "cards"]]){
        await page.evaluate(([FIX, ws, dvs, tab, CARDS])=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const P = JSON.parse(FIX); if (dvs) P.deliverables = dvs;
          if (tab === "decisions") P.decisions = [{id:"dec-a", text:"Pick the search index", state:"open", owners:[]}, {id:"dec-b", text:"Who runs the pilot", state:"open", owners:[]}];
          S = normalize(P, false); file.handle = null; sel = null; if (tab === "cards"){ (0, eval)(CARDS); UI.cv = {}; UI.cardLayoutBy = {}; UI.cvStatusPick = {}; UI.cvHiddenOpen = false; cardsPlan(); }
          if (tab) UI.planTab = tab; goWs(ws); render(); document.activeElement && document.activeElement.blur(); }, [FIX, ws, dvs, tab, CARDS]);
        await page.waitForTimeout(250); await page.keyboard.press("j"); await page.waitForTimeout(150);
        const r = await page.evaluate(ringOf, rowSel), live = await page.evaluate(()=>document.querySelector("#navLive")?.textContent || "");
        ok(`R1 ${theme}: J on ${name} outlines the whole row, 2px, at 3:1 or better, with a tint`, !!r && r.style === "solid" && r.width >= 2 && r.contrast >= 3 && r.tint, JSON.stringify(r));
        ok(`R2 ${theme}: …and a screen reader hears where it is`, /^1 of \d+: \S/.test(live), live);
        ok(`R3 ${theme}: …and the outline never covers the row's text`, r && r.clear != null && r.clear >= 2, JSON.stringify(r && r.clear));
        if (ws === "people"){
          const span = await page.evaluate(()=>{ const a = document.activeElement, g = a && a.closest(".lgrid"), last = a && [...a.querySelectorAll(".c")].pop(); if (!g || !last) return null; const ar = a.getBoundingClientRect(), lr = last.getBoundingClientRect(); return {inside:lr.right <= ar.right + 1 && lr.left >= ar.left, wide:Math.round(ar.width / g.getBoundingClientRect().width * 100)}; });
          ok(`R4 ${theme}: the People load mark spans the person's whole row of weeks`, !!span && span.inside && span.wide >= 95, JSON.stringify(span));
          await page.keyboard.press("Enter"); await page.waitForTimeout(150);
          const opened = await page.evaluate(()=>({sel, ws:UI.ws, first:S.people.find(p=>p.id === sel?.id)?.id === document.querySelector(".lgrid > .lrow")?.dataset.pid}));
          ok(`R5 ${theme}: Enter on a person there opens their card and stays on Capacity`, opened.sel && opened.sel.type === "person" && opened.first && opened.ws === "people", JSON.stringify(opened));
        }
        if (dvs === ideas){
          const acts = await page.evaluate(()=>{ const li = document.activeElement?.closest("li[data-idea]"), x = li?.querySelector(".ideaacts"); if (!x) return null; const lr = li.getBoundingClientRect(), xr = x.getBoundingClientRect(), cs = getComputedStyle(li);
            const inner = lr.right + Math.min(0, parseFloat(cs.outlineOffset) || 0), last = Math.max(...[...li.querySelectorAll("button,a,select")].map(e=>e.getBoundingClientRect().right));
            const o = -Math.min(0, parseFloat(cs.outlineOffset) || 0), bs = [...li.querySelectorAll("button,a,select")].map(e=>e.getBoundingClientRect());
            return {inside:xr.right <= lr.right + 1 && xr.left >= lr.left && xr.top >= lr.top - 1 && xr.bottom <= lr.bottom + 1, clearRight:Math.round(inner - last), clearY:Math.round(Math.min(...bs.map(r=>Math.min(r.top - (lr.top + o), (lr.bottom - o) - r.bottom))))}; });
          ok(`R6 ${theme}: the idea's mark takes in its quarter buttons too, clear of them on the right, top and bottom`, !!acts && acts.inside && acts.clearRight >= 5 && acts.clearY >= 2, JSON.stringify(acts));
        }
      }
      // Long titles on Today end in an ellipsis, and the whole title is there on hover
      await page.evaluate(FIX=>{ const P = JSON.parse(FIX); S = normalize(P, false); const t = S.bars.flatMap(b=>b.tasks || [])[0]; if (t) t.title = "A very long task title that keeps going well past the width of its column on Today"; sel = null; goWs("today"); render(); }, FIX);
      await page.setViewportSize({width:1100, height:800}); await page.waitForTimeout(200);
      const clip = await page.evaluate(()=>{ const xs = [...document.querySelectorAll("#today li.trow .tname")].filter(x=>x.scrollWidth > x.clientWidth + 1); return {n:xs.length, all:xs.every(x=>{ const cs = getComputedStyle(x); return cs.textOverflow === "ellipsis" && cs.display !== "flex" && x.title === x.textContent; })}; });
      ok(`R7 ${theme}: a Today title too long for its column ends in an ellipsis and shows in full on hover`, clip.n > 0 && clip.all, JSON.stringify(clip));
      await page.setViewportSize({width:1400, height:800});
      // O on a selected initiative: its owner picker has the cursor, and the names it offers are on screen
      await page.setViewportSize({width:1300, height:760});
      await page.evaluate(FIX=>{ S = normalize(JSON.parse(FIX), false); goWs("timeline"); render(); select("bar", S.bars.find(b=>isLeafBar(b)).id); render(); document.activeElement && document.activeElement.blur(); }, FIX);
      await page.waitForTimeout(200); await page.keyboard.press("o"); await page.waitForTimeout(150); await page.keyboard.type("a"); await page.waitForTimeout(200);
      const pick = await page.evaluate(()=>{ const a = document.activeElement, l = document.querySelector("#f-owner-list"); if (!l || l.hidden) return {id:a && a.id, list:false}; const r = l.getBoundingClientRect(); return {id:a.id, list:true, bottom:Math.round(r.bottom), vh:innerHeight}; });
      ok(`R8 ${theme}: O puts the cursor in the owner picker, and the names it offers fit on screen`, pick.id === "f-owner" && pick.list && pick.bottom <= pick.vh, JSON.stringify(pick));
      await page.setViewportSize({width:1400, height:800});
      await page.close();
    }
    ok("no page errors", !errs.length, errs.slice(0, 2).join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
