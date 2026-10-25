// Refused quick updates are atomic; stable initiative/task amendment ids remain completed.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8');
const checks = [], ok = (name, pass, detail = '')=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
const wait = ms=>new Promise(resolve=>setTimeout(resolve, ms));
(async()=>{
  let dom;
  try {
    dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
      const RD = w.Date, now = new RD(2026, 8, 30, 10).getTime();
      w.Date = class extends RD { constructor(...args){ args.length ? super(...args) : super(now); } static now(){ return now; } };
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>'Tester'; w.alert = ()=>{};
      w.Element.prototype.scrollIntoView = function(){}; w.HTMLAnchorElement.prototype.click = function(){};
      w.URL.createObjectURL = ()=>'blob:test'; w.URL.revokeObjectURL = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})});
      w.CSS = {escape:s=>s}; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message));
    }});
    await wait(150);
    const w = dom.window, ev = code=>w.eval(code); w.FIX = fixture;
    ev(`stopAuto(); window.realRender = render; render = ()=>{}; renderDerived = ()=>{}; assistantScheduleExport = ()=>{};
      whoAmI = (x,cb)=>cb(); askWhoOnStart = ()=>{};
      window.reset = ()=>{ S = normalize(JSON.parse(FIX), false); file.handle = null; file.holdLock = false; file.dirty = false; locked = false; present = false; resetHistory(); changeGen = 0; };
      window.snapshot = ()=>JSON.stringify({S,past,future,changeGen,dirty:file.dirty}); reset();
      S.deliverables = [{id:'dv-limit', name:'Limit', stage:'idea', jira:Array.from({length:DV_MAX_KEYS}, (_,i)=>'ABC-'+(i+1))}];`);
    let before = ev('snapshot()');
    let saved = await ev(`dvEdit('dv-limit', 'One extra link', d=>{ d.jira.push('ABC-999'); })`);
    ok('A1 refusing a 201st Jira link leaves the entire plan, history and dirty generation unchanged', saved === false && before === ev('snapshot()'));
    ok('A2 the link limit explains how to recover', /epics or features/.test(w.document.querySelector('#status').textContent));
    before = ev('snapshot()');
    saved = await ev(`dvSave('No matching deliverable', s=>{ s.people.push({id:'unused-owner', name:'Unused'}); return NOCHANGE; })`);
    ok('A3 a callback returning NOCHANGE cannot leak an added owner', saved === false && before === ev('snapshot()'));
    ev(`reset(); S.deliverables = Array.from({length:DV_MAX}, (_,i)=>({id:'dv-'+i,name:'Delivery '+i,stage:'idea'}));`);
    before = ev('snapshot()'); saved = await ev(`addIdea('One too many')`);
    ok('A4 refusing a 5001st deliverable leaves the live state and undo stack intact', saved === null && before === ev('snapshot()'));
    ev(`reset(); S.deliverables = [{id:'dv-okay', name:'Before', stage:'idea'}];`);
    saved = await ev(`dvEdit('dv-okay', 'Rename', d=>{ d.name = 'After'; })`);
    ok('A5 an accepted browser-only update records one undo step and advances its generation', saved === true && ev(`S.deliverables[0].name === 'After' && past.length === 1 && changeGen > 0`), ev('JSON.stringify({savedName:S.deliverables[0].name,steps:past.length,dirty:file.dirty,changeGen})'));
    ev(`undo();`);
    ok('A6 Undo restores an accepted update', ev(`S.deliverables[0].name === 'Before'`));
    ev(`reset(); S.deliverables = Array.from({length:DV_MAX}, (_,i)=>({id:'dv-'+i,name:'Delivery '+i,stage:'idea'}));
      AM = {hash:'limit', file:{batchId:'limit',source:'Tester',changes:[{id:'batch',summary:'Over limit',ops:[
        {op:'set',type:'deliverable',id:'dv-0',field:'name',prev:'Delivery 0',value:'Must not leak'},
        {op:'propose',key:'ABC-1',field:'points',value:3},
        {op:'add',type:'deliverable',id:'dv-extra',value:{name:'Extra'}}]}]}};`);
    before = ev('snapshot()'); saved = await ev(`amApply(['batch'])`);
    ok('B1 a batch beyond the cap refuses every mutation, including a prior rename and Jira proposal', saved === false && before === ev('snapshot()'));
    ok('B2 a refused amendment has no applied receipt and retains the limit explanation', ev(`!amReceipt('limit',AM.file.changes[0])`) && /5000/.test(w.document.querySelector('#status').textContent));
    ev(`reset(); window.change = {id:'stable',ops:[
      {op:'add',type:'initiative',id:'bar-stable',value:{label:'Initial',lane:S.lanes[0].id,start:S.meta.start,weeks:2}},
      {op:'add',type:'task',id:'task-stable',value:{initiative:'bar-stable',label:'Task',start:S.meta.start,days:2}},
      {op:'set',type:'initiative',id:'bar-stable',field:'label',prev:'Initial',value:'Final'},
      {op:'set',type:'task',id:'task-stable',field:'label',prev:'Task',value:'Final task'}]};
      window.checked = amCheck(change,S);`);
    ok('C1 a composite add initiative, add task and set change is ready', ev(`checked.status === 'ready'`), ev('JSON.stringify(checked.reasons)'));
    ev(`checked.apply(S); rollup(S); reschedule(); window.checkedAgain = amCheck(change,S);`);
    ok('C2 the same composite change is completed after applying, without browser receipts', ev(`checkedAgain.status === 'done'`), ev('JSON.stringify(checkedAgain.reasons)'));
    before = ev('JSON.stringify(S)'); ev(`checkedAgain.apply(S)`);
    ok('C3 replaying a completed change is harmless', before === ev('JSON.stringify(S)'));
    ev(`S.bars.find(b=>b.id==='bar-stable').label='A different initiative';`);
    ok('C4 an id reused with different initiative details stays invalid', ev(`amCheck(change,S).status === 'invalid'`));
    ev(`S.bars.find(b=>b.id==='bar-stable').label='Final'; S.bars.find(b=>b.id==='bar-stable').tasks[0].days=9;`);
    ok('C5 an id reused with different task details stays invalid', ev(`amCheck(change,S).status === 'invalid'`));
    ev(`S.bars.find(b=>b.id==='bar-stable').tasks[0].days=2;
      window.duplicate = clone(change); duplicate.ops.push(clone(duplicate.ops[0]));`);
    ok('C6 duplicate adds in one change are still invalid', ev(`amCheck(duplicate,S).status === 'invalid'`));
    ev(`window.wrongParent = {id:'wrong',ops:[{op:'add',type:'task',id:'task-stable',value:{initiative:S.bars[0].id,label:'Final task',start:S.meta.start,days:2}}]};`);
    ok('C7 an existing task under a different initiative is not treated as completed', ev(`amCheck(wrongParent,S).status === 'invalid'`));
    ev(`AM = {hash:'stable',file:{batchId:'stable',source:'Tester',changes:[change]}}; amMemo = null;`);
    ok('C8 completed add changes appear in the completed group on a fresh browser', ev(`amRows()[0].group === 'completed'`));
    before = ev('snapshot()'); saved = await ev(`amApply(['stable'])`);
    ok('C9 applying an already completed change records a receipt without a plan mutation, not as applied', saved === false && before === ev('snapshot()') && ev(`amReceipt('stable',change) === 'already'`));
    ev(`reset(); window.clearOwners = {id:'clear-owners',ops:[
      {op:'add',type:'initiative',id:'bar-clear',value:{label:'Clear',lane:S.lanes[0].id,start:S.meta.start,weeks:2,owners:[S.people[0].id]}},
      {op:'set',type:'initiative',id:'bar-clear',field:'owners',prev:[S.people[0].id],value:null},
      {op:'add',type:'task',id:'task-clear',value:{initiative:'bar-clear',label:'Clear task',start:S.meta.start,days:2,owners:[S.people[0].id]}},
      {op:'set',type:'task',id:'task-clear',field:'owners',prev:[S.people[0].id],value:null}]};
      window.clearCheck = amCheck(clearOwners,S); clearCheck.apply(S);`);
    ok('C10 clearing initiative and task owners with null remains completed after application', ev(`clearCheck.status === 'ready' && amCheck(clearOwners,S).status === 'done'`));
    ev(`S = normalize(clone(S),false);`);
    ok('C11 cleared owners remain completed after save/load normalization', ev(`amCheck(clearOwners,S).status === 'done'`));
    ev(`reset(); window.duplicateOwners = {id:'duplicates',ops:[{op:'add',type:'initiative',id:'bar-owners',value:{label:'Owners',lane:S.lanes[0].id,start:S.meta.start,weeks:2,owners:[S.people[0].id,S.people[0].id]}}]};
      amCheck(duplicateOwners,S).apply(S); S = normalize(clone(S),false);`);
    ok('C12 duplicate owners canonicalized on load do not make an applied addition invalid', ev(`amCheck(duplicateOwners,S).status === 'done'`));
    ev(`reset(); S.deliverables = [{id:'dv-shared',name:'Shared',stage:'idea',jira:Array.from({length:DV_MAX_KEYS},(_,i)=>'ABC-'+(i+1))}];
      window.HD = {name:'atomic.json',queryPermission:async()=>'granted',requestPermission:async()=>'granted'};
      window.FILE = serialize(S,HD.name); window.writes = 0;
      FileStore.read = async()=>FILE; FileStore.apply = async(hd,expected,text)=>{ if (FILE !== expected) return 'changed'; FILE=text; writes++; return 'ok'; };
      installPlan(parseText(FILE),FILE,HD);`);
    before = ev('FILE'); saved = await ev(`dvEdit('dv-shared','Too many links',d=>{d.jira.push('ABC-999');})`);
    ok('D1 a refused shared-file link update neither writes nor changes the live plan', saved === false && before === ev('FILE') && ev(`writes === 0 && S.deliverables[0].jira.length === DV_MAX_KEYS && !file.dirty && !past.length`));
    ev(`AM = {hash:'shared-composite',file:{batchId:'shared-composite',source:'Tester',changes:[change]}};`);
    saved = await ev(`amApply(['stable'])`);
    ok('D2 an accepted composite amendment saves once through shared quickSave', saved === true && ev(`writes === 1 && JSON.parse(FILE).bars.some(b=>b.id==='bar-stable' && b.label==='Final' && b.tasks.some(t=>t.id==='task-stable' && t.label==='Final task'))`));
    ok('D3 a saved composite amendment is completed after normalization and receipt reset', ev(`amCheck(change,parseText(FILE)).status === 'done'`));
    before = ev('FILE'); saved = await ev(`amApply(['stable'])`);
    ok('D4 repeating a saved composite amendment performs no extra file write', saved === false && before === ev('FILE') && ev('writes === 1'));
    ok('E1 browser script completed without errors', !w.errors.length, w.errors.join('; '));
  } catch(e){ ok('section crashed', false, String(e.stack).slice(0, 1000)); }
  if (dom) dom.window.close();
  console.log(checks.join('\n')); const failed = checks.filter(x=>x.startsWith('FAIL')).length;
  console.log(`${checks.length-failed}/${checks.length} passed`); process.exit(failed ? 1 : 0);
})();
