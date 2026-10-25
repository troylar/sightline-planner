// Capacity, Forecast (docs/forecast-and-scenarios.md 1.8, 6): the summary, the items table, the critical chain, load by
// workstream with its weekly chart, the incomplete and empty states, and that drawing it never writes the plan.
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
    ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-fc7';
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
    const q = s => d.querySelector(s), txt = s => (q(s) || {}).textContent || '';
    d.querySelector('#tab-people').click(); ev('render()');
    ok('V1 the Capacity workspace has a Forecast section', !!q('#sec-forecast') && !q('#ws-people').hidden && !!q('#fcSummary'), txt('#forecastWs').slice(0, 200));
    ok('V1 …whose summary names the scope, the items, the effort range and the likely and high finish', /^Everything \(4 items, 4 to 5 person-weeks\): likely [A-Z][a-z]{2} \d+, 2026, high [A-Z][a-z]{2} \d+, 2026 \(if everything takes its high estimate\)\.$/.test(txt('#fcSummary')), txt('#fcSummary'));
    const rows = () => [...d.querySelectorAll('#fcItems tbody tr')];
    ok('V2 every item is in the table, soonest finish first', rows().length === 4 && rows()[0].dataset.fc === 'A', rows().map(r=>r.dataset.fc).join());
    const rB = rows().find(r=>r.dataset.fc === 'B');
    ok('V2 …with its workstream, effort, dates and why', rB && rB.cells[1].textContent === 'Data' && rB.cells[2].textContent === '1' && rB.cells[3].textContent === 'Nov 2' && rB.cells[4].textContent === 'Nov 6' && rB.cells[6].textContent === 'waited for A (finishes Oct 30)', rB && [...rB.cells].map(c=>c.textContent).join(' | '));
    ok('V2 …and an effort range shows low to high', rows().find(r=>r.dataset.fc === 'A').cells[2].textContent === '1 (1–2)');
    rB.querySelector('button').click();
    ok('V3 clicking an initiative opens it on the timeline', ev('sel && sel.type === "bar" && sel.id') === 'B' && ev('UI.ws') === 'timeline');
    d.querySelector('#tab-people').click();
    ok('V4 the critical chain to the last finish is listed', d.querySelectorAll('#fcChain li').length >= 1 && !!q('#fcBottleneck'), txt('#fcChain') + ' / ' + txt('#fcBottleneck'));
    const ld = q('#fcLoad tr[data-lane="l-data"]');
    ok('V5 each workstream with work has a load row: its people, capacity, demand and load', ld && ld.cells[0].textContent === 'Data (Casey)' && /person-week/.test(ld.cells[1].textContent) && /^\d+\.\d ×$/.test(ld.cells[3].textContent), ld && [...ld.cells].map(c=>c.textContent).join(' | '));
    ok('V5 …and a weekly chart: work as bars, and the line of what the people have', ld && ld.querySelectorAll('svg rect').length > 0 && !!ld.querySelector('svg polyline') && !!ld.querySelector('svg pattern'));
    ok('V5 a workstream with nobody and nothing in it has no row', !q('#fcLoad tr[data-lane="l-empty"]'));
    const settle = () => new Promise(r=>setTimeout(r, 250));
    ev(`commit(()=>{ mk(S, 'A2', 'l-data', 0.5, 3); mk(S, 'A3', 'l-data', 0.6, 3); })`); await settle();
    ok('V5 the chain\'s waiting for one workstream counts each working day once', /^Most of the waiting on this chain is for Data \(Casey\): (\d+) working days\.$/.test(txt('#fcBottleneck')) && +txt('#fcBottleneck').match(/(\d+) working/)[1] <= ev(`(()=>{ const r = forecastFor().runs.likely; let n = 0; for (let x = r.first; x <= r.end; x++) if (isWork(x, holidaySet(S))) n++; return n; })()`), txt('#fcBottleneck'));
    ev(`commit(()=>{ mk(S, 'NC', 'l-data', 3, null); S.bars.at(-1).label = 'Unsized work'; })`); await settle();
    ok('V6 with an item that has no finish, the summary says incomplete, why, and claims no date for everything', /^Everything: incomplete\. The 6 items with a date finish .+ \(likely\)\. 1 item has no finish: 1 not counted \(no effort\)\. No finish date is claimed for everything\.$/.test(txt('#fcSummary')) && q('#fcSummary').classList.contains('incomplete'), txt('#fcSummary'));
    ok('V6 …and the item is in the table with no date and its reason', (r=>r && r.cells[4].textContent === 'no date' && r.cells[6].textContent === 'not counted: no effort')(rows().find(r=>r.dataset.fc === 'NC')));
    ok('V7 drawing the forecast never writes the plan', ev(`(()=>{ const t = JSON.stringify(planOfRecord(S)); render(); renderForecastWs(); return JSON.stringify(planOfRecord(S)) === t; })()`) === true);
    ev(`commit(()=>{ S.bars.forEach(b=>{ delete b.effort; }); })`); await settle();
    ok('V8 with no effort anywhere, it says how to start', !!q('#fcEmpty') && !q('#fcItems'), txt('#forecastWs'));
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
