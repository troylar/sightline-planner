// Startup asks who you are a moment after the page is ready. That call looks the function up when it runs, so a test
// (or anything else) that replaces askWhoOnStart before then is what runs: a slow start can't open the people picker
// over a plan loaded meanwhile. The sample plan; every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 30000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      // a slow start: the browser's storage answers after 300 ms
      w.indexedDB = {open(){ const r = {}; setTimeout(()=>{ r.error = new Error("slow"); r.onerror && r.onerror(); }, 300); return r; }};
      w.localStorage.setItem("timeline-planner-local", FIX);   // the plan this browser has, with its people
      w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, ev = s=>w.eval(s);
    // replace it right after startup has scheduled the call and before the call runs (the window a slow CI run hit)
    for (let i = 0; i < 300 && ev("locked"); i++) await wait(5);
    ev(`window.asked = 0; askWhoOnStart = ()=>{ window.asked++; };`);
    await wait(300);
    const items = [...w.document.querySelectorAll("#addMenu:not([hidden]) [role=menuitem], dialog[open] button")].map(b=>b.textContent).filter(t=>/Avery|Blake/.test(t));
    ok("W1 after a slow start, the replaced askWhoOnStart is the one that runs", ev("window.asked") === 1, String(ev("window.asked")));
    ok("W2 …and no people picker opens", !items.length, items.slice(0, 3).join(" | "));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
