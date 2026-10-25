// The forecast scheduler (docs/forecast-and-scenarios.md 1.6, 1.7): day by day, dependencies through holders, gates and
// Jira, no finish with a reason, likely and high, capacity waits named, deterministic, cached, fast, and never writing.
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8'), checks = [];
const ok = (name, pass, x='')=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${x ? '  (' + x + ')' : ''}`);
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},50000).unref();
(async()=>{
  const dom = new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB=undefined;w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'Tester';
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});w.Element.prototype.scrollIntoView=()=>{};
    w.CSS={escape:s=>s};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  try {
    await new Promise(r=>setTimeout(r,180)); const w=dom.window, d=w.document, ev=s=>w.eval(s); w.FIX=fixture;
    ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-fc4';
      P.lanes = [{id:'l-data',name:'Data',members:['p-casey']},{id:'l-plat',name:'Platform',members:['p-avery']},{id:'l-q',name:'Queue',members:['p-blake']},{id:'l-empty',name:'Reporting',members:[]}];
      P.people = [{id:'p-casey',name:'Casey'},{id:'p-avery',name:'Avery'},{id:'p-blake',name:'Blake'}];
      P.holidays = [{date:'2026-10-12',name:'Columbus Day'}]; P.gates = []; P.milestones = [];
      const bar = (id, lane, start, eff, deps, x) => ({id, lane, start, span:1, label:id, status:'notstarted', kind:'work', dependsOn:deps || [], ...(eff == null ? {} : {effort:typeof eff === 'number' ? {low:eff, likely:eff, high:eff} : eff}), ...(x || {})});
      P.bars = [bar('A', 'l-data', 0, {low:1, likely:1, high:2}), bar('B', 'l-data', 1, 1, ['A']), bar('J', 'l-plat', 1, 1, [], {jira:'ABC-7'}), bar('P1', 'l-plat', 2, 1)];
      JIRA = {kind:'sightline-jira-status', generatedAt:'2026-10-05T10:00:00Z', sprints:[], releases:[], rollups:{}, issues:{
        'ABC-7':{summary:'Sprint work', status:'In Progress', category:'inprogress', type:'Story', sprintState:'active', sprint:'Sprint 4', sprintStart:'2026-09-28', sprintEnd:'2026-10-09'},
        'ABC-8':{summary:'Parked', status:'To Do', category:'todo', type:'Story', sprintState:'future', sprint:'Later', sprintStart:'2026-09-14', sprintEnd:'2026-09-25'},
        'ABC-9':{summary:'Shipped', status:'Done', category:'done', type:'Story'}}};
      S = normalize(P, false); file.handle = null; resetHistory(); sel = null; dropJiraMemos(); render(); setMe(S.people[0].id);
      window.T = isoToDay('2026-10-05');
      window.mk = (P, id, lane, start, eff, deps, x) => { const b = {...clone(P.bars.find(y=>y.id === 'A')), id, lane, start, label:id, dependsOn:deps || [], parent:'', ...(x || {})};
        if (eff == null) delete b.effort; else b.effort = typeof eff === 'number' ? {low:eff, likely:eff, high:eff} : eff; delete b.added; delete b.edited; P.bars.push(b); return b; };
      window.R = (mod, lv, t) => { const P = clone(planOfRecord(S)); if (mod) mod(P); return forecastRun(lv || 'likely', {plan:P, today:t ? isoToDay(t) : T}); }; })()`);
    const near = (a, b)=>Math.abs(a - b) < 1e-9, day = iso => ev(`isoToDay('${iso}')`), get = (src, id) => ev(`(()=>{ const r = ${src}; return JSON.stringify(r.items['${id}'] || r.holders['${id}'] || null); })()`), it = (src, id) => JSON.parse(get(src, id));
    const base = 'R()';
    ok('S1 an item with no constraints starts on the first day and takes its effort at its person\'s pace: 1 person-week of Casey is a week', it(base, 'A').start === day('2026-10-05') && it(base, 'A').finish === day('2026-10-09'), get(base, 'A'));
    ok('S1 a successor starts the working day after its predecessor finishes, skipping a holiday', it(base, 'B').start === day('2026-10-13') && it(base, 'B').finish === day('2026-10-19'), get(base, 'B'));
    ok('S1 …and says so: it waited for A', it(base, 'B').startEdge.kind === 'dep' && it(base, 'B').startEdge.id === 'A');
    const flip = `R(P=>{ P.bars.find(b=>b.id === 'B').start = 0; P.bars.find(b=>b.id === 'A').start = 3; })`;
    ok('S2 a successor ranked above its predecessor gets the same dates', it(flip, 'B').start === it(base, 'B').start && it(flip, 'B').finish === it(base, 'B').finish && it(flip, 'A').finish === it(base, 'A').finish);
    const hold = `R(P=>{ mk(P, 'H', 'l-q', 0, null); mk(P, 'K1', 'l-q', 0, 0.5, [], {parent:'H'}); mk(P, 'K2', 'l-q', 1, 1, [], {parent:'H'}); mk(P, 'C', 'l-q', 3, 0.5, ['H']); })`;
    ok('S3 a dependency on a holder waits for all of its leaf items', it(hold, 'C').start === ev(`nextWork(${Math.max(it(hold, 'K1').finish, it(hold, 'K2').finish) + 1}, holidaySet(S))`) && it(hold, 'C').startEdge.id === 'K2', get(hold, 'C'));
    ok('S3 a holder finishes when its last item does', it(hold, 'H').finish === it(hold, 'K2').finish);
    const hold2 = `R(P=>{ mk(P, 'H', 'l-q', 0, null, ['A']); mk(P, 'K1', 'l-q', 0, 0.5, [], {parent:'H'}); })`;
    ok('S3 a holder\'s own dependency holds what\'s inside it', it(hold2, 'K1').start === day('2026-10-13'), get(hold2, 'K1'));
    const none = `R(P=>{ mk(P, 'N', 'l-data', 2, null); mk(P, 'N2', 'l-data', 3, 1, ['N']); mk(P, 'L1', 'l-q', 0, 1, ['L2']); mk(P, 'L2', 'l-q', 0, 1, ['L1']); mk(P, 'U', 'l-empty', 0, 1); mk(P, 'U2', 'l-data', 4, 1, ['U']); mk(P, 'U3', 'l-data', 5, 1, ['U2']); })`;
    ok('S4 a dependency on a Not counted item gives no date, and says why', it(none, 'N2').finish === null && /waits for N \(not counted: no effort\)/.test(it(none, 'N2').why.text), get(none, 'N2'));
    ok('S4 items on a loop have no date', it(none, 'L1').finish === null && it(none, 'L1').why.kind === 'loop' && it(none, 'L2').why.kind === 'loop');
    ok('S4 work in a workstream with nobody in it is unstaffed, and what waits for it has no date', /unstaffed: nobody in Reporting/.test(it(none, 'U').why.text) && /waits for U \(unstaffed/.test(it(none, 'U2').why.text) && /waits for U2 \(which has no date\)/.test(it(none, 'U3').why.text), get(none, 'U3'));
    ok('S4 a holder with an item that has no date has no date itself', it(`R(P=>{ mk(P, 'H', 'l-q', 0, null); mk(P, 'K1', 'l-q', 0, 1, [], {parent:'H'}); mk(P, 'K2', 'l-q', 0, null, [], {parent:'H'}); })`, 'H').finish === null);
    const jd = `R(P=>{ mk(P, 'W1', 'l-q', 0, 1, [], {jiraDeps:['ABC-8']}); mk(P, 'W2', 'l-q', 1, 1, [], {jiraDeps:['ABC-404']}); mk(P, 'W3', 'l-q', 2, 1, [], {jiraDeps:['ABC-9']}); mk(P, 'W4', 'l-q', 2, 1, [], {jiraDeps:['ABC-7']}); })`;
    ok('S5 waiting on a Jira issue in a stale future sprint gives no date: waits for ABC-8 (no sprint)', it(jd, 'W1').finish === null && it(jd, 'W1').why.text === 'waits for ABC-8 (no sprint)', get(jd, 'W1'));
    ok('S5 …one missing from the sync says so, one done in Jira has cleared, and one in a sprint clears after it ends', /not in the last sync/.test(it(jd, 'W2').why.text) && it(jd, 'W3').start === day('2026-10-05') && it(jd, 'W4').readyDay === day('2026-10-10') && it(jd, 'W4').startEdge.kind === 'jira', get(jd, 'W4'));
    const mw = `R(P=>{ P.people.find(p=>p.id === 'p-blake').off = [{from:'2026-10-08', to:'2026-10-09', note:''}]; mk(P, 'M0', 'l-q', 0, 0.5); mk(P, 'M1', 'l-q', 1, 0.5, ['M0']); })`;
    ok('S6 someone in only Monday to Wednesday does nothing on an item that becomes ready on Thursday', it(mw, 'M0').finish === day('2026-10-07') && it(mw, 'M1').start === day('2026-10-13'), get(mw, 'M1'));
    const two = `R(P=>{ mk(P, 'A2', 'l-data', 0.5, 1); })`;
    ok('S7 two items sharing one person never use more than that person has: the second waits, and it\'s named', it(two, 'A2').start === day('2026-10-13') && it(two, 'A2').startEdge.kind === 'capacity' && it(two, 'A2').startEdge.ids.includes('A') && it(two, 'B').start === day('2026-10-20'), get(two, 'A2'));
    ok('S7 …and what each person gave adds up to the effort', ev(`(()=>{ const r = ${two}; return ['A', 'A2', 'B'].every(id=>Math.abs(Object.values(r.items[id].people).reduce((a, b)=>a + b, 0) - 1) < 1e-9); })()`) === true);
    ok('S8 a forecast run on a Friday uses no capacity from earlier in that week', it(`R(null, 'likely', '2026-10-09')`, 'A').start === day('2026-10-09') && it(`R(null, 'likely', '2026-10-09')`, 'A').finish === day('2026-10-16'));
    ok('S9 a Fixed item halfway through its sprint spreads its effort over its remaining days only, ahead of Forecast work', it(base, 'J').state === 'fixed' && it(base, 'P1').start === day('2026-10-13') && it(base, 'P1').startEdge.ids.includes('J'), get(base, 'P1'));
    ok('S9 …a Fixed item that can\'t fit its effort says by how much', near(it(`R(P=>{ P.bars.find(b=>b.id === 'J').effort = {low:2, likely:2, high:2}; })`, 'J').overbooked || 0, 1), get(`R(P=>{ P.bars.find(b=>b.id === 'J').effort = {low:2, likely:2, high:2}; })`, 'J'));
    // The raw high run can finish an item earlier: in it, Q takes longer, so X isn't ready in time to take Casey from Y.
    const adv = `P=>{ P.bars = P.bars.filter(b=>!['A', 'B'].includes(b.id)); mk(P, 'Q', 'l-q', 0, {low:0.5, likely:0.5, high:3}); mk(P, 'X', 'l-data', 0, 1, ['Q']); mk(P, 'Y', 'l-data', 1, 2); }`;
    ok('L1 the adversarial plan: the raw high run finishes Y earlier than the likely run', it(`R(${adv}, 'high')`, 'Y').finish < it(`R(${adv})`, 'Y').finish, `${it(`R(${adv}, 'high')`, 'Y').finish} vs ${it(`R(${adv})`, 'Y').finish}`);
    ok('L1 …so the reported high is the likely date, flagged', ev(`(()=>{ const P = clone(S); (${adv})(P); const F = forecastFor({plan:P, today:T}), f = F.finish('Y'); return f.high === f.likely && f.highEarlier; })()`) === true);
    ok('L2 the reported high finish is never earlier than the likely one', ev(`(()=>{ const P = clone(S); mk(P, 'Z', 'l-q', 3, {low:1, likely:2, high:4}, ['A']); const F = forecastFor({plan:P, today:T}); return P.bars.every(b=>{ const f = F.finish(b.id); return f.likely == null || f.high >= f.likely; }) && F.finish('Z').high > F.finish('Z').likely; })()`) === true);
    ok('L3 with every high equal to its likely, the high finish equals the likely finish', ev(`(()=>{ const P = clone(S); P.bars.forEach(b=>{ if (b.effort) b.effort.high = b.effort.likely; }); const F = forecastFor({plan:P, today:T}); return P.bars.every(b=>{ const f = F.finish(b.id); return f.high === f.likely; }); })()`) === true);
    ok('L4 each item says how fast it goes, in person-weeks a week', near(it(base, 'A').rate, 1) && near(it(base, 'B').rate, 1 / (7 / 7)), `${it(base, 'A').rate} ${it(base, 'B').rate}`);
    ok('R1 the same plan and day give the same result, byte for byte', ev(`JSON.stringify(R()) === JSON.stringify(R())`) && ev(`JSON.stringify(forecastRun('likely', {today:T})) === JSON.stringify(forecastRun('likely', {today:T}))`));
    ok('R2 a redraw with no change reuses the result; an edit makes a new one', ev(`(()=>{ const a = forecastFor(); render(); const b = forecastFor(); commit(()=>{ S.bars.find(x=>x.id === 'A').label = 'A again'; }); return a === b && forecastFor() !== a; })()`) === true);
    ok('R3 the forecast never writes the plan', ev(`(()=>{ const t = JSON.stringify(planOfRecord(S)); forecastFor(); R(); ['A', 'B', 'J', 'P1'].forEach(id=>select('bar', id)); render(); return JSON.stringify(planOfRecord(S)) === t; })()`) === true);
    const big = ev(`(()=>{ const P = clone(S); P.people = Array.from({length:40}, (_, i)=>({...clone(S.people[0]), id:'pp' + i, name:'Person ' + i}));
      P.lanes = Array.from({length:8}, (_, i)=>({...clone(S.lanes[0]), id:'ln' + i, name:'Lane ' + i, members:P.people.slice(i * 5, i * 5 + 5).map(p=>p.id)}));
      P.meta.weeks = 260; P.bars = []; for (let i = 0; i < 300; i++) mk(P, 'b' + i, 'ln' + (i % 8), i / 8, {low:2, likely:3, high:5}, i >= 8 && i % 3 ? ['b' + (i - 8)] : []);
      forecastRun('likely', {plan:P, today:T}); const t0 = performance.now(); const r = forecastRun('likely', {plan:P, today:T}); const t1 = performance.now() - t0;
      const t2 = performance.now(); forecastFor({plan:P, today:T}); const t3 = performance.now() - t2; return JSON.stringify({one:t1, all:t3, done:Object.values(r.items).filter(x=>x.finish != null).length}); })()`);
    const bg = JSON.parse(big);
    ok('R4 300 items, 40 people, 5 years: everything gets a date, one run under 150 ms and all three under 500 ms', bg.done === 300 && bg.one < 150 && bg.all < 500, big);
    ev(`select('bar', 'B')`);
    ok('U1 an initiative\'s card shows its forecast dates and why they are what they are', /^Forecast: likely Nov 2 to Nov 6; high finish Nov \d+ \(if everything takes its high estimate\)\. It starts then because waited for A again \(finishes Oct 30\)\. About 1 person-week a week \(Casey\)\.$/.test((d.querySelector('#f-fcast') || {}).textContent || ''), (d.querySelector('#f-fcast') || {}).textContent);
    ev(`commit(()=>{ S.bars.push({...clone(S.bars.find(b=>b.id === 'A')), id:'NC', label:'Unsized work', start:3}); delete S.bars.at(-1).effort; S.bars.find(b=>b.id === 'B').dependsOn = ['A', 'NC']; }); select('bar', 'B')`);
    ok('U2 …and when it has no date, the reason', /^No forecast date: waits for Unsized work \(not counted: no effort\)\.$/.test((d.querySelector('#f-fcast') || {}).textContent || ''), (d.querySelector('#f-fcast') || {}).textContent);
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
