// Rich external-assistant context: actual calculations, saved provenance, privacy and explicit coverage.
const {JSDOM, VirtualConsole} = require('jsdom'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,'../dist/sightline.html'),'utf8').replace(/<link[^>]+fonts[^>]+>/,'');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/sample-plan.json'),'utf8'), checks = [];
const ok = (name, pass)=>checks.push(`${pass ? 'PASS' : 'FAIL'} ${name}`);
setTimeout(()=>{console.log(checks.join('\n'));console.log('TIMEOUT');process.exit(1);},45000).unref();
(async()=>{
  const dom = new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://local.test/',virtualConsole:new VirtualConsole(),beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB=undefined;w.alert=()=>{};w.confirm=()=>true;w.prompt=()=>'Tester';
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:String(t).length*7})});w.Element.prototype.scrollIntoView=()=>{};
    w.CSS={escape:s=>s};w.errors=[];w.addEventListener('error',e=>w.errors.push(e.message));
  }});
  try {
    await new Promise(r=>setTimeout(r,180)); const w=dom.window, ev=s=>w.eval(s);w.FIX=fixture;
    ev(`S=normalize(JSON.parse(FIX),false);S.meta.planId='p-planning-export';S.meta.revision=9;S.meta.capRates=[{from:'2026-09-21',points:10}];
      S.people=[{id:'p-one',name:'Avery',days:5,alloc:50,jira:{key:'user-1'},off:[{from:'2026-10-20',to:'2026-10-20',reason:'PRIVATE LEAVE REASON'}]},
        {id:'p-two',name:'Blake',days:5,off:[]},{id:'p-away',name:'Casey',days:5,alloc:0,jira:{key:'user-3'},off:[]}];
      S.holidays=[{date:'2026-10-21',name:'Private holiday annotation'}];
      S.bars=[{id:'bar-one',label:'Plan work',lane:S.lanes[0].id,start:0,span:1,status:'notstarted',owners:['p-one'],dependsOn:[],waitsFor:['gate-one'],jiraDeps:['ABC-2'],epics:[],tasks:[{id:'task-one',label:'Task',start:'2026-10-26',days:2,status:'notstarted',owners:['p-two'],dependsOn:[],jiraDeps:[]}]},
        {id:'bar-parked',label:'Parked work',lane:S.lanes[0].id,start:2,span:1,status:'notstarted',owners:[],dependsOn:['bar-one'],parked:true,tasks:[],epics:[]}];
      S.deliverables=[{id:'dv-one',name:'Outcome',stage:'planned',target:'2027-Q1',jira:['ABC-1'],note:'PRIVATE OUTCOME NOTE'}];
      S.notes=[{id:'note-private',text:'PRIVATE PLAN NOTE'}];
      S.risks=[{id:'risk-one',text:'Shared specialist unavailable',sev:'high',owners:['p-one'],item:'bar-one',next:'Agree a backup',waitingOn:'p-two',escalateBy:'2026-10-26'}];
      S.decisions=[{id:'dec-one',text:'Choose a launch scope',state:'open',owners:['p-two'],item:'bar-one',due:'2026-10-27',decider:'p-one'}];
      S.gates=[{id:'gate-one',gate:'Security review',lane:S.lanes[0].id,at:2,status:'notstarted',note:'PRIVATE GATE NOTE'}];
      S.milestones=[{id:'ms-one',label:'Launch',at:4,after:['bar-one'],note:'PRIVATE MILESTONE NOTE'}];
      JIRA={generatedAt:'2026-10-24T12:00:00Z',missing:['ABC-9'],issues:{
        'ABC-1':{summary:'Assigned work',type:'Story',status:'To Do',category:'todo',sprintId:1,assigneeKey:'user-1',points:8},
        'ABC-2':{summary:'Unestimated work',type:'Story',status:'To Do',category:'todo',sprintId:1,assigneeKey:'user-1',points:null},
        'ABC-3':{summary:'Unassigned work',type:'Story',status:'To Do',category:'todo',sprintId:1,points:3},
        'ABC-4':{summary:'Unlinked person',type:'Story',status:'To Do',category:'todo',sprintId:1,assigneeKey:'other-user',points:2},
        'ABC-5':{summary:'Epic',type:'Epic',status:'To Do',category:'todo',sprintId:1,points:100},
        'ABC-6':{summary:'Abandoned',type:'Story',status:'Abandoned',category:'done',resolution:'Abandoned',sprintId:1,points:100},
        'ABC-7':{summary:'Zero allocation',type:'Story',status:'To Do',category:'todo',sprintId:1,assigneeKey:'user-3',points:1}},
        sprints:[{id:1,name:'Sprint 1',state:'active',start:'2026-10-19',end:'2026-10-30'}],rollups:{},releases:[]};
      JIRA_ISSUES={generatedAt:'2026-10-24T11:00:00Z',issues:{'ABC-1':{summary:'Old search copy',points:99}}};dropJiraMemos();file.handle=null;`);
    let context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('exports planning and capacity context',!!context.planning?.capacity);
    ok('exports explicit whole-plan coverage',context.coverage?.initiatives?.total===2);
    if (!context.planning?.capacity) throw new Error('Missing richer planning export');
    const p=context.planning,c=p.capacity,allocation=c.allocations.find(x=>x.personId==='p-one');
    ok('capacity exactly reuses capOf',allocation.capacityPoints===ev('capOf(S.people[0],JIRA.sprints[0])'));
    ok('allocation, holiday and time off reduce capacity',allocation.capacityPoints===4);
    ok('known assigned demand is counted once across Jira sources',allocation.assignedPoints===8&&allocation.issueCount===2);
    ok('unestimated work stays visible',allocation.unestimatedIssues===1);
    ok('unlinked person load is unknown rather than zero',c.allocations.find(x=>x.personId==='p-two').assignedPoints===null);
    ok('zero allocation is explicit even with assigned work',c.allocations.find(x=>x.personId==='p-away').capacityPoints===0);
    ok('unassigned and unlinked Jira work are separate',c.sprints[0].unassigned.points===3&&c.sprints[0].unlinked.points===2);
    ok('epics and abandoned issues excluded from demand',c.sprints[0].demand.points===14&&c.sprints[0].demand.issueCount===5);
    ok('risks retain stable links and next actions',p.risks[0].item==='bar-one'&&p.risks[0].next==='Agree a backup');
    ok('decisions retain due dates and decider',p.decisions[0].due==='2026-10-27'&&p.decisions[0].decider==='p-one');
    ok('parked work and dependency IDs are recoverable',context.initiatives.find(b=>b.id==='bar-parked').dependsOn[0]==='bar-one');
    ok('gates and milestones retain their links',p.gates[0].id==='gate-one'&&p.milestones[0].after[0]==='bar-one');
    ok('Jira issue facts and both sync timestamps available',context.jira.issues.find(x=>x.key==='ABC-1').points===8&&context.jira.searchSyncedAt==='2026-10-24T11:00:00Z');
    ok('issue facts carry their actual source freshness',context.jira.issues.find(x=>x.key==='ABC-1').source==='status'&&context.jira.issues.find(x=>x.key==='ABC-1').syncedAt==='2026-10-24T12:00:00Z');
    ok('plan notes, item notes and leave descriptions excluded',!JSON.stringify(context).includes('PRIVATE')&&!JSON.stringify(context).includes('Private holiday annotation'));
    ev('JIRA.sprints.push({...JIRA.sprints[0]});S.people[1].jira={key:"user-1"};');
    context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('duplicate sprint IDs cannot duplicate demand rows',context.planning.capacity.sprints.length===1);
    ok('ambiguous people links do not double count assigned load',context.planning.capacity.ambiguousJiraKeys.includes('user-1')&&context.planning.capacity.allocations.find(x=>x.personId==='p-one').assignedPoints===null);
    ev(`JIRA.sprints=Array.from({length:6},(_,i)=>({id:i+1,name:'Future '+i,state:'future',start:'2026-11-02',end:'2026-11-13'}));S.meta.capRates=[];`);
    context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('capacity includes known sprints beyond the UI four-sprint window',context.planning.capacity.sprints.length===6);
    ok('missing capacity rate is null rather than zero',context.planning.capacity.allocations.every(x=>x.capacityPoints===null));
    ev("JIRA.sprints.push({id:99,name:'Unsupported range',state:'future',start:'2026-11-02',end:'2030-11-02'});");context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('unsupported sprint ranges are counted as incomplete coverage',context.planning.capacity.unsupportedSprintRanges===1&&context.coverage.capacitySprints.omitted===1&&!context.coverage.complete);
    ev(`S.people=Array.from({length:80},(_,i)=>({id:'p-team-'+i,name:'Team member '+i,days:5,jira:{key:'team-user-'+i},off:[]}));
      S.meta.capRates=[{from:'2026-09-21',points:10}];JIRA.sprints=JIRA.sprints.filter(sp=>sp.id!==99);
      JIRA.issues=Object.fromEntries(Array.from({length:400},(_,i)=>['ABC-'+(1000+i),{summary:'Synthetic work '+i,type:'Story',status:'To Do',category:'todo',sprintId:1+i%6,assigneeKey:'team-user-'+i%80,points:1}]));dropJiraMemos();`);
    context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('large team exports all 480 person-sprint capacity rows',context.planning.capacity.activePeople===80&&context.planning.capacity.allocations.length===480);
    ok('large team demand remains 400 distinct known points',context.planning.capacity.sprints.reduce((n,sp)=>n+sp.demand.points,0)===400);
    ok('search-only facts retain their older timestamp',context.jira.issues.find(x=>x.key==='ABC-1').source==='search'&&context.jira.issues.find(x=>x.key==='ABC-1').syncedAt==='2026-10-24T11:00:00Z');
    ev('JIRA=null;JIRA_ISSUES=null;dropJiraMemos()');context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('no Jira does not fabricate capacity feasibility',!context.planning.capacity.sprints.length&&context.jira.syncedAt===null);
    ev(`S.bars=Array.from({length:900},(_,i)=>({id:'bar-many-'+i,label:'Work '+i,lane:S.lanes[0].id,start:0,span:1,status:'notstarted',owners:[],dependsOn:[],epics:[],tasks:[]}));
      S.bars[0].tasks=Array.from({length:110},(_,i)=>({id:'task-many-'+i,label:'Task '+i,start:'2026-10-26',days:1,status:'notstarted',owners:[],dependsOn:[]}));`);
    context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('large plan is not silently capped at 800 initiatives or 100 tasks',context.initiatives.length===900&&context.initiatives[0].tasks.length===110);
    ev(`S.decisions=Array.from({length:1500},(_,i)=>({id:'dec-large-'+i,text:'\u6f22'.repeat(800),state:'open',owners:[]}));`);
    context=JSON.parse(ev('JSON.stringify(assistantView())'));
    ok('oversized context fits the UTF-8 output limit',Buffer.byteLength(JSON.stringify(context,null,2))+1024<=ev('MAX_BYTES'));
    ok('byte-budget omissions are explicit',context.coverage.decisions.omitted>0&&context.coverage.decisions.total===1500&&!context.coverage.complete);
    const rawBefore=ev('JSON.stringify(S)');ev('assistantView()');ok('budget fitting never mutates plan arrays',ev('JSON.stringify(S)')===rawBefore);
    ev(`S=normalize(JSON.parse(FIX),false);file.baseText=serialize(planOfRecord(S),'plan.json');stopAuto(); startAuto = ()=>{}; file.handle={name:'plan.json'};file.dirty=true;
      S.risks=[{id:'risk-unsaved',text:'UNSAVED SECRET',owners:[]}];S.meta.capRates=[{from:'2026-09-21',points:99}];`);
    const before=ev('JSON.stringify(S)'),payload=JSON.parse(ev('JSON.stringify(assistantPayloads())'));
    ok('automatic context excludes unsaved planning fields',!JSON.stringify(payload.context).includes('UNSAVED SECRET')&&!payload.context.planning.capacity.rates.some(x=>x.points===99));
    ok('snapshot provenance and source state preserved',payload.context.snapshot.unsavedChangesInBrowser&&ev('JSON.stringify(S)')===before);
    ok('results identify the Jira search snapshot as well',Object.hasOwn(payload.results,'jiraSearchSyncedAt')&&payload.results.jiraSearchSyncedAt===payload.context.jira.searchSyncedAt);
    ok('no browser script errors',!w.errors.length);
  }catch(e){ok('section completed: '+e.message,false);}finally{dom.window.close();}
  console.log(checks.join('\n'));const failed=checks.filter(x=>x.startsWith('FAIL')).length;console.log(`${checks.length-failed}/${checks.length} passed`);process.exit(failed?1:0);
})();
