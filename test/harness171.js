// Connect assistant waits in your name menu until an assistant is connected; then the toolbar shows its state (connected,
// paused, needs attention, changes waiting). A quieter first open; the plan doesn't change. The plan is the sample plan.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), X = s => { try { return ev(s); } catch(e){ return undefined; } };
  const $ = s => d.querySelector(s), shown = el => !!el && !el.closest("[hidden]");
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; AM = null; UI.ws = "timeline"; render();`);
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    ok("A1 on a first open, the toolbar has no Connect assistant button", !shown($("#assistantChanges")) || $("#assistantChanges").hidden === true, String($("#assistantChanges")?.hidden));
    $("#meBtn").click(); await wait(20);
    const item = $("#meAssistant");
    ok("A2 your name menu offers Connect assistant", shown(item) && item.textContent === "Connect assistant" && item.getAttribute("role") === "menuitem");
    ok("A3 …right after who you are, so the keyboard reaches it second", [...$("#meMenu").querySelectorAll("button")].filter(b=>!b.closest("[hidden]"))[1] === item);
    item.click(); await wait(30);
    ok("A4 choosing it opens the assistant setup, and the menu closes", X("sel && sel.type") === "amend" && $("#meMenu").hidden === true, JSON.stringify(X("sel")));
    ev(`sel = null; AM = {}; render();`); await wait(10);
    ok("A5 once an assistant is connected, the toolbar shows it and the menu item goes", shown($("#assistantChanges")) && $("#assistantChanges").textContent === "Assistant connected" && !shown($("#meAssistant")), $("#assistantChanges").textContent);
    ev(`AM = {paused:true}; render();`); await wait(10);
    ok("A6 …and says when it's paused", shown($("#assistantChanges")) && $("#assistantChanges").textContent === "Assistant paused");
    $("#assistantChanges").click(); await wait(20);
    ok("A7 the toolbar button still opens the assistant panel", X("sel && sel.type") === "amend");
    ev(`sel = null; AM = null; present = true; render();`); await wait(10);
    ok("A8 Present shows neither", !shown($("#assistantChanges")) && !shown($("#meAssistant")));
    ev(`present = false; render();`); await wait(10);
    for (const q of ["assistant", "connect"]){ ev(`sel = null; render(); openFind(); renderFind(${JSON.stringify(q)});`); await wait(10);
      const hits = [...d.querySelectorAll("#findList .fhit.fcmd .ft")].map(x=>x.textContent);
      ok(`A10 typing "${q}" in Find offers Connect assistant`, hits.includes("Connect assistant or review its changes"), hits.join(" | ")); }
    ev(`findCmd("assistant");`); await wait(20);
    ok("A11 …and it opens the same assistant panel", X("sel && sel.type") === "amend");
    ev(`sel = null; render();`);
    ok("A9 nothing in the plan changed", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
