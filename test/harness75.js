// Undo on change records: older steps are kept as the ops that undo them (a few KB, not a whole plan each), and undo and
// redo stay exact through a mix of edits, including ones the ops can't describe (which keep a full copy).
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
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {ev} = await page(); await ev("startEditing(false)"); await wait(30);
    const canon = () => ev("histCanon(JSON.parse(JSON.stringify(S)))");
    const s0 = canon();
    ev(`const L = S.lanes[0].id, B = S.bars[0], T = S.bars.find(b=>(b.tasks||[]).length);
      const edits = [
        s=>{ s.meta.title = "Renamed plan"; }, s=>{ s.bars[0].label = "First, renamed"; }, s=>{ s.bars[0].start += 1; },
        s=>{ s.bars.push({id:"bar-u1", lane:L, start:2, span:2, label:"New one", kind:"work", owners:[], jira:"", epics:[], status:"notstarted", dependsOn:[], tasks:[], datesFrom:"manual"}); },
        s=>{ s.bars = s.bars.filter(b=>b.id !== s.bars[1].id); }, s=>{ s.lanes.reverse(); }, s=>{ s.notes.push({id:"note-u1", text:"hello", author:"", lane:L, date:s.meta.start}); },
        s=>{ (s.deliverables = s.deliverables || []).push({id:"dv-u1", name:"Deliv", stage:"idea"}); }, s=>{ s.deliverables[0].target = "2027-Q2"; s.deliverables[0].stage = "planned"; },
        s=>{ s.meta.capRates = [{from:"2026-09-01", points:9}]; }, s=>{ s.meta.oddThing = "not a synced field"; },
        s=>{ const b = s.bars.find(x=>(x.tasks||[]).length); if (b) b.tasks[0].label = "Task renamed"; }, s=>{ s.holidays = [...(s.holidays||[]), {date:"2026-12-24", name:"Eve"}]; },
        s=>{ s.people[0].name = "Someone else"; }, s=>{ s.bars[0].status = "done"; }];
      window.EDITS = edits.length; edits.forEach(fn=>commit(fn));`);
    const s1 = canon(), n = ev("EDITS");
    ok("U0: setup: the edits changed the plan and each is an undo step", s1 !== s0 && ev("past.length") >= n - 1, String(ev("past.length")));
    ok("M1: older steps are change records, not copies", ev("past.slice(0, -1).filter(x=>typeof x !== 'string').length") >= n - 3);
    ok("M2: a change record is a few hundred bytes, against a whole plan for a copy", ev("Math.max(...past.filter(x=>typeof x !== 'string').map(x=>x.n))") < 2000 && ev("past.slice(0, -1).filter(x=>typeof x === 'string').length") <= 2, ev("JSON.stringify(past.map(x=>typeof x === 'string' ? 'copy' : x.n))"));
    ok("M3: a change the ops can't describe keeps its copy (so undo stays exact)", ev("past.some(x=>typeof x === 'string')"));
    for (let i = 0; i < 40; i++) ev("undo()");
    ok("U1: undoing everything gets back to exactly the start", canon() === s0);
    for (let i = 0; i < 40; i++) ev("redo()");
    ok("U2: redoing everything gets back to exactly the end", canon() === s1);
    ev("undo(); undo(); undo();"); const mid = canon(); ev("redo(); undo();");
    ok("U3: undo and redo mixed stay exact", canon() === mid);
    ev("commit(()=>NOCHANGE)"); ev("undo()"); const afterNo = canon(); ev("redo()"); ev("undo()");
    ok("U4: a change that turns out to be nothing leaves the stack intact", canon() === afterNo && typeof ev("past[past.length - 1]") === "string"); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
