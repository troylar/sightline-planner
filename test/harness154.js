// Dates from what a task waits for: task.add takes after (the tasks it starts after) instead of, or as well as, a start,
// and starts the working day after the last of them finishes (weekends, holidays and its owners' time off skipped).
// A length can be marked a guess (rough), saved, drawn and counted. The card offers the day a task could start after
// what it waits for. The sync's offline check agrees. Fixed clock (Wed Oct 7, 2026); the sample plan. Names are invented.
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
  const $ = s => w.document.querySelector(s);
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX); p.holidays = [{date:"2026-10-19", name:"Day off"}];
        S = normalize(p, false); render(); window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const bar = J("S.bars.find(b=>!b.jira && !(b.epics || []).length && !S.bars.some(k=>k.parent === b.id)).id"), pa = J("S.people[0].id"), pb = J("S.people[1].id");
    const B = JSON.stringify(bar);
    // A chain, with no start after the first: R-01 Thu Oct 8 for 3 working days (Oct 8, 9, 12), so R-02 starts Tue Oct 13.
    const chain = T(`(()=>{ const p = P(); const o = [];
      o.push(RA(p, 'task.add', {id:'r01', bar:${B}, start:'2026-10-08', days:3, label:'R-01', owners:[${JSON.stringify(pa)}]}));
      o.push(RA(p, 'task.add', {id:'r02', bar:${B}, after:['r01'], days:2, label:'R-02', owners:[${JSON.stringify(pa)}]}));
      o.push(RA(p, 'task.add', {id:'r03', bar:${B}, after:['r02'], days:1, label:'R-03', owners:[${JSON.stringify(pa)}]}));
      const g = id => actTask(p, id).t; return {ok:o.map(r=>r.ok), r02:g('r02').start, r03:g('r03').start, deps:g('r03').dependsOn}; })()`);
    ok("A1 a task added with after and no start begins the working day after what it waits for finishes", chain && chain.ok.every(Boolean) && chain.r02 === "2026-10-13", JSON.stringify(chain));
    ok("A2 a chain follows on, skipping a holiday (R-02 ends Wed Oct 14; Mon Oct 19 is off... R-03 starts Thu Oct 15)", chain && chain.r03 === "2026-10-15", chain && chain.r03);
    ok("A3 after is stored as what it waits for (the same links the card shows), not a second list", chain && JSON.stringify(chain.deps) === '["r02"]');
    const many = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'a1', bar:${B}, start:'2026-10-08', days:1, label:'A'}); RA(p, 'task.add', {id:'a2', bar:${B}, start:'2026-10-08', days:5, label:'B'});
      RA(p, 'task.add', {id:'a3', bar:${B}, after:['a1', 'a2'], label:'C'}); return actTask(p, 'a3').t.start; })()`);
    ok("A4 with several, it waits for the last to finish (B ends Wed Oct 14, so Thu Oct 15)", many === "2026-10-15", many);
    const hol = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'h1', bar:${B}, start:'2026-10-14', days:3, label:'H'}); RA(p, 'task.add', {id:'h2', bar:${B}, after:['h1'], label:'After H'}); return actTask(p, 'h2').t.start; })()`);
    ok("A5 the next working day skips a weekend and a holiday (ends Fri Oct 16; Mon Oct 19 is off, so Tue Oct 20)", hol === "2026-10-20", hol);
    const off = T(`(()=>{ const p = P(); p.people.find(x=>x.id === ${JSON.stringify(pb)}).off = [{from:'2026-10-13', to:'2026-10-14', note:''}];
      RA(p, 'task.add', {id:'o1', bar:${B}, start:'2026-10-08', days:3, label:'O', owners:[${JSON.stringify(pa)}]}); RA(p, 'task.add', {id:'o2', bar:${B}, after:['o1'], label:'Away', owners:[${JSON.stringify(pb)}]}); return actTask(p, 'o2').t.start; })()`);
    ok("A6 and its owner's time off (they're away Oct 13-14, so Thu Oct 15)", off === "2026-10-15", off);
    const both = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'b1', bar:${B}, start:'2026-10-08', days:3, label:'B1'});
      RA(p, 'task.add', {id:'b2', bar:${B}, start:'2026-10-08', after:['b1'], label:'early'}); RA(p, 'task.add', {id:'b3', bar:${B}, start:'2026-10-26', after:['b1'], label:'late'});
      return [actTask(p, 'b2').t.start, actTask(p, 'b3').t.start]; })()`);
    ok("A7 given both, the later wins: a start before what it waits for moves after it; a later start stays", both && both[0] === "2026-10-13" && both[1] === "2026-10-26", JSON.stringify(both));
    const refuse = T(`(()=>{ const p = P(); return [RA(p, 'task.add', {id:'x1', bar:${B}, label:'none'}).reason, RA(p, 'task.add', {id:'x2', bar:${B}, after:[], label:'empty'}).reason,
      RA(p, 'task.add', {id:'x3', bar:${B}, after:['nope'], label:'missing'}).reason, RA(p, 'task.add', {id:'x4', bar:${B}, after:['x4'], label:'self'}).reason]; })()`);
    ok("A8 refused: no start and no after, an empty after, one that isn't in the plan, and itself", Array.isArray(refuse) && /start, or after/.test(refuse[0]) && /after lists/.test(refuse[1]) && /nope/.test(refuse[2]) && /itself/.test(refuse[3]), JSON.stringify(refuse));
    const r8 = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'g1', bar:${B}, start:'2026-10-08', days:4, rough:true, label:'Guess'}); RA(p, 'task.add', {id:'g2', bar:${B}, start:'2026-10-08', label:'Known'}); return [actTask(p, 'g1').t.rough, 'rough' in actTask(p, 'g2').t, RA(p, 'task.add', {id:'g3', bar:${B}, start:'2026-10-08', rough:'yes', label:'x'}).ok]; })()`);
    ok("G1 rough: true marks a length as a guess; leaving it out saves nothing; it has to be true or false", r8 && r8[0] === true && r8[1] === false && r8[2] === false, JSON.stringify(r8));

    // A proposal: the review says what it starts after, and Apply places it.
    const rv = T(`(()=>{ const r = amCheck({id:'c-deps', ops:[{op:'action', action:'task.add', args:{id:'tp1', bar:${B}, start:'2026-10-08', days:2, label:'First'}}, {op:'action', action:'task.add', args:{id:'tp2', bar:${B}, after:['tp1'], days:3, rough:true, label:'Second'}}]}, S);
      const q = P(); if (r.status === 'ready') r.apply(q); const f = actTask(q, 'tp2'); return {status:r.status, reasons:r.reasons, text:JSON.stringify(r.lines || r), start:f && f.t.start, rough:f && f.t.rough}; })()`);
    ok("R1 a proposal adding tasks in order, each after the last, is ready and Apply places them", rv && rv.status === "ready" && rv.start === "2026-10-12" && rv.rough === true, JSON.stringify(rv && {s:rv.status, r:rv.reasons, st:rv.start}));
    ok("R2 the review says what it starts after and that the length is a guess", rv && /starting after \\"First\\"/.test(rv.text) && /length is a guess/.test(rv.text), rv && rv.text.slice(0, 300));

    // Saved: a field older copies don't know opens the plan read-only there.
    const feat = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'tf1', bar:${B}, start:'2026-10-08', rough:true, label:'F'}); return [featuresIn(p).includes('rough1'), KNOWN_FEATURES.includes('rough1'), featuresIn(P()).includes('rough1')]; })()`);
    ok("F1 a plan with a guessed length says so in its features, and this copy knows it", feat && feat.join() === "true,true,false", JSON.stringify(feat));
    const rt = T(`(()=>{ const p = P(); RA(p, 'task.add', {id:'tf2', bar:${B}, start:'2026-10-08', rough:true, label:'F'}); RA(p, 'task.add', {id:'tf3', bar:${B}, start:'2026-10-08', label:'G'}); const n = normalize(JSON.parse(JSON.stringify(p)), false); const g = id => n.bars.flatMap(b=>b.tasks).find(t=>t.id === id); return [g('tf2').rough, 'rough' in g('tf3'), normalize({...JSON.parse(JSON.stringify(p)), bars:p.bars.map(b=>({...b, tasks:b.tasks.map(t=>t.id === 'tf3' ? {...t, rough:'yes'} : t)}))}, false).bars.flatMap(b=>b.tasks).find(t=>t.id === 'tf3').rough === undefined]; })()`);
    ok("F2 it survives a save and reopen; anything but true is dropped", rt && rt[0] === true && rt[1] === false && rt[2] === true, JSON.stringify(rt));

    // The card.
    ev(`commit(s=>{ const b = s.bars.find(x=>x.id === ${B}); b.tasks.push({id:'k1', label:'Base', start:'2026-10-08', days:3, owners:[], jira:'', status:'notstarted'}, {id:'k2', label:'Waits', start:'2026-10-26', days:2, owners:[], jira:'', status:'notstarted', dependsOn:['k1']}); }); select("task", "k2");`); await wait(30);
    let hint = $("#f-tafter");
    ok("C1 a task that starts later than it could names the day, what it waits for, and when it's set for now", hint && hint.textContent.startsWith('Could start Tue, Oct 13, the working day after "Base" finishes. It\'s set for Oct 26 now.') && $("#f-tafterGo")?.textContent === "Start Oct 13", hint && hint.textContent);
    ok("C1b the card says it moves later on its own, never earlier", /Moves later on its own/.test($("#f-tmoves")?.textContent || ""), $("#f-tmoves")?.textContent);
    $("#f-tafterGo")?.click(); await wait(30);
    ok("C2 Start then moves it there", T(`taskById('k2').t.start`) === "2026-10-13" && !$("#f-tafter"), T(`taskById('k2').t.start`));
    ev(`commit(s=>{ const b = s.bars.find(x=>x.id === ${B}); b.tasks.push({id:'k3', label:'Overdue', start:'2026-10-01', days:2, owners:[], jira:'', status:'inprogress'}, {id:'k4', label:'After overdue', start:'2026-10-20', days:1, owners:[], jira:'', status:'notstarted', dependsOn:['k3']}); }); select("task", "k4");`); await wait(30);
    hint = $("#f-tafter");
    ok("C9 when what it waits for is late and not done, no earlier day is offered; it says why", hint && hint.textContent === '"Overdue" is late, so this can\'t start until it\'s done.' && !$("#f-tafterGo"), hint && hint.textContent);
    ev(`commit(s=>{ taskById('k3').t.status = 'done'; }); select("task", "k4");`); await wait(30);
    ok("C10 once it's done, the earlier day is offered again", /^Could start Mon, Oct 5/.test($("#f-tafter")?.textContent || "") && !!$("#f-tafterGo"), $("#f-tafter")?.textContent);
    ev(`S.meta.autoSchedule = false; commit(s=>{ taskById('k1').t.days = 6; }); select("task", "k2");`); await wait(30); hint = $("#f-tafter");
    ok("C7 with automatic moving off, a task that now starts before what it waits for finishes is flagged, with the earliest day", hint && hint.classList.contains("bad") && hint.textContent.startsWith('Starts before "Base" finishes. The earliest it can start is Fri, Oct 16.') && /Automatic moving is off/.test($("#f-tmoves")?.textContent || ""), hint && hint.textContent);
    ev(`setZoom("days", ${B}); render();`); await wait(50);
    const k2t = () => [...w.document.querySelectorAll('[data-sel="task:k2"]')].map(e=>e.textContent).join(" | ");
    ok("D2 its bar on the Days view says too early (on the bar, or beside it when its name doesn't fit)", /too early/.test(k2t()), k2t());
    ev(`select("task", "k2");`); await wait(30); $("#f-tafterGo")?.click(); await wait(30);
    ok("C8 its Start link moves it there, and the flag goes", T(`taskById('k2').t.start`) === "2026-10-16" && !$("#f-tafter") && !/too early/.test(k2t()), T(`taskById('k2').t.start`));
    ev(`S.meta.autoSchedule = true;`);
    const cb = $("#f-trough");
    ok("C3 the card has Length is a guess, unchecked", cb && !cb.checked && /Length is a guess/.test(cb.closest("label").textContent));
    cb.checked = true; cb.dispatchEvent(new w.Event("change")); await wait(30);
    ok("C4 checking it saves the guess and keeps focus", T(`taskById('k2').t.rough`) === true && w.document.activeElement?.id === "f-trough");
    ev(`select("bar", ${B});`); await wait(30);
    ok("C5 the initiative counts its guessed lengths", /1 with a guessed length/.test($("#f-rough")?.textContent || ""), $("#f-rough")?.textContent);
    ev(`setZoom("days", ${B}); render();`); await wait(50);
    const tb = $('.tbar[data-sel="task:k2"]');
    ok("D1 on the Days view a guessed length is hatched and says guess in words, on the bar or beside it", tb && tb.classList.contains("rough") && /guess/.test(k2t()) && /a guess/.test(tb.getAttribute("aria-label")), k2t());
    ev(`select("task", "k2");`); await wait(30); const cb2 = $("#f-trough"); cb2.checked = false; cb2.dispatchEvent(new w.Event("change")); await wait(30);
    ok("C6 unchecking takes the flag off the task entirely", T(`'rough' in taskById('k2').t`) === false);

    // The sync's offline check agrees.
    const py = spawnSync("python3", ["-I", "-c", `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
ids = {"bar": {"b1"}, "task": {"t0"}}
def chk(args): return m.check_action_op({"op": "action", "action": "task.add", "args": args}, "ops[0]", ids, {})
print(json.dumps([chk({"id": "t1", "bar": "b1", "after": ["t0"], "rough": True, "label": "x"}), chk({"id": "t2", "bar": "b1", "label": "x"}), chk({"id": "t3", "bar": "b1", "after": ["zz"]}), chk({"id": "t4", "bar": "b1", "start": "2026-10-08", "rough": "yes"}), chk({"id": "t5", "bar": "b1", "after": ["t5"]})]))`, SYNC], {encoding:"utf8"});
    let pyr = null; try { pyr = JSON.parse(py.stdout.trim()); } catch(e){}
    ok("P1 the sync's offline check accepts after and rough, and refuses the same things", pyr && pyr[0] === "" && /start, or after/.test(pyr[1]) && /zz/.test(pyr[2]) && /rough/.test(pyr[3]) && /itself/.test(pyr[4]), py.stdout.trim() + py.stderr.slice(-300));
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
