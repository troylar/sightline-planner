const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8");
const results = []; const ok = (name, cond, extra="") => results.push(`${cond?"PASS":"FAIL"}  ${name}${extra?"  ("+extra+")":""}`);
function makeHandle(name, text){
  const h = {name, _text:text, _gone:false, writes:0,
    async getFile(){ if (h._gone){ const e=new Error("gone"); e.name="NotFoundError"; throw e; } const t=h._text; return {size:t.length, lastModified:Date.now(), text: async()=>t}; },
    async createWritable(){ let buf=""; return {write: async(x)=>{buf+=x;}, close: async()=>{ h._text=buf; h.writes++; }}; },
    async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } };
  return h;
}
const handle = makeHandle("sample-plan.json", plan);
let confirmAnswer = true; const downloads = [];
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){ this.open=true; }; w.HTMLDialogElement.prototype.close=function(){ this.open=false; };
  w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>confirmAnswer; w.prompt=()=>"Tester"; w.HTMLAnchorElement.prototype.click=function(){};
  w.URL.createObjectURL = (b)=>{ downloads.push(b); return "blob:x"; }; w.URL.revokeObjectURL=()=>{};
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s.replace(/"/g,'\\"');
  w.errors=[]; w.addEventListener("error",e=>w.errors.push(e.message));
}});
const w = dom.window, d = w.document, ev = s => w.eval(s);
const wait = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  await wait(150);
  ok("starts local with blank plan", ev("S.bars.length")===0 && !ev("locked"));
  // link file
  d.querySelector("#link").click(); await wait(150);
  ok("adopt loads file", ev("S.bars.length")===29, "bars="+ev("S.bars.length"));
  ok("linked + saved", ev("file.handle && !file.dirty") === true);
  ok("save disabled when clean", d.querySelector("#saveFile").disabled);
  // edit -> dirty
  ev('commit(s=>s.bars[0].label="Edited locally")');
  ok("edit marks dirty", ev("file.dirty")===true && !d.querySelector("#saveFile").disabled);
  // refresh with unchanged file while dirty must NOT discard
  await ev("refresh(false)"); await wait(50);
  ok("auto refresh keeps dirty edits when file unchanged", ev("S.bars[0].label")==="Edited locally");
  // teammate saves
  const theirs = JSON.parse(plan); theirs.bars[1].label = "Teammate change"; handle._text = JSON.stringify(theirs,null,2);
  await ev("refresh(false)"); await wait(50);
  ok("remote change while dirty -> conflict banner, no overwrite", ev("S.bars[0].label")==="Edited locally" && /changed while you have unsaved/.test(d.querySelector("#banners").textContent));
  // save must refuse (content changed)
  const writesBefore = handle.writes; await ev("save()"); await wait(50);
  ok("save refuses when file changed", handle.writes===writesBefore && /someone else saved/.test(d.querySelector("#banners").textContent));
  // choose overwrite with mine
  const btn = [...d.querySelectorAll("#banners button")].find(b=>/Overwrite with mine/.test(b.textContent));
  btn.click(); await wait(100);
  ok("overwrite writes mine + backs up theirs", handle.writes===writesBefore+1 && JSON.parse(handle._text).bars[0].label==="Edited locally" && downloads.length>=1, "downloads="+downloads.length);
  ok("revision incremented", JSON.parse(handle._text).meta.revision===1);
  // clean refresh picks up remote when not dirty
  const t2 = JSON.parse(handle._text); t2.bars[2].label="Remote clean update"; handle._text = JSON.stringify(t2);
  await ev("refresh(false)"); await wait(50);
  ok("clean refresh loads remote", ev("S.bars[2].label")==="Remote clean update");
  // malformed remote
  handle._text = "{not json"; await ev("refresh(false)"); await wait(50);
  ok("malformed remote not loaded, still connected", ev("S.bars.length")===29 && /can't be read/.test(d.querySelector("#banners").textContent));
  handle._text = JSON.stringify(t2);
  // file deleted
  handle._gone = true; await ev("refresh(false)"); await wait(50);
  ok("missing file -> disconnected, not 'saved'", ev("file.handle")===null && /moved, renamed or deleted/.test(d.querySelector("#banners").textContent) && d.querySelector("#linked").hidden);
  handle._gone = false;
  // duplicate ids rejected
  let err=""; try { ev(`parseText(JSON.stringify({lanes:[{id:"a"}],bars:[{id:"x",lane:"a"},{id:"x",lane:"a"}]}))`); } catch(e){ err=e.message; }
  ok("duplicate ids rejected", /Duplicate id "x"/.test(err));
  // v1 stretch migration
  const mig = ev(`JSON.stringify(normalize({lanes:[{id:"a",name:"A"}],flags:[{lane:"a",at:2,label:"stretch Oct 9",kind:"stretch"},{lane:"a",at:3,label:"Pilot",kind:"realistic"}]},false).milestones)`);
  ok("v1 stretch flags preserved", /"stretchAt":2/.test(mig) && /"at":3/.test(mig));
  // missing lane falls back
  ok("bar with unknown lane kept", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"b",lane:"zzz"}]},false).bars.length`)===1);
  // horizon extends for long items
  ok("items past horizon extend sprints", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"b",lane:"a",start:20,span:4}]},false).meta.weeks`)>=24);
  // cycle detection
  ev('commit(s=>{ const a=s.bars.find(b=>b.id==="c1"), b=s.bars.find(b=>b.id==="c2"); })');
  ok("reaches detects loop", ev('reaches("c2","c1")')===true && ev('reaches("c1","c2")')===false);
  // late uses Friday end
  ok("late false before Friday end", ev('isLate({status:"notstarted",kind:"work",start:0,span:0.1})')=== (ev("todayDay()") > ev("startDay()+Math.round(0.7)-3")));
  // sprint shrink with cancel keeps sprints
  confirmAnswer = false; const wk = ev("S.meta.weeks"); ev('changeSprints(s=>s.sprints.splice(s.sprints.length-1,1))');
  ok("sprint shrink cancelled keeps weeks", ev("S.meta.weeks")===wk);
  confirmAnswer = true; ev('changeSprints(s=>s.sprints.splice(s.sprints.length-1,1))');
  ok("sprint shrink confirmed clamps items", ev("S.meta.weeks")===wk-2 && ev("S.bars.every(b=>b.start+b.span<=S.meta.weeks+1e-9)"));
  // present mode disables inputs
  ev("setPresent(true)");
  ok("present disables table inputs", [...d.querySelectorAll(".sections input")].every(i=>i.disabled) && d.querySelector("#title").disabled);
  ok("present blocks commit", ev('commit(s=>s.meta.title="x")')===false);
  ev("setPresent(false)");
  // undo coalescing
  const before = ev("past.length"); ev('commit(s=>s.meta.title="a",{quiet:true,coalesce:"title"})'); ev('commit(s=>s.meta.title="ab",{quiet:true,coalesce:"title"})'); ev('commit(s=>s.meta.title="abc",{quiet:true,coalesce:"title"})');
  ok("typing = one undo step", ev("past.length")===before+1);
  // XSS check
  ev(`S=normalize({lanes:[{id:"a",name:"<img src=x onerror=alert(1)>"}],bars:[{id:"b",lane:"a",label:"<script>bad()</script>"}]},false); render();`);
  ok("no HTML injection", !d.querySelector("#gantt img") && !d.querySelector("#gantt script"));
  ok("no runtime errors", w.errors.length===0, w.errors.join(" | "));
  console.log(results.join("\n"));
  const fails = results.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${results.length-fails}/${results.length} passed`);
})();
