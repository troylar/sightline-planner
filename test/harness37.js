// Data safety, from the sixth review: never write over a newer copy's plan (quick update, Start editing, a save's retry);
// two people's first tags on one Jira item both win; a deletion a teammate's edit overrode is backed up; "Put them back"
// restores everything an older copy dropped; hiding a person hides their notes on cards too, with a way to show them;
// hiding a tag hides the initiative even if its tasks don't carry it; the page says when the sync fetched only part of
// the plan's Jira items. Each check fails on the build before this.
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
const NEWER = p => { const o = JSON.parse(p); o.meta.savedWith = "9.0.0"; o.meta.features = ["added", "holograms"]; o.holograms = [{id:"h1"}]; return JSON.stringify(o); };
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev, handle} = await page();
    const newer = NEWER(handle._text); handle._text = newer; const w0 = handle.writes;
    const r = await ev("quickSave('a note', s=>{ s.notes.push({id:'nQ', lane:s.lanes[0].id, date:s.meta.start, text:'hi', author:ME}); })"); await wait(40);
    ok("W1: a quick update never writes over a plan a newer Sightline saved since I looked", r === false && handle._text === newer && handle.writes === w0, String(r));
    ok("W1: it shows that plan, read-only, and says why", !!ev("tooNew()") && /saved by Sightline 9\.0\.0/.test(ev("document.querySelector('#status')?.textContent || ''") + ev("[...document.querySelectorAll('.banner, [role=status]')].map(x=>x.textContent).join(' ')")));
    await ev("startEditing(false)"); await wait(40);
    ok("W2: Start editing doesn't write its lock over it either", handle._text === newer && !ev("file.holdLock"));
    ok("W3: and nothing can serialize a newer plan (the last line of defense)", ev("(()=>{ try { serialize(S, 'plan.json'); return 'wrote'; } catch(e){ return 'refused'; } })()") === "refused"); });

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev("startEditing(false)"); await wait(40); ev("commit(s=>{ s.bars[0].label = 'Mine'; })");
    handle._text = NEWER(handle._text);
    const r = await ev("save()"); await wait(40);
    ok("W4: a save that finds a newer copy's plan in its way keeps my edits and doesn't write", !JSON.parse(handle._text).meta.savedWith.startsWith("1.") && ev("S.bars[0].label") === "Mine" && ev("file.dirty"), String(r)); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    const r = ev(`(()=>{ S.tags = [{id:'ta', name:'a', color:'#7a4fb3'}, {id:'tb', name:'b', color:'#1f8a70'}]; const base = clone(S), mine = clone(S), theirs = clone(S);
      mine.jiraItems = [{id:'ABC-12', tags:['tb']}]; theirs.jiraItems = [{id:'ABC-12', tags:['ta']}];
      const m = mergePlans(base, mine, theirs); return JSON.stringify((m.plan.jiraItems[0].tags || []).slice().sort()); })()`);
    ok("M1: two people tagging the same Jira item for the first time both keep their tag", r === JSON.stringify(["ta","tb"]), r); });

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev("startEditing(false)"); await wait(40);
    const id = ev("S.bars.find(b=>isLeafBar(b) && !(b.tasks||[]).length && !kidsOf(b.id).length).id");
    ev(`window.ID = ${JSON.stringify(id)}; window.THEIRS = parseText(file.baseText); THEIRS.bars.find(b=>b.id===ID).label = 'Teammate renamed'; commit(s=>{ s.bars = s.bars.filter(b=>b.id!==ID); });`);
    const d0 = ev("downloads"); ev("rebaseOnto(THEIRS, file.baseText)");
    ok("M2: when a teammate's edit keeps an item I deleted, my version is downloaded first", ev("downloads") > d0 && !!ev("barById(ID)")); });

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev(`quickSave('setup', s=>{ s.tags = [{id:'t1', name:'q4', color:'#7a4fb3'}]; const b = s.bars.find(x=>isLeafBar(x)); b.tags = ['t1']; b.jiraDeps = ['ABC-9'];
      s.jiraItems = [{id:'ABC-9', tags:['t1']}]; s.notes.push({id:'nJ', lane:s.lanes[0].id, date:s.meta.start, text:'on a story', author:ME, on:'jira:ABC-9'}); })`); await wait(40);
    const prev = handle._text, o = JSON.parse(prev);
    delete o.meta.savedWith; delete o.meta.features; delete o.tags; delete o.jiraItems; delete o.changes; o.notes = o.notes.filter(n=>!String(n.on||"").startsWith("jira:")); o.bars.forEach(b=>{ delete b.tags; delete b.jiraDeps; delete b.added; delete b.edited; });
    o.meta.revision = (o.meta.revision || 0) + 1; handle._text = JSON.stringify(o);
    ev(`window.PREV = ${JSON.stringify(prev)}; putBack(parseText(PREV))`); await wait(80);
    const f = JSON.parse(handle._text), b = f.bars.find(x=>(x.tags||[]).includes("t1"));
    ok("O1: Put them back restores tags and their definitions", (f.tags || []).some(t=>t.id === "t1") && !!b);
    ok("O1: Jira items' tags", (f.jiraItems || []).some(x=>x.id === "ABC-9" && x.tags.includes("t1")));
    ok("O1: notes and dependencies on Jira items", f.notes.some(n=>n.id === "nJ" && n.on === "jira:ABC-9") && !!b && (b.jiraDeps || []).includes("ABC-9")); });

  await sec(async ()=>{ const {d, ev} = await page({file:false});
    const id = ev("S.bars.find(b=>isLeafBar(b) && b.lane).id");
    ev(`window.ID = ${JSON.stringify(id)}; S.notes.push({id:'nO', lane:S.lanes[0].id, date:S.meta.start, text:'from other', author:OTHER, on:'bar:' + ID, added:{by:OTHER, at:'2026-09-27T10:00:00Z'}}); setHide(h=>{ h.people.push(OTHER); }); select('bar', ID); render();`); await wait(10);
    ok("H1: hiding a person hides their note on an item's card", !/from other/.test(d.querySelector("#side .stickies").textContent) && ev("notesOn('bar:' + ID).length") === 0);
    ok("H1: and says so, with a way to show it", /1 more hidden by your view/.test(d.querySelector("#side #notesHidden")?.textContent || ""));
    d.querySelector("#side #notesReveal").click(); await wait(10);
    ok("H1: Show brings it back on that card", /from other/.test(d.querySelector("#side .stickies").textContent)); });

  await sec(async ()=>{ const {ev} = await page({file:false});
    const r = ev(`(()=>{ const b = S.bars.find(x=>isLeafBar(x) && x.lane); S.tags = [{id:'ts', name:'secret', color:'#7a4fb3'}]; b.tags = ['ts'];
      b.tasks = [{id:newId('task'), label:'T', start:S.meta.start, days:2, owners:[], jira:'', status:'notstarted'}]; S = normalize(JSON.parse(JSON.stringify(S)), false);
      UI.filter = normFilter({hideTags:['ts']}); render(); return barVisible(barById(b.id)); })()`);
    ok("T1: hiding a tag hides the initiative, even when its tasks don't carry it", r === false, String(r)); });

  await sec(async ()=>{ const {d, ev} = await page({file:false});
    ev(`JIRA = parseJiraStatus(JSON.stringify({kind:'sightline-jira-status', generatedAt:new Date().toISOString(), jiraBase:'https://jira.example.com', missing:[], issues:{}, keysCut:{linked:2400, fetched:2000}, rollups:{}})); UI.planTab = 'epics'; setWs('plan'); render();`); await wait(10);
    ok("K1: the page says when the sync fetched only part of the plan's Jira items", /links 2400 Jira items; the sync fetches at most 2000/.test(d.querySelector("#jiraKeysCut")?.textContent || "")); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
