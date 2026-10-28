// The List, By connection: each chain of linked work together, in the order it has to happen (what something waits for
// comes before it), chains by their first start, ones holding linked picks first, and work with no links last. A view: the
// plan doesn't change. The sample plan's chains (m1 -> m2 -> m3, c1 -> c3 -> c4 ..., r1 -> ... -> r5); every name is invented.
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
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`)), X = s => { try { return ev(s); } catch(e){ return undefined; } };
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; UI.filter = normFilter({}); UI.ws = "list"; setListLayoutQuiet("lane"); render();
        window.G = () => listGroups(listModel(), "connection").map(g=>({label:g.label, picked:!!g.picked, ids:g.rows.map(r=>r.type + ":" + r.id), s0:g.s0}));
        window.WAITS = () => { const P = orderPreds(), o = {}; P.forEach((L, k)=>{ o[k] = [...new Set(L)]; }); return o; };`);
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    const btn = [...d.querySelectorAll('.seg[aria-label="List layout"] button')].find(b=>b.textContent === "By connection");
    ok("C1 the List offers By connection, with a tooltip that says what it does", !!btn && /chain/.test(btn.title));
    btn.click(); await wait(20);
    ok("C2 …and choosing it shows it, and the link carries it", X("listLayout()") === "connection" && /ll=connection/.test(w.location.hash), w.location.hash);
    const G = J("G()"), P = J("WAITS()");
    const chain = G.find(g=>g.ids.includes("bar:c3"));
    ok("C3 a chain is one group: c1 through c6, and the m and u work linked into it", !!chain && ["c1","c3","c4","c5","c6","m1","m3","u4","u5"].every(x=>chain.ids.includes("bar:" + x)), chain && chain.ids.join(","));
    const before = G.every(g=>g.ids.every((k, i)=>(P[k] || []).filter(q=>g.ids.includes(q)).every(q=>g.ids.indexOf(q) < i)));
    ok("C4 in every group, what a row waits for comes before it", before);
    const rg = G.find(g=>g.ids.includes("bar:r3"));
    ok("C5 a separate chain is its own group (r1 to r5), not mixed into another", !!rg && rg !== chain && ["r1","r2","r4","r5"].every(x=>rg.ids.includes("bar:" + x)) && !rg.ids.includes("bar:c3"), rg && rg.ids.join(","));
    const last = G[G.length - 1];
    ok("C6 work with no links comes last, in one group that says so", /^No links/.test(last.label) && last.ids.includes("bar:p1") && !G.slice(0, -1).some(g=>g.ids.includes("bar:p1")), last.label);
    const s0 = G.filter(g=>!/^No links/.test(g.label)).map(g=>g.s0);
    ok("C7 chains go by when they start", s0.every((v, i)=>!i || s0[i - 1] <= v), s0.join(","));
    ok("C8 each row shows once", (()=>{ const all = G.flatMap(g=>g.ids); return all.length === new Set(all).size; })());
    const keys = [...d.querySelectorAll("#listTable tr[data-lk]")].map(r=>r.dataset.lk.slice(5));
    ok("C9 the table draws the groups in that order, so J and K follow it", keys.join() === G.flatMap(g=>g.ids).join(), keys.slice(0, 6).join(","));
    ok("C10 each group has a heading row with its name", [...d.querySelectorAll("#listTable tbody")].some(b=>/From /.test(b.textContent)));
    // Filters hide rows, never move them to another group.
    ev(`UI.filter = normFilter({status:["notstarted"]}); render();`); await wait(10);
    const Gf = J("G()"), home = k => (G.find(g=>g.ids.includes(k)) || {}).label, homeF = k => (Gf.find(g=>g.ids.includes(k)) || {}).label;
    ok("C11 a filter hides rows but keeps each in its group", Gf.flatMap(g=>g.ids).every(k=>homeF(k) === home(k) || (/^From /.test(homeF(k)) && /^From /.test(home(k)) && G.find(g=>g.label === home(k)).ids.includes(k))), Gf.length + " groups");
    // Linked picks: the chain holding them first.
    ev(`UI.filter = normFilter({}); render(); showLinked("bar", "r3"); setLinkMode("highlight");`); await wait(20);
    const Gh = J("G()");
    ok("C12 while linked work is highlighted, the chain holding it comes first", Gh[0].ids.includes("bar:r3") && Gh[0].picked, Gh[0].label);
    ev(`setLinkMode("only");`); await wait(10);
    const Go = J("G()");
    ok("C13 with Only these, just the linked rows show, still in order", Go.length === 1 && Go[0].ids.every(k=>/^bar:r[1-5]$/.test(k)), JSON.stringify(Go.map(g=>g.ids)));
    ev(`linkedOff();`); await wait(10);
    // A loop: it still draws, and the group says so.
    ev(`S.bars.find(b=>b.id === "r1").dependsOn = ["r5"]; dropJiraMemos(); render();`); await wait(10);
    const Gl = J("G()"), lg = Gl.find(g=>g.ids.includes("bar:r1"));
    ok("C14 a loop of links draws, and its group says it includes a loop", !!lg && /loop/.test(lg.label) && lg.ids.length === 5, lg && lg.label);
    ev(`S.bars.find(b=>b.id === "r1").dependsOn = []; dropJiraMemos(); render();`);
    const md = X(`listMarkdown(listGroups(listModel(), "connection"), "connection")`) || "";
    ok("C15 Copy as table keeps the groups and their order", /\*\*From /.test(md) && /\*\*No links/.test(md) && md.indexOf("**No links") > md.indexOf("**From "));
    ev(`setListLayoutQuiet("lane"); render();`); await wait(10); w.history.back(); await wait(80);
    ok("C16 Back returns to By connection", X("listLayout()") === "connection", X("listLayout()"));
    ev(`setListLayoutQuiet("nope"); render();`);
    ok("C17 a layout this page doesn't know falls back to the default", X("listLayout()") === "lane");
    ok("C18 nothing in the plan changed", X("JSON.stringify(planOfRecord(S))") === plan0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
