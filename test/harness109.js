// Browser conversations use private file mailboxes; the companion replies and people review all plan changes.
const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'..','dist','sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures','sample-plan.json'),'utf8');
const checks=[], ok=(name,pass,detail='')=>checks.push(`${pass?'PASS':'FAIL'} ${name}${detail?': '+detail:''}`);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},40000).unref();
function file(name,text=''){
  const hd={name,text,writes:0,permission:'granted',beforeClose:null,
    async queryPermission(){return hd.permission;},async requestPermission(){return hd.permission;},
    async getFile(){const saved=hd.text;return {size:Buffer.byteLength(saved),text:async()=>saved};},
    async createWritable(){let next='';return {async write(t){next=t;},async abort(){},async close(){if(hd.beforeClose)await hd.beforeClose();hd.text=next;hd.writes++;}};}};
  return hd;
}
function directory(){
  const dir={name:'Private test assistant',files:new Map(),permission:'granted',onGet:null,
    async queryPermission(){return dir.permission;},async requestPermission(){return dir.permission;},
    async getFileHandle(name,opts={}){if(dir.onGet)await dir.onGet(name);if(!dir.files.has(name)){if(!opts.create){const e=new Error('Missing');e.name='NotFoundError';throw e;}dir.files.set(name,file(name));}return dir.files.get(name);}};
  return dir;
}
async function page(){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const RealDate=w.Date;w.CLOCK_NOW=new RealDate('2026-10-10T14:00:00Z').getTime();w.Date=class extends RealDate{constructor(...args){args.length?super(...args):super(w.CLOCK_NOW);}static now(){return w.CLOCK_NOW;}};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.indexedDB=undefined;w.confirm=()=>true;w.prompt=()=>'Tester';w.alert=()=>{};w.showOpenFilePicker=async()=>[];w.showDirectoryPicker=async()=>w.DIR;
    w.Element.prototype.scrollIntoView=function(){};w.HTMLAnchorElement.prototype.click=function(){};w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:t=>({width:String(t).length*7})});w.CSS=w.CSS||{};w.CSS.escape=s=>s;
    w.networkCalls=0;w.fetch=async()=>{w.networkCalls++;throw new Error('Browser must not contact endpoint');};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  await wait(180);const w=dom.window,d=w.document,ev=code=>w.eval(code),dir=directory();w.FIX=fixture;w.DIR=dir;
  ev(`S=normalize(JSON.parse(FIX),false);S.meta.revision=7;S.deliverables=[{id:'dv-chat',name:'Initial delivery',stage:'idea'}];S.planningGuide=[{id:'purpose',text:'Make answers diagnosable'}];
    file.handle=null;locked=false;resetHistory();setMe(S.people[0].id);UI.noWelcome=true;amTried=S.meta.planId;
    kvSet=async()=>true;kvGet=async()=>null;kvDel=async()=>true;whoAmI=(x,cb)=>cb();askWhoOnStart=()=>{};download=()=>{};sel={type:'amend',id:'x'};render();`);
  return {dom,w,d,ev,dir};
}
function draft(p,text){const el=p.d.querySelector('#chatDraft');if(!el)throw new Error('Missing conversation composer');el.value=text;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));return el;}
function request(p){return JSON.parse(p.dir.files.get('sightline-chat-request.json').text);}
function response(req,extra={}){return {kind:'sightline-chat-response',version:1,planId:req.planId,requestId:req.requestId,conversationId:req.conversationId,planRevision:req.planRevision,jiraSyncedAt:req.jiraSyncedAt,status:'ok',message:'Do you mean retrieval diagnostics or logging across services?',...extra};}
function reply(p,data){p.dir.files.set('sightline-chat-response.json',file('sightline-chat-response.json',typeof data==='string'?data:JSON.stringify(data)));}
function amendments(req,name='Improved delivery'){return {kind:'sightline-amendments',version:1,planId:req.planId,batchId:'chat-'+req.requestId,createdAt:'2026-10-10T14:00:00Z',source:'Company assistant',basedOn:{planRevision:req.planRevision},changes:[{id:'rename-chat',summary:'Clarify the delivery name',ops:[{op:'set',type:'deliverable',id:'dv-chat',field:'name',prev:'Initial delivery',value:name}]}]};}
async function connect(p){await p.ev('assistantConnect()');p.ev("sel={type:'amend',id:'x'};render();");}
async function send(p,text='We want to improve logging'){draft(p,text);await p.ev('chatSend()');return request(p);}
(async()=>{
  const pages=[];
  const section=async fn=>{try{const p=await page();pages.push(p);await fn(p);}catch(e){ok('section completed',false,String(e.stack).slice(0,500));}};
  const initial=await page();pages.push(initial);
  ok('endpoint conversation feature available',initial.ev("typeof chatSend==='function' && typeof chatPoll==='function'"));
  if(initial.ev("typeof chatSend==='function' && typeof chatPoll==='function'")){
    await section(async p=>{const {ev}=p;await connect(p);
      ev("S.deliverables.push({id:'dv-second',name:'Second delivery',stage:'planned',target:'2027-Q2'});changeGen++;openPlanningAssistant({kind:'deliverable',id:'dv-chat'});");
      let req=await send(p,'What is missing here?');reply(p,response(req,{message:'The owner is missing.'}));await ev('chatPoll()');
      ev("openPlanningAssistant({kind:'deliverable',id:'dv-second'});");req=await send(p,'Compare this with the outcome we just discussed.');
      let first=req.messages.findIndex(m=>m.content==='What is missing here?');
      ok('cross-outcome follow-up retains the earlier selected stable id',first>0&&req.messages[first-1].content.includes('dv-chat'));
      ok('cross-outcome follow-up keeps its current selection distinct',req.messages.at(-2).content.includes('dv-second')&&req.messages.at(-1).content==='Compare this with the outcome we just discussed.');
      reply(p,response(req));await ev('chatPoll()');
      ev("openPlanningAssistant({kind:'roadmap',quarters:['2027-Q3','2027-Q4','2028-Q1','2028-Q2']});");req=await send(p,'Review these quarters.');reply(p,response(req));await ev('chatPoll()');
      ev("S.deliverables=S.deliverables.filter(d=>d.id!=='dv-chat');changeGen++;openPlanningAssistant({kind:'deliverable',id:'dv-second'});");req=await send(p,'Explain the current outcome.');
      const quarter=req.messages.findIndex(m=>m.content==='Review these quarters.');
      ok('past quarter selection survives switching back to an outcome',quarter>0&&req.messages[quarter-1].content.includes('2028-Q2'));
      ok('a removed historical outcome does not block a valid current question',req.messages.some(m=>m.content.includes('dv-chat'))&&req.messages.at(-1).content==='Explain the current outcome.');
      reply(p,response(req));await ev('chatPoll()');
      for(let i=0;i<9;i++){req=await send(p,'Recent question '+i);reply(p,response(req,{message:'Recent answer '+i}));await ev('chatPoll()');}
      ok('expanded selection history remains within the companion message limits',req.messages.length<=20&&req.messages.every(m=>m.content.length<=4000));
      const complete=req.messages.every((m,i)=>!m.content.startsWith('Planning selection')||(req.messages[i+1]?.role==='user'&&!req.messages[i+1].content.startsWith('Planning selection')));
      ok('history trimming retains complete recent turns rather than detached context',req.messages[0].content.startsWith('Planning selection')&&complete&&!req.messages.some(m=>m.content==='What is missing here?'));
    });
    await section(async p=>{const {d,ev,w}=p;
      w.INBOX=file('changes.json',JSON.stringify({kind:'sightline-amendments',version:1,planId:ev('S.meta.planId'),batchId:'reconnect-file',basedOn:{planRevision:7},changes:[]}));w.INBOX.permission='prompt';w.filePermissions=0;w.folderPickers=0;
      w.INBOX.requestPermission=async()=>{w.filePermissions++;w.INBOX.permission='granted';return 'granted';};w.showDirectoryPicker=async()=>{w.folderPickers++;return w.DIR;};
      ev("AM={handle:INBOX,name:INBOX.name,paused:true};render();");const label=d.querySelector('#chatConnection').textContent;d.querySelector('#chatReconnect').click();
      for(let i=0;i<50&&ev('AM.paused');i++)await wait(5);
      ok('paused individual-file connection is labeled as a file',label==='File access paused');
      ok('top Reconnect requests permission for the original individual file',w.filePermissions===1&&w.folderPickers===0&&ev('AM.handle===INBOX&&!AM.dir&&!AM.paused'));
    });
    await section(async p=>{const {d,ev,w}=p;await connect(p);const dir=w.DIR;dir.permission='prompt';w.folderPermissions=0;w.folderPickers=0;
      dir.requestPermission=async()=>{w.folderPermissions++;dir.permission='granted';return 'granted';};w.showDirectoryPicker=async()=>{w.folderPickers++;return dir;};
      ev('AM.paused=true;render();');d.querySelector('#chatReconnect').click();for(let i=0;i<50&&ev('AM.paused');i++)await wait(5);
      ok('top Reconnect retains the original private folder connection',w.folderPermissions===1&&w.folderPickers===0&&ev('AM.dir===DIR&&!AM.paused'));
    });
    await section(async p=>{const {d,ev,dir}=p;await connect(p);
      ev("openPlanningAssistant({kind:'roadmap',quarters:['2027-Q1','2027-Q2','2027-Q3','2027-Q4']});");
      const notes='Quarter one: improve onboarding. Quarter two: make search easier.';draft(p,notes);await ev('chatSend()');let req=request(p);
      ok('one message carries roadmap notes with the selected quarters',req.messages.at(-1).content===notes&&req.messages.at(-2).content.includes('2027-Q4')&&req.messages.at(-2).content.includes('Planning selection'));
      ok('selection context does not alter the exported saved plan',req.contextText===dir.files.get('sightline-assistant-view.json').text&&!JSON.parse(req.contextText).selection);
      reply(p,response(req));await ev('chatPoll()');
      ev("openPlanningAssistant({kind:'deliverable',id:'dv-chat'});");draft(p,'Clarify the customer outcome');await ev('chatSend()');req=request(p);
      ok('item request carries the stable id separately from the written question',req.messages.at(-1).content==='Clarify the customer outcome'&&req.messages.at(-2).content.includes('dv-chat'));
      ok('conversation records the readable scope of the sent question',d.querySelector('#chatTranscript').textContent.includes('Initial delivery'));
      reply(p,response(req));await ev('chatPoll()');
      const longQuestion='x'.repeat(4000);draft(p,longQuestion);await ev('chatSend()');req=request(p);
      ok('selection context preserves the full 4000-character message allowance',req.messages.at(-1).content===longQuestion&&req.messages.length<=20&&req.messages.every(m=>m.content.length<=4000));
    });
    await section(async p=>{const {ev,d,dir}=p;await connect(p);
      ev("openPlanningAssistant({kind:'deliverable',id:'dv-chat'});S.deliverables=[];changeGen++;render();");draft(p,'Change this outcome');await ev('chatSend()');
      ok('a removed selected outcome refuses the request and retains the question',!dir.files.has('sightline-chat-request.json')&&d.querySelector('#chatDraft').value==='Change this outcome'&&/selected outcome/.test(ev('chatState().error')));
    });
    await section(async p=>{const {d,ev,dir}=p;await connect(p);draft(p,'My unfinished roadmap question');const before=ev('JSON.stringify(S)');
      d.querySelector('#chatTest').click();
      for(let i=0;i<50&&(ev('chatState().sending')||!dir.files.has('sightline-chat-request.json'));i++)await wait(5);
      const req=request(p);
      ok('Test reply sends a bounded connection question while preserving draft',req.messages.at(-1).content.startsWith('Connection check:')&&d.querySelector('#chatDraft').value==='My unfinished roadmap question');
      ok('test request uses the same saved context and identity checks',req.contextText===dir.files.get('sightline-assistant-view.json').text&&req.planRevision===7);
      reply(p,response(req,{message:'Test reply for the synthetic plan.',amendments:amendments(req)}));await ev('chatPoll()');
      ok('test confirms a matching reply without permitting embedded amendments',d.querySelector('#chatStatus').textContent.includes('Test reply received')&&!d.querySelector('#chatReview')&&!ev('chatState().response.data.amendments'));
      ok('test neither changes plan nor clears the unfinished question',ev('JSON.stringify(S)')===before&&d.querySelector('#chatDraft').value==='My unfinished roadmap question');
      ok('test never writes external amendments',!dir.files.has('sightline-amendments.json'));
    });
    await section(async p=>{const {d,ev}=p;await connect(p);await ev('chatSend(true)');let req=request(p);
      reply(p,response(req,{status:'error',message:'Synthetic test failure'}));await ev('chatPoll()');d.querySelector('#chatRetry').click();
      for(let i=0;i<50&&(ev('chatState().sending')||request(p).requestId===req.requestId);i++)await wait(5);
      req=request(p);reply(p,response(req,{amendments:amendments(req)}));await ev('chatPoll()');
      ok('retrying a connection test still ignores amendments',!d.querySelector('#chatReview')&&!ev('chatState().response.data.amendments')&&d.querySelector('#chatDraft').value==='');
    });
    await section(async p=>{const {d,ev,dir,w}=p;
      ok('unconnected assistant explains local companion without endpoint secrets',!!d.querySelector('#assistantChat') && !d.querySelector('input[type=password]'));
      await connect(p);const before=ev('JSON.stringify(S)'),field=draft(p,'We want to improve logging');field.focus();field.setSelectionRange(3,7);ev('render();');
      ok('conversation draft and selection survive redraw',d.querySelector('#chatDraft').value==='We want to improve logging'&&d.activeElement.id==='chatDraft'&&d.activeElement.selectionStart===3&&d.activeElement.selectionEnd===7);
      ev("sel=null;setWs('timeline');sel={type:'amend',id:'x'};render();");
      ok('conversation draft survives navigation',d.querySelector('#chatDraft').value==='We want to improve logging');
      d.querySelector('#chatSend').focus();d.querySelector('#chatSend').click();
      for(let i=0;i<50&&(ev('chatState().sending')||!dir.files.has('sightline-chat-request.json'));i++)await wait(5);
      const req=request(p),context=dir.files.get('sightline-assistant-view.json');
      ok('Send button returns keyboard focus to the composer',d.activeElement.id==='chatDraft');
      ok('Send writes a real request with the exact exported context',req.kind==='sightline-chat-request'&&req.version===1&&req.contextText===context.text&&req.messages.at(-1).content==='We want to improve logging');
      ok('request contains stable plan and request identities',req.planId===ev('S.meta.planId')&&!!req.requestId&&!!req.conversationId&&req.planRevision===7);
      ok('project guide is available in the submitted context',JSON.parse(req.contextText).projectGuide.sections.some(x=>x.id==='purpose'&&x.text==='Make answers diagnosable'));
      ok('request leaves the plan unchanged and contains no endpoint configuration',ev('JSON.stringify(S)')===before&&!('endpoint'in req)&&!('token'in req)&&!('apiKey'in req));
      const requestWrites=dir.files.get('sightline-chat-request.json').writes;await ev('chatPoll()');await ev('chatPoll()');
      ok('waiting polls do not rewrite request or create proposal file',dir.files.get('sightline-chat-request.json').writes===requestWrites&&!dir.files.has('sightline-amendments.json'));
      const nextDraft=draft(p,'Prepare the next question');nextDraft.focus();nextDraft.setSelectionRange(3,8);
      reply(p,response(req));await ev('chatPoll()');
      ok('fake companion clarification appears inside Sightline',d.querySelector('#chatTranscript').textContent.includes('retrieval diagnostics')&&!ev('chatState().active'));
      ok('response arrives while typing without losing draft or selection',d.querySelector('#chatDraft').value==='Prepare the next question'&&d.activeElement.id==='chatDraft'&&d.activeElement.selectionStart===3&&d.activeElement.selectionEnd===8);
      const acceptedMessages=ev('chatState().messages.length'),acceptedWrites=[...dir.files.values()].reduce((n,f)=>n+f.writes,0);await ev('chatPoll()');await ev('chatPoll()');
      ok('replaying accepted response neither appends messages nor rewrites files',ev('chatState().messages.length')===acceptedMessages&&[...dir.files.values()].reduce((n,f)=>n+f.writes,0)===acceptedWrites);
      ok('assistant reply does not mutate plan',ev('JSON.stringify(S)')===before);
      const next=await send(p,'Specifically retrieval diagnostics');
      ok('follow-up carries conversation and prior clarification',next.conversationId===req.conversationId&&next.requestId!==req.requestId&&next.messages.some(m=>m.role==='assistant'&&m.content.includes('retrieval diagnostics')));
      const proposal=amendments(next);reply(p,response(next,{message:'I suggest a clearer delivery name.',amendments:proposal}));await ev('chatPoll()');
      ok('proposals wait for deliberate review',!!d.querySelector('#chatReview')&&ev("dvById('dv-chat').name")==='Initial delivery'&&!ev('AM.chatReview'));
      await ev('chatReview()');
      ok('Review imports validated proposal in memory without writing assistant inbox',ev('AM.chatReview')&&ev("AM.file.batchId")===proposal.batchId&&!dir.files.has('sightline-amendments.json'));
      await ev("amApply(['rename-chat'])");
      ok('reviewed proposal uses existing apply path',ev("dvById('dv-chat').name")==='Improved delivery');ev('undo();');
      ok('Undo restores plan after conversation proposal',ev("dvById('dv-chat').name")==='Initial delivery');
      ev("sel={type:'amend',id:'x'};render();");
      const external=amendments(next,'External proposal');external.batchId='external-file';const inbox=file('sightline-amendments.json',JSON.stringify(external));dir.files.set(inbox.name,inbox);
      await ev('assistantTick()');
      ok('chat review protects pending batch from external inbox replacement',ev('AM.file.batchId')===proposal.batchId&&inbox.writes===0);
      await ev('chatReturnToFile()');
      ok('Return to changes file restores external proposal source',ev('AM.file.batchId')==='external-file'&&!ev('AM.chatReview')&&inbox.writes===0);
      draft(p,'Another request');await ev('chatSend()');
      ok('pending proposals still permit analysis without replacing review work',dir.files.get('sightline-chat-request.json').writes===requestWrites+2&&!!ev('chatState().active')&&ev('AM.file.batchId')==='external-file');
      const later=request(p);reply(p,response(later,{message:'A different suggestion',amendments:amendments(later,'New proposal')}));await ev('chatPoll()');await ev('chatReview()');
      ok('Review refuses to overwrite an unresolved external proposal batch',ev('AM.file.batchId')==='external-file'&&!ev('AM.chatReview')&&inbox.writes===0);
      ok('conversation makes no browser endpoint requests',w.networkCalls===0&&!w.errors.length,w.errors.join(';'));
    });
    await section(async p=>{const {ev,d,w}=p;await connect(p);
      let req=await send(p);reply(p,response(req,{requestId:'wrong-request',message:'Wrong response'}));await ev('chatPoll()');
      ok('out-of-order response cannot finish current request',!!ev('chatState().active')&&!d.querySelector('#chatTranscript').textContent.includes('Wrong response'));
      reply(p,response(req,{planId:'p-other-plan',message:'Other plan data'}));await ev('chatPoll()');
      ok('other-plan response ignored',!d.querySelector('#chatTranscript').textContent.includes('Other plan data'));
      reply(p,response(req,{conversationId:'other-conversation',message:'Other conversation'}));await ev('chatPoll()');
      ok('other-conversation response ignored',!d.querySelector('#chatTranscript').textContent.includes('Other conversation'));
      await ev('chatCancel()');const cancelled=request(p);
      ok('Cancel writes a cancellation for the active request',cancelled.cancelled===true&&cancelled.requestId===req.requestId&&!ev('chatState().active'));
      reply(p,response(req,{message:'Late cancelled response',amendments:amendments(req)}));await ev('chatPoll()');
      ok('late cancelled response neither displays nor installs proposals',!d.querySelector('#chatTranscript').textContent.includes('Late cancelled response')&&!ev('AM.chatReview'));
      req=await send(p,'Analyze the existing delivery');ev("dvById('dv-chat').name='Local edit at same revision';changeGen++;render();");reply(p,response(req,{message:'Old-context proposal',amendments:amendments(req)}));await ev('chatPoll()');
      const staleReview=ev('chatReview()');
      ok('same-revision local edit invalidates response proposals',!staleReview&&!ev('AM.chatReview')&&ev("dvById('dv-chat').name")==='Local edit at same revision');
      if(ev('!!chatState().active'))await ev('chatCancel()');req=await send(p,'Another analysis');ev('amDisconnect();');reply(p,response(req,{message:'Disconnected reply'}));await ev('chatPoll()');
      ok('disconnect invalidates late response',!d.querySelector('#side').textContent.includes('Disconnected reply'));
      ok('identity and cancellation flows raise no script errors',!w.errors.length,w.errors.join(';'));
    });
    await section(async p=>{const {ev,dir}=p;await connect(p);const req=await send(p,'Suggest a delivery name');reply(p,response(req,{amendments:amendments(req)}));await ev('chatPoll()');
      p.d.activeElement?.blur();let release,entered;
      const missingStarted=new Promise(resolve=>{entered=resolve;});
      dir.onGet=async name=>{if(name==='sightline-amendments.json'){dir.onGet=null;entered();await new Promise(resolve=>{release=resolve;});const e=new Error('Missing');e.name='NotFoundError';throw e;}};
      const poll=ev('assistantTick()');await missingStarted;
      const reviewed=ev('chatReview()');release();await poll;
      ok('an in-flight missing-inbox poll cannot clear newly imported chat proposals',reviewed&&!!ev('AM.chatReview')&&ev('AM.file?.batchId')==='chat-'+req.requestId);
    });
    await section(async p=>{const {ev,d,w,dir}=p;await connect(p);
      w.SHARED=file('plan.json',ev("serialize(planOfRecord(S),'plan.json')"));ev("file.handle=SHARED;file.baseText=SHARED.text;file.dirty=true;S.planningGuide[0].text='Unsaved team guidance';changeGen++;render();");draft(p,'Use my unsaved change');await ev('chatSend()');
      ok('shared unsaved edits require saving before conversation request',!dir.files.has('sightline-chat-request.json'));
      ev("file.dirty=false;S=parseText(SHARED.text);render();");let req=await send(p,'Analyze this saved plan');
      ok('shared request uses confirmed snapshot and source flag',JSON.parse(req.contextText).snapshot.source==='saved-shared-file'&&!req.contextText.includes('Unsaved team guidance'));
      ev("window.OLD_PLAN=S;S=clone(S);S.meta.planId='p-another-conversation';render();");reply(p,response(req,{message:'Previous plan reply'}));await ev('chatPoll()');
      ok('switching plans isolates conversations and late replies',!d.querySelector('#side').textContent.includes('Previous plan reply')&&!ev('chatState().active'));
      ok('different plan does not inherit composer draft',!d.querySelector('#chatDraft')||d.querySelector('#chatDraft').value==='');
      ev('S=OLD_PLAN;render();');await ev('chatPoll()');
      ok('returning to original plan does not revive its abandoned request',!ev('chatState().active')&&!d.querySelector('#side').textContent.includes('Previous plan reply'));
      ok('shared and switched-plan workflows raise no script errors',!w.errors.length,w.errors.join(';'));
    });
    await section(async p=>{const {ev,d,w,dir}=p;await connect(p);
      const longDraft='x'.repeat(4001);draft(p,longDraft);await ev('chatSend()');
      ok('oversized message is refused with complete draft retained',!dir.files.has('sightline-chat-request.json')&&d.querySelector('#chatDraft').value===longDraft);
      let req=await send(p);reply(p,'{invalid');await ev('chatPoll()');
      ok('malformed response reports recoverable error without plan changes',!!ev('chatState().error')&&ev("dvById('dv-chat').name")==='Initial delivery');
      if(ev('!!chatState().active'))await ev('chatCancel()');req=await send(p,'Please try again');reply(p,response(req,{message:'x'.repeat(3*1024*1024)}));await ev('chatPoll()');
      ok('oversized response refused before rendering or review',!!ev('chatState().error')&&!ev('AM.chatReview')&&d.querySelector('#chatTranscript').textContent.length<100000);
      if(ev('!!chatState().active'))await ev('chatCancel()');req=await send(p,'Clarify scope');reply(p,response(req,{message:'<img src=x onerror=alert(1)>'}));await ev('chatPoll()');
      ok('assistant text displayed safely as text',d.querySelector('#chatTranscript').textContent.includes('<img')&&!d.querySelector('#chatTranscript img'));
      req=await send(p,'Test a companion error');reply(p,response(req,{status:'error',message:'Synthetic endpoint unavailable'}));await ev('chatPoll()');
      ok('companion error ends request with a useful retry action',!ev('chatState().active')&&d.querySelector('#chatStatus').textContent.includes('Synthetic endpoint unavailable')&&!!d.querySelector('#chatRetry'));
      draft(p,'A newer question I am composing');
      ok('Retry cannot overwrite a newer composer draft',!d.querySelector('#chatRetry')&&d.querySelector('#chatDraft').value==='A newer question I am composing');
      req=await send(p,'Test a missing companion');w.CLOCK_NOW+=151000;await ev('chatPoll()');
      ok('missing companion times out and cancels without losing the plan',!ev('chatState().active')&&request(p).cancelled===true&&ev("dvById('dv-chat').name")==='Initial delivery'&&!!ev('chatState().error'));
      req=await send(p,'Suggest a change');reply(p,response(req,{amendments:{kind:'wrong',version:1},message:'Bad proposal'}));await ev('chatPoll()');
      ok('invalid embedded amendments cannot enter plan review',!ev('AM.chatReview')&&ev("dvById('dv-chat').name")==='Initial delivery');
      if(ev('!!chatState().active'))await ev('chatCancel()');dir.permission='prompt';draft(p,'Try without permission');await ev('chatSend()');
      ok('revoked folder permission preserves composer for retry',d.querySelector('#chatDraft').value==='Try without permission'&&!ev('chatState().active'),JSON.stringify({draft:d.querySelector('#chatDraft').value,active:!!ev('chatState().active'),error:ev('chatState().error')}));
      ok('failure flows neither write proposal file nor use network',!dir.files.has('sightline-amendments.json')&&w.networkCalls===0&&!w.errors.length,w.errors.join(';'));
    });
  }
  for(const p of pages)p.dom.window.close();console.log(checks.join('\n'));const failed=checks.filter(x=>x.startsWith('FAIL')).length;console.log(`${checks.length-failed}/${checks.length} passed`);process.exit(failed?1:0);
})().catch(e=>{console.log('FAIL harness completed: '+e.stack);console.log('0/1 passed');process.exit(1);});
