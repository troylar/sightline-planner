// Lining up tasks already in the plan: task.move takes start "after", the working day after the last task it waits for
// finishes (weekends, holidays and its owners' time off skipped), keeping its id and links; prev can be the start alone.
// And a task with no guess flag reads as rough: false, so prev: false matches it. The sample plan; names are invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), {spawnSync} = require("child_process");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const SYNC = process.env.SIGHTLINE_SYNC || path.join(__dirname, "..", "tools", "sightline-jira-sync.py");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  try {
    await wait(150); w.FIX = FIX;
    // Contract: Thu Oct 8 for 2 working days (Oct 8, 9). Adapter waits for it but sits on Mon Nov 2; Loose waits for nothing.
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX); p.holidays = [{date:"2026-10-13", name:"Day off"}];
        p.bars.find(b=>b.id === "c4").tasks = [{id:"a", label:"Contract", start:"2026-10-08", days:2, owners:[], jira:"", status:"notstarted"},
          {id:"b", label:"Adapter", start:"2026-11-02", days:1, owners:[], jira:"", status:"notstarted", dependsOn:["a"]},
          {id:"z", label:"Loose", start:"2026-11-02", days:1, owners:[], jira:"", status:"notstarted"}];
        S = normalize(p, false); S.meta.autoSchedule = false; render(); window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const tk = (p, id) => `actTask(${p}, '${id}').t`;

    // Guess flag on a task that has none.
    const r1 = T(`(()=>{ const p = P(); const r = RA(p, 'task.set', {id:'b', field:'rough', value:true, prev:false}); return {ok:r.ok, code:r.code, rough:${tk("p", "b")}.rough}; })()`);
    ok("G1 a task with no guess flag reads as rough: false, so prev: false matches and the change applies", r1 && r1.ok === true && r1.rough === true, JSON.stringify(r1));
    const r2 = T(`(()=>{ const p = P(); const r = RA(p, 'task.set', {id:'b', field:'rough', value:true, prev:true}); return {ok:r.ok, code:r.code}; })()`);
    ok("G2 prev: true on a task that isn't a guess still conflicts", r2 && r2.ok === false && r2.code === "stale", JSON.stringify(r2));

    const vt = T(`(()=>{ const v = assistantView(); const t = v.initiatives.find(b=>b.id === "c4").tasks.find(t=>t.id === "b"); return {rough:t.rough, guide:JSON.stringify(v.guide)}; })()`);
    ok("G3 the assistant's context says rough: false on a task that isn't a guess, and its guide says how to line up existing tasks", vt && vt.rough === false && /task\.move with start 'after'/.test(vt.guide) && /prev false/.test(vt.guide), JSON.stringify(vt && vt.rough));

    // Move after what it waits for. Oct 9 ends Contract; Mon Oct 12 is next.
    const m1 = T(`(()=>{ const p = P(); const r = RA(p, 'task.move', {id:'b', start:'after'}); const t = ${tk("p", "b")}; return {ok:r.ok, reason:r.reason, start:t.start, deps:t.dependsOn, id:t.id}; })()`);
    ok("M1 start: after moves an existing task to the working day after what it waits for, earlier too, keeping its id and links", m1 && m1.ok && m1.start === "2026-10-12" && m1.id === "b" && JSON.stringify(m1.deps) === '["a"]', JSON.stringify(m1));
    const m2 = T(`(()=>{ const p = P(); RA(p, 'task.move', {id:'a', days:3}); const r = RA(p, 'task.move', {id:'b', start:'after'}); return ${tk("p", "b")}.start; })()`);
    ok("M2 it skips holidays: Contract running through Mon Oct 12 puts it after the Oct 13 day off", m2 === "2026-10-14", m2);
    const pa = J("S.people[0].id");
    const m3 = T(`(()=>{ const p = P(); RA(p, 'task.set', {id:'b', field:'owners', value:[${JSON.stringify(pa)}]}); RA(p, 'person.timeOff.add', {id:${JSON.stringify(pa)}, from:'2026-10-12', to:'2026-10-12'}); const r = RA(p, 'task.move', {id:'b', start:'after'}); return {ok:r.ok, reason:r.reason, s:${tk("p", "b")}.start}; })()`);
    ok("M3 and its owners' time off", m3 && m3.s === "2026-10-14", JSON.stringify(m3));
    const m4 = T(`(()=>{ const p = P(); const r = RA(p, 'task.move', {id:'z', start:'after'}); return {ok:r.ok, reason:r.reason, s:${tk("p", "z")}.start}; })()`);
    ok("M4 a task that waits for nothing is refused, saying how to link it, and stays put", m4 && m4.ok === false && /task\.link/.test(m4.reason) && m4.s === "2026-11-02", JSON.stringify(m4));
    const m5 = T(`(()=>{ const p = P(); const a = RA(p, 'task.move', {id:'b', start:'after', prev:'2026-11-02'}); const q = P(); const b = RA(q, 'task.move', {id:'b', start:'after', prev:'2026-11-03'}); return [a.ok, b.ok, b.code]; })()`);
    ok("M5 prev can be the start alone; a different start conflicts", m5 && m5.join() === "true,false,stale", JSON.stringify(m5));
    const m6 = T(`(()=>{ const p = P(); const r = RA(p, 'task.move', {id:'b', start:'next Monday'}); return ${tk("p", "b")}.start; })()`);
    ok("M6 dates in words still work for a move", m6 === "2026-10-12", m6);
    const m7 = T(`(()=>{ const p = P(); const r = RA(p, 'task.move', {id:'b', start:'afterwards'}); return r.reason; })()`);
    ok("M7 anything else is refused with the forms that work, after included", /or "after"/.test(m7 || ""), m7);

    // Through a proposal: link, then move after, then mark it a guess, in one change.
    const rv = T(`(()=>{ const r = amCheck({id:'c-line', ops:[{op:'action', action:'task.link', args:{id:'z', after:'a'}}, {op:'action', action:'task.move', args:{id:'z', start:'after', prev:'2026-11-02'}}, {op:'action', action:'task.set', args:{id:'z', field:'rough', value:true, prev:false}}]}, S);
      const q = P(); if (r.status === 'ready') r.apply(q); const t = actTask(q, 'z').t; return {status:r.status, reasons:r.reasons, text:JSON.stringify(r.notes || []) + JSON.stringify(r.lines || []), start:t.start, rough:t.rough}; })()`);
    ok("A1 a proposal can link a task, move it after, and mark it a guess in one change", rv && rv.status === "ready" && rv.start === "2026-10-12" && rv.rough === true, JSON.stringify(rv && {s:rv.status, r:rv.reasons, st:rv.start}));
    ok("A2 the review's line says the day it lands, the day it was, and what it starts after, once", rv && /Start \\"Loose\\" Oct 12 \(was Nov 2\), the working day after \\"Contract\\" finishes/.test(rv.text) && !/starts Oct 12/.test(rv.text) && /\\"Loose\\": length is a guess/.test(rv.text) , rv && rv.text.slice(0, 500));

    // A late predecessor: nothing can start the day after a finish that has passed.
    const lt = T(`(()=>{ const p = P(); RA(p, 'task.move', {id:'a', start:'2026-09-28', days:2}); const r = RA(p, 'task.move', {id:'b', start:'after'}); const q = P(); RA(q, 'task.move', {id:'a', start:'2026-09-28', days:2}); const r2 = RA(q, 'task.add', {id:'qq1', bar:'c4', after:['a'], label:'N'}); const r3 = RA(q, 'task.add', {id:'qq2', bar:'c4', after:['a'], start:'2026-10-14', label:'N2'}); return {ok:r.ok, reason:r.reason, s:${tk("p", "b")}.start, add:r2.ok, addWhy:r2.reason, given:r3.ok}; })()`);
    ok("L1 a late, unfinished predecessor refuses start: after, saying why, and the task stays put", lt && lt.ok === false && /\"Contract\" is late, so this can't start until it's done\. Give a start instead\./.test(lt.reason) && lt.s === "2026-11-02", JSON.stringify(lt));
    ok("L2 adding a task after it refuses the same way, unless a start is given", lt && lt.add === false && /is late/.test(lt.addWhy || "") && lt.given === true, JSON.stringify(lt));
    const ld = T(`(()=>{ const p = P(); RA(p, 'task.move', {id:'a', start:'2026-09-28', days:2}); RA(p, 'task.setStatus', {id:'a', status:'done'}); const r = RA(p, 'task.move', {id:'b', start:'after'}); return {ok:r.ok, s:${tk("p", "b")}.start}; })()`);
    ok("L3 once it's done, start: after works again", ld && ld.ok === true && ld.s === "2026-09-30", JSON.stringify(ld));

    const py = spawnSync("python3", ["-I", "-c", `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
ids = {"bar": {"b1"}, "task": {"t0"}}
def chk(args): return m.check_action_op({"op": "action", "action": "task.move", "args": args}, "ops[0]", ids, {})
print(json.dumps([chk({"id": "t0", "start": "after"}), chk({"id": "t0", "start": "2026-10-12"}), chk({"id": "t0", "start": "afterwards"})]))`, SYNC], {encoding:"utf8"});
    let pyr = null; try { pyr = JSON.parse(py.stdout.trim()); } catch(e){}
    ok("P1 the sync's offline check accepts start: after on a move, and still refuses other words", pyr && pyr[0] === "" && pyr[1] === "" && pyr[2] !== "", py.stdout.trim() + py.stderr.slice(-300));
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
