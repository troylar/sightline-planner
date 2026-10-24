const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
function makeHandle(name, text){ const h = {name,_text:text,_gone:false,writes:0,
  async getFile(){ if (h._gone){ const e=new Error("gone"); e.name="NotFoundError"; throw e; } const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
const handle = makeHandle("sample-plan.json", plan);
let confirmAnswer = true; const downloads = [];
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>confirmAnswer; w.prompt = ()=>"Tester";
  w.URL.createObjectURL=b=>{downloads.push(b);return "blob:x";}; w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){};
  w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message));
}});
const w=dom.window, d=w.document, ev=s=>w.eval(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
const banner=()=>d.querySelector("#banners").textContent + " " + (d.querySelector("#editstrip")?.textContent||""), fileJson=()=>JSON.parse(handle._text);
const otherLock = (by="Hank") => { const j=fileJson(); j.meta.lock={by,id:"other-session",at:new Date().toISOString()}; return j; };
(async()=>{
  ok("locked before startup finishes", ev("locked")===true);
  await wait(150);
  ok("then local + editable", ev("locked")===false && ev("editable()")===true);
  d.querySelector("#link").click(); await wait(150);
  ok("adopt loads file", ev("S.bars.length")===29);
  ok("linked file opens read-only", ev("editable()")===false && !d.querySelector("#startEdit").hidden && d.querySelector("#saveFile").hidden);
  ok("edit blocked while read-only", ev('commit(s=>s.meta.title="x")')===false);
  await ev("startEditing(false)"); await wait(50);
  ok("start editing writes my lock", fileJson().meta.lock?.id===ev("SESSION") && fileJson().meta.lock.by==="Tester" && ev("editable()")===true);
  ev('commit(s=>s.bars[0].label="Mine")');
  ok("dirty + save enabled", ev("file.dirty")===true && !d.querySelector("#saveFile").disabled);
  await ev("save()"); await wait(50);
  ok("save writes, keeps lock, rev 1", fileJson().bars[0].label==="Mine" && fileJson().meta.lock?.id===ev("SESSION") && fileJson().meta.revision===1);
  // takeover by teammate, then I try to save
  ev('commit(s=>s.bars[1].label="Mine2")');
  handle._text = JSON.stringify(otherLock("Hank"),null,2);
  const wb = handle.writes; await ev("save()"); await wait(50);
  ok("save blocked after takeover", handle.writes===wb && /Hank took over/.test(banner()));
  // overwrite path but file changes again first
  const theirs2 = otherLock("Hank"); theirs2.bars[5].label="Hank again"; handle._text = JSON.stringify(theirs2);
  [...d.querySelectorAll("#banners button")].find(b=>/Overwrite with mine/.test(b.textContent)).click(); await wait(80);
  ok("overwrite aborts if file changed again", handle.writes===wb && /changed again/.test(banner()));
  // now load file version
  [...d.querySelectorAll("#banners button")].find(b=>/Load file version/.test(b.textContent)).click(); await wait(80);
  ok("load file version: backup + read-only (Hank editing)", ev("S.bars[5].label")==="Hank again" && ev("editable()")===false && /Hank is editing/.test(banner()) && downloads.length>=1);
  // Hank finishes (releases lock)
  const rel = fileJson(); rel.meta.lock=null; rel.meta.revision=5; handle._text = JSON.stringify(rel);
  await ev("refresh(false)"); await wait(50);
  ok("refresh picks up release; read-only prompt to start", /Read-only/.test(banner()) && ev("S.meta.revision")===5);
  await ev("startEditing(false)"); await wait(50);
  ok("can start editing again", ev("editable()")===true);
  // expired lock by other is ignored
  ev('commit(s=>s.bars[2].label="x")'); await ev("doneEditing()"); await wait(50);
  ok("done editing releases lock", fileJson().meta.lock===null && ev("file.holdLock")===false && ev("editable()")===false);
  const exp = fileJson(); exp.meta.lock={by:"Old",id:"zzz",at:new Date(Date.now()-3600e3).toISOString()}; handle._text=JSON.stringify(exp);
  await ev("refresh(false)"); await wait(50); await ev("startEditing(false)"); await wait(50);
  ok("expired lock can be taken without override", ev("file.holdLock")===true);
  // forced refresh failure keeps dirty
  ev('commit(s=>s.bars[3].label="keepme")'); handle._text="{broken"; confirmAnswer=true;
  await ev("refresh(true,true)"); await wait(50);
  ok("forced refresh on broken file keeps dirty edits", ev("S.bars[3].label")==="keepme" && ev("file.dirty")===true);
  handle._text = JSON.stringify(exp);
  // missing file
  handle._gone=true; await ev("refresh(false)"); await wait(50);
  ok("missing file -> disconnected", ev("file.handle")===null && /moved, renamed or deleted/.test(banner()));
  handle._gone=false;
  // YAML alias rejection
  let err=""; try{ ev(`parseText("lanes: &a\\n  - {id: x}\\nbars: *a")`); }catch(e){ err=e.message; }
  ok("YAML aliases rejected", /anchors and aliases/.test(err));
  let yerr=""; try{ ev(`parseText("lanes:\\n  - id: a\\n    name: 'A & B *not alias*'\\nbars: []")`); }catch(e){ yerr=e.message; }
  ok("YAML with & inside quotes allowed", yerr==="", yerr);
  // contrast
  ok("dark text on light lane", ev('textOn("#f0e68c")')==="#1b2231" && ev('textOn("#1f5fa8")')==="#ffffff");
  ok("negative milestone clamped", ev(`normalize({lanes:[{id:"a"}],milestones:[{id:"m",lane:"a",at:-3}]},false).milestones[0].at`)===0);
  const future5 = new Date(Date.now()+5*60e3).toISOString(), future2h = new Date(Date.now()+2*3600e3).toISOString();
  ok("lock 5 min in future still active (clock skew)", ev(`lockOf({meta:{lock:{id:"o",by:"x",at:"${future5}"}}}).expired`)===false);
  ok("lock 2h in future treated as invalid", ev(`lockOf({meta:{lock:{id:"o",by:"x",at:"${future2h}"}}}).expired`)===true);
  ok("lock 29 min old active, 31 min expired", ev(`lockOf({meta:{lock:{id:"o",at:new Date(Date.now()-29*60e3).toISOString()}}}).expired`)===false && ev(`lockOf({meta:{lock:{id:"o",at:new Date(Date.now()-31*60e3).toISOString()}}}).expired`)===true);
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
