// Sideways linked work: with Work that waits for the same things (in the Linked work menu), Show linked work also shows what waits for the same things as the
// picks (directly), and what's in it, but nothing beyond that. Only both ways: Leads here only ignores it. A viewer's
// choice: Back undoes it, it's never in a saved view, and the plan doesn't change. The sample plan's chains
// (c1 -> c2 and c3, c3 -> c4 and u4 -> u5, m3 -> c4 and m4 -> m5, c4 -> c5 -> c6); every name is invented.
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
       S.bars.find(b=>b.id === "u4").tasks = [{id:"tu4a", title:"Sizing notes", start:S.bars.find(b=>b.id === "u4").start, weeks:1}];
       S.bars.find(b=>b.id === "c4").tasks = [{id:"tc4a", title:"Tool list", start:S.bars.find(b=>b.id === "c4").start, weeks:1}];
       S = normalize(S, false); UI.filter = normFilter({}); UI.ws = "timeline"; UI.rows = "lanes"; UI.zoom = "weeks"; render();
       window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();
       window.LI = (t, id, dir, side) => { const o = linkedItems([{t, id}], S, dir, side); return {bars:[...o.bars].sort(), tasks:[...o.tasks].sort(), ms:[...o.ms].sort(), side:[...o.side].sort()}; };`); await wait(20);
    const status = () => d.querySelector("#status").textContent, vis = () => J("VIS()"), plan0 = X("JSON.stringify(planOfRecord(S))");
    const BOTH4 = ["c1","c3","c4","c5","c6","m1","m2","m3"];

    ok("S1 sideways is off unless asked for, and a saved view never keeps it", X("normFilter({}).linkSide") === false && X("normFilter({linkSide:'yes'}).linkSide") === false && X("normFilter({linkSide:true}).linkSide") === true
      && X("normViewDef({filter:{linkSide:true, linked:[{t:'bar', id:'c4'}]}}).filter.linkSide") === false);
    const a = J(`LI("bar", "c4", "both", false)`), b = J(`LI("bar", "c4", "both", true)`);
    ok("S2 without it, c4's linked work is what it waits for and what waits for it", a.bars.join() === BOTH4.join() && !a.side.length, a.bars.join());
    ok("S3 with it, c4 also gets u4 (waits for c3, as c4 does) with its task, and m4 (waits for m3), and nothing that only waits on those (u5, m5) or shares a deeper prerequisite (c2)",
      b.bars.join() === [...BOTH4, "m4", "u4"].sort().join() && b.side.join() === "bar:m4,bar:u4,task:tu4a" && b.tasks.includes("tu4a") && !b.bars.includes("u5") && !b.bars.includes("m5") && !b.bars.includes("c2"), JSON.stringify(b));
    const c = J(`LI("bar", "c3", "both", true)`);
    ok("S4 c3 gets c2, the other initiative that waits for c1", c.side.join() === "bar:c2" && c.bars.includes("c2"), JSON.stringify(c));
    const t = J(`LI("task", "tc4a", "both", true)`);
    ok("S5 a task's pick shares what its initiative waits for: tc4a gets u4 and m4 too", t.side.includes("bar:u4") && t.side.includes("bar:m4"), JSON.stringify(t.side));
    const u = J(`LI("bar", "c4", "up", true)`);
    ok("S6 one way (Leads here only), it adds nothing", !u.side.length && !u.bars.includes("u4") && !u.bars.includes("m4"), JSON.stringify(u));

    X(`showLinked("bar", "c4"); render();`); await wait(20);
    const tg = () => d.querySelector("#showStrip #linkScope"), side = () => { tg().click(); const x = d.querySelector("#linkMenu:not([hidden]) #lmSide"); return x; };
    let it = side();
    ok("S7 the Linked work menu beside the chips has Work that waits for the same things, unchecked, and only c4's linked work is shown", !!it && /Work that waits for the same things/.test(it.textContent) && it.getAttribute("role") === "menuitemcheckbox" && it.getAttribute("aria-checked") === "false" && vis().join() === BOTH4.join(), (it && it.textContent) + " " + vis().join());
    it.click(); await wait(30);
    it = side();
    ok("S8 choosing it shows u4 and m4 too, and it's checked when the menu opens again", X("UI.filter.linkSide") === true && vis().join() === [...BOTH4, "m4", "u4"].sort().join() && !!it && it.getAttribute("aria-checked") === "true", vis().join());
    X(`closeLinkMenu()`);
    const n = Number((status().match(/linked to it, plus (\d+) that share a prerequisite/) || [])[1]);
    const linkedDrawn = Number((status().match(/and the (\d+) items? linked to it/) || [])[1]);
    // A task counts with its initiative's row (tc4a in c4, tu4a in u4), as the List shows it.
    const drawn = [...new Set([...d.querySelectorAll("#gantt [data-sel]")].map(e=>e.dataset.sel))].filter(k=>/^bar:/.test(k) && k !== "bar:c4");
    ok("S9 the status line counts what shares a prerequisite on its own (u4, its task and m4), apart from the 8 linked to c4 (7 initiatives and c4's task)", n === 3 && linkedDrawn === 8 && drawn.length === 9, `${n} + ${linkedDrawn}, ${drawn.length} rows drawn: ${status()}`);
    w.history.back(); await wait(80);
    ok("S10 Back turns it off again", X("UI.filter.linkSide") === false && vis().join() === BOTH4.join(), vis().join());
    w.history.forward(); await wait(80);
    X(`setLinkDir("up"); render();`); await wait(20);
    it = side();
    ok("S11 Leads here only shows only what leads to c4, and the menu shows the sideways choice unchecked there", !vis().includes("u4") && !vis().includes("m4") && !!it && it.getAttribute("aria-checked") === "false", vis().join());
    X(`closeLinkMenu()`);
    X(`setLinkDir("both"); render();`); await wait(20);
    ok("S12 Both ways again brings it back as it was", X("UI.filter.linkSide") === true && vis().includes("u4"));
    X(`setLinkDir("up"); render();`); await wait(20); it = side(); it.click(); await wait(30);
    ok("S12b from Leads here only, choosing it switches to both ways with it on, in one step", X("UI.filter.linkDir") === "both" && X("UI.filter.linkSide") === true && vis().includes("u4"));
    w.history.back(); await wait(80);
    ok("S12c …so Back goes straight to Leads here only", X("UI.filter.linkDir") === "up" && !vis().includes("u4"));
    X(`setLinkDir("both"); render();`); await wait(20);
    ok("S13 the command palette offers turning it off now, not on", J(`COMMANDS.filter(c=>c.id.startsWith("linked-side") && c.when()).map(c=>c.id)`).join() === "linked-side-off");
    X(`showLinked("bar", "r1"); render();`); await wait(20);
    ok("S14 a new pick keeps it on, and says when nothing else shares a prerequisite", X("UI.filter.linkSide") === true && /Nothing else shares a prerequisite with it\./.test(status()), status());
    X(`linkedOff(); render();`); await wait(20);
    ok("S15 taking the last chip off ends it, so the next Show linked work starts without it", X("UI.filter.linkSide") === false && !tg());
    X(`showLinked("bar", "c4"); render();`); await wait(20); tg().click(); await wait(10); X(`linkedOff(); render();`); await wait(20);
    ok("S15b an open menu closes when the last chip goes", d.querySelector("#linkMenu").hidden);
    X(`showLinked("bar", "c3"); setLinkSide(true); render();`); await wait(20);
    ok("S16 c3 with it: c2 is shown, and the status line says 1 shares a prerequisite", vis().includes("c2") && /plus 1 that shares a prerequisite/.test(status()), status());
    X(`setLinkMode("highlight"); render();`); await wait(20);
    ok("S17 highlighted, c2 isn't dimmed", !!d.querySelector('#gantt [data-sel="bar:c2"]') && !d.querySelector('#gantt [data-sel="bar:c2"]').closest(".link-dim") && !d.querySelector('#gantt [data-sel="bar:c2"]').classList.contains("link-dim"));
    ok("S18 the plan doesn't change", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
