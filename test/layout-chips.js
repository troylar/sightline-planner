// The Showing strip laid out in a real browser (jsdom has no layout): a chip shows its whole name when there's room,
// ends in an ellipsis when there isn't without the strip overflowing, reads at 4.5:1 or better, shows a focus ring from
// the keyboard, and taking a chip off moves keyboard focus to the next chip. Light and dark, two widths.
// run.sh runs it when Playwright is installed, and CI always does. By hand: node test/layout-chips.js. Playwright comes from
// node_modules, or from PLAYWRIGHT=/path/to/node_modules/playwright. The plan is fixtures/sample-plan.json; every name is invented.
const fs = require("fs"), path = require("path");
let pw; try { pw = require(process.env.PLAYWRIGHT || "playwright"); } catch(e){ console.log("FAIL  Playwright isn't installed. Run npm ci, then npx playwright install chromium (or set PLAYWRIGHT)."); console.log("\n0/1 passed"); process.exit(1); }
const HTML = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 120000).unref();

function setup(FIX){
  askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; goWs("timeline");
  UI.filter = normFilter({}); UI.zoom = "weeks"; UI.focus = null; render();
  const A = S.people.find(p=>p.name === "Avery").id; showOnly("bar", "m2"); showOnly("person", A); return A;
}
const chipAt = sel => { const c = document.querySelector(sel), n = c && c.querySelector(".sn");
  return c ? {clip:n.scrollWidth > n.clientWidth + 1, ell:getComputedStyle(n).textOverflow, title:c.title, text:n.textContent} : null; };
