// Leads here only: the linked lens in one direction, so a milestone's runway (or an initiative's prerequisites) is what's
// on the Timeline and nothing that waits on it. From the runway on a milestone's card (Show on the Timeline), the >
// key, or the toggle beside Highlight instead. A viewer's choice: Back undoes it, it's never in a saved view, and the
// plan doesn't change. The sample plan's chains (m1 -> m2 -> m3, c1 -> c3 -> c4 <- m3, c4 -> c5 -> c6, and the
// sideways c2 and m4); every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null;
       S.milestones.find(m=>m.id === "ms8").after = ["c4"]; UI.filter = normFilter({}); UI.ws = "list"; UI.rows = "lanes"; UI.zoom = "weeks"; render();
       window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();`); await wait(20);
    const key = async (k, o = {}) => { (o.on || d.body).dispatchEvent(new w.KeyboardEvent("keydown", {key:k, code:o.code || "", shiftKey:!!o.shift, bubbles:true, cancelable:true})); await wait(10); };
    const gt = o => key(">", {code:"Period", shift:true, ...o});
    const status = () => d.querySelector("#status").textContent, vis = () => J("VIS()"), dir = () => X("UI.filter.linkDir");
    const RUN = ["c1","c3","c4","m1","m2","m3"], plan0 = X("JSON.stringify(planOfRecord(S))");

    X(`select("ms", "ms8")`); await wait(10);
    const btn = d.querySelector("#f-mrunway #f-mrwshow");
    ok("H1 a milestone's runway on its card offers Show on the Timeline", !!btn && btn.textContent === "Show on the Timeline", btn && btn.textContent);
    btn && btn.click(); await wait(30);
    ok("H2 it opens the Timeline with only the milestone and the work that leads to it: exactly the runway, nothing that waits on it or is sideways (c5, c6, c2, m4)",
      X("UI.ws") === "timeline" && vis().join() === RUN.join() && JSON.stringify(J("UI.filter.linked")) === JSON.stringify([{t:"ms", id:"ms8"}]), X("UI.ws") + " " + vis().join());
    const rows = J(`runwayOf(S.milestones.find(m=>m.id === "ms8")).rows.filter(r=>r.t === "bar").map(r=>r.id).sort()`);
    ok("H3 …the same items the card lists", Array.isArray(rows) && rows.join() === vis().join(), String(rows));
    const chip = d.querySelector('#showStrip [data-show="linked:ms:ms8"]'), tg = d.querySelector("#showStrip #linkDir");
    ok("H4 the chip says Leading to, and the toggle beside Highlight instead is pressed", !!chip && /^Leading to/.test(chip.textContent) && !!tg && tg.getAttribute("aria-pressed") === "true" && !!d.querySelector("#showStrip #linkMode"), (chip && chip.textContent) + " | " + (tg && tg.textContent));
    const said = Number((status().match(/what leads to .*: (\d+) items?\./) || [])[1]);
    const drawn = [...new Set([...d.querySelectorAll("#gantt [data-sel]")].map(e=>e.dataset.sel))].filter(k=>/^(bar|task|ms|gate):/.test(k) && k !== "ms:ms8");
    ok("H5 the status line says what leads to it, and its count is what's drawn in the chart", said > 0 && said === drawn.length, `said ${said}, drawn ${drawn.length}: ${status()}`);
    ok("H6 the plan doesn't change", X("JSON.stringify(planOfRecord(S))") === plan0);

    X(`linkedOff(); sel = null; render(); select("bar", "c4"); render();`); await wait(20);
    ok("H7 taking the last chip off goes back to both ways", dir() === "both" && !J("UI.filter.linked").length, dir());
    await gt();
    ok("H8 with an initiative selected, > shows only what it waits for, all the way back (no c5, c6)", dir() === "up" && vis().join() === RUN.join() && /^Showing what leads to .*: \d+ items?\./.test(status()), vis().join() + " | " + status());
    await gt();
    ok("H9 > again shows both ways: what waits for it comes back", dir() === "both" && ["c5","c6"].every(x=>vis().includes(x)) && /linked to it/.test(status()), vis().join());
    w.history.back(); await wait(80);
    ok("H10 Back goes back to Leads here only", dir() === "up" && vis().join() === RUN.join(), dir() + " " + vis().join());
    d.querySelector("#showStrip #linkDir")?.click(); await wait(20);
    ok("H11 the toggle switches it too, and says what it does next", dir() === "both" && d.querySelector("#showStrip #linkDir")?.textContent === "Leads here only" && d.querySelector("#showStrip #linkDir")?.getAttribute("aria-pressed") === "false", d.querySelector("#showStrip #linkDir")?.textContent);
    X(`setLinkDir("up"); select("bar", "c2"); render();`); await wait(10);
    await key("C", {code:"KeyC", shift:true});
    const v2 = vis();
    ok("H12 with two picks it shows what leads to both, in one direction", J("UI.filter.linked").length === 2 && dir() === "up" && v2.includes("c2") && v2.includes("c1") && !v2.includes("c5") && !v2.includes("c6"), v2.join());
    ok("H13 …and the status line names how many picks", /^Showing what leads to 2 picked items: \d+ items?\./.test(status()), status());
    const inp = d.body.appendChild(d.createElement("input")); inp.focus(); await gt({on:inp});
    ok("H14 > does nothing while typing", dir() === "up", dir()); inp.remove();
    X(`openFind(); renderFind("both ways");`); await wait(10);
    ok("H15 Find offers the other direction", [...d.querySelectorAll("#findList .fhit.fcmd .ft")].some(x=>x.textContent === "Show linked work both ways again"));
    X(`closeFind(); document.activeElement?.blur?.()`);
    ok("H16 a saved view never keeps the direction", X(`normViewDef({filter:{...UI.filter}}).filter.linkDir`) === "both" && X(`normFilter({linkDir:"sideways"}).linkDir`) === "both");
    X(`linkedOff(); sel = null; render();`); await wait(10); await gt();
    ok("H17 with nothing selected, > says to select something and changes nothing", /Select an item to see what leads to it/.test(status()) && !J("UI.filter.linked").length, status());
    X(`showLinked("bar", "c3"); setLinkMode("highlight"); select("ms", "ms8"); render();`); await wait(30);
    d.querySelector("#f-mrwshow")?.click(); await wait(30);
    ok("H20 while highlighting, Show on the Timeline hides what doesn't lead there", X("UI.filter.linkMode") === "only" && dir() === "up" && vis().join() === RUN.join(), X("UI.filter.linkMode") + " " + vis().join());
    X(`linkedOff(); sel = null; UI.ws = "list"; render(); select("bar", "c4"); render();`); await wait(30);
    const ws0 = X("UI.ws"), len0 = w.history.length; await gt(); await wait(20);
    ok("H21 from the List, > opens the Timeline with what leads to the selection, in one step", ws0 === "list" && X("UI.ws") === "timeline" && dir() === "up" && w.history.length === len0 + 1, `${ws0} ${X("UI.ws")} ${len0} -> ${w.history.length}`);
    w.history.back(); await wait(80);
    ok("H22 …so Back goes straight to the List, with nothing picked", X("UI.ws") === "list" && !J("UI.filter.linked").length && dir() === "both", X("UI.ws") + " " + dir());
    X(`linkedOff(); sel = null; render();`);
    X(`S.milestones.find(m=>m.id === "ms9").dep = ""; select("ms", "ms9"); render();`); await wait(10);
    ok("H18 a milestone nothing leads to has no Show on the Timeline", !!d.querySelector("#f-mrunway") && !d.querySelector("#f-mrwshow"));
    ok("H19 the plan still hasn't changed (beyond the note cleared for H18)", X(`JSON.stringify(planOfRecord(S)).length`) <= plan0.length);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
