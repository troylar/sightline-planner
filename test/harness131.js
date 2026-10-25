// Workstream names stay in view while you scroll the chart (docs/timeline.md): in Days each workstream's header sticks
// under the dates (and pinned top rows) until the next one slides over it; in Weeks the name rides down its tall row.
// jsdom can't scroll, so this checks the rules and structure the browser needs: the sticky rules and their stacking, the
// offset under the dates and pinned rows, person and epic rows, and print. Fixture: fixtures/many-lanes.js (22 workstreams).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, ""), many = require("./fixtures/many-lanes.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      // heights the browser would give: the dates 100px, a pinned row 20px, anything else 30px
      Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", {configurable:true, get(){ return this.classList.contains("ghead") ? 100 : this.classList.contains("sechdr") || this.closest?.(".gaterow,.meetrow,.blkrow,.relrow,.dvrow") ? 20 : 30; }});
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    await wait(180); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = many();
    ev("stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; JIRA = null; resetHistory(); askWhoOnStart = ()=>{}; setMe(S.people[0].id); sel = null; UI.pinTop = false; UI.zoom = 'days'; goWs('timeline'); render();");
    const css = [...d.querySelectorAll("style")].map(s=>s.textContent).join("\n").replace(/\s+/g, " ");
    const rule = sel => { const i = css.indexOf(sel + "{"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
    const z = sel => +((/z-index:\s*(\d+)/.exec(rule(sel)) || [])[1] || 0);
    ok("D1 in Days, a workstream's header sticks under the dates", /position:\s*sticky/.test(rule(".gantt.days>.lanehdr[data-ohdr]")) && /top:\s*var\(--lhtop/.test(rule(".gantt.days>.lanehdr[data-ohdr]")));
    ok("D2 it sits under the dates and pinned rows, over the names that stick to the left", z(".gantt.days>.lanehdr[data-ohdr]") < z(".gscroll .ghead") && z(".gantt.days>.lanehdr[data-ohdr]") < 7 && z(".gantt.days>.lanehdr[data-ohdr]") > 4, [z(".gantt.days>.lanehdr[data-ohdr]"), z(".gscroll .ghead")].join(","));
    ok("D3 the header has its own background, so rows scroll under it, not through it", /background:\s*var\(--paper\)/.test(rule(".lanehdr")));
    const hdrs = [...d.querySelectorAll("#gantt > .lanehdr[data-ohdr]")].map(x=>x.dataset.ohdr);
    ok("D4 every one of the 22 workstreams has a header, in order", hdrs.length === 22 && hdrs.join() === ev("S.lanes.map(l=>l.id).join()"), hdrs.length);
    ok("D5 the offset is the dates' height when nothing is pinned", d.querySelector("#gantt").style.getPropertyValue("--lhtop") === "100px", d.querySelector("#gantt").style.getPropertyValue("--lhtop"));
    ev("UI.pinTop = true; render();");
    { const pins = [...d.querySelectorAll("#gantt > .pinned")], last = pins[pins.length - 1], want = last ? (parseFloat(last.style.top) + 20) + "px" : "";
      ok("D6 with top rows pinned, workstream names stick below the last of them", pins.length > 0 && d.querySelector("#gantt").style.getPropertyValue("--lhtop") === want, `${pins.length} pinned, ${d.querySelector("#gantt").style.getPropertyValue("--lhtop")} vs ${want}`); }
    ev("UI.pinTop = false; UI.zoom = 'weeks'; render();");
    ok("W1 in Weeks, the name and its fold button stick inside their row", /position:\s*sticky/.test(rule(".gantt:not(.days) .lane>.lnwrap>*,.gantt:not(.days) .lane>.eplabel>*,.gantt:not(.days) .lane>.plabel>.lstick")) && /align-items:\s*flex-start/.test(rule(".gantt:not(.days) .lane>.lnwrap")));
    ok("W2 short workstreams keep their height, so nothing shifts", /min-height:\s*47px/.test(rule(".gantt:not(.days) .lane>.lnwrap>.lname,.gantt:not(.days) .lane>.lnwrap>.foldb")));
    ok("W3 each workstream row has its name block to stick", d.querySelectorAll("#gantt > .lane[data-lane] > .lnwrap > .lname").length === 22 && d.querySelector("#gantt").style.getPropertyValue("--lhtop") === "100px");
    ev("S.bars.slice(0, 40).forEach((b, i)=>{ b.owners = [S.people[i % 3].id]; }); UI.rows = 'people'; render();");
    ok("W4 rows by person: each person's name and note stick together as one block", d.querySelectorAll("#gantt > .lane.personrow > .plabel > .lstick > b").length >= 3 && !d.querySelector("#gantt > .lane.personrow > .plabel > b"));
    ev("UI.rows = 'lanes'; render();");
    ok("P1 printing lays the names out normally", /@media print\{[^@]*\.gantt\.days>\.lanehdr\[data-ohdr\]\{position:\s*static\}/.test(css));
    ok("P2 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness completed", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
