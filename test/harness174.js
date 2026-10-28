// The Timeline's time controls fold behind one "Time" button that says what's on screen. Closed the first time; open or
// closed is this browser's choice. Every control, shortcut and Find action works while it's closed, the button keeps
// up with them, and nothing that warns about the plan moves inside it. A viewer preference: the plan doesn't change.
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
(async()=>{
  try {
    const w = await open(), d = w.document, X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const btn = () => d.querySelector("#timeSummary"), body = () => d.querySelector("#timeBody"), say = () => (btn() || {}).textContent || "";
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    ok("T1 the first time, the time controls are folded behind one Time button", !!btn() && !!body() && body().hidden && btn().getAttribute("aria-expanded") === "false" && !d.querySelector("#timeControls").hidden);
    ok("T2 …which says the zoom, the sprint and the dates on screen", /^Time: (Weeks|Days) · .+\(\w{3} \d+ – \w{3} \d+\)$/.test(say()) && say().includes(X(`$("#pgRange").textContent`)), say());
    ok("T3 every control is still there, inside it", ["#zWeeks", "#zDays", "#pgPrev", "#pgNext", "#zoomIn", "#zoomOut"].every(q=>body().querySelector(q)));
    const keep = ["#editstrip", "#status", "#banners", "#hiddenStrip", "#showStrip"].filter(q=>d.querySelector(q));
    ok("T4 nothing that warns about the plan is inside it: edit and save state, status, banners, the hidden-work strip", keep.length >= 4 && keep.every(q=>!d.querySelector("#timeControls").contains(d.querySelector(q))), keep.join(" "));
    ok("T5 the late count stays outside it", (()=>{ const late = [...d.querySelectorAll("#banners *")].find(e=>/\d+ late/.test(e.textContent)); return !!late && !d.querySelector("#timeControls").contains(late); })());

    d.dispatchEvent(new w.KeyboardEvent("keydown", {key:"d", bubbles:true})); await wait(30);
    ok("T6 a shortcut works while it's folded, and the button follows (D: Days)", X("UI.zoom") === "days" && /^Time: Days · /.test(say()) && body().hidden, say());
    X(`COMMANDS.find(c=>c.id === "weeks").run()`); await wait(30);
    ok("T7 a Find action works while it's folded, and the button follows (Weeks view)", X("UI.zoom") === "weeks" && /^Time: Weeks · /.test(say()), say());
    X("setZoomN(0)"); await wait(30);
    ok("T8 Fit says so", /^Time: Weeks · Fit( \(|$)/.test(say()), say());
    X("zoomPreset(1)"); await wait(30);
    ok("T9 one sprint names it, with its dates", /^Time: Weeks · S\d+ \(\w{3} \d+ – \w{3} \d+\)$/.test(say()) || /^Time: Weeks · \S.* \(\w{3} \d+ – \w{3} \d+\)$/.test(say()) && !/sprints? from/.test(say()), say());
    const before = say();
    X(`showLinked("bar", "c3")`); await wait(30);
    ok("T10 Show linked work switches to Fit, and the folded button says so", /· Fit( \(|$)/.test(say()) && body().hidden, say());
    X(`linkedOff()`); await wait(30);
    ok("T11 …and taking it off puts the zoom back, and the button with it", say() === before, say() + " vs " + before);

    btn().click(); await wait(10);
    ok("T12 the button opens them, and says it's open", !body().hidden && btn().getAttribute("aria-expanded") === "true");
    ok("T12b open, it shrinks to its chevron and a screen reader hears what it does", btn().getAttribute("aria-label") === "Hide the time controls" && d.querySelector("#timeControls").classList.contains("open"));
    ok("T13 open is remembered in this browser, not in the plan", JSON.parse(w.localStorage.getItem("timeline-planner-ui") || "{}").timeOpen === true && X("JSON.stringify(planOfRecord(S))") === plan0);
    X(`UI.ws = "list"; render();`); await wait(20);
    ok("T14 it's only on the Timeline", d.querySelector("#timeControls").hidden);
    X(`UI.ws = "timeline"; render();`); await wait(20);
    btn().click(); await wait(10);
    ok("T15 and it closes again, saying what's on screen", body().hidden && btn().getAttribute("aria-expanded") === "false" && !btn().hasAttribute("aria-label") && /^Time: /.test(say()));
    ok("T16 nothing in the plan changed", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));

    const w2 = await open(w=>w.localStorage.setItem("timeline-planner-ui", JSON.stringify({timeOpen:true})));
    ok("T17 a browser that left it open finds it open", !w2.document.querySelector("#timeBody").hidden && w2.document.querySelector("#timeSummary").getAttribute("aria-expanded") === "true");
    const w3 = await open(w=>{ w.Storage.prototype.getItem = ()=>{ throw new Error("blocked"); }; w.Storage.prototype.setItem = ()=>{ throw new Error("blocked"); }; });
    w3.document.querySelector("#timeSummary").click(); await wait(10);
    ok("T18 with storage blocked it starts folded and still opens", w3.document.querySelector("#timeSummary").getAttribute("aria-expanded") === "true" && w3.errs.length === 0, w3.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
