// Forecast inputs (docs/forecast-and-scenarios.md 1.1–1.3, 5): effort on leaf initiatives, the forecast state each one is
// in (computed, never stored), a holder's effort as the sum of what's inside, delivers linking work to what it ships,
// and the file format: forecast1 for older copies, effort merged as one field, delivers merged as a set.
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
    ev(`(()=>{ const P = JSON.parse(FIX); P.meta.planId = 'p-fc';
      P.deliverables = [{id:'dv-a',name:'Faster search',stage:'planned'},{id:'dv-b',name:'Exports',stage:'planned'}];
      P.people = [{id:'p-avery',name:'Avery'},{id:'p-blake',name:'Blake'}];
      P.bars.find(b=>b.id === 'u3').parent = 'u2'; P.bars.find(b=>b.id === 'u4').parent = 'u2'; P.bars.find(b=>b.id === 'u5').parent = 'u2';
      S = normalize(P, false); file.handle = null; resetHistory(); sel = null; render(); setMe(S.people[0].id); })()`);
    const leaf = ev(`S.bars.find(b=>!hasKids(b) && !b.jira && !b.parent && b.status !== 'done' && !S.bars.some(c=>c.parent === b.id)).id`);
    const holder = ev(`S.bars.find(b=>hasKids(b)).id`), kids = JSON.parse(ev(`JSON.stringify(descendantsOf(${JSON.stringify(holder)}).filter(x=>!hasKids(x)).map(x=>x.id))`));
    const L = JSON.stringify(leaf);

    ok('F1 an initiative with no effort is Not counted, never zero', ev(`forecastState(barById(${L}))`) === 'notcounted' && ev(`effortOf(barById(${L}))`) === null);
    ev(`act('initiative.setEffort', {id:${L}, likely:4, low:3, high:6})`);
    ok('F1 with an effort it is Forecast, stamped with today as when it was estimated', ev(`forecastState(barById(${L}))`) === 'forecast' && ev(`JSON.stringify(barById(${L}).effort)`) === JSON.stringify({low:3, likely:4, high:6, at:'2026-10-24'}), ev(`JSON.stringify(barById(${L}).effort)`));
    ev(`act('initiative.setScope', {id:${L}, scope:'out'})`);
    ok('F1 left out on purpose it is Out of scope, and putting it back makes it Forecast again', ev(`forecastState(barById(${L}))`) === 'out' && (ev(`act('initiative.setScope', {id:${L}, scope:'in'})`), ev(`forecastState(barById(${L}))`) === 'forecast' && !ev(`'scope' in barById(${L})`)));
    ok('F1 a done item and a holder have no state of their own', ev(`forecastState({...barById(${L}), status:'done'})`) === null && ev(`forecastState(barById(${JSON.stringify(holder)}))`) === null);
    ok('F1 a Jira-dated leaf is Fixed', ev(`(()=>{ const b = barById(${L}), real = jiraLockOf; jiraLockOf = o => o === b ? {dates:true} : real(o); b.jira = 'ABC-1'; const st = forecastState(b); b.jira = ''; jiraLockOf = real; return st; })()`) === 'fixed');

    ev(`act('initiative.setEffort', {id:${JSON.stringify(kids[0])}, likely:2})`); if (kids[1]) ev(`act('initiative.setEffort', {id:${JSON.stringify(kids[1])}, likely:3, high:5})`);
    const sum = JSON.parse(ev(`JSON.stringify(effortOf(barById(${JSON.stringify(holder)})))`));
    ok('F2 a holder\'s effort is the sum of its leaves, and says how many have none', sum.likely === (kids[1] ? 5 : 2) && sum.high === (kids[1] ? 7 : 2) && sum.missing === Math.max(0, kids.length - 2), JSON.stringify(sum));
    ok('F2 effort can\'t be set on a holder', !ev(`applyAction(planOfRecord(S), 'initiative.setEffort', {id:${JSON.stringify(holder)}, likely:3}).ok`));
    const refuse = a => !ev(`applyAction(planOfRecord(S), 'initiative.setEffort', ${JSON.stringify({id:leaf, ...a})}).ok`);
    ok('F2 effort is refused out of order, off the halves, out of range, or low/high without likely', refuse({likely:4, low:5}) && refuse({likely:4, high:3}) && refuse({likely:4.3}) && refuse({likely:600}) && refuse({low:2}));
    ok('F2 clearing likely clears the effort', ev(`(()=>{ const r = applyAction(planOfRecord(S), 'initiative.setEffort', {id:${L}}); return r.ok && !r.plan.bars.find(b=>b.id === ${L}).effort; })()`) === true);

    ok('F3 normalize keeps a good effort, fills low and high, fixes the order and the halves', ev(`JSON.stringify(normEffort({likely:4.2, high:3}))`) === JSON.stringify({low:4, likely:4, high:4}) && ev(`normEffort({likely:0})`) === null && ev(`normEffort({likely:'x'})`) === null && ev(`normEffort({likely:9999}).likely`) === 520);
    ev(`act('initiative.delivers.add', {id:${L}, outcome:'dv-a'})`);
    ok('F4 delivers links the work to what it ships, both ways', ev(`deliveredBy('dv-a').map(b=>b.id).join()`) === leaf && ev(`deliveredBy('dv-b').length`) === 0);
    ev(`select('deliverable', 'dv-a')`);
    ok('F4 the outcome card lists what delivers it', /Delivered by/.test((d.querySelector('#f-dvby') || {}).textContent || '') && d.querySelectorAll('#f-dvby .lchip').length === 1);
    ev(`select('deliverable', 'dv-b')`);
    ok('F4 …and says Not forecast when nothing does', !!d.querySelector('#f-dvnotforecast'));
    ok('F4 a reference to an outcome that\'s gone is kept, so undo or a merge can bring it back', ev(`normalize({...planOfRecord(S), bars:planOfRecord(S).bars.map(b=>b.id === ${L} ? {...b, delivers:['dv-gone','dv-a']} : b)}, false).bars.find(b=>b.id === ${L}).delivers.join()`) === 'dv-gone,dv-a');
    ev(`select('bar', ${L})`);
    ok('F5 the card shows the effort fields, the state, and Delivers', !!d.querySelector('#f-elikely') && d.querySelector('#f-elikely').value === '4' && /Forecast/.test(d.querySelector('#f-fstate').textContent) && !!d.querySelector('#f-delivers'));
    ev(`select('bar', ${JSON.stringify(holder)})`);
    ok('F5 a holder\'s card shows the sum, with no inputs', /person-weeks? likely/.test((d.querySelector('#f-effortsum') || {}).textContent || '') && !d.querySelector('#f-elikely'), (d.querySelector('#f-effortsum') || {}).textContent);
    ok('F5 a review line says the unit', ev(`actLine('initiative.setEffort', {id:${L}, likely:4, low:3, high:6}, S)`).includes('4 person-weeks of work left (3 to 6)'));

    ok('F6 a plan with forecast inputs names forecast1, which this copy knows', ev(`featuresIn(S).includes('forecast1') && KNOWN_FEATURES.includes('forecast1')`) === true && ev(`featuresIn(normalize(JSON.parse(FIX), false)).includes('forecast1')`) === false);
    ok('F6 an older copy opens it read-only', ev(`(()=>{ const p = JSON.parse(serialize(planOfRecord(S), 'p.json')); const known = KNOWN_FEATURES.slice(); KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf('forecast1'), 1); const t = tooNew(p); KNOWN_FEATURES.splice(0, KNOWN_FEATURES.length, ...known); return !!t && t.unknown.includes('forecast1'); })()`) === true);
    ok('F6 JSON and YAML keep effort, scope and delivers', ev(`(()=>{ const b0 = barById(${L}); b0.scope = 'out'; const ok = ['p.json','p.yaml'].every(n=>{ const b = parseText(serialize(planOfRecord(S), n)).bars.find(x=>x.id === ${L}); return JSON.stringify(b.effort) === JSON.stringify(b0.effort) && b.scope === 'out' && b.delivers.join() === 'dv-a'; }); delete b0.scope; return ok; })()`) === true);
    ok('F7 two people linking different outcomes to one initiative keeps both', ev(`(()=>{ const base = planOfRecord(S), mine = clone(base), theirs = clone(base);
      mine.bars.find(b=>b.id === ${L}).delivers.push('dv-b'); theirs.bars.find(b=>b.id === ${L}).delivers = [];
      theirs.bars.find(b=>b.id === ${L}).delivers.push('dv-a', 'dv-c'); const m = mergePlans(base, mine, theirs), P = m.plan || m;
      return [...P.bars.find(b=>b.id === ${L}).delivers].sort().join(); })()`) === 'dv-a,dv-b,dv-c');
    ok('F7 an effort is one field: the newer whole estimate wins, never a mix', ev(`(()=>{ const base = planOfRecord(S), mine = clone(base), theirs = clone(base);
      theirs.bars.find(b=>b.id === ${L}).effort = {low:8, likely:9, high:10, at:'2026-10-24'}; const m = mergePlans(base, mine, theirs), P = m.plan || m;
      return JSON.stringify(P.bars.find(b=>b.id === ${L}).effort); })()`) === JSON.stringify({low:8, likely:9, high:10, at:'2026-10-24'}));
    ok('F8 the assistant guide names the forecast actions', /initiative\.setEffort/.test(ev('assistantView().guide')));
    ok('F9 drawing never writes the plan', ev(`(()=>{ const a = JSON.stringify(planOfRecord(S)); render(); select('bar', ${L}); select('deliverable', 'dv-a'); return JSON.stringify(planOfRecord(S)) === a; })()`) === true);
    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
