// Chart drags go through commit: the finished drag is stamped and refused when it lands in a blacked-out time.
// Each check fails on the build before this, where a drag pushed history and marked the plan dirty directly.
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8'), checks = [];
const ok = (name, pass, x='')=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}${x ? '  (' + x + ')' : ''}`);
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},45000).unref();
(async()=>{
  const dom = new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB=undefined;w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'';
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});w.Element.prototype.scrollIntoView=()=>{};
    w.Element.prototype.setPointerCapture=()=>{};w.document.elementFromPoint=()=>null;
    w.CSS={escape:s=>s};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  try {
    await new Promise(r=>setTimeout(r,180)); const w=dom.window, ev=s=>w.eval(s);w.FIX=fixture;
    const fresh = ()=>ev(`S=normalize(JSON.parse(FIX),false);S.meta.planId='p-drag';
      S.people=[{id:'p-avery',name:'Avery',days:5,off:[]}];setMe('p-avery');
      barById('m1').tasks=[{id:'task-one',label:'Task',start:'2026-09-22',days:2,status:'notstarted',owners:[],dependsOn:[],jiraDeps:[]}];
      file.handle=null;past=[];future=[];sel=null;render();`);
    const fake = (sel)=>`{button:0, pointerId:1, preventDefault(){}, stopPropagation(){}, currentTarget:document.querySelector('${sel}'), clientX:0, clientY:0}`;
    const barDrag = (id, start)=>{ ev(`startDrag(${fake(`#gantt .bar[data-key="bar:${id}"]`)}, "bar", "${id}", "move")`);
      ev(`barById("${id}").start = ${start}; drag.moved = true; onUp({clientX:0, clientY:0})`); };

    fresh();
    barDrag('m5', 9);
    ok('a dragged bar keeps its new start', ev('barById("m5").start') === 9, ev('barById("m5").start'));
    ok('a dragged bar is stamped as edited by the person', ev('barById("m5").edited && barById("m5").edited.by') === 'p-avery', ev('JSON.stringify(barById("m5").edited)'));
    ok('one Undo puts the drag back', (ev('undo()'), ev('barById("m5").start')) === 8);

    fresh();
    ev(`S.lanes.find(l=>l.id==='int').until = dayToIso(wkDay(9) + 4); render()`);
    barDrag('m5', 10);
    ok('a bar dragged past its workstream\'s end is refused', ev('barById("m5").start') === 8, ev('barById("m5").start'));
    ok('and says why', /blacked out/.test(ev('document.querySelector("#status").textContent')), ev('document.querySelector("#status").textContent'));

    fresh();
    ev(`startDrag(${fake('#gantt .ms[data-key="ms:ms1"], #gantt [data-key="ms:ms1"]')}, "ms", "ms1", "move")`);
    const msStarted = ev('drag !== null');
    if (msStarted) ev(`S.milestones.find(m=>m.id==='ms1').at = 2.7; drag.moved = true; onUp({clientX:0, clientY:0})`);
    ok('a dragged milestone is stamped as edited', msStarted && ev(`(S.milestones.find(m=>m.id==='ms1').edited || {}).by`) === 'p-avery', String(msStarted));

    fresh();
    ev(`tdrag = {tid:'task-one', mode:'move', x0:0, y0:0, colW:10, orig:{start:'2026-09-22', days:2}, snapshot:JSON.stringify(S), el:document.createElement('div'), moved:true};
      taskById('task-one').t.start = '2026-09-24'; onTaskUp({})`);
    ok('a dragged task keeps its new start', ev(`taskById('task-one').t.start`) === '2026-09-24');
    ok('a dragged task is stamped as edited', ev(`(taskById('task-one').t.edited || {}).by`) === 'p-avery', ev(`JSON.stringify(taskById('task-one').t.edited)`));

    fresh();
    ev(`S.lanes.find(l=>l.id==='int').until = '2026-09-25'; render();
      tdrag = {tid:'task-one', mode:'move', x0:0, y0:0, colW:10, orig:{start:'2026-09-22', days:2}, snapshot:JSON.stringify(S), el:document.createElement('div'), moved:true};
      taskById('task-one').t.start = '2026-09-30'; onTaskUp({})`);
    ok('a task dragged past its workstream\'s end is refused', ev(`taskById('task-one').t.start`) === '2026-09-22', ev(`taskById('task-one').t.start`));

    ok('no runtime errors', ev('window.errors.length') === 0, ev('window.errors.join(" | ")'));
  } catch(e){ ok('harness ran', false, e && e.message); }
  console.log(checks.join('\n')); const f = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`\n${checks.length - f}/${checks.length} passed`); process.exit(f ? 1 : 0);
})();
