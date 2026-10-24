// 1.20: who added what and the change log. Everything added records who added it and who last edited it; automatic
// moves aren't anyone's edit; merges never clash over stamps; each quick update and save writes one change record;
// Activity lists them; Mine shows Jira's work plus what I added; an older copy's save can be put back.
// Each check fails on the build before this.
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
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev} = await page({file:false});
    ev("commit(s=>{ s.bars.push({id:'bNew', lane:s.lanes[0].id, start:1, span:2, label:'Mine', kind:'work', owners:[], jira:'', epics:[], status:'notstarted', dependsOn:[], tasks:[], datesFrom:'manual'}); })");
    ok("A1: something new records who added it", ev("barById('bNew').added.by") === ev("ME") && !ev("barById('bNew').edited"));
    ev("commit(s=>{ s.bars.find(b=>b.id==='bNew').label = 'Mine, renamed'; })");
    ok("A2: editing records who last edited it and keeps who added it", ev("barById('bNew').edited.by") === ev("ME") && ev("barById('bNew').added.by") === ev("ME"));
    const dep = ev("(()=>{ const b = S.bars.find(x=>(x.dependsOn||[]).length); return b ? b.id : null; })()");
    const pred = dep && ev(`barById(${JSON.stringify(dep)}).dependsOn[0]`);
    ev(`commit(s=>{ const p = s.bars.find(b=>b.id===${JSON.stringify(pred)}); p.span = p.span + 3; })`);
    ok("A3: something that moved on its own (a dependency) isn't counted as anyone's edit", !!dep && !ev(`barById(${JSON.stringify(dep)}).edited`), dep);
    ok("A4: replaying a change never rewrites who added something", ev("applyOps(S, [{op:'set', type:'bars', id:'bNew', field:'added', value:{by:'someone-else', at:'2026-01-01T00:00Z'}}]).plan.bars.find(b=>b.id==='bNew').added.by") === ev("ME")); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    const r = ev(`(()=>{ const base = clone(S), mine = clone(S), theirs = clone(S);
      mine.bars[0].edited = {by:ME, at:'2026-09-27T10:00Z'}; mine.bars[0].label = 'Mine';
      theirs.bars[0].edited = {by:OTHER, at:'2026-09-27T11:00Z'}; theirs.bars[1].label = 'Theirs';
      const m = mergePlans(base, mine, theirs); return JSON.stringify([m.kept.length, m.plan.bars[0].label, m.plan.bars[0].edited.by, m.plan.bars[1].label]); })()`);
    ok("A5: two people editing the same item never clash over who edited it last; the later stamp wins", r === JSON.stringify([0, "Mine", ev("OTHER"), "Theirs"]), r); });

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev("quickSave('a note', s=>{ s.notes.push({id:'nQ', lane:s.lanes[0].id, date:s.meta.start, text:'hello', author:ME}); })"); await wait(40);
    const f = JSON.parse(handle._text), c = f.changes || [];
    ok("C1: a quick update writes one change record: who, when, what", c.length === 1 && c[0].by === ev("ME") && c[0].what === "a note" && c[0].ops.some(o=>o.type === "notes" && o.id === "nQ"));
    ok("C1: the log never records itself, or a stamp", !c[0].ops.some(o=>o.type === "changes" || o.field === "edited" || o.field === "added"));
    ok("C1: the file says it uses these, so older copies open it read-only", (f.meta.features || []).includes("added") && f.meta.features.includes("changes"), JSON.stringify(f.meta.features));
    await ev("startEditing(false)"); await wait(40); ev("commit(s=>{ s.bars[0].label = 'Saved edit'; })"); await ev("save()"); await wait(40);
    const c2 = JSON.parse(handle._text).changes;
    ok("C2: a save writes one record too, describing what changed", c2.length === 2 && /Saved edit|title/.test(c2[1].what), c2[1] && c2[1].what);
    ok("C3: the log is kept short (at most 1,000, the last 30 days)", ev("pruneChanges(Array.from({length:1001}, (_, i)=>({id:'c'+i, by:'', at:new Date().toISOString(), what:'x', ops:[]}))).length") === 1000 && ev("pruneChanges([{id:'old', by:'', at:'2020-01-01T00:00:00Z', what:'x', ops:[]}]).length") === 0); });

  await sec(async ()=>{ const {d, ev} = await page({file:false});
    ev("commit(s=>{ s.notes.push({id:'nA', lane:s.lanes[0].id, date:s.meta.start, text:'hi', author:ME}); }); select('note', 'nA'); render();"); await wait(10);
    ok("U1: a card says who added it", /Added by /.test(d.querySelector("#f-addedby")?.textContent || ""), d.querySelector("#f-addedby")?.textContent);
    ok("U2: a note's author is shown, not editable", !d.querySelector("#f-nauth") && !!d.querySelector("#f-nwho"));
    ev("select('bar', S.bars.find(b=>!b.added).id); render();"); await wait(10);
    ok("U3: something from before this version says so", /before names were tracked/.test(d.querySelector("#f-addedby")?.textContent || "")); });

  await sec(async ()=>{ const {d, ev} = await page({file:false});
    ev(`commit(s=>{ s.bars.push({id:'bMine', lane:s.lanes[0].id, start:1, span:2, label:'Mine', kind:'work', owners:[], jira:'', epics:[], status:'notstarted', dependsOn:[], tasks:[], datesFrom:'manual'}); });
      S.bars.push({id:'bTheirs', lane:S.lanes[0].id, start:1, span:2, label:'Theirs', kind:'work', owners:[], jira:'', epics:[], status:'notstarted', dependsOn:[], tasks:[], datesFrom:'manual', added:{by:OTHER, at:'2026-09-20T10:00Z'}});
      S.bars.push({id:'bJira', lane:S.lanes[0].id, start:1, span:2, label:'ABC-1', kind:'work', owners:[], jira:'ABC-1', epics:[], status:'notstarted', dependsOn:[], tasks:[], datesFrom:'manual', added:{by:OTHER, at:'2026-09-20T10:00Z'}});
      setWs('timeline'); setZoom('weeks'); setLayer('mine');`); await wait(10);
    const has = id => !!d.querySelector(`#gantt [data-key="bar:${id}"]`);
    ok("L1: Mine shows what I added and Jira's work, and hides what others added", has("bMine") && has("bJira") && !has("bTheirs"));
    ok("L1: and counts what it hides, including items with no recorded author", /added by others (is|are) hidden/.test(d.querySelector("#hiddenStrip").textContent) && /no recorded author/.test(d.querySelector("#hiddenStrip").textContent), d.querySelector("#hiddenStrip").textContent); });

  await sec(async ()=>{ const {d, ev} = await page();
    await ev("quickSave('parked 2 epics', s=>{ s.meta.jiraSkip = ['ABC-1','ABC-2']; })"); await wait(40);
    ev("UI.planTab = 'activity'; setWs('plan');"); await wait(10);
    const a = d.querySelector("#actList");
    ok("V1: Plan, then Activity lists each change with who and what", !!a && /parked 2 epics/.test(a.textContent) && a.textContent.includes(ev("personName(ME)"))); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    const r = ev(`(()=>{ const src = JSON.parse(JSON.stringify(S)); src.bars[0].added = {by:"p-x", at:"2026-09-27T10:00Z"}; src.bars[1].added = {by:"bad id!", at:"nope"};
      const n = normalize(src, false); return JSON.stringify([n.bars[0].added, n.bars[1].added || null]); })()`);
    ok("N1: saved and opened again, stamps are kept (even for someone no longer on the team) and bad ones dropped", r === JSON.stringify([{by:"p-x", at:"2026-09-27T10:00Z"}, null]), r); });

  await sec(async ()=>{ const {d, ev, handle} = await page();
    await ev("quickSave('a note', s=>{ s.notes.push({id:'nB', lane:s.lanes[0].id, date:s.meta.start, text:'kept', author:ME}); })"); await wait(40);
    const older = JSON.parse(handle._text); delete older.meta.savedWith; delete older.meta.features; delete older.changes; older.notes.forEach(n=>{ delete n.added; delete n.edited; }); older.meta.revision++; handle._text = JSON.stringify(older, null, 2);
    await ev("refresh(true)"); await wait(60);
    ok("P1: when an older copy drops who added what, the page offers to put it back", /dropped who added what/.test(d.querySelector("#banners").textContent) && !!d.querySelector("#putBack"), d.querySelector("#banners").textContent.slice(0, 160));
    d.querySelector("#putBack").click(); await wait(80);
    const f = JSON.parse(handle._text);
    ok("P1: and putting it back restores it in the file", !!(f.notes.find(n=>n.id==='nB') || {}).added && (f.changes || []).length >= 1); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
