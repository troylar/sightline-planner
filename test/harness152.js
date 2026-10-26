// Dates said in words: any date an action or a proposed change is given can be YYYY-MM-DD or a day like tomorrow, +3d,
// 2 weeks ago, Friday, next Friday, last Monday, next month or next sprint, read against today when it's checked. A
// task's start moves to its next working day; a proposal says which date each one became, and Apply uses that date.
// Junk is refused with the forms that work, and the sync's offline check agrees. Fixed clock (Wed Oct 7, 2026); the
// sample plan (sprints of two weeks from Sep 21). Every name is invented.
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
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); render();
        window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const bar = J("S.bars.find(b=>!b.jira && !(b.epics || []).length && !S.bars.some(k=>k.parent === b.id)).id"), pa = J("S.people[0].id");

    // The words.
    const table = {"today":"2026-10-07", "Tomorrow":"2026-10-08", "yesterday":"2026-10-06", "+3d":"2026-10-10", "in 2 weeks":"2026-10-21", "-3d":"2026-10-04",
      "3 days ago":"2026-10-04", "2 weeks ago":"2026-09-23", "Friday":"2026-10-09", "fri":"2026-10-09", "wednesday":"2026-10-14", "this friday":"2026-10-09",
      "this monday":"2026-10-05", "next friday":"2026-10-16", "next Monday":"2026-10-12", "last monday":"2026-10-05", "last wednesday":"2026-09-30",
      "next week":"2026-10-12", "last week":"2026-09-28", "next month":"2026-11-01", "last month":"2026-09-01", "this sprint":"2026-10-05", "next sprint":"2026-10-19",
      "  Next   MONDAY ":"2026-10-12", "2026-11-02":"2026-11-02"};
    const got = T(`(${JSON.stringify(Object.keys(table))}).map(v=>relDay(v, S))`) || [], miss = Object.keys(table).filter((k, i)=>got[i] !== table[k]);
    ok("W1 each way of saying a day becomes the right date (today is Wednesday, Oct 7)", got.length && !miss.length, miss.map(k=>`${k.trim()} -> ${got[Object.keys(table).indexOf(k)]}, not ${table[k]}`).join("; "));
    const junk = T(`["monkey", "+3x", "this week", "soon", "next", "", "2026-13-01", "mon day"].map(v=>relDay(v, S))`);
    ok("W2 anything else isn't a date: no guessing", Array.isArray(junk) && junk.every(x=>x === null), JSON.stringify(junk));
    ok("W3 next week's Friday comes after next week's Monday, so \"from next Monday to next Friday\" is one week", table["next Monday"] < table["next friday"] && got[Object.keys(table).indexOf("next friday")] === "2026-10-16");
    ok("W4 a plan without sprints has no next sprint", T(`relDay("next sprint", {...clone(S), sprints:[]})`) === null);

    // Actions.
    const t1 = T(`(()=>{ const p = P(); const r = RA(p, 'task.add', {id:'task-rel1', bar:${JSON.stringify(bar)}, start:'next Monday', label:'Rel one'}); const f = actTask(p, 'task-rel1'); return [r.ok, f && f.t.start]; })()`);
    ok("A1 task.add takes a start in words", t1 && t1[0] && t1[1] === "2026-10-12", JSON.stringify(t1));
    const t2 = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'task-rel2', bar:${JSON.stringify(bar)}, start:'this saturday', label:'Rel two'}); return actTask(p, 'task-rel2').t.start; })()`);
    ok("A2 a start that falls on a weekend moves to the next working day, as a date does", t2 === "2026-10-12", t2);
    const t3 = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'task-rel3', bar:${JSON.stringify(bar)}, start:'2026-10-08', label:'Rel three'}); const r = RA(p, 'task.move', {id:'task-rel3', start:'+2w'}); return [r.ok, actTask(p, 'task-rel3').t.start]; })()`);
    ok("A3 task.move takes one too", t3 && t3[0] && t3[1] === "2026-10-21", JSON.stringify(t3));
    const bad = T(`RA(P(), 'task.add', {id:'task-rel4', bar:${JSON.stringify(bar)}, start:'whenever', label:'x'})`);
    ok("A4 a start nobody can read is refused, and the reason lists the forms that work", bad && !bad.ok && /next Monday/.test(bad.reason) && /YYYY-MM-DD/.test(bad.reason), bad && bad.reason);
    const ms = T(`(()=>{ const p = P(); const r = RA(p, 'milestone.add', {id:'ms-rel', what:'Pilot review', day:'next friday'}); const m = p.milestones.find(x=>x.id === 'ms-rel'); return [r.ok, m ? dayToIso(isoToDay(p.meta.start) + Math.round(m.at * 7)) : null]; })()`);
    ok("A5 any date works, not just a task's: a milestone on next Friday", ms && ms[0] && ms[1] === "2026-10-16", JSON.stringify(ms));
    const off = T(`(()=>{ const p = P(); const r = RA(p, 'person.timeOff.add', {id:${JSON.stringify(pa)}, from:'next Monday', to:'next friday', note:'Away'}); return [r.ok, r.reason || "", JSON.stringify(p.people.find(x=>x.id === ${JSON.stringify(pa)}))]; })()`);
    ok("A6 time off from next Monday to next Friday is that week", off && off[0] && /2026-10-12/.test(off[2]) && /2026-10-16/.test(off[2]), off && off[1]);
    const raised = T(`(()=>{ const p = P(); p.deliverables = [{id:'dv-r', name:'R', stage:'idea', capture:'request'}]; const r = RA(p, 'outcome.set', {id:'dv-r', field:'raised', value:'yesterday'}); return [r.ok, p.deliverables[0].raised]; })()`);
    ok("A7 a date set on its own (when a capture was raised) takes words too, including the past", raised && raised[0] && raised[1] === "2026-10-06", JSON.stringify(raised));
    const label = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'task-rel5', bar:${JSON.stringify(bar)}, start:'next Monday', label:'tomorrow'}); const f = actTask(p, 'task-rel5'); return f ? [f.t.label, f.t.start] : null; })()`);
    ok("A8 only dates are read as days: a title that says tomorrow stays a title", label && label[0] === "tomorrow" && label[1] === "2026-10-12", JSON.stringify(label));

    // A proposal: the review says which date, and Apply uses it.
    const rv = T(`(()=>{ const r = amCheck({id:'c-rel', ops:[{op:'action', action:'task.add', args:{id:'task-rel6', bar:${JSON.stringify(bar)}, start:'next Monday', label:'From words'}}]}, S);
      const q = P(); if (r.status === 'ready') r.apply(q); const f = actTask(q, 'task-rel6'); return {status:r.status, notes:r.notes, lines:r.lines, start:f && f.t.start}; })()`);
    ok("R1 a proposed task with a start in words is ready, the review says which day it became, and Apply uses that day",
      rv && rv.status === "ready" && rv.notes.some(n=>/"next Monday" is Monday, Oct 12, 2026\./.test(n)) && rv.start === "2026-10-12", JSON.stringify(rv && {s:rv.status, n:rv.notes}));
    ev(`RA(S, 'task.add', {id:'task-base', bar:${JSON.stringify(bar)}, start:'2026-10-08', label:'Base'})`); const tid = "task-base";
    const pv = T(`(()=>{ const r = amCheck({id:'c-rel2', ops:[{op:'set', type:'task', id:${JSON.stringify(tid)}, field:'start', value:'this saturday', prev:'2026-10-08'}]}, S); const q = P(); if (r.status === 'ready') r.apply(q); return {status:r.status, reasons:r.reasons, notes:r.notes, start:actTask(q, ${JSON.stringify(tid)}).t.start}; })()`);
    ok("R2 a plain change to a task's start takes words too, and a weekend becomes the next working day", pv && pv.status === "ready" && pv.start === "2026-10-12" && pv.notes.some(n=>/"this saturday" is Monday, Oct 12, 2026/.test(n)), JSON.stringify(pv));
    const nv = T(`amCheck({id:'c-rel3', ops:[{op:'action', action:'task.add', args:{id:'task-rel7', bar:${JSON.stringify(bar)}, start:'someday', label:'x'}}]}, S)`);
    ok("R3 a proposal with a day nobody can read is invalid, saying what works", nv && nv.status === "invalid" && nv.reasons.some(x=>/next Monday/.test(x)), JSON.stringify(nv && nv.reasons));

    // The sync's offline check of a changes file agrees.
    const py = spawnSync("python3", ["-I", "-c", `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
ok = ['next Monday', '+3d', '2 weeks ago', 'last month', 'this sprint', 'fri', '2026-11-02']; bad = ['monkey', 'whenever', 'this week', '+3x', 'next']
print(json.dumps([[x for x in ok if not m._act_type_ok('iso', x)], [x for x in bad if m._act_type_ok('iso', x)]]))`, SYNC], {encoding:"utf8"});
    let pyr = null; try { pyr = JSON.parse(py.stdout.trim()); } catch(e){}
    ok("P1 the sync's offline check accepts the same words and refuses the same junk", pyr && !pyr[0].length && !pyr[1].length, py.stdout.trim() + py.stderr.slice(-200));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
