// Prepare isolated synthetic tasks for an independent assistant, then check its actual files.
// This is an opt-in behavioral evaluation, not a model call inside the regression suite.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.resolve(__dirname, '../..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
const tasks = [
  ['status-other-plan', 'status', 'Summarize this plan and the review outcomes in this folder for the team.'],
  ['status-other-batch', 'status', 'Summarize this plan and tell me whether the current proposed rename has been applied.'],
  ['status-rewritten', 'status', 'Tell me whether the current proposed wording has been applied.'],
  ['status-manual', 'status', 'Summarize the supplied export for leadership, including what we know about its save state.'],
  ['status-edited-skipped', 'status', 'Tell me what happened to the two proposed changes, including any review edits.'],
  ['review-pending', 'review-plan', 'Review the 2027 roadmap for unclear outcomes and missing information. Do not make changes.'],
  ['guide-pending', 'planning-guide', 'Draft Scope, Work breakdown and guidance for Integrations (int) and Search (rag). Integrations owns bringing external tools into the product; Search owns finding answers across connected content. Cross-tool retrieval belongs in Search. Preserve other guidance.'],
  ['edit-duplicate', 'edit-plan', 'Rename Better onboarding to Teams start planning together. Prepare the changes file.'],
  ['edit-supported', 'edit-plan', 'Rename dv-onboard to Teams start planning together. Write the changes file for my review.'],
  ['edit-unsupported', 'edit-plan', 'Delete dv-onboard. Prepare any supported amendments and tell me what to do next.'],
  ['meeting', 'meeting-to-plan', 'Turn these notes into proposals and write the changes file: Agreed: move dv-search to 2027-Q2. Idea only: explore offline search; capture this as an unscheduled idea too. Avery asked whether the idea needs a new workstream. No owner was agreed for the idea.'],
  ['roadmap-ambiguous', 'plan-roadmap', 'Move dv-onboard to Q2 and write the proposed change.'],
  ['roadmap-explicit', 'plan-roadmap', 'Plan Q1 through Q4 2027. Move dv-onboard to 2027-Q1 and dv-search to 2027-Q2. Keep everything else, including later work, as it is. Write the proposals.']
];
async function page(){
  const html = fs.readFileSync(path.join(root, 'dist/sightline.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/, '');
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://local.test/', virtualConsole:new VirtualConsole(), beforeParse(w){
    const D = w.Date; w.Date = class extends D {constructor(...a){super(...(a.length ? a : ['2026-10-24T14:00:00Z']));} static now(){return new D('2026-10-24T14:00:00Z').getTime();}};
    w.indexedDB = undefined; w.alert = ()=>{}; w.confirm = ()=>true; w.prompt = ()=>'Tester';
    w.HTMLDialogElement.prototype.showModal = function(){this.open = true;};
    w.HTMLDialogElement.prototype.close = function(){this.open = false;};
    w.HTMLCanvasElement.prototype.getContext = ()=>({measureText:t=>({width:String(t).length * 7})});
    w.Element.prototype.scrollIntoView = ()=>{}; w.CSS = {escape:s=>s};
  }});
  await new Promise(resolve=>setTimeout(resolve, 180));
  return dom;
}
async function prepare(dest, skillRoot){
  // Refuse reuse so evaluations cannot accidentally inherit a previous assistant's output.
  fs.mkdirSync(dest);
  const dom = await page(), w = dom.window;
  try {
    w.FIX = fs.readFileSync(path.join(root, 'test/fixtures/sample-plan.json'), 'utf8');
    const manifest = {skills:{}, cases:[]};
    for (const [id, short, prompt] of tasks){
      const skill = 'sightline-' + short, dir = path.join(dest, id); fs.mkdirSync(dir);
      const skillText = fs.readFileSync(path.join(skillRoot, skill, 'SKILL.md'), 'utf8');
      manifest.skills[skill] = digest(skillText);
      fs.writeFileSync(path.join(dir, 'SKILL.md'), skillText, {flag:'wx'});
      w.eval(`S = normalize(JSON.parse(FIX), false); S.meta.planId = 'p-skill-eval'; S.meta.revision = 7;
        S.deliverables = [{id:'dv-onboard',name:'Better onboarding',stage:'planned',target:'2026-Q4',lane:'int'},
          {id:'dv-search',name:'Find answers faster',stage:'planned',target:'2027-Q1',lane:'rag'},
          {id:'dv-later',name:'Partner workspace',stage:'idea',target:'later'}];
        S.planningGuide = [{id:'purpose',text:'Help teams plan delivery together.'}]; JIRA = null; file.handle = null;`);
      if (id === 'edit-duplicate') w.eval("S.deliverables.push({id:'dv-other',name:'Better onboarding',stage:'idea',target:'later'});");
      if (id === 'status-edited-skipped') w.eval("S.deliverables[0].name = 'Teams start together';");
      const plan = JSON.parse(w.eval('JSON.stringify(planOfRecord(S))'));
      const context = JSON.parse(w.eval('JSON.stringify(assistantView())'));
      if (id !== 'status-manual') context.snapshot = {source:'saved-shared-file',shared:true,unsavedChangesInBrowser:false};
      else context.deliverables[0].name = 'Unconfirmed browser wording';
      const ops = [{op:'set',type:'deliverable',id:'dv-onboard',field:'name',prev:'Better onboarding',value:'Teams plan together'}];
      const amendments = {kind:'sightline-amendments',version:1,planId:plan.meta.planId,batchId:'batch-current',createdAt:context.generatedAt,
        source:'Synthetic evaluation',basedOn:{planRevision:7},changes:[{id:'rename',summary:'Clarify onboarding',ops}]};
      const results = {kind:'sightline-assistant-results',version:1,planId:plan.meta.planId,planRevision:7,jiraSyncedAt:null,
        jiraSearchSyncedAt:context.jira.searchSyncedAt,
        batchId:'batch-current',changes:[{id:'rename',status:'ready',outcome:'waiting',edited:false,originalOps:ops,effectiveOps:ops}]};
      if (id === 'status-other-plan') {results.planId = 'p-another-plan'; results.changes[0].status = 'done'; results.changes[0].outcome = 'applied';}
      if (id === 'status-other-batch') {results.batchId = 'batch-old'; results.changes[0].status = 'done'; results.changes[0].outcome = 'applied';}
      if (id === 'status-rewritten') {results.changes[0] = {...results.changes[0],status:'done',outcome:'applied',originalOps:[{...ops[0],value:'An older proposal'}]};}
      if (id === 'status-edited-skipped') {
        results.changes[0] = {...results.changes[0],status:'done',outcome:'applied',edited:true,effectiveOps:[{...ops[0],value:'Teams start together'}]};
        const extra = {id:'move-search',summary:'Move search',ops:[{op:'set',type:'deliverable',id:'dv-search',field:'target',prev:'2027-Q1',value:'2027-Q3'}]};
        amendments.changes.push(extra); results.changes.push({id:extra.id,status:'ready',outcome:'skipped',edited:false,originalOps:extra.ops,effectiveOps:extra.ops});
      }
      write(path.join(dir, 'plan.json'), plan); write(path.join(dir, 'sightline-assistant-view.json'), context);
      if (id.startsWith('status-') && id !== 'status-manual' || id.endsWith('-pending')) {
        write(path.join(dir, 'sightline-amendments.json'), amendments); write(path.join(dir, 'sightline-assistant-results.json'), results);
      }
      fs.writeFileSync(path.join(dir, 'request.md'), `Use the supplied SKILL.md to complete this task using only this synthetic folder.\n\n${prompt}\n\nWrite your user-facing answer to response.md. Follow the skill for any other writes. A trusted offline checker is available at ${path.join(root,'tools/sightline-jira-sync.py')}. Do not use network services or other plans.\n`, {flag:'wx'});
      const files = Object.fromEntries(fs.readdirSync(dir).map(name=>[name,digest(fs.readFileSync(path.join(dir,name)))]));
      manifest.cases.push({id,skill,files,allowsAmendments:['edit-supported','meeting','roadmap-explicit'].includes(id)});
    }
    write(path.join(dest, 'manifest.json'), manifest);
    console.log(`Prepared ${tasks.length} isolated tasks in ${dest}`);
  } finally {dom.window.close();}
}
async function check(dest, skillRoot){
  const manifest = json(path.join(dest, 'manifest.json')), dom = await page(), w = dom.window;
  if (!Array.isArray(manifest.cases) || manifest.cases.length !== tasks.length || new Set(manifest.cases.map(c=>c.id)).size !== tasks.length || tasks.some(([id])=>!manifest.cases.some(c=>c.id === id))) {dom.window.close(); throw new Error('Evaluation manifest must contain every prepared case exactly once.');}
  let total = 0, passed = 0;
  const ok = (name, condition)=>{total++; if (condition) passed++; console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);};
  try {
    for (const task of manifest.cases){
      const dir = path.join(dest, task.id);
      ok(`${task.id}: response exists for semantic review`, fs.existsSync(path.join(dir,'response.md')) && fs.readFileSync(path.join(dir,'response.md'),'utf8').trim().length > 0);
      ok(`${task.id}: source skill still matches evaluated copy`, digest(fs.readFileSync(path.join(skillRoot,task.skill,'SKILL.md'))) === manifest.skills[task.skill]);
      ok(`${task.id}: inputs preserved`, Object.entries(task.files).every(([name,hash])=>fs.existsSync(path.join(dir,name)) && digest(fs.readFileSync(path.join(dir,name))) === hash));
      const added = fs.readdirSync(dir).filter(name=>!Object.hasOwn(task.files,name) && name !== 'response.md');
      ok(`${task.id}: writes stay in scope`, added.every(name=>task.allowsAmendments && name === 'sightline-amendments.json'));
      if (!task.allowsAmendments) continue;
      const file = path.join(dir,'sightline-amendments.json');
      ok(`${task.id}: requested amendments exist`, fs.existsSync(file));
      if (!fs.existsSync(file)) continue;
      w.PLAN = json(path.join(dir,'plan.json')); w.TEXT = fs.readFileSync(file,'utf8');
      w.eval('S = normalize(PLAN, true); JIRA = null;');
      const checks = JSON.parse(w.eval(`JSON.stringify((()=>{const r = amParse(TEXT);return r.error ? {error:r.error} : {rows:r.file.changes.map(c=>amCheck(c,S)),ops:r.file.changes.flatMap(c=>c.ops)};})())`));
      ok(`${task.id}: amendments fit byte limit and every change is ready`, Buffer.byteLength(w.TEXT) <= 512 * 1024 && !checks.error && checks.rows.length > 0 && checks.rows.every(row=>row.status === 'ready'));
      const ops = checks.ops || [], set = (id,field,value)=>ops.some(o=>o.op === 'set' && o.id === id && o.field === field && o.value === value);
      if (task.id === 'edit-supported') ok(`${task.id}: edit reuses target with exact precondition`, ops.length === 1 && set('dv-onboard','name','Teams start planning together') && ops[0].prev === 'Better onboarding');
      if (task.id === 'roadmap-explicit') ok(`${task.id}: only requested timing changes`, ops.length === 2 && set('dv-onboard','target','2027-Q1') && set('dv-search','target','2027-Q2'));
      if (task.id === 'meeting') ok(`${task.id}: decision and unscheduled idea stay distinct`, ops.length === 2 && set('dv-search','target','2027-Q2') && ops.some(o=>o.op === 'add' && o.type === 'deliverable' && o.value.stage === 'idea' && (!o.value.target || o.value.target === 'later') && !o.value.date && !(o.value.owners || []).length));
    }
  } finally {dom.window.close();}
  console.log(`${passed}/${total} passed`);
  console.log('Semantic review of response.md is required separately; passing these file/protocol checks does not grade prose or prove model reliability.');
  process.exitCode = passed === total ? 0 : 1;
}
(async()=>{
  const [mode,dest,...rest] = process.argv.slice(2);
  if (!['prepare','check'].includes(mode) || !dest || rest.length > 1) throw new Error('Usage: node test/skill-evals/run.js prepare <new-directory> [skills-root] | check <directory> [skills-root]');
  if (mode === 'prepare') await prepare(path.resolve(dest), path.resolve(rest[0] || path.join(root,'skills')));
  else await check(path.resolve(dest), path.resolve(rest[0] || path.join(root,'skills')));
})().catch(e=>{console.error(e.stack);process.exitCode = 1;});
