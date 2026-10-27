// What an item waits for merges link by link: two people adding different links to the same task or initiative both
// keep theirs, and a removal stays removed. A link that would close a loop with the teammate's links isn't merged: theirs
// wins and mine is kept as a clash, so it's backed up and nobody gets work that waits for itself. Sample plan only.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.URL.createObjectURL = ()=>"blob:x"; w.URL.revokeObjectURL = ()=>{}; w.HTMLAnchorElement.prototype.click = function(){ w.downloads = (w.downloads || 0) + 1; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX); const t = (id, deps) => ({id, label:id, start:"2026-10-20", days:1, owners:[], jira:"", status:"notstarted", ...(deps ? {dependsOn:deps} : {})});
        p.bars.find(b=>b.id === "c4").tasks = [t("a"), t("b"), t("c"), t("d", ["a"])]; p.bars.forEach(b=>{ b.dependsOn = []; }); p.bars.find(b=>b.id === "c3").dependsOn = ["c1"];
        S = normalize(p, false); file.handle = null; render();
        window.TK = (pl, id) => pl.bars.find(b=>b.id === "c4").tasks.find(x=>x.id === id); window.BR = (pl, id) => pl.bars.find(b=>b.id === id);
        window.TRIO = () => { const base = clone(S); return [base, clone(base), clone(base)]; };`);
    const m1 = T(`(()=>{ const [base, mine, theirs] = TRIO(); TK(mine, "d").dependsOn = ["a", "b"]; TK(theirs, "d").dependsOn = ["a", "c"];
      const m = mergePlans(base, mine, theirs); return {deps:TK(m.plan, "d").dependsOn.slice().sort(), kept:m.kept.length}; })()`);
    ok("M1 two people adding different links to the same task both keep theirs, with no clash", m1 && m1.deps.join() === "a,b,c" && m1.kept === 0, JSON.stringify(m1));
    const m2 = T(`(()=>{ const [base, mine, theirs] = TRIO(); BR(mine, "c3").dependsOn = ["c1", "c2"]; BR(theirs, "c3").dependsOn = ["c1", "m1"];
      const m = mergePlans(base, mine, theirs); return {deps:BR(m.plan, "c3").dependsOn.slice().sort(), kept:m.kept.length}; })()`);
    ok("M2 and on an initiative", m2 && m2.deps.join() === "c1,c2,m1" && m2.kept === 0, JSON.stringify(m2));
    const m3 = T(`(()=>{ const [base, mine, theirs] = TRIO(); TK(mine, "d").dependsOn = []; TK(theirs, "d").dependsOn = ["a", "c"];
      const m = mergePlans(base, mine, theirs); return {deps:TK(m.plan, "d").dependsOn || [], kept:m.kept.length}; })()`);
    ok("M3 a link one person removed stays removed while the other adds one", m3 && m3.deps.join() === "c" && m3.kept === 0, JSON.stringify(m3));
    const m4 = T(`(()=>{ const [base, mine, theirs] = TRIO(); TK(mine, "a").dependsOn = ["b"]; TK(theirs, "b").dependsOn = ["a"];
      const m = mergePlans(base, mine, theirs); return {a:TK(m.plan, "a").dependsOn || [], b:TK(m.plan, "b").dependsOn || [], kept:m.kept.map(o=>o.id + ":" + o.field)}; })()`);
    ok("M4 a link that would close a loop with theirs (I make a wait for b while they make b wait for a) isn't merged: it's kept as a clash, to back up", m4 && m4.a.length === 0 && m4.b.join() === "a" && m4.kept.join() === "a:dependsOn", JSON.stringify(m4));
    const m5 = T(`(()=>{ const [base, mine, theirs] = TRIO(); BR(mine, "c1").dependsOn = ["c2"]; BR(theirs, "c2").dependsOn = ["c1"];
      const m = mergePlans(base, mine, theirs); return {c1:BR(m.plan, "c1").dependsOn || [], kept:m.kept.map(o=>o.id + ":" + o.field)}; })()`);
    ok("M5 and between initiatives", m5 && m5.c1.length === 0 && m5.kept.join() === "c1:dependsOn", JSON.stringify(m5));
    const m6 = T(`(()=>{ const [base, mine, theirs] = TRIO(); TK(theirs, "d").dependsOn = ["a", "c"];
      const r = applyOps(theirs, [{op:"set", type:"task", id:"d", field:"dependsOn", prev:["a"], value:["a", "b"]}]); return TK(r.plan, "d").dependsOn.slice().sort(); })()`);
    ok("M6 a quick update replayed on a newer file merges its links the same way", m6 && m6.join() === "a,b,c", JSON.stringify(m6));
    // On save, the person whose link wasn't kept is told which link, why, and that their version was backed up.
    const sv = T(`(()=>{ const keep = S; file.baseText = serialize(S, "p.json"); const base = parseText(file.baseText); const mine = clone(base), theirs = clone(base);
      TK(mine, "a").dependsOn = ["b"]; TK(theirs, "b").dependsOn = ["a"]; theirs.meta.revision = (base.meta.revision || 0) + 1; S = mine; window.downloads = 0;
      const ok = rebaseOnto(theirs, serialize(theirs, "p.json")); const note = mergeNote; const out = {ok, note, a:TK(S, "a").dependsOn || [], dl:window.downloads}; mergeNote = ""; S = keep; return out; })()`);
    ok("S1 saving onto a teammate's change says which link wasn't kept and why, and backs up my version", sv && sv.ok && sv.a.length === 0 && sv.dl === 1 && /Your "waits for" link from "a" to "b" wasn't kept: it would make a loop with a teammate's change/.test(sv.note) && /downloaded as a backup/.test(sv.note) && !/you also edited/.test(sv.note), JSON.stringify(sv));
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
