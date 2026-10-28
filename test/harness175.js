// What the Timeline leaves out: two or more reasons fold into one line, what you chose to hide first, with Details for
// the full sentences and their buttons. One reason reads as before. Closed or open is this browser's choice; nothing in
// the plan changes, and the warnings above the chart never move into it. Every name is the sample plan's.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
async function open(prep){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message));
    if (prep) prep(w); }});
  const w = dom.window; await wait(150); w.FIX = FIX;
  w.eval(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; UI.filter = normFilter({}); UI.ws = "timeline"; render();`);
  await wait(20); return w;
}
const two = `setHiddenKinds(["gate"]); S.bars.find(b=>b.id === "c6").parked = true; render();`;
(async()=>{
  try {
    const w = await open(), d = w.document, X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const hs = () => d.querySelector("#hiddenStrip"), more = () => d.querySelector("#hsMore"), det = () => d.querySelector("#hsDetails"), sum = () => (d.querySelector("#hiddenStrip .hssum") || {}).textContent || "";
    const tabbable = () => [...hs().querySelectorAll("button,a[href],input,select,textarea,[tabindex]")].filter(e=>!e.closest("[hidden]") && e.tabIndex >= 0).map(e=>e.id || e.textContent);
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    X(`setHiddenKinds(["gate"])`); await wait(10);
    ok("F1 one reason reads as before: its sentence and button, no Details", !hs().hidden && !more() && /1 hidden: gates\./.test(hs().textContent) && !!d.querySelector("#hiddenStrip > #hsKinds #hsShowAll"), hs().textContent.slice(0, 80));
    X(`S.bars.find(b=>b.id === "c6").parked = true; render();`); await wait(10); const plan1 = X("JSON.stringify(planOfRecord(S))");
    ok("F2 two reasons fold into one line with Details, closed the first time", !!more() && more().getAttribute("aria-expanded") === "false" && more().getAttribute("aria-controls") === "hsDetails" && det().hidden, sum());
    ok("F3 the line counts each reason in its own words, with no made-up total", sum() === "1 kind hidden · 1 initiative parked", sum());
    ok("F4 closed, nothing inside Details can be reached with Tab", tabbable().join() === "hsMore", tabbable().join());
    ok("F5 the full sentences and their buttons are still there, inside Details", ["#hsKinds", "#hsShowAll", "#hsParked", "#hsParkedGo", "#hsParkedOff"].every(q=>det().querySelector(q)));
    ok("F6 the strip is a labeled group and the line is what a screen reader hears", hs().getAttribute("role") === "group" && hs().getAttribute("aria-label") === "Hidden from view" && d.querySelector("#hiddenStrip .hssum").getAttribute("role") === "status");
    more().click(); await wait(5);
    ok("F7 Details opens them, and says it's open", !det().hidden && more().getAttribute("aria-expanded") === "true" && more().textContent === "Hide details" && tabbable().includes("hsShowAll"));
    ok("F8 open is remembered in this browser, not in the plan", JSON.parse(w.localStorage.getItem("timeline-planner-ui") || "{}").hiddenOpen === true && X("JSON.stringify(planOfRecord(S))") === plan1);
    more().focus(); X("render()"); await wait(5);
    ok("F9 a redraw keeps it open and keeps focus on Details", !det().hidden && d.activeElement === more());
    more().click(); await wait(5);
    X(`UI.filter.authors = ["nobody"]; render();`); await wait(10);
    ok("F10 what you chose to hide comes first; what happened on its own after", /^1 kind hidden · \d+ hidden by Added by · 1 initiative parked$/.test(sum()), sum());
    ok("F11 a new reason updates the line and leaves Details closed", det().hidden && more().getAttribute("aria-expanded") === "false");
    X(`UI.filter.authors = []; render();`); await wait(10);
    det().querySelector("#hsShowAll").click(); await wait(10);
    ok("F12 a button inside Details still works, and one reason left unfolds", X("hiddenKinds().length") === 0 && !more() && !!d.querySelector("#hiddenStrip > #hsParked"), hs().textContent.slice(0, 60));
    X(two); await wait(10);
    const late = [...d.querySelectorAll("#banners *")].find(e=>/\d+ late/.test(e.textContent));
    ok("F13 the late count and every warning stay outside the strip", !!late && !hs().contains(late) && !hs().querySelector(".banner"));
    X(`showLinked("bar", "c3")`); await wait(10);
    ok("F14 under Show linked work, closed: the same folded line, Showing still says what's linked", !!more() && det().hidden && sum() === "1 kind hidden · 1 initiative parked" && !!d.querySelector("#showStrip .linkchip"), sum());
    more().click(); await wait(5);
    ok("F15 …and open, the same details", !det().hidden && !!det().querySelector("#hsParked"));
    more().click(); X(`linkedOff()`); await wait(10);
    X(`UI.ws = "list"; render();`); await wait(10);
    ok("F16 it's the Timeline's: on the List the parked note isn't there", !/parked/.test(hs().hidden ? "" : hs().textContent));
    X(`UI.ws = "timeline"; render();`); await wait(10);
    X(`delete S.bars.find(b=>b.id === "c6").parked; setHiddenKinds([]); render();`); await wait(10);
    ok("F17 with the test's own changes taken back, the plan is as it was: Details changed nothing in it", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));

    const w2 = await open(w=>w.localStorage.setItem("timeline-planner-ui", JSON.stringify({hiddenOpen:true})));
    w2.eval(two); await wait(10);
    ok("F18 a browser that left it open finds it open", !w2.document.querySelector("#hsDetails").hidden && w2.document.querySelector("#hsMore").getAttribute("aria-expanded") === "true");
    const w3 = await open(w=>{ w.Storage.prototype.getItem = ()=>{ throw new Error("blocked"); }; w.Storage.prototype.setItem = ()=>{ throw new Error("blocked"); }; });
    w3.eval(`UI.filter.authors = ["nobody"]; S.bars.find(b=>b.id === "c6").parked = true; render();`); await wait(10);
    const m3 = w3.document.querySelector("#hsMore"); m3 && m3.click(); await wait(5);
    ok("F19 with storage blocked it starts closed and still opens", !!m3 && m3.getAttribute("aria-expanded") === "true" && w3.errs.length === 0, w3.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
