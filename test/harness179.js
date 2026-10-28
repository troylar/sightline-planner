// The linked work count on the status line is what's drawn: each linked item is asked the chart's own questions
// (barVisible, taskVisible, msVisible, gateVisible; the List builds its rows from the same ones), so under any filter the
// number said equals the linked marks on screen, and what your other filters hide is said as hidden. The List has no
// rows for milestones and gates, so there they're said to be on the Timeline. The plan is fixtures/sample-plan.json;
// every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null;
       S.milestones.find(m=>m.id === "ms8").after = ["c4"]; S.bars.find(b=>b.id === "c4").waitsFor = [S.gates[0].id];
       S.tags = [...(S.tags || []), {id:"tg-later", name:"later", color:"#888888"}]; window.TAG = "tg-later"; S.bars.find(b=>b.id === "c3").tags = [TAG];   // what it waits for, tagged
       const c1 = S.bars.find(b=>b.id === "c1"); c1.status = "done"; (c1.tasks || []).forEach(t=>t.status = "done");          // done work to hide
       S.bars.find(b=>b.id === "c5").added = {by:S.people[0].id, at:"2026-10-01T00:00:00.000Z"};                              // the only item someone is recorded adding
       UI.filter = normFilter({}); UI.ws = "timeline"; UI.zoom = "weeks"; render();`); await wait(20);
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    const P = J(`(()=>{ const c4 = S.bars.find(b=>b.id === "c4"), who = peopleOf(c4)[0] || S.people[0].id; return {who, lane:S.bars.find(b=>b.id === "c1").lane, tag:TAG, adder:S.people[0].id}; })()`);
    const status = () => d.querySelector("#status").textContent;
    // What the page says, and what's drawn: linked keys with a mark in the chart (or a row in the List), less the picks.
    const look = (seeds) => J(`(()=>{ const L = linkedScope(), seeds = ${JSON.stringify(seeds)}, keys = [...L.keys].filter(k=>/^(bar|task|ms|gate):/.test(k) && !seeds.includes(k));
      const list = UI.ws === "list", marks = new Set(list ? [...document.querySelectorAll("#listTable tr[data-lk]")].map(r=>r.dataset.lk.replace(/^list:/, "")) : [...[...document.querySelectorAll("#gantt [data-sel]")].map(e=>e.dataset.sel), ...[...document.querySelectorAll("#gantt [data-peek-type=gate][data-peek-id]")].map(e=>"gate:" + e.dataset.peekId), ...[...document.querySelectorAll("#gantt [data-gates]")].flatMap(e=>e.dataset.gates.split(" ").map(x=>"gate:" + x))]);   // gates are marked by id
      const work = keys.filter(k=>!list || /^(bar|task):/.test(k)), drawn = work.filter(k=>marks.has(k)).length;
      return {total:work.length, drawn, elsewhere:list ? keys.length - work.length : 0}; })()`);
    const said = () => { const t = status(), n = t.match(/: (\d+) items?[;.]| the (\d+) items? linked/), h = t.match(/(\d+) (?:more )?(?:is|are) hidden by your filters/), e = t.match(/(\d+) linked milestones? (?:or|and) gates? (?:is|are) on the Timeline/);
      return {shown:n ? Number(n[1] || n[2]) : 0, hidden:h ? Number(h[1]) : 0, elsewhere:e ? Number(e[1]) : 0, text:t}; };
    const run = async (flt, seeds, o = {}) => { X(`UI.ws = ${JSON.stringify(o.ws || "timeline")}; setLayerQuiet(${JSON.stringify(o.layer || "all")}); setHiddenQuiet(${JSON.stringify(o.hide || [])});
        UI.filter = normFilter({...${JSON.stringify(flt)}, linked:${JSON.stringify(seeds.map(k=>({t:k.split(":")[0], id:k.split(":")[1]})))}, linkDir:${JSON.stringify(o.dir || "both")}, linkMode:${JSON.stringify(o.mode || "only")}});
        ${o.ws === "list" ? `setListLayout(${JSON.stringify(o.layout || "lane")});` : "render();"} linkSay();`); await wait(15);
      const a = said(), b = look(seeds); return {a, b, ok:a.shown === b.drawn && a.hidden === b.total - b.drawn && a.elsewhere === b.elsewhere}; };
    const cases = [
      ["no filters: nothing hidden, and the wording is unchanged", {}, {}],
      ["a person filter", {people:[P.who]}, {}],
      ["Added by one person", {authors:[P.adder]}, {}],
      ["only what's added here", {}, {layer:"here"}],
      ["only Jira's", {}, {layer:"jira"}],
      ["done work hidden", {}, {hide:["done"]}],
      ["gates hidden", {}, {hide:["gate"]}],
      ["milestones hidden", {}, {hide:["milestone"]}],
      ["a workstream filter", {lanes:[P.lane]}, {}],
      ["a hidden tag", {hideTags:[P.tag]}, {}],
      ["all of them together", {people:[P.who], lanes:[P.lane], hideTags:[P.tag]}, {hide:["done", "gate"]}]];
    let anyHidden = 0;
    for (const [name, flt, o] of cases) for (const [dir, mode] of [["both", "only"], ["up", "only"], ["both", "highlight"]]){
      const r = await run(flt, ["bar:c4"], {...o, dir, mode}); anyHidden += r.a.hidden; const bites = !/^no filters|added here|Jira's/.test(name) && !(dir === "up" && /milestones hidden/.test(name));
      ok(`C ${name}, ${dir === "up" ? "leads here only" : "both ways"}${mode === "highlight" ? ", highlighted" : ""}: the count is what's drawn, and the rest is said as hidden`, r.ok && (!bites || r.b.total > r.b.drawn), `said ${r.a.shown}+${r.a.hidden} hidden, drawn ${r.b.drawn} of ${r.b.total}`); }
    ok("C0 the filters above do hide linked work, so the checks aren't empty", anyHidden > 10, String(anyHidden));
    const r0 = await run({}, ["bar:c4"]);
    ok("C1 with no filters the line reads as before: no hidden part", !/hidden by your filters/.test(r0.a.text) && /^Showing .* and the \d+ items linked to it\. Take a chip off/.test(r0.a.text), r0.a.text);
    const rm = await run({}, ["ms:ms8"], {dir:"up"});
    ok("C2 a milestone's runway: the count is what's drawn", rm.ok && rm.a.shown > 0, `said ${rm.a.shown}, drawn ${rm.b.drawn}`);
    const rh = await run({lanes:[P.lane]}, ["ms:ms8"], {dir:"up"});
    ok("C3 …and with a workstream filter, what it hides is said as hidden", rh.ok && rh.a.hidden > 0 && /; \d+ more (is|are) hidden by your filters\./.test(rh.a.text), rh.a.text);
    const off = await run({range:{type:"custom", from:"2001-01-01", to:"2001-01-31"}}, ["bar:c4"]);
    ok("C4 when the filters hide every linked item, it says nothing is shown and why", /^Nothing linked to .* is shown: \d+ (is|are) hidden by your filters\./.test(off.a.text) && off.ok, off.a.text);
    ok("C5 a pick the filters hide is said to be hidden", /is hidden by your filters\./.test(off.a.text.replace(/^Nothing[^.]*\./, "")), off.a.text);
    for (const layout of ["lane", "start"]) for (const [name, flt, o] of [["a person filter", {people:[P.who]}, {}], ["all of them together", {people:[P.who], lanes:[P.lane], hideTags:[P.tag]}, {hide:["done", "gate"]}], ["no filters", {}, {}]]){
      const r = await run(flt, ["bar:c4"], {...o, ws:"list", layout});
      ok(`L List ${layout === "lane" ? "By workstream" : "By start date"}, ${name}: the count is the linked rows drawn, and milestones and gates are said to be on the Timeline`, r.ok && (r.b.elsewhere > 0 ? /on the Timeline; the List shows work\./.test(r.a.text) : true), `said ${r.a.shown}+${r.a.hidden} hidden+${r.a.elsewhere} on the Timeline, drawn ${r.b.drawn} of ${r.b.total}, ${r.b.elsewhere} elsewhere`); }
    X(`setLayerQuiet("all"); setHiddenQuiet([]); UI.ws = "timeline"; UI.filter = normFilter({}); render();`);
    ok("the plan doesn't change", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
