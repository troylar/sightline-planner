// change engine: diff/apply round trips, fuzzed edits, and concurrent merges
const {JSDOM} = require("jsdom"); const fs = require("fs");
const html = fs.readFileSync(require("path").join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(require("path").join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R=[]; const ok=(n,c,x="")=>R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",beforeParse(w){ w.indexedDB=undefined; w.confirm=()=>true; w.alert=()=>{}; w.prompt=()=>""; w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;}; w.CSS=w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
const w=dom.window, ev=s=>w.eval(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  await wait(150);
  ev(`loadExternal(${JSON.stringify(plan)},"t")`); await wait(30);
  ev(`window.P0 = clone(S); window.norm = x => JSON.stringify(normalize(clone(x), false))`);
  ok("no change → no ops", ev("diffPlans(P0, P0).length")===0);
  // fuzz: random edits, then diff + apply on the original must reproduce the edited plan
  ev(`window.rnd = (n)=>Math.floor(Math.random()*n); window.pick = a=>a[rnd(a.length)];
  window.mutate = function(p){
    const k = rnd(16), b = pick(p.bars), l = pick(p.lanes);
    if (k===0 && b){ b.start = Math.max(0, b.start + pick([-1,-.5,.5,1])); }
    else if (k===1 && b){ b.label = b.label + " *"; }
    else if (k===2 && b){ b.tasks = b.tasks || []; b.tasks.push({id:newId("task"),label:"T",start:p.meta.start,days:1+rnd(4),owners:p.people.length?[pick(p.people).id]:[],jira:"",status:"notstarted"}); }
    else if (k===3){ const bb = p.bars.filter(x=>x.tasks && x.tasks.length); if (bb.length){ const x = pick(bb); x.tasks.splice(rnd(x.tasks.length),1); } }
    else if (k===4){ const bb = p.bars.filter(x=>x.tasks && x.tasks.length); if (bb.length && p.bars.length > 1){ const x = pick(bb), t = x.tasks.pop(), y = pick(p.bars.filter(z=>z!==x)); y.tasks = y.tasks || []; y.tasks.push(t); } }
    else if (k===5 && p.milestones.length){ p.milestones.splice(rnd(p.milestones.length),1); }
    else if (k===6 && l){ p.lanes.push(p.lanes.splice(p.lanes.indexOf(l),1)[0]); }
    else if (k===7){ p.notes.push({id:newId("note"),text:"n"+rnd(99),date:p.meta.start,lane:l.id,author:"",created:""}); }
    else if (k===8 && p.people.length){ const x = pick(p.people); x.days = 1 + rnd(5); x.off.push({from:p.meta.start,to:p.meta.start,note:"x"}); }
    else if (k===9 && b){ b.owners = p.people.slice(0, rnd(3)).map(x=>x.id); }
    else if (k===10){ p.meta.title = "T" + rnd(999); }
    else if (k===11){ p.holidays.push({date:dayToIso(isoToDay(p.meta.start) + 7*rnd(8) + rnd(5)), name:"H"}); p.holidays = [...new Map(p.holidays.map(h=>[h.date,h])).values()]; }
    else if (k===12 && p.gates.length){ pick(p.gates).blocks = "b" + rnd(9); }
    else if (k===13){ p.risks.push({id:newId("risk"),sev:"high",text:"r"}); }
    else if (k===14 && b){ p.bars.splice(p.bars.indexOf(b),1); p.bars.forEach(x=>x.dependsOn = x.dependsOn.filter(d=>d!==b.id)); }
    else if (k===15 && p.sprints.length > 1){ p.sprints.reverse(); }
  };`);
  ev(`window.canon = p => { const c = clone(p); (c.bars||[]).forEach(b=>{ b.tasks = b.tasks || []; }); c.holidays = (c.holidays||[]).slice().sort((x,y)=>x.date<y.date?-1:1); ["meta"].forEach(k=>{ delete c.meta.revision; delete c.meta.savedAt; delete c.meta.lock; }); return c; }`);
  let bad = 0, total = 0;
  for (let i=0;i<300;i++){ const r = ev(`(()=>{ const a = clone(P0); const b = clone(P0); for (let j=0;j<1+rnd(8);j++) mutate(b); const ops = diffPlans(a, b); const got = applyOps(a, ops).plan; return JSON.stringify(canon(got)) === JSON.stringify(canon(b)) ? "ok" : "bad"; })()`); total++; if (r!=="ok") bad++; }
  ok("fuzz: apply(diff(a,b)) on a == b  (300 random edit sets)", bad===0, `${bad} of ${total} differ`);
  ok("re-applying the same ops changes nothing (idempotent)", ev(`(()=>{ const a = clone(P0), b = clone(P0); for (let j=0;j<6;j++) mutate(b); const ops = diffPlans(a,b); const once = applyOps(a, ops).plan; const twice = applyOps(once, ops).plan; return JSON.stringify(canon(once)) === JSON.stringify(canon(twice)); })()`));
  // concurrent edits from the same base
  ok("two people, different items → both kept", ev(`(()=>{ const base = clone(P0), A = clone(base), B = clone(base); A.bars[0].label = "A edit"; B.bars[1].label = "B edit"; const m = applyOps(applyOps(base, diffPlans(base, A)).plan, diffPlans(base, B)).plan; return m.bars[0].label === "A edit" && m.bars[1].label === "B edit"; })()`));
  ok("two people, same item different fields → both kept", ev(`(()=>{ const base = clone(P0), A = clone(base), B = clone(base); A.bars[0].label = "A edit"; B.bars[0].start = 5; const m = applyOps(applyOps(base, diffPlans(base, A)).plan, diffPlans(base, B)).plan; return m.bars[0].label === "A edit" && m.bars[0].start === 5; })()`));
  ok("same field: later op wins", ev(`(()=>{ const base = clone(P0), A = clone(base), B = clone(base); A.bars[0].label = "first"; B.bars[0].label = "second"; const m = applyOps(applyOps(base, diffPlans(base, A)).plan, diffPlans(base, B)).plan; return m.bars[0].label === "second"; })()`));
  ok("delete vs edit → delete wins, edit is reported skipped", ev(`(()=>{ const base = clone(P0), A = clone(base), B = clone(base); const id = base.milestones[0].id; A.milestones = A.milestones.filter(m=>m.id!==id); B.milestones[0].what = "edited"; const r1 = applyOps(base, diffPlans(base, A)).plan; const r2 = applyOps(r1, diffPlans(base, B)); return !r2.plan.milestones.some(m=>m.id===id) && r2.skipped.length===1; })()`));
  ok("task moved by one person, edited by another → both apply", ev(`(()=>{ const base = clone(P0); base.bars[0].tasks = [{id:"tq",label:"x",start:base.meta.start,days:1,owners:[],jira:"",status:"notstarted"}]; const A = clone(base), B = clone(base); A.bars[1].tasks = A.bars[1].tasks || []; A.bars[1].tasks.push(A.bars[0].tasks.pop()); B.bars[0].tasks[0].label = "renamed"; const m = applyOps(applyOps(base, diffPlans(base, A)).plan, diffPlans(base, B)).plan; const t = m.bars[1].tasks.find(t=>t.id==="tq"); return !!t && t.label === "renamed" && !m.bars[0].tasks.length; })()`));
  ok("lists (decisions/risks) have stable ids", ev("S.decisions.every(x=>x.id) && S.risks.every(x=>x.id)") && ev(`normalize(clone(S),false).risks.map(r=>r.id).join()===S.risks.map(r=>r.id).join()`));
  ok("no runtime errors", w.errs.length===0, w.errs.join(" | "));
  console.log(R.join("\n")); const f=R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length-f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
