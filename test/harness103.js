// Shared-file polls update their local check indicator without rebuilding the app or assistant context.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, '..', 'dist', 'sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-plan.json'), 'utf8');
const checks = [];
const ok = (label, pass, detail = '') => checks.push(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ': ' + detail : ''}`);
const wait = ms => new Promise(resolve=>setTimeout(resolve, ms));
function handle(name, text = ''){
  const hd = {name, text, writes:0, reads:0,
    async queryPermission(){ return 'granted'; }, async requestPermission(){ return 'granted'; },
    async getFile(){ hd.reads++; return {size:Buffer.byteLength(hd.text), text:async()=>hd.text}; },
    async createWritable(){ let next = ''; return {async write(value){ next = value; }, async abort(){}, async close(){ hd.text = next; hd.writes++; }}; }};
  return hd;
}
function folder(){
  const dir = {name:'Private test assistant', files:new Map(),
    async queryPermission(){ return 'granted'; }, async requestPermission(){ return 'granted'; },
    async getFileHandle(name, options = {}){
      if (!dir.files.has(name)){ if (!options.create){ const e = new Error('Missing'); e.name = 'NotFoundError'; throw e; } dir.files.set(name, handle(name)); }
      return dir.files.get(name);
    }};
  return dir;
}
(async()=>{
  let dom;
  try {
    dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
      const RealDate = w.Date; w.CLOCK_NOW = new RealDate(2026, 9, 8, 10).getTime();
      w.Date = class extends RealDate { constructor(...args){ args.length ? super(...args) : super(w.CLOCK_NOW); } static now(){ return w.CLOCK_NOW; } };
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>'Tester'; w.alert = ()=>{};
      w.showOpenFilePicker = async()=>[]; w.showDirectoryPicker = async()=>w.DIR;
      w.Element.prototype.scrollIntoView = function(){}; w.HTMLAnchorElement.prototype.click = function(){};
      w.URL.createObjectURL = ()=>'blob:test'; w.URL.revokeObjectURL = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>({font:'', measureText:t=>({width:String(t).length * 7})});
      w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errors = []; w.addEventListener('error', e=>w.errors.push(e.message));
    }});
    await wait(200);
    const w = dom.window, d = w.document, ev = code=>w.eval(code), dir = folder(), plan = handle('sync-check.json');
    w.FIX = fixture; w.DIR = dir; w.PLAN = plan;
    ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); S.meta.revision = 10;
      S.deliverables = [{id:'dv-sync-check', name:'Initial delivery', stage:'idea'}];
      PLAN.text = serialize(S, PLAN.name); installPlan(S, PLAN.text, PLAN); amTried = S.meta.planId; render();
      window.remembered = new Map(); kvSet = async(k,v)=>{ remembered.set(k,v); return true; }; kvGet = async k=>remembered.get(k); kvDel = async k=>{ remembered.delete(k); return true; };
      whoAmI = (x,cb)=>cb(); askWhoOnStart = ()=>{}; download = ()=>{};`);
    await ev('assistantConnect()'); await wait(260); await ev('assistantExportChain');
    const context = dir.files.get('sightline-assistant-view.json'), results = dir.files.get('sightline-assistant-results.json');
    ok('S0 connected shared-file baseline has both assistant outputs', !!context && !!results && ev('file.handle === PLAN'));
    if (!context || !results) throw new Error('Missing baseline outputs');
    const baseline = {context:context.writes, results:results.writes, check:ev('file.lastCheck'), indicator:d.querySelector('#fileCheck')?.textContent};
    ev(`window.fullRenders = 0; window.contextBuilds = 0;
      const measuredRender = render; render = (...args)=>{ fullRenders++; return measuredRender(...args); };
      const measuredPayloads = assistantPayloads; assistantPayloads = (...args)=>{ contextBuilds++; return measuredPayloads(...args); };`);
    for (let i = 0; i < 3; i++){ w.CLOCK_NOW += 60000; await ev('refresh(false)'); }
    await wait(260); await ev('assistantExportChain');
    ok('S1 unchanged shared-file checks perform no full renders or assistant reconstruction', ev('fullRenders') === 0 && ev('contextBuilds') === 0, ev('JSON.stringify({fullRenders, contextBuilds})'));
    ok('S2 unchanged checks perform no assistant output writes', context.writes === baseline.context && results.writes === baseline.results);
    ok('S3 last local check state and visible indicator advance', ev('file.lastCheck') === w.CLOCK_NOW && ev('file.lastCheck') > baseline.check && d.querySelector('#fileCheck')?.textContent !== baseline.indicator && /local file checked/.test(d.querySelector('#fileCheck')?.textContent || ''));
    w.CLOCK_NOW += 60000;
    const arrived = JSON.parse(plan.text); arrived.meta.revision = 11; arrived.deliverables[0].name = 'Teammate delivery update'; plan.text = JSON.stringify(arrived);
    await ev('refresh(false)'); await wait(260); await ev('assistantExportChain');
    ok('S4 an arriving shared update renders and builds assistant context exactly once', ev('fullRenders') === 1 && ev('contextBuilds') === 1, ev('JSON.stringify({fullRenders, contextBuilds})'));
    const exportedContext = JSON.parse(context.text), exportedResults = JSON.parse(results.text);
    ok('S5 arriving update writes each output once with the new confirmed values', context.writes === baseline.context + 1 && results.writes === baseline.results + 1 && exportedContext.plan.revision === 11 && exportedResults.planRevision === 11 && exportedContext.deliverables[0].name === 'Teammate delivery update');
    w.CLOCK_NOW += 60000; await ev('refresh(false)'); await wait(260); await ev('assistantExportChain');
    ok('S6 next unchanged check stays cheap and preserves the updated context', ev('fullRenders') === 1 && ev('contextBuilds') === 1 && context.writes === baseline.context + 1 && results.writes === baseline.results + 1 && ev('file.lastCheck') === w.CLOCK_NOW && plan.writes === 0 && !w.errors.length, w.errors.join(';'));
  } catch(e){ ok('section crashed', false, String(e.stack).slice(0, 700)); }
  if (dom) dom.window.close();
  console.log(checks.join('\n')); const fail = checks.filter(c=>c.startsWith('FAIL')).length;
  console.log(`${checks.length - fail}/${checks.length} passed`); process.exit(fail ? 1 : 0);
})();
