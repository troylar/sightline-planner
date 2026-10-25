// The critical chain, load and bottleneck (docs/forecast-and-scenarios.md 1.7): the walk back through dependencies,
// capacity waits and slow-downs, strictly back in time; load per workstream; the bottleneck; and the card's sentences.
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
    ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-fc5';
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
    const near = (a, b)=>Math.abs(a - b) < 1e-9, J = s => JSON.parse(ev(`JSON.stringify(${s})`));
    const CH = (mod, id) => J(`(()=>{ const P = clone(planOfRecord(S)); (${mod || 'P=>{}'})(P); const r = forecastRun('likely', {plan:P, today:T}); return criticalChain(r, '${id}'); })()`);
    const ids = c => c.links.map(l=>l.id).join(' ');
    const dep = CH(null, 'B');
    ok('C1 a chain through a dependency: B waited for A, which started on the first day', ids(dep) === 'B A' && dep.links[0].via === 'start' && dep.links[0].edge.kind === 'dep' && dep.stop.kind === 'first', JSON.stringify(dep));
    const two = `P=>{ mk(P, 'A2', 'l-data', 0.5, 1); }`, cap = CH(two, 'A2');
    ok('C2 a capacity wait: A2 waited 5 working days while Casey was on A, and the walk goes to A', ids(cap) === 'A2 A' && cap.links[0].edge.kind === 'capacity' && cap.links[0].late === 5 && cap.stop.kind === 'first', JSON.stringify(cap.links[0]));
    // Three people in one workstream, crew of two: A slows B; C, which depends on B, then slows A.
    const tri = `P=>{ P.holidays = []; P.lanes[0].members = ['p-casey', 'p-avery', 'p-blake']; P.lanes[1].members = []; P.lanes[2].members = []; P.bars = [];
      mk(P, 'C', 'l-data', 0, 2, ['B']); mk(P, 'A', 'l-data', 1, 4); mk(P, 'B', 'l-data', 2, 1); }`, ring = CH(tri, 'A');
    ok('C3 slow-downs in turn (A slows B, then C, which depends on B, slows A): the chain is A, C, B, A and stops at the first day', ids(ring) === 'A C B A' && ring.links[0].via === 'slow' && ring.links[1].via === 'start' && ring.links[2].via === 'slow' && ring.stop.kind === 'first', JSON.stringify(ring.links.map(l=>[l.id, l.via, l.seg, l.at])));
    ok('C3 …each step\'s segment ends before the one after it starts, so time only goes back', ring.links.slice(1).every((l, i)=>l.seg[1] < ring.links[i].at), JSON.stringify(ring.links.map(l=>[l.seg, l.at])));
    ok('C3 …and the slow-down is counted in days: C took the people A could have had for 5 days', ring.links[0].slowDays === 5 && ring.links[0].slowedBy.join() === 'C', JSON.stringify(ring.links[0]));
    const tie = `P=>{ P.holidays = []; P.lanes[0].members = ['p-casey', 'p-avery']; P.lanes[1].members = []; P.bars = []; mk(P, 'H1', 'l-data', 0, 0.2); mk(P, 'H2', 'l-data', 1, 0.2); mk(P, 'W', 'l-data', 2, 0.4); }`, tc = CH(tie, 'W');
    ok('C4 two items holding the people on the same day are listed together, and the walk goes on through one of them, by id', tc.links[0].edge.kind === 'capacity' && tc.links[0].edge.ids.join() === 'H1,H2' && tc.links[1].id === 'H1', JSON.stringify(tc));
    const hold = CH(`P=>{ mk(P, 'H', 'l-q', 0, null); mk(P, 'K1', 'l-q', 0, 0.5, [], {parent:'H'}); mk(P, 'K2', 'l-q', 1, 1, [], {parent:'H'}); }`, 'H');
    ok('C5 a holder\'s chain starts at its last item', hold.end === 'K2' && hold.links[0].edge.kind === 'capacity', JSON.stringify(hold));
    const fx = CH(null, 'P1');
    ok('C6 a chain that reaches a Fixed item stops there', ids(fx) === 'P1 J' && fx.stop.kind === 'fixed', JSON.stringify(fx));
    ok('C7 an item with no date has no chain', CH(`P=>{ mk(P, 'U', 'l-empty', 0, 1); }`, 'U').links.length === 0);
    const LD = (mod, to) => J(`(()=>{ const P = clone(planOfRecord(S)); (${mod || 'P=>{}'})(P); const r = forecastRun('likely', {plan:P, today:T}); return forecastLoad(r, 'l-data', r.first, isoToDay('${to}')); })()`);
    const l1 = LD(null, '2026-10-19');
    ok('D1 load over a stretch: Casey\'s 10 working days are 2 person-weeks of capacity, and A and B used all of it', near(l1.capacity, 2) && near(l1.used, 2) && near(l1.backlog, 0) && near(l1.load, 1) && l1.people.join() === 'p-casey', JSON.stringify(l1));
    const l2 = LD(two, '2026-10-09');
    ok('D2 work that was ready and waiting at the end counts as backlog: demand 2 on capacity 1, load 2.0', near(l2.capacity, 1) && near(l2.used, 1) && near(l2.backlog, 1) && near(l2.load, 2), JSON.stringify(l2));
    ok('D3 work not yet ready by the end isn\'t backlog', near(LD(null, '2026-10-09').backlog, 0), JSON.stringify(LD(null, '2026-10-09')));
    const BN = (mod, id) => J(`(()=>{ const P = clone(planOfRecord(S)); (${mod || 'P=>{}'})(P); const r = forecastRun('likely', {plan:P, today:T}); return forecastBottleneck(r, criticalChain(r, '${id}'), x=>r.items[x].lane); })()`);
    const b1 = BN(two, 'A2');
    ok('E1 the bottleneck is the workstream whose waits add the most days to the chain, with its people', b1.lane === 'l-data' && b1.by === 'chain' && b1.days === 5 && b1.people.join() === 'p-casey', JSON.stringify(b1));
    const b2 = BN(null, 'B');
    ok('E2 with no waits for people on the chain, it\'s the workstream with the highest load', b2.by === 'load' && b2.lane === 'l-data' && near(b2.load, 1), JSON.stringify(b2));
    ok('E3 the run is still the same byte for byte, pools included', ev(`JSON.stringify(R()) === JSON.stringify(R())`) && J(`Object.keys(R().pools)`).join() === 'l-data,l-plat,l-q,l-empty');
    ok('E4 each workstream\'s days add up: what Casey had is what A and B used, and nothing was short', ev(`(()=>{ const r = R(), p = r.pools['l-data'], sum = a => a.reduce((t, x)=>t + x, 0); return Math.abs(sum(p.used) - 2) < 1e-9 && Math.abs(sum(p.short)) < 1e-9 && sum(p.cap) >= 2 - 1e-9; })()`) === true, J(`(()=>{ const p = R().pools['l-data'], sum = a => a.reduce((t, x)=>t + x, 0); return [sum(p.used), sum(p.short), sum(p.cap)]; })()`).join());
    ev(`select('bar', 'B')`);
    const why = () => [...d.querySelectorAll('#f-chain li')].map(x=>x.textContent);
    ok('U1 an initiative\'s card says why it finishes then, step by step', why().length === 2 && why()[0] === 'B (Nov 2 to Nov 6): started then because it waited for A (finishes Oct 30).' && why()[1] === 'A (Oct 26 to Oct 30): started as soon as it could.', JSON.stringify(why()));
    ok('U1 …and names the busiest workstream when nobody waited for people', /^Nobody on this chain waited for people\. The busiest workstream is Data \(Casey\): demand 1\.0 × capacity, Oct 26 to Nov 6\.$/.test((d.querySelector('#f-bottleneck') || {}).textContent || ''), (d.querySelector('#f-bottleneck') || {}).textContent);
    ev(`commit(()=>{ mk(S, 'A2', 'l-data', 0.5, 1); S.bars.at(-1).label = 'Schema cleanup'; }); select('bar', 'A2')`);
    ok('U2 a capacity wait names the work that held the people, and the bottleneck names the workstream and its people', why()[0] === 'Schema cleanup (Nov 2 to Nov 6): started then because its people were on A, Oct 26 to Oct 30.' && /^Most of the waiting on this chain is for Data \(Casey\): 5 working days\.$/.test((d.querySelector('#f-bottleneck') || {}).textContent || ''), JSON.stringify(why()) + ' ' + (d.querySelector('#f-bottleneck') || {}).textContent);
    ev(`select('bar', 'A')`);
    ok('U3 an item that starts on the first day with nothing in its way has no chain to show', !d.querySelector('#f-chain'));
    ok('U4 showing the chain never writes the plan', ev(`(()=>{ const t = JSON.stringify(planOfRecord(S)); ['A', 'A2', 'B', 'J', 'P1'].forEach(id=>select('bar', id)); render(); return JSON.stringify(planOfRecord(S)) === t; })()`) === true);
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
