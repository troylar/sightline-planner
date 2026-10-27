// Day view task names never run off the right edge. A name too long for its bar sits to its right; when that would pass
// the edge it sits to the left of the bar instead, and when neither side has room it is cut short with "…" (the full
// name on hover). The space a name claims includes its " · late" / " · guess" tails. Sample plan, focused initiative.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s), $$ = s => [...w.document.querySelectorAll(s)];
  const lab = id => $$(`.tlabel[data-sel="task:${id}"]`)[0];
  const pct = (v, m) => { const r = new RegExp((m ? m + "\\(" : "^") + "([\\d.]+)%"); const x = r.exec(v || ""); return x ? +x[1] : null; };
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();`);
    const bid = ev("S.bars.find(b=>!b.parked && barEndDay(b) - wkDay(b.start) >= 9).id");
    ev(`setZoom("days", ${JSON.stringify(bid)}); render()`); await wait(20);
    // Three one-day tasks with long names: at the start, at the very end, and one too long to fit anywhere.
    ev(`(()=>{ const b = barById(${JSON.stringify(bid)}), s = wkDay(b.start), e = barEndDay(b);
      const iso = d => dayToIso(d); commit(()=>{ const bb = barById(b.id);
        bb.tasks.push({id:"lbl-first", label:"Kickoff with a fairly long name for a one day task", start:iso(s), days:1, owners:[], status:"notstarted"});
        bb.tasks.push({id:"lbl-last", label:"Final review with a fairly long name for a one day task", start:iso(e), days:1, owners:[], status:"notstarted", rough:true});
        bb.tasks.push({id:"lbl-huge", label:"x".repeat(400), start:iso(s + Math.floor((e - s) / 2)), days:1, owners:[], status:"notstarted"}); }); })()`);
    ev(`setZoom("days", ${JSON.stringify(bid)}); render()`); await wait(20);
    // Slide the last task to the last day the view shows.
    for (let k = 1; k < 40; k++){ const el = $$('.tbar[data-sel="task:lbl-last"]')[0]; if (!el || pct(el.style.left, "calc") + pct(el.style.width, "calc") >= 99.9) break;
      ev(`commit(()=>{ const t = barById(${JSON.stringify(bid)}).tasks.find(t=>t.id === "lbl-last"); t.start = dayToIso(isoToDay(t.start) + 1); }); setZoom("days", ${JSON.stringify(bid)}); render()`); }
    const f = lab("lbl-first"), l = lab("lbl-last"), g = lab("lbl-huge");
    ok("L0 the setup: each long name is drawn beside its bar", !!f && !!l && !!g, [!!f, !!l, !!g].join());
    ok("L1 a name with room on the right sits to the right of its bar", !!f && pct(f.style.left, "calc") != null && !f.style.right, f && f.getAttribute("style"));
    ok("L2 at the right edge the name moves to the left of its bar, right-aligned", !!l && pct(l.style.right, "calc") != null && !l.style.left && l.style.textAlign === "right", l && l.getAttribute("style"));
    ok("L3 a name too long for either side is cut to the space left, and shows in full on hover", !!g && /calc/.test(g.style.maxWidth) && g.title === "x".repeat(400), g && g.getAttribute("style"));
    ok("L4 no name starts past the right edge or claims room beyond it", $$(".tlabel").every(x=>{ const a = pct(x.style.left, "calc"), m = pct(x.style.maxWidth, "calc"); return a == null || (a < 100 && (m == null || a + m <= 100.01)); }));
    // A milestone near the right edge: its name is cut short at the edge and shows in full on hover.
    ev(`(()=>{ const b = barById(${JSON.stringify(bid)}); commit(()=>{ S.milestones.push({id:"ms-edge", lane:b.lane, what:"Production ready with every integration partner signed off and announced", at:null, status:"planned"}); }); })()`);
    const lastDay = ev(`taskSpan(barById(${JSON.stringify(bid)}).tasks.find(t=>t.id === "lbl-last"), HS()).e`);
    ev(`(()=>{ const m = S.milestones.find(x=>x.id === "ms-edge"); m.at = dayToAt(${lastDay}); setZoom("days", ${JSON.stringify(bid)}); render(); })()`); await wait(20);
    const mf = $$('.flag[data-sel="ms:ms-edge"]')[0];
    ok("L5 a milestone name that would pass the right edge is cut short there, in full on hover", !!mf && mf.classList.contains("clip") && /calc/.test(mf.style.maxWidth) && /Production ready with every integration partner/.test(mf.title || ""), mf ? mf.getAttribute("style") + " / " + mf.className : "no flag");
    ok("E1 no page errors", !JSON.parse(ev("JSON.stringify(errs)")).length, ev("errs.join('; ')"));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