// Contrast of an element's text against what's behind it, compositing see-through fills over their parents.
function contrast(sel){
  const rgb = c => { const n = (c.match(/[\d.]+/g) || []).map(Number); return /^color\(srgb/.test(c) ? n.map((v, i)=>i < 3 ? v * 255 : v) : n; };
  const lum = ([r, g, b]) => [r, g, b].map(v=>{ v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i)=>a + v * [.2126, .7152, .0722][i], 0);
  const over = (top, el) => { const t = rgb(top); if (t.length < 4 || t[3] >= 1) return t.slice(0, 3); let p = el.parentElement, under = [255, 255, 255];
    while (p){ const c = rgb(getComputedStyle(p).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0)){ under = over(getComputedStyle(p).backgroundColor, p); break; } p = p.parentElement; }
    return t.slice(0, 3).map((v, i)=>v * t[3] + under[i] * (1 - t[3])); };
  return [...document.querySelectorAll(sel)].map(e=>{ const box = e.closest(".showchip") || e, bg = over(getComputedStyle(box).backgroundColor, box), fg = rgb(getComputedStyle(e).color).slice(0, 3);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y)=>y - x); return Math.round((a + .05) / (b + .05) * 10) / 10; });
}
(async()=>{
  const b = await pw.chromium.launch();
  try {
    const errs = [];
    for (const [w, theme] of [[1500, "light"], [1500, "dark"], [900, "light"]]){
      const page = await b.newPage({viewport:{width:w, height:900}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.evaluate(t=>localStorage.setItem("timeline-planner-theme", t), theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      const A = await page.evaluate(setup, FIX); await page.waitForTimeout(150);
      const tag = `${w}px ${theme}`, c = await page.evaluate(chipAt, '#showStrip [data-show="bar:m2"]');
      if (w >= 1500) ok(`L1 ${tag}: with room on the row, a chip shows its whole name`, c && !c.clip && c.title.endsWith(c.text), JSON.stringify(c));
      ok(`L2 ${tag}: a chip says what its click does, with the full name`, c && /^Stop showing only /.test(c.title) && c.ell === "ellipsis", JSON.stringify(c));
      const cr = await page.evaluate(contrast, "#showStrip .showchip .sn, #showStrip .showchip .sk, #showStrip .slabel");
      ok(`L3 ${tag}: the strip's text reads at 4.5:1 or better`, cr.length >= 5 && cr.every(x=>x >= 4.5), JSON.stringify(cr));
      await page.evaluate(()=>{ S.bars.find(x=>x.id === "m2").label = "A very long initiative name ".repeat(12).trim(); render(); }); await page.waitForTimeout(100);
      const c2 = await page.evaluate(chipAt, '#showStrip [data-show="bar:m2"]'), row = await page.evaluate(()=>{ const s = document.querySelector("#showStrip"); return {sw:s.scrollWidth, cw:s.clientWidth, pw:document.documentElement.scrollWidth, vw:innerWidth}; });
      ok(`L4 ${tag}: a name too long for the row is cut with an ellipsis, and nothing overflows`, c2 && c2.clip && row.sw <= row.cw + 1 && row.pw <= row.vw, JSON.stringify([c2 && c2.clip, row]));
      // From the keyboard: a focus ring on the chip, and taking it off moves focus to the next chip
      await page.focus('#showStrip [data-show="bar:m2"]'); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
      const ring = await page.evaluate(()=>{ const a = document.activeElement, s = getComputedStyle(a); return {on:a.matches('[data-show="bar:m2"]'), ring:s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2}; });
      ok(`L5 ${tag}: a chip reached from the keyboard shows a focus ring`, ring.on && ring.ring, JSON.stringify(ring));
      await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const after = await page.evaluate(()=>({show:[...document.querySelectorAll("#showStrip .showchip")].map(c=>c.dataset.show), focus:document.activeElement && document.activeElement.dataset.show}));
      ok(`L6 ${tag}: Enter on a chip takes it off, and focus goes to the next chip`, after.show.join() === "person:" + A && after.focus === "person:" + A, JSON.stringify(after));
      // In Present (where Filters is hidden), taking the last chip off leaves keyboard focus on something you can see
      await page.evaluate(()=>{ present = true; document.body.classList.add("present"); render(); }); await page.waitForTimeout(150);
      await page.focus("#showStrip .showchip"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
      const pf = await page.evaluate(()=>{ const a = document.activeElement; return {tag:a && a.tagName, id:a && a.id, seen:!!(a && a !== document.body && a.getClientRects().length)}; });
      ok(`L7 ${tag}: in Present, taking the last chip off leaves focus on a control you can see`, pf.seen, JSON.stringify(pf));
      await page.evaluate(()=>{ present = false; document.body.classList.remove("present"); render(); }); await page.waitForTimeout(100);
      if (w === 1500){ await page.evaluate(()=>{ S.bars.find(x=>x.id === "m2").label = "Search relevance"; showOnly("bar", "m2"); }); await page.waitForTimeout(150);
        await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `chips-${theme}.png`), clip:{x:0, y:0, width:w, height:420}}); }
      // Two chips whose work is out of the dates on screen: the strip says where it is, and Go to it gets there without a new zoom
      const gap = () => page.evaluate(()=>{ const g = document.querySelector("#showGap"), v = visibleDays(), F = fitSpan();
        return {shown:!!g && !g.hidden && g.getClientRects().length > 0, text:g ? g.textContent : "", go:!!document.querySelector("#showGapGo"), all:!!document.querySelector("#showGapAll"),
          inView:!!v && (F.spans || []).some(([x, y])=>x <= v[1] && y >= v[0]), zoom:UI.zoom, zoomN:UI.zoomN, filter:[...UI.filter.bars, ...UI.filter.people].join()}; });
      for (const z of ["days", "weeks"]){
        await page.evaluate(([A, z])=>{ UI.filter = normFilter({}); showOnly("bar", "m2"); showOnly("person", A); if (z === "weeks"){ UI.zoomN = 1; UI.zoomSp = null; } setZoom(z); }, [A, z]); await page.waitForTimeout(150);
        await page.evaluate(()=>{ const sc = $("#gscroll"); sc.scrollLeft = sc.scrollWidth; }); await page.waitForTimeout(200);
        const g0 = await gap();
        ok(`L8 ${tag} ${z}: with nothing for the chips on screen, the strip says when their work is and offers Go to it`, g0.shown && !g0.inView && /^Nothing for these chips in the dates on screen\. Their work is .+\./.test(g0.text) && g0.go, JSON.stringify(g0));
        if (w === 1500 && z === "days") await page.evaluate(()=>document.activeElement && document.activeElement.blur()), await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `chips-gap-${theme}.png`), clip:{x:0, y:0, width:w, height:560}});
        await page.evaluate(()=>document.querySelector("#showGapGo")?.click()); await page.waitForTimeout(250);
        const g1 = await gap();
        ok(`L9 ${tag} ${z}: Go to it brings the work on screen, in the same zoom, and the note goes away`, g1.inView && !g1.shown && g1.zoom === z && g1.zoomN === g0.zoomN && g1.filter === g0.filter, JSON.stringify([g0, g1]));
        if (w === 1500 && z === "days"){ await page.evaluate(()=>document.activeElement && document.activeElement.blur()); await page.waitForTimeout(50);
          await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `chips-go-${theme}.png`), clip:{x:0, y:0, width:w, height:560}}); }
      }
      // Chips that match nothing at all say so and offer Show all work
      const none = await page.evaluate(()=>{ UI.zoomN = 0; const idle = S.people.find(p=>{ UI.filter = normFilter({bars:["m2"], people:[p.id]}); fitMemo = null; return !!fitSpan().none; }); UI.filter = normFilter({}); fitMemo = null; render();
        if (!idle) return null; showOnly("bar", "m2"); showOnly("person", idle.id); return idle.name; }); await page.waitForTimeout(200);
      const g2 = await gap();
      ok(`L10 ${tag}: chips that match nothing say so and offer Show all work`, !!none && g2.shown && g2.text.startsWith(`${none} has no work on "`) && g2.all && !g2.go, JSON.stringify([none, g2]));
      await page.evaluate(()=>document.querySelector("#showGapAll")?.click()); await page.waitForTimeout(150);
      ok(`L11 ${tag}: Show all work there clears the chips, and the note is gone`, await page.evaluate(()=>!document.querySelector("#showStrip") && !fActive()), "");
      await page.close();
    }
    ok("no page errors", !errs.length, errs.slice(0, 2).join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
