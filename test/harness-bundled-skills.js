// The distributed HTML deploys exact skill assets without source files or a network.
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const html=fs.readFileSync(process.env.SIGHTLINE_HTML||path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const checks=[],ok=(name,pass,detail='')=>checks.push(`${pass?'PASS':'FAIL'} ${name}${detail?': '+detail:''}`),wait=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},30000).unref();
function missing(){const e=new Error('Missing');e.name='NotFoundError';return e;}
function folder(root,prefix=''){
  root=root||{writes:[],files:new Map(),dirs:new Set(),permission:'granted',fail:''};
  return {root,name:'Assistant skills',async queryPermission(){return root.permission;},async requestPermission(){return root.permission;},
    async getDirectoryHandle(name,opt={}){const key=prefix+name+'/';if(!root.dirs.has(key)){if(!opt.create)throw missing();root.dirs.add(key);}return folder(root,key);},
    async getFileHandle(name,opt={}){const key=prefix+name;if(!root.files.has(key)){if(!opt.create)throw missing();root.files.set(key,'');}
      return {async getFile(){const text=root.files.get(key);return {size:Buffer.byteLength(text),text:async()=>text};},async createWritable(){let draft='';return {async write(text){if(root.fail===key)throw new Error('Simulated write failure');draft=text;},async close(){root.files.set(key,draft);root.writes.push(key);},async abort(){}};}};}};
}
(async()=>{
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
  const D=w.Date;w.Date=class extends D{constructor(...a){a.length?super(...a):super('2026-10-07T14:00:00Z');}static now(){return D.parse('2026-10-07T14:00:00Z');}};
  w.indexedDB=undefined;w.confirm=()=>true;w.prompt=()=>'Synthetic';w.alert=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.Element.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*7})});w.CSS=w.CSS||{};w.CSS.escape=s=>s;
  w.URL.createObjectURL=()=>'blob:skills';w.URL.revokeObjectURL=()=>{};
 }});
 const w=dom.window,d=w.document,ev=s=>w.eval(s);await wait(180);
 try{
  const available=ev("typeof openPlanningSkills==='function'&&typeof installPlanningSkills==='function'");ok('source-free deployment is available',available);if(!available)throw new Error('Build has no embedded skill deployment');
  const bundle=JSON.parse(ev('JSON.stringify(BUNDLED_SKILLS)')),names=fs.readdirSync(path.join(__dirname,'../skills')).sort();
  ok('bundle version matches the app',bundle.version===ev('APP_VERSION'));
  ok('every current skill is bundled',JSON.stringify(bundle.files.map(x=>x.name).sort())===JSON.stringify(names));
  ok('skill text matches source bytes',bundle.files.every(x=>x.text===fs.readFileSync(path.join(__dirname,'../skills',x.name,'SKILL.md'),'utf8')));
  ok('license matches source',bundle.license===fs.readFileSync(path.join(__dirname,'../LICENSE'),'utf8'));
  const read=spawnSync('python3',['-c',"import sys,io,zipfile,json;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({n:z.read(n).decode('utf8') for n in z.namelist()}))"],{input:Buffer.from(bundle.archive,'base64'),encoding:'utf8'});
  ok('independent reader opens the ZIP',read.status===0,read.stderr);const zip=JSON.parse(read.stdout);
  ok('ZIP includes exact skills and license',Object.keys(zip).length===names.length+1&&bundle.files.every(x=>zip[x.path]===x.text)&&zip.LICENSE===bundle.license);
  ev("window.DOWNLOADS=[];download=(bytes,name,type)=>{DOWNLOADS.push({bytes:Array.from(bytes),name,type});return true;};sel={type:'amend',id:'x'};render();window.PLAN_BEFORE=JSON.stringify(S);");
  const entry=d.querySelector('#assistantSkills');ok('assistant exposes skill deployment',!!entry);entry.focus();entry.click();
  ok('dialog lists names and version',d.querySelector('#dlgSkills').textContent.includes(bundle.version)&&bundle.files.every(x=>d.querySelector('#dlgSkills').textContent.includes(x.name)));
  ok('download gets focus',d.activeElement.id==='skillsDownload');ok('ZIP works without folder APIs',d.querySelector('#skillsInstall').hidden&&!d.querySelector('#skillsDownload').disabled);
  d.querySelector('#skillsDownload').click();const download=JSON.parse(ev('JSON.stringify(DOWNLOADS[0])'));
  ok('download uses exact archive and versioned name',download.name===`sightline-skills-${bundle.version}.zip`&&download.type==='application/zip'&&Buffer.from(download.bytes).equals(Buffer.from(bundle.archive,'base64')));
  d.querySelector('#skillsClose').click();ok('close restores focus',d.activeElement===entry);
  const description=ev('BUNDLED_SKILLS.files[0].description');ev('BUNDLED_SKILLS.files[0].description="<img src=x onerror=alert(1)>";');entry.click();
  ok('descriptions remain inert text',!d.querySelector('#dlgSkills img')&&d.querySelector('#dlgSkills').textContent.includes('<img src=x'));w.DESCRIPTION=description;ev('BUNDLED_SKILLS.files[0].description=DESCRIPTION;');d.querySelector('#skillsClose').click();
  const target=folder();target.root.files.set('plan.json','KEEP PLAN');target.root.files.set('sightline-amendments.json','KEEP PROPOSALS');w.TARGET=target;
  let result=await ev('installPlanningSkills(TARGET)');ok('install writes skills plus license',result.installed===names.length+1&&result.skills===names.length&&target.root.writes.length===names.length+1);
  ok('installed text is exact',bundle.files.every(x=>target.root.files.get(x.path)===x.text));ok('unrelated files are preserved',target.root.files.get('plan.json')==='KEEP PLAN'&&target.root.files.get('sightline-amendments.json')==='KEEP PROPOSALS');
  const writes=target.root.writes.length;result=await ev('installPlanningSkills(TARGET)');ok('identical reinstall makes no writes',result.installed===0&&result.unchanged===names.length+1&&target.root.writes.length===writes);
  const conflict=folder();conflict.root.dirs.add(bundle.files.at(-1).name+'/');conflict.root.files.set(bundle.files.at(-1).path,'CUSTOM SKILL');w.TARGET=conflict;let error;
  try{await ev('installPlanningSkills(TARGET)');}catch(e){error=e;}ok('all targets are checked before any write',!!error&&error.installed===0&&!conflict.root.writes.length);ok('custom skill remains intact',conflict.root.files.get(bundle.files.at(-1).path)==='CUSTOM SKILL');
  const interrupted=folder();interrupted.root.fail=bundle.files[1].path;w.TARGET=interrupted;error=null;try{await ev('installPlanningSkills(TARGET)');}catch(e){error=e;}
  ok('interruption reports confirmed completion',!!error&&error.installed===1&&error.total===names.length+1);ok('interruption preserves completed data and stops later writes',interrupted.root.files.get(bundle.files[0].path)===bundle.files[0].text&&!interrupted.root.files.has(bundle.files[2].path));
  const denied=folder();denied.root.permission='denied';w.TARGET=denied;error=null;try{await ev('installPlanningSkills(TARGET)');}catch(e){error=e;}ok('permission denial makes no writes',!!error&&!denied.root.writes.length&&!denied.root.files.size);
  w.showDirectoryPicker=async()=>{const e=new Error('Canceled');e.name='AbortError';throw e;};entry.click();d.querySelector('#skillsInstall').click();await wait(10);ok('picker cancellation recovers',/canceled/.test(d.querySelector('#skillsStatus').textContent)&&!d.querySelector('#skillsInstall').disabled&&!d.querySelector('#skillsClose').disabled);d.querySelector('#skillsClose').click();
  const chosen=folder();let picked=0;w.showDirectoryPicker=async opt=>{picked++;w.PICKER_OPTIONS=opt;return chosen;};entry.click();d.querySelector('#skillsInstall').click();for(let n=0;n<100&&ev('skillsInstalling');n++)await wait(5);
  ok('button uses explicit folder selection',picked===1&&chosen.root.writes.length===names.length+1&&w.PICKER_OPTIONS.id==='sightline-skills'&&w.PICKER_OPTIONS.mode==='readwrite');ok('completion is announced',d.querySelector('#skillsStatus').textContent.includes(names.length+' skills ready'));d.querySelector('#skillsClose').click();
  let releasePicker;w.showDirectoryPicker=()=>new Promise(resolve=>{releasePicker=resolve;});entry.click();d.querySelector('#skillsInstall').click();const cancel=new w.Event('cancel',{cancelable:true});d.querySelector('#dlgSkills').dispatchEvent(cancel);ok('busy install disables repeat actions and defers Escape',cancel.defaultPrevented&&d.querySelector('#skillsInstall').disabled&&d.querySelector('#skillsClose').disabled);releasePicker(folder());for(let n=0;n<100&&ev('skillsInstalling');n++)await wait(5);d.querySelector('#skillsClose').click();
  ok('deployment leaves the plan unchanged',ev('JSON.stringify(S)===PLAN_BEFORE'));ev("UI.ws='plan';UI.planTab='guide';render();");ok('Planning guide also offers deployment',!!d.querySelector('#pgSkills'));
 }catch(e){ok('deployment checks complete',false,e.stack?.slice(0,600)||String(e));}finally{dom.window.close();}
 console.log(checks.join('\n'));const failed=checks.filter(x=>x.startsWith('FAIL')).length;console.log(`${checks.length-failed}/${checks.length} passed`);process.exit(failed?1:0);
})();
