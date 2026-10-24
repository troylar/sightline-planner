const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R=[]; const ok=(n,c,x="")=>R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
let confirmAnswer=true;
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.indexedDB=undefined; w.confirm=()=>confirmAnswer; w.prompt=()=>"T"; w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.HTMLAnchorElement.prototype.click=function(){};
  w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
const w=dom.window,d=w.document,ev=s=>w.eval(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await wait(150);
  ok("paste/open plan in local mode", ev(`loadExternal(${JSON.stringify(plan)},"test")`)===true); await wait(50); ev("setWs('timeline')");
  ok("29 bars rendered", d.querySelectorAll(".bar").length===29 && d.querySelectorAll(".flag").length>=8);
  let err=""; try { ev(`parseText(JSON.stringify({lanes:[{id:"a"}],bars:[{id:"x",lane:"a"},{id:"x",lane:"a"}]}))`); } catch(e){ err=e.message; }
  ok("duplicate ids rejected", /Duplicate id "x"/.test(err));
  ok("same id in lanes+bars allowed", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"a",lane:"a"}]},true).bars[0].id`)==="a");
  const mig = ev(`JSON.stringify(normalize({lanes:[{id:"a",name:"A"}],flags:[{lane:"a",at:2,label:"stretch",kind:"stretch"},{lane:"a",at:3,label:"Pilot",kind:"realistic"}]},false).milestones)`);
  ok("v1 stretch preserved", /"stretchAt":2/.test(mig) && /"at":3/.test(mig));
  ok("horizon extends", ev(`normalize({lanes:[{id:"a"}],bars:[{id:"b",lane:"a",start:20,span:4}]},false).meta.weeks`)>=24);
  ok("loop detection", ev('reaches("c2","c1")')===true && ev('reaches("c1","c2")')===false);
  confirmAnswer=false; const wk=ev("S.meta.weeks"); ev('changeSprints(s=>s.sprints.splice(s.sprints.length-1,1))');
  ok("sprint shrink cancel", ev("S.meta.weeks")===wk);
  confirmAnswer=true; ev('changeSprints(s=>s.sprints.splice(s.sprints.length-1,1))');
  ok("sprint shrink confirm clamps", ev("S.meta.weeks")===wk-2 && ev("S.bars.every(b=>b.start+b.span<=S.meta.weeks+1e-9)"));
  ev("setPresent(true)");
  ok("present: inputs disabled, commit blocked", [...d.querySelectorAll(".sections input")].every(i=>i.disabled) && ev('commit(s=>s.meta.title="x")')===false);
  ev("setPresent(false)");
  const b=ev("past.length"); ["a","ab","abc"].forEach(t=>ev(`commit(s=>s.meta.title="${t}",{quiet:true,coalesce:"title"})`));
  ok("typing = one undo", ev("past.length")===b+1);
  ev('undo()'); ok("undo restores", ev("S.meta.title")!=="abc");
  ev('commit(s=>s.baseline={takenAt:"",start:s.meta.start,bars:{c3:{start:0,span:4,lane:"chat"}},milestones:{}})'); ev("render()");
  ok("baseline slip shown", /\+2w/.test(d.querySelector("#gantt").textContent) && d.querySelectorAll(".ghost").length>=1);
  ev(`S=normalize({lanes:[{id:"a",name:"<img src=x onerror=alert(1)>"}],bars:[{id:"b",lane:"a",label:"<script>bad()</script>"}]},false); render();`);
  ok("no HTML injection", !d.querySelector("#gantt img") && !d.querySelector("#gantt script"));
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
