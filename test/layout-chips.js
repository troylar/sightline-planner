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
      // An initiative with tasks: with a person chip too, Days draws only that person's tasks, and the note's dates are theirs
      const T = await page.evaluate(A=>{ const B = S.people.find(p=>p.name === "Blake").id, b = S.bars.find(x=>x.id === "m2"), st = nearWeekday(wkDay(b.start));
        b.tasks = [{id:"fa", label:"Avery builds the adapter", start:dayToIso(st), days:4, owners:[A], status:"inprogress"}, {id:"fb", label:"Blake tests it", start:dayToIso(st + 7), days:5, owners:[B], status:"notstarted"}];
        UI.filter = normFilter({}); UI.zoomN = 0; render(); showOnly("bar", "m2"); showOnly("person", A); setZoom("days");
        const sp = taskSpan(taskById("fa").t, HS()); return {s:sp.s, e:sp.e, want:`Their work is ${sp.s === sp.e ? fmtDay(sp.s) : fmtDay(sp.s) + " – " + fmtDay(sp.e)}.`}; }, A); await page.waitForTimeout(150);
      await page.evaluate(()=>{ const sc = $("#gscroll"); sc.scrollLeft = sc.scrollWidth; }); await page.waitForTimeout(200);
      const n3 = await gap();
      ok(`L12 ${tag}: with an initiative and a person, the note gives that person's task dates, not the initiative's`, n3.shown && n3.text.includes(T.want), JSON.stringify([T.want, n3.text]));
      await page.evaluate(()=>document.querySelector("#showGapGo")?.click()); await page.waitForTimeout(250);
      const drawn = () => page.evaluate(()=>{ const sc = $("#gscroll").getBoundingClientRect(), seen = k => { const el = document.querySelector(`#gantt [data-key="task:${k}"]`); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > sc.left && r.left < sc.right; };
        return {fa:seen("fa"), fb:!!document.querySelector('#gantt [data-key="task:fb"]')}; });
      const d1 = await drawn();
      ok(`L13 ${tag}: after Go to it, Days shows the person's task on screen and not a teammate's`, d1.fa && !d1.fb, JSON.stringify(d1));
      if (w === 1500){ await page.evaluate(()=>document.activeElement && document.activeElement.blur()); await page.waitForTimeout(50);
        await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `chips-tasks-${theme}.png`), clip:{x:0, y:0, width:w, height:600}}); }
      await page.evaluate(A=>showOff("person", A), A); await page.waitForTimeout(150);
      const d2 = await page.evaluate(()=>({fa:!!document.querySelector('#gantt [data-key="task:fa"]'), fb:!!document.querySelector('#gantt [data-key="task:fb"]')}));
      ok(`L14 ${tag}: the initiative chip alone draws all its tasks`, d2.fa && d2.fb, JSON.stringify(d2));
      // Highlight in the List: a dimmed row is still readable, 3:1 or better for every cell's text against the page.
      await page.evaluate(()=>{ UI.filter = normFilter({}); showLinked("bar", "c3"); setLinkMode("highlight"); UI.ws = "list"; sel = null; render(); }); await page.waitForTimeout(200);
      const dimC = await page.evaluate(()=>{ const P = c => (c.match(/[\d.]+/g) || []).map(Number);
        const lum = c => c.map(v=>{ v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i)=>a + v * [.2126, .7152, .0722][i], 0);
        const bgOf = el => { for (let e = el; e; e = e.parentElement){ const c = P(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > .9) return c.slice(0, 3); } return [255, 255, 255]; };
        const out = []; document.querySelectorAll("#listTable tr.link-dim").forEach(tr=>{ const op = Number(getComputedStyle(tr).opacity);
          tr.querySelectorAll("td").forEach(td=>{ if (!td.textContent.trim()) return; const t = td.querySelector("a,button,span") || td, f = P(getComputedStyle(t).color), bg = bgOf(td), fa = (f.length > 3 ? f[3] : 1) * op;
            const fg = f.slice(0, 3).map((v, i)=>bg[i] + (v - bg[i]) * fa), [a, b] = [lum(fg), lum(bg)].sort((x, y)=>y - x); out.push((a + .05) / (b + .05)); }); });
        return {n:out.length, min:Math.round(Math.min(...out) * 100) / 100}; });
      ok(`L15 ${tag}: highlighted, the List's dimmed rows still read at 3:1 or better`, dimC.n > 10 && dimC.min >= 3, JSON.stringify(dimC));
      // Leads here only, from a milestone's runway: the chip, Highlight instead and the direction toggle keep the strip one line.
      await page.evaluate(()=>{ UI.filter = normFilter({}); S.milestones.find(m=>m.id === "ms8").after = ["c4"]; UI.ws = "list"; render(); select("ms", "ms8"); render(); document.querySelector("#f-mrwshow").click(); }); await page.waitForTimeout(250);
      const lh = await page.evaluate(()=>{ const rows = () => { const r = e => e.getBoundingClientRect(), tops = [...document.querySelectorAll("#showStrip button")].filter(e=>e.getClientRects().length).map(e=>Math.round(r(e).top)).sort((x, y)=>x - y);
          return tops.filter((t, i)=>!i || t - tops[i - 1] > 12).length; };
        const out = {ws:UI.ws, dir:UI.filter.linkDir, toggle:!!document.querySelector("#showStrip #linkDir"), rows:rows(), over:document.documentElement.scrollWidth > innerWidth + 1};
        setLinkDir("both"); out.bothRows = rows(); setLinkDir("up"); return out; });
      ok(`L15b ${tag}: Leads here only from a milestone's card: the Timeline, one way, and the chip row stays one line either way`, lh.ws === "timeline" && lh.dir === "up" && lh.toggle && lh.rows === 1 && lh.bothRows === 1 && !lh.over, JSON.stringify(lh));
      if (w === 1500){ await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `leads-here-${theme}.png`), clip:{x:0, y:0, width:w, height:700}});
        await page.evaluate(()=>{ UI.filter = normFilter({}); render(); select("ms", "ms8"); render(); document.querySelector("#f-mrunway")?.scrollIntoView({block:"center"}); }); await page.waitForTimeout(200);
        const box = await page.evaluate(()=>{ const r = document.querySelector("#f-mrunway").getBoundingClientRect(); return {x:Math.max(0, r.x - 12), y:Math.max(0, r.y - 12), width:r.width + 24, height:r.height + 24}; });
        await page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `leads-here-card-${theme}.png`), clip:box}); }
      await page.close();
    }
    // The Time button: open at 1400 the toolbar is no taller than with every control always out (1.165.0's one row), and
    // the status text keeps its row, whole. Closed, it's one row too.
    for (const theme of ["light", "dark"]){
      const page = await b.newPage({viewport:{width:1400, height:800}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.evaluate(t=>{ localStorage.clear(); localStorage.setItem("timeline-planner-theme", t); }, theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      await page.evaluate(FIX=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); loadExternal(FIX, "sample"); }, FIX); await page.waitForTimeout(200); await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      const bar = () => page.evaluate(()=>{ const w = document.querySelector("#wsbar"), sl = document.querySelector("#scopeLine"), wr = document.querySelector("#wsright"), r = x => x.getBoundingClientRect();
        const tops = [...wr.querySelectorAll("button,select")].filter(e=>e.getClientRects().length).map(e=>r(e).top).sort((a, z)=>a - z);
        const rows = tops.filter((t, i)=>!i || t - tops[i - 1] > 12).length;   // a group's padding nudges its buttons a few pixels: same row
        return {h:Math.round(r(w).height), rows, sameRow:Math.abs(r(sl).top + r(sl).height / 2 - (r(wr).top + r(wr).height / 2)) < 12,
          whole:[sl, ...sl.querySelectorAll("*")].every(x=>x.scrollWidth <= x.clientWidth + 1), titled:!!sl.textContent && sl.title === sl.textContent}; });
      const shut = await bar(); await page.click("#timeSummary"); await page.waitForTimeout(150); const open = await bar();
      ok(`L16 1400px ${theme}: closed, the toolbar is one row`, shut.rows === 1 && shut.h <= 44, JSON.stringify(shut));
      ok(`L17 1400px ${theme}: open, the time controls fit the same one row, no taller than before`, open.rows === 1 && open.h <= 44 && open.h <= shut.h, JSON.stringify(open));
      ok(`L18 1400px ${theme}: open, the status text keeps its row and isn't cut`, open.sameRow && open.whole, JSON.stringify(open));
      ok(`L18b 1400px ${theme}: the status text's full words are in its tooltip, so a wider font that cuts it never hides them`, shut.titled && open.titled, JSON.stringify([shut.titled, open.titled]));
      await page.focus("#timeSummary"); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      const ring = await page.evaluate(()=>{ const a = document.activeElement, s = getComputedStyle(a); return {on:a.id === "timeSummary", ring:s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2}; });
      ok(`L19 1400px ${theme}: the Time button shows a focus ring`, ring.on && ring.ring, JSON.stringify(ring));
      await page.close();
    }
    // What the Timeline leaves out, three reasons (the Added by filter hides one milestone, so the chart still has work on it): closed it's one short line and the chart starts higher than open; at
    // 900 nothing runs off the side and Details shows a focus ring. The late warning stays in view throughout.
    for (const [w, theme] of [[1400, "light"], [1400, "dark"], [900, "light"], [900, "dark"]]){
      const page = await b.newPage({viewport:{width:w, height:800}}); page.on("pageerror", e=>errs.push(String(e)));
      await page.goto("file://" + HTML); await page.evaluate(t=>{ localStorage.clear(); localStorage.setItem("timeline-planner-theme", t); }, theme); await page.goto("file://" + HTML); await page.waitForTimeout(300);
      await page.evaluate(FIX=>{ askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); loadExternal(FIX, "sample"); }, FIX); await page.waitForTimeout(200); await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      await page.evaluate(()=>{ setHiddenKinds(["gate"]); S.bars.find(x=>x.id === "c6").parked = true; S.milestones[0].added = {by:S.people[0].id, at:"2026-10-01T00:00:00Z"}; UI.filter.authors = ["unknown"]; render(); }); await page.waitForTimeout(200);
      const strip = () => page.evaluate(()=>{ const s = document.querySelector("#hiddenStrip"), g = document.querySelector("#gscroll"), late = [...document.querySelectorAll("#banners *")].find(e=>/\d+ late/.test(e.textContent));
        return {h:Math.round(s.getBoundingClientRect().height), chart:Math.round(g.getBoundingClientRect().top), over:document.scrollingElement.scrollWidth - innerWidth, late:!!late && late.getClientRects().length > 0}; });
      const shot = n => page.screenshot({path:path.join(process.env.SHOTS || require("os").tmpdir(), `hidden-${w}-${theme}-${n}.png`)});
      const shut = await strip(); await page.evaluate(()=>document.activeElement && document.activeElement.blur()); await shot("closed");
      if (w === 1400){
        await page.click("#hsMore"); await page.waitForTimeout(150); const open = await strip(); await page.evaluate(()=>document.activeElement && document.activeElement.blur()); await shot("open");
        ok(`L20 ${w}px ${theme}: closed, what's hidden is one short line`, shut.h <= 32, JSON.stringify(shut));
        ok(`L21 ${w}px ${theme}: closed, the chart starts higher than with Details open`, shut.chart < open.chart, JSON.stringify([shut.chart, open.chart]));
        await page.click("#hsMore"); await page.waitForTimeout(100);
      } else {
        await page.focus("#hsMore"); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
        const ring = await page.evaluate(()=>{ const a = document.activeElement, s = getComputedStyle(a); return {on:a.id === "hsMore", ring:s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2}; });
        ok(`L22 ${w}px ${theme}: nothing runs off the side, and Details shows a focus ring`, shut.over <= 0 && ring.on && ring.ring, JSON.stringify({...shut, ...ring}));
      }
      ok(`L23 ${w}px ${theme}: the late warning stays in view`, shut.late, "");
      await page.close();
    }
    ok("no page errors", !errs.length, errs.slice(0, 2).join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 300)); }
  await b.close();
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
