// From the seventh review, and plan format versioning. Quick Undo never overwrites a teammate's newer value, and a raced
// quick update reports its final result; hidden counts cover every collection and note setting; proposals are judged
// only against their own Jira server; the page refuses Jira files from a newer sync; the page and the sync agree on the
// plan format; a format change has a migration and backs up the old file on its first save; the sync refuses a plan
// in a newer format. Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(opts = {}){
  const handle = makeHandle("plan.json", opts.text || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); w.downloads = 0; }});
  const w = dom.window, ev = s => w.eval(s); await wait(250);
  if (opts.file !== false){ w.document.querySelector("#link").click(); await wait(200); }
  else { w.FIX = plan; ev("S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); render();"); }
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb(); download = () => { downloads++; }; setMe(S.people[0].id); window.ME = S.people[0].id; window.OTHER = S.people[1].id;");
  return {w, d: w.document, ev, handle};
}
const sync = fs.readFileSync(path.join(__dirname,"..","tools","sightline-jira-sync.py"),"utf8");
const pyConst = n => Number((sync.match(new RegExp("^" + n + " = (\\d+)", "m")) || [])[1]);
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev, handle} = await page();
    const id = ev("S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length).id");
    ev(`window.ID = ${JSON.stringify(id)}`);
    await ev("quickSave('marked done', s=>{ const b = s.bars.find(x=>x.id===ID); b.status = 'done'; })"); await wait(40);
    const o = JSON.parse(handle._text); o.bars.find(b=>b.id === id).status = "atrisk"; o.meta.revision++; handle._text = JSON.stringify(o);
    ev("undo()"); await wait(120);
    ok("U1: quick Undo leaves a value a teammate changed since", JSON.parse(handle._text).bars.find(b=>b.id === id).status === "atrisk");
    await ev("quickSave('a note', s=>{ s.notes.push({id:'nU', lane:s.lanes[0].id, date:s.meta.start, text:'x', author:ME}); })"); await wait(40);
    ev("undo()"); await wait(120);
    ok("U2: and still undoes what nobody touched", !JSON.parse(handle._text).notes.some(n=>n.id === "nU")); });

  await sec(async ()=>{ const {ev, handle} = await page();
    const r = await ev(`(()=>{ let n = 0; const orig = FileStore.writeIfUnchanged; FileStore.writeIfUnchanged = (...a)=> n++ ? orig.apply(FileStore, a) : Promise.resolve("changed");
      return quickSave('a raced note', s=>{ s.notes.push({id:'nR', lane:s.lanes[0].id, date:s.meta.start, text:'x', author:ME}); }); })()`); await wait(40);
    ok("U3: a quick update that had to retry reports how it finally went", r === true && JSON.parse(handle._text).notes.some(n=>n.id === "nR"), String(r)); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    ev("setMe(ME); UI.notes = 'mine'; S.notes.push({id:'nX', lane:S.lanes[0].id, date:S.meta.start, text:'theirs', author:OTHER}); render();");
    ok("C1: notes the Notes setting leaves out are counted", ev("hiddenTally().notes") >= 1);
    ev("UI.notes = 'all'; S.meetings.push({id:'mX', lane:S.lanes[0].id, title:'Sync', date:S.meta.start, added:{by:OTHER, at:'2026-09-27T10:00:00Z'}}); setHide(h=>{ h.people.push(OTHER); });");
    const t = JSON.parse(ev("JSON.stringify(hiddenTally())"));
    ok("C2: so are meetings someone you hid added", (t.people[ev("OTHER")] || 0) >= 1, JSON.stringify(t.people));
    ev("setHide(h=>{ h.people = []; }); UI.filter.authors = [ME]; setWs('timeline'); render();");
    ok("C3: and what the Added by filter hides, with a way to clear it", /hidden by the Added by filter/.test(ev("document.querySelector('#hiddenStrip').textContent")) && !!ev("document.querySelector('#hsAuthors')")); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    ev(`JIRA = parseJiraStatus(JSON.stringify({kind:'sightline-jira-status', generatedAt:new Date().toISOString(), jiraBase:'https://jira-b.example.com', missing:[], issues:{'ABC-20':{summary:'x', status:'In Progress', category:'inprogress', type:'Story'}}, rollups:{}}));
      S.proposals = [{id:'p1', server:'https://jira-a.example.com', key:'ABC-20', field:'status', value:'In Progress', seen:{value:'To Do', at:''}, why:'', review:{state:'proposed', by:'', at:''}}];`);
    ok("P1: a proposal made on another Jira server isn't judged against this one", ev("proposalState(S.proposals[0])") === "otherServer"); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    const e = ev(`(()=>{ try { parseJiraStatus(JSON.stringify({kind:'sightline-jira-status', version:99, issues:{}})); return 'read'; } catch(e){ return e.message; } })()`);
    ok("F1: the page won't misread Jira files from a newer sync script", /newer sync script \(format 99\)/.test(e), e);
    const e2 = ev(`(()=>{ try { parseJiraIssues(JSON.stringify({kind:'sightline-jira-issues', version:99, issues:[]})); return 'read'; } catch(e){ return e.message; } })()`);
    ok("F1: either file", /newer sync script/.test(e2), e2);
    ok("F2: the page and the sync script agree on the plan format", ev("SCHEMA") === pyConst("PLAN_SCHEMA"), `${ev("SCHEMA")} vs ${pyConst("PLAN_SCHEMA")}`);
    ok("F2: and on the Jira file formats", ev("JIRA_FORMATS.status") === pyConst("STATUS_FORMAT") && ev("JIRA_FORMATS.issues") === pyConst("ISSUES_FORMAT"));
    ok("F3: every plan format after 2 has a migration step", ev("Array.from({length:Math.max(0, SCHEMA - 2)}, (_, i)=>i + 3).every(v=>MIGRATIONS.some(m=>m.to === v))")); });

  await sec(async ()=>{ const o = JSON.parse(plan); o.meta.schema = 1; const {ev, handle} = await page({text: JSON.stringify(o)});
    ev("MIGRATIONS.push({to:2, run(s){ s.meta.migrated = true; return s; }})");
    const d0 = ev("downloads");
    await ev("quickSave('a note', s=>{ s.notes.push({id:'nM', lane:s.lanes[0].id, date:s.meta.start, text:'x', author:ME}); })"); await wait(40);
    ok("F4: the first save in a new plan format downloads the old file first", ev("downloads") === d0 + 1 && JSON.parse(handle._text).meta.schema === 2);
    await ev("quickSave('another', s=>{ s.notes.push({id:'nM2', lane:s.lanes[0].id, date:s.meta.start, text:'y', author:ME}); })"); await wait(40);
    ok("F4: only once", ev("downloads") === d0 + 1); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
