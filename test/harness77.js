// Jira is a read-only layer: its status and sprint dates show on Jira-linked items, but they are never written into the
// plan file, change records or unsaved-changes lists as if someone edited them. J4, J9 and J10 fail on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const P0 = JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8"));
// one leaf item linked to Jira issue A-1, planned as not started in weeks 1-2
const leaf = P0.bars.find(b=>!(b.epics||[]).length && b.kind !== "milestone" && !P0.bars.some(c=>c.parent === b.id || (c.dependsOn||[]).includes(b.id)) && !(b.dependsOn||[]).length && !(b.tasks||[]).length);
leaf.jira = "A-1"; leaf.status = "notstarted"; delete leaf.abandoned;
const START = leaf.start, SPAN = leaf.span;
const plan = JSON.stringify(P0, null, 2) + "\n", LEAF = leaf.id;
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; if (h.cross){ const c = h.cross; h.cross = null; h._text = c(h._text); } }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(fileText){
  const handle = makeHandle("plan.json", fileText || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(250);
  const ev = s => w.eval(s);
  w.document.querySelector("#link").click(); await wait(200);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb();");
  return {w, d: w.document, ev, handle};
}

const JS = start => JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:"2026-09-30T08:00:00Z", jiraBase:"https://jira.example.com", missing:[], rollups:{},
  issues:{"A-1":{summary:"s", status:"Done", category:"done", type:"Story", points:3, sprintId:42, sprintState:"closed", sprintStart:start, sprintEnd:"2026-10-09"}},
  sprints:[{id:42, name:"Sprint 42", state:"closed", start, end:"2026-10-09"}]});
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  const withJira = (ev, start) => ev(`JIRA = parseJiraStatus(${JSON.stringify(JS(start || "2026-09-28"))}); dropJiraMemos(); render();`);
  const leafIn = t => JSON.parse(t).bars.find(b=>b.id === LEAF);
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10);
    ok("J1 the linked item shows Jira's status", ev(`effStatus(S.bars.find(b=>b.id === "${LEAF}"))`) === "done" || ev(`S.bars.find(b=>b.id === "${LEAF}").status`) === "done", ev(`S.bars.find(b=>b.id === "${LEAF}").status`));
    ok("J2 drawing with Jira data leaves nothing unsaved", !ev("file.dirty"));
    await ev("startEditing(false)"); await wait(30);
    ev("commit(s=>{ s.meta.title = 'Renamed'; })");
    const unsaved = ev("JSON.stringify(describeUnsaved(unsavedOps() || []).map(r=>r.line))");
    ok("J3 unsaved changes list only the rename", JSON.parse(unsaved).length === 1, unsaved);
    await ev("save()"); await wait(40);
    const f = leafIn(handle._text), rec = JSON.parse(handle._text).changes.at(-1);
    ok("J4 the file keeps the plan's own status and weeks", f.status === "notstarted" && f.start === START && f.span === SPAN, JSON.stringify({status:f.status, start:f.start, span:f.span}));
    const jops = (rec && rec.ops || []).filter(o=>o.type === "bars" || o.type === "tasks");
    ok("J5 the change record has no Jira facts as edits", rec && jops.every(o=>o.field === "edited"), JSON.stringify(jops.map(o=>o.field)));
    ok("J6 and the page still shows Jira's status after saving", ev(`S.bars.find(b=>b.id === "${LEAF}").status`) === "done");
  });
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10);
    const r = await ev("quickSave('a note', s=>{ s.notes.push({id:'nJ', lane:s.lanes[0].id, date:s.meta.start, text:'hi', author:''}); })"); await wait(40);
    const f = leafIn(handle._text);
    ok("J7 a quick update doesn't write Jira's facts either", r === true && f.status === "notstarted" && f.start === START, JSON.stringify({r, status:f.status, start:f.start}));
  });
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10); await ev("startEditing(false)"); await wait(30);
    try { ev(`JIRA = null; dropJiraMemos(); render(); commit(s=>{ s.bars.find(b=>b.id === "${LEAF}").status = "atrisk"; })`); } catch(e){ ok("J8 setup", false, e.stack.split("\n").slice(0,4).join(" | ")); return; }
    await ev("save()"); await wait(40);
    ok("J8 once Jira no longer covers it, your own edit to that field saves", leafIn(handle._text).status === "atrisk", leafIn(handle._text).status);
  });
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10); await ev("startEditing(false)"); await wait(30);
    ev("commit(s=>{ s.meta.title = 'Renamed'; })"); withJira(ev, "2026-10-05"); await wait(10);
    const lines = ev("JSON.stringify(describeUnsaved(unsavedOps() || []).map(r=>r.line))");
    ok("J9 a newer Jira sync mid-edit doesn't show up as your unsaved change", JSON.parse(lines).length === 1, lines);
    ev("commit(s=>{ s.meta.title = 'Again'; })"); ev("undo()"); await wait(10); await ev("save()"); await wait(40);
    const f = leafIn(handle._text);
    ok("J10 after undo, saving still keeps the plan's own values", f.status === "notstarted" && f.start === START && JSON.parse(handle._text).meta.title === "Renamed", JSON.stringify({status:f.status, start:f.start, title:JSON.parse(handle._text).meta.title}));
  });
  // Review 14: the overlay must not outlive Jira's coverage, survive a plan being replaced, or reach a download.
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10); await ev("startEditing(false)"); await wait(30);
    ev("JIRA = null; dropJiraMemos(); render(); commit(s=>{ s.meta.title = 'No Jira now'; })"); await ev("save()"); await wait(40);
    const f = leafIn(handle._text);
    ok("K1 once Jira stops covering an item, saving keeps the plan's own values", f.status === "notstarted" && f.start === START, JSON.stringify({status:f.status, start:f.start}));
    ok("K1b and the page shows them again", ev(`S.bars.find(b=>b.id === "${LEAF}").status`) === "notstarted");
  });
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10);
    // unsaved edits held while not editing (as Save as you go leaves them when a teammate has the lock)
    ev("S.meta.title = 'Before the lock'; file.dirty = true;"); const edited = true;
    await ev("startEditing(false)"); await wait(30); await ev("save()"); await wait(40);
    const f = leafIn(handle._text);
    ok("K2 unsaved edits carried into Start editing don't bring Jira's values", edited && JSON.parse(handle._text).meta.title === "Before the lock" && (f.status === "notstarted" && f.start === START), JSON.stringify({status:f.status, title:JSON.parse(handle._text).meta.title}));
  });
  await sec(async ()=>{ const {ev, handle} = await page(); withJira(ev); await wait(10);
    const other = JSON.parse(plan); other.bars.find(b=>b.id === LEAF).status = "atrisk"; other.bars.find(b=>b.id === LEAF).jira = "A-1";
    ev(`window.confirm = ()=>true; loadExternal(${JSON.stringify(JSON.stringify(other))}, "import.json")`); await wait(60);
    ok("K3 an imported plan keeps its own value, not the old file's", ev(`planOfRecord(S).bars.find(b=>b.id === "${LEAF}").status`) === "atrisk", ev(`planOfRecord(S).bars.find(b=>b.id === "${LEAF}").status`));
  });
  await sec(async ()=>{ const {ev, d} = await page(); withJira(ev); await wait(10);
    ev("window.__dl = []; download = (t, n) => __dl.push(t);");
    d.querySelector("#saveYaml").click(); ev("backup(S, 'mine')");
    const [y, b] = ev("__dl");
    ok("K4 Download YAML has the plan's own status", /status: notstarted/.test((y || "").split(`id: ${LEAF}`)[1]?.split("\n  - ")[0] || ""), (y || "").length + " chars");
    ok("K5 a backup of your version has the plan's own status", b && JSON.parse(b).bars.find(x=>x.id === LEAF).status === "notstarted");
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
