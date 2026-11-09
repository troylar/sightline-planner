// The offline check and the page agree (issue 169): every argument the assistant view exports has an exact type, and
// sightline-app.py check refuses the references and listed values the page refuses, with the page's own words, and
// accepts what the page accepts. Fixture: fixtures/sample-plan.json. Runs the checker built beside the page.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), os = require("os"), {execFileSync} = require("child_process");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const APP = process.env.SIGHTLINE_APP || path.join(path.dirname(DIST), "sightline-app.py");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; let f = 0; const ok = (n, c, x = "") => { if (!c) f++; R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + String(x).slice(0, 600) + ")" : ""}`); };
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 85000).unref();
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
  w.indexedDB = undefined; w.Element.prototype.scrollIntoView = ()=>{}; w.CSS = {escape:s=>s};
  w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})}); }});
setTimeout(()=>{
  const w = dom.window, ev = s=>w.eval(s); w.FIX = sample;
  ev(`S = normalize(JSON.parse(FIX), false); file.handle = null; render();`);
  // One of every kind the fixture lacks, so every action gets cases: a task, an outcome and a capture, a group, a skill,
  // what matters now, a risk, a milestone, a gate, an own item. Made through the actions themselves; every name is invented.
  const made0 = ev(`(()=>{ const b = S.bars[0].id, r = [["task.add", {id:"task-h1", bar:b, start:"2026-12-01", days:2, label:"Write it"}], ["outcome.add", {id:"dv-h1", name:"Faster search"}],
    ["outcome.add", {id:"dv-h2", name:"Export to CSV", capture:"request"}], ["group.add", {id:"grp-h1", name:"Support"}], ["skill.add", {id:"sk-h1", label:"Go"}],
    ["guidance.add", {id:"gd-h1", text:"Keep cloud cost flat", from:"2026-11-01"}], ["risk.add", {id:"risk-h1", text:"Vendor limits"}],
    ["milestone.add", {id:"ms-h1", what:"Pilot", day:"2026-12-10"}], ["gate.add", {id:"gate-h1", gate:"Security review", day:"2026-12-10"}],
    ["own.add", {id:"own-h1", text:"Call the vendor", owner:S.people[0].id}]].map(([a, x])=>[a, runAction(S, a, x)]);
    render(); return JSON.stringify(r.filter(([, x])=>!x.ok)); })()`);
  const ctx = JSON.parse(ev("JSON.stringify(assistantView())")), refs = (ctx.argTypes || {}).refs || {}, acts = ctx.actions;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl193-"));
  fs.writeFileSync(path.join(dir, "sightline-assistant-view.json"), JSON.stringify(ctx));
  const check = (changes, view = null) => { if (view) fs.writeFileSync(path.join(dir, "sightline-assistant-view.json"), JSON.stringify(view)); const b = {kind:"sightline-amendments", version:1, planId:ctx.plan.id, batchId:"h138", createdAt:new Date().toISOString(), source:"assistant", basedOn:{planRevision:ctx.plan.revision || 0}, changes};
    fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify(b));
    let out; try { out = execFileSync("python3", [APP, "check", dir, path.join(dir, "b.json"), "--json"], {encoding:"utf8"}); } catch(e){ out = e.stdout; }
    const r = JSON.parse(out), by = {}; ((r.lines) || []).forEach(l=>{ const m = /^change ([^,:]+)(?:, op \d+)?: (.*)$/.exec(l); if (m) (by[m[1]] = by[m[1]] || []).push(m[2]); }); return {r, by}; };
  const page = (ops) => JSON.parse(ev(`(()=>{ const p = clone(S); let last = {ok:true}; for (const o of ${JSON.stringify(ops)}){ last = runAction(p, o.action, o.args); if (!last.ok) break; } return JSON.stringify(last); })()`));

  // ids that exist, by kind, from the plan itself
  const have = JSON.parse(ev(`JSON.stringify(typeof ACT_REF === "undefined" ? {} : Object.fromEntries(Object.keys(ACT_REF).map(r=>[r, r.replace(/Id$/, "")]).map(([r, k])=>[r, (k === "initiative" ? S.bars : k === "task" ? S.bars.flatMap(b=>b.tasks || []) : k === "outcome" ? S.deliverables || [] : k === "item" ? [...(S.deliverables || []), ...S.bars] : k === "person" ? S.people : k === "group" ? S.groups || [] : k === "workstream" ? S.lanes : k === "milestone" ? S.milestones : k === "gate" ? S.gates : k === "guidance" ? S.guidance || [] : k === "own" ? S.own || [] : k === "skill" ? S.skills || [] : k === "meeting" ? S.meetings || [] : k === "risk" ? S.risks : k === "decision" ? S.decisions : S.sprints || []).map(x=>x.id)])))`));
  const alts = t => t.replace(/\?$/, "").split("|"), refOf = a => refs[a.replace(/\[\]$/, "")] ? a.replace(/\[\]$/, "") : null;
  const BASE = {id:"x-1", ids:[], keys:["ABC-1"], str:"x", num:1, int:1, bool:true, iso:"2026-12-01", isoOrAfter:"2026-12-01", isoOrNull:"2026-12-01", idOrBlank:"", who:null, weights:null, any:"x"};
  const fill = t => { for (const a of alts(t)){ if (a === "blank") return ""; if (a === "null") return null; const r = refOf(a); if (r){ if (!have[r].length) continue; return a.endsWith("[]") ? [have[r][0]] : have[r][0]; }
    if (a.endsWith("[]")) return []; if (a in BASE) return BASE[a]; return a; } return undefined; };
  const typeOf = (A, k, args) => k === "value" && A.fields && A.fields[args.field] ? A.fields[args.field] : A.args[k];

  // H1: no argument is "any" unless it's prev, or a setter's value whose fields say what each field takes
  const loose = acts.flatMap(A=>Object.entries(A.args).filter(([k, t])=>t.replace(/\?$/, "") === "any" && k !== "prev" && !(k === "value" && A.fields)).map(([k])=>A.id + "." + k));
  ok("H0 (setup) one of every kind is in the plan", made0 === "[]", made0);
  ok("H1 every exported argument has a type narrower than any", !loose.length, loose.join(", "));
  ok("H1b decision.add and risk.add say item is an initiative id", ["decision.add", "risk.add"].every(id=>acts.find(a=>a.id === id).args.item === "initiativeId|blank?"));
  const clash = acts.flatMap(A=>[...Object.values(A.args), ...Object.values(A.fields || {})]).flatMap(t=>alts(t)).filter(a=>!refOf(a) && !(a.replace(/\[\]$/, "") in BASE) && a !== "blank" && a !== "null" && (/Id$/.test(a) || a in BASE));
  ok("H1d no listed value can be read as a type or a reference (a word ending in Id would be)", !clash.length, [...new Set(clash)].join(", "));
  const word = (id, k) => (acts.find(a=>a.id === id) || {args:{}}).args[k];
  const lists = JSON.parse(ev(`JSON.stringify({channel:CHANNELS.map(c=>c[0]).join("|"), capture:CAPTURE_TYPES.map(c=>c[0]).join("|"), status:STATUS_IDS.join("|"), ms:MSTATUS.join("|"), rel:RELS.map(r=>r[0]).join("|")})`));
  ok("H1e listed values are the page's own lists (channel, capture type, status, milestone status, relation)", word("outcome.add", "channel") === lists.channel + "?" && word("outcome.raiseAgain", "channel") === lists.channel + "?" && word("outcome.add", "capture") === lists.capture + "?" &&
    word("initiative.setStatus", "status") === lists.status && word("task.setStatus", "status") === lists.status && word("milestone.add", "status") === lists.ms + "?" && word("outcome.relate", "rel") === lists.rel, JSON.stringify(lists));
  ok("H1c every reference names its noun, where it's listed and the message", Object.values(refs).every(r=>r.noun && r.in && r.missing === `That ${r.noun} isn't in the plan.`) && Object.keys(refs).length >= 15);

  // Cases: every reference argument (and every setter field that's a reference) given a missing id, an id of another
  // kind and an id that exists; every listed-values argument given a word that isn't listed.
  const cases = [];
  for (const A of acts){ if (A.id.startsWith("jira.")) continue;      // placements are checked against jiraSort, in harness130
    const targets = Object.entries(A.args).filter(([k])=>k !== "prev" && k !== "value").map(([k, t])=>[k, t, null]);
    if (A.fields) Object.entries(A.fields).forEach(([fld, t])=>targets.push(["value", t, fld]));
    for (const [k, t, fld] of targets){ const refAlts = alts(t).filter(refOf), words = alts(t).filter(a=>a !== "blank" && a !== "null" && !refOf(a) && !(a.replace(/\[\]$/, "") in BASE));
      if ((A.removes || []).includes(k)) continue;                      // H7b: what's removed isn't a reference
      if (!refAlts.length && !(words.length && words.length === alts(t).filter(a=>a !== "blank" && a !== "null").length)) continue;
      const args = {}; let skip = false;
      for (const [kk, tt] of Object.entries(A.args)){ if (kk === "prev") continue; if (kk === "id" && A.creates){ args.id = "new-" + A.id.replace(/\W/g, "-"); continue; }
        if (tt.endsWith("?") && kk !== k) continue; if (kk === "field"){ args.field = fld || Object.keys(A.fields)[0]; continue; }
        const v = kk === "value" ? fill(A.fields ? A.fields[args.field] : tt) : fill(tt); if (v === undefined){ skip = true; break; } args[kk] = v; }
      if (skip) continue;
      const put = v => ({...args, [k]: refAlts.length && alts(t).some(a=>a.endsWith("[]")) && refAlts[0].endsWith("[]") ? [v] : v});
      const where = A.id + "." + (fld ? "value(" + fld + ")" : k);
      const gone = /^[a-z]+\.del$/.test(A.id) && k === "id";          // deleting what isn't there is already done, for both
      if (gone){ cases.push({where, kind:"gone", A, args:put("zz-missing"), want:"nochange"}); continue; }
      if (refAlts.length){ const r = refOf(refAlts[0]), other = Object.keys(have).find(o=>o !== r && o !== "itemId" && !(r === "itemId" && (o === "outcomeId" || o === "initiativeId")) && have[o].length && !refAlts.map(refOf).some(x=>have[x].includes(have[o][0])));
        cases.push({where, kind:"missing", A, args:put("zz-missing"), want:refs[r].missing});
        if (other) cases.push({where, kind:"other kind", A, args:put(have[other][0]), want:refs[r].missing});
        if (have[r].length) cases.push({where, kind:"exists", A, args:put(have[r][0]), want:null}); }
      else cases.push({where, kind:"unlisted word", A, args:{...args, [k]:"zz-not-a-choice"}, want:"one of"}); } }
  const changes = cases.map((c, i)=>({id:"c" + i, summary:c.where, ops:[{op:"action", action:c.A.id, args:c.args}]}));
  const {by} = check(changes);
  const bad = [], quiet = [], loud = [], TABLE = x => / isn't in the plan\.$| is one of | isn't a valid /.test(x);    // what the shared table decides
  cases.forEach((c, i)=>{ const pg = page([{action:c.A.id, args:c.args}]), py = by["c" + i] || [];
    if (c.want === "nochange"){ if (!pg.ok || !pg.nochange) bad.push(`${c.where}: page said ${pg.reason || "it changed something"}`); if (py.length) loud.push(`${c.where}: checker said ${py.join("; ")}`); }
    else if (c.want && c.want !== "one of"){ if (pg.ok || pg.reason !== c.want) bad.push(`${c.where} ${c.kind}: page said ${pg.ok ? "ok" : pg.reason}`); if (!py.includes(c.want)) quiet.push(`${c.where} ${c.kind}: checker said ${py.join("; ") || "ok"}`); }
    else if (c.want === "one of"){ if (pg.ok || !/ is one of /.test(pg.reason)) bad.push(`${c.where}: page said ${pg.ok ? "ok" : pg.reason}`); if (!py.some(x=>x === pg.reason)) quiet.push(`${c.where}: page "${pg.reason}", checker "${py.join("; ") || "ok"}"`); }
    else if (py.some(TABLE) && (pg.ok || !py.filter(TABLE).every(x=>x === pg.reason))) loud.push(`${c.where}: checker said ${py.join("; ")}, page ${pg.ok ? "accepted it" : "said " + pg.reason}`); });
  const nRef = cases.filter(c=>c.kind !== "unlisted word").length, nWord = cases.length - nRef;
  ok(`H2 the page refuses every missing or wrong-kind reference with "That … isn't in the plan." (${nRef} reference cases)`, !bad.length && nRef > 150, bad.slice(0, 8).join(" | "));
  ok(`H3 the checker refuses the same ones with the same words, and every unlisted value the way the page does (${nWord} value cases)`, !quiet.length && nWord >= 12, quiet.slice(0, 8).join(" | "));
  ok("H4 the checker raises nothing about a reference that exists, unless the page refuses it with the same words", !loud.length, loud.slice(0, 8).join(" | "));

  // H5 the issue's repro: a decision about a capture added in the same change. Both refuse it, the same way.
  const lane = ev("S.lanes[0].id"), repro = [{id:"r1", summary:"A capture and its decision", ops:[
    {op:"action", action:"outcome.add", args:{id:"dv-new", name:"Example request", lane, capture:"request"}},
    {op:"action", action:"decision.add", args:{id:"dec-new", text:"Example decision", item:"dv-new"}}]}];
  const pr = page(repro[0].ops), cr = check(repro).by.r1 || [];
  ok("H5 a decision whose item is a new capture: page and checker both say the initiative isn't in the plan", !pr.ok && pr.reason === "That initiative isn't in the plan." && cr.join() === "That initiative isn't in the plan.", JSON.stringify(pr) + " / " + cr.join("; "));
  const bar = ev("S.bars[0].id"), fine = [{id:"r2", summary:"A decision about an initiative", ops:[
    {op:"action", action:"initiative.add", args:{id:"b-new", lane, label:"New work", day:"2026-12-07"}}, {op:"action", action:"decision.add", args:{id:"dec-2", text:"Example", item:"b-new"}},
    {op:"action", action:"risk.add", args:{id:"risk-2", text:"Example", item:bar, sev:"high"}}]}];
  ok("H5b an initiative made earlier in the same change, or one already in the plan, is a good item for both", page(fine[0].ops).ok && !(check(fine).by.r2 || []).length, JSON.stringify(check(fine).by));

  // H6 setters: every field the view lists can be set; a field it doesn't list is refused by both
  const sf = [];
  for (const A of acts.filter(a=>a.fields)) for (const fld of Object.keys(A.fields)){
    const args = {}; for (const [kk, tt] of Object.entries(A.args)){ if (kk === "prev" || tt.endsWith("?")) continue; args[kk] = kk === "field" ? fld : kk === "value" ? fill(A.fields[fld]) : fill(tt); }
    if (Object.values(args).includes(undefined)) continue; const pg = page([{action:A.id, args}]); if (!pg.ok && /can't be set this way/.test(pg.reason)) sf.push(`${A.id} ${fld}: ${pg.reason}`); }
  ok("H6 every field in fields is one the page sets", !sf.length, sf.join(" | "));
  const bogus = acts.filter(a=>a.fields).map((A, i)=>({id:"f" + i, summary:A.id, ops:[{op:"action", action:A.id, args:Object.fromEntries(Object.entries(A.args).filter(([kk, tt])=>kk !== "prev" && !tt.endsWith("?")).map(([kk, tt])=>[kk, kk === "field" ? "zzField" : kk === "value" ? "x" : fill(tt)]))}]})).filter(c=>!Object.values(c.ops[0].args).includes(undefined));
  const bb = check(bogus).by, both = bogus.filter(c=>!page(c.ops).ok && (bb[c.id] || []).length);
  ok(`H6b a field fields doesn't list is refused by the page and the checker (${bogus.length} setters)`, both.length === bogus.length && bogus.length >= 9, bogus.filter(c=>!both.includes(c)).map(c=>c.summary).join(", "));

  // H7 what's being removed may already be gone: a link to a deleted item can still be removed, and neither refuses it
  ev(`runAction(S, "outcome.relate", {id:"dv-h1", to:"dv-h2", rel:"supports"}); runAction(S, "initiative.delivers.add", {id:S.bars[0].id, outcome:"dv-h2"}); runAction(S, "outcome.del", {id:"dv-h2"}); render();`);
  const ctx2 = JSON.parse(ev("JSON.stringify(assistantView())")), dangling = [{id:"g1", summary:"Unlink a deleted capture", ops:[{op:"action", action:"outcome.unrelate", args:{id:"dv-h1", to:"dv-h2"}}]},
    {id:"g2", summary:"Stop delivering a deleted capture", ops:[{op:"action", action:"initiative.delivers.remove", args:{id:ev("S.bars[0].id"), outcome:"dv-h2"}}]}];
  const gp = dangling.map(c=>page(c.ops)), gc = check(dangling, ctx2).by;
  ok("H7 a link to a deleted item can still be removed: the page does it and the checker doesn't refuse", gp.every(x=>x.ok) && !gc.g1 && !gc.g2, JSON.stringify(gp) + " / " + JSON.stringify(gc));
  const rem = acts.filter(a=>a.removes).flatMap(A=>A.removes.map(k=>({id:"x" + A.id.replace(/\W/g, "") + k, summary:A.id, A, k, ops:[{op:"action", action:A.id, args:Object.fromEntries(Object.entries(A.args).filter(([kk, tt])=>kk !== "prev" && !tt.endsWith("?")).map(([kk, tt])=>[kk, kk === k ? "zz-gone" : fill(tt)]))}]}))).filter(c=>!Object.values(c.ops[0].args).includes(undefined));
  const rc = check(rem, ctx2).by, remBad = rem.filter(c=>/isn't in the plan/.test(page(c.ops).reason || "") || (rc[c.id] || []).some(x=>/isn't in the plan/.test(x)));
  ok(`H7b no removal argument is checked as a reference, by either (${rem.length} cases)`, rem.length >= 15 && !remBad.length, remBad.map(c=>c.summary + "." + c.k + ": " + (page(c.ops).reason || "") + " / " + (rc[c.id] || []).join("; ")).join(" | "));

  // H8 an id made earlier in the batch counts, through any kind it can be: an action, or an {op:'add'}
  const earlier = [{id:"e1", summary:"New outcome", ops:[{op:"action", action:"outcome.add", args:{id:"dv-n", name:"New"}}]}, {id:"e2", summary:"Link it", ops:[{op:"action", action:"ref.add", args:{on:"dv-n", id:"ref-n", url:"https://docs.example.com/x"}}]},
    {id:"e3", summary:"New initiative", ops:[{op:"action", action:"initiative.add", args:{id:"b-n", lane:ev("S.lanes[0].id"), label:"New", day:"2026-12-07"}}]}, {id:"e4", summary:"Relate to it", ops:[{op:"action", action:"outcome.relate", args:{id:"dv-h1", to:"b-n", rel:"supports"}}]},
    {id:"e5", summary:"Add by op", ops:[{op:"add", type:"deliverable", id:"dv-x", value:{name:"Added by op"}}, {op:"action", action:"ref.add", args:{on:"dv-x", id:"ref-x", url:"https://docs.example.com/y"}}]}];
  const ec = check(earlier, ctx2).by, es = JSON.parse(ev(`(()=>{ const F = amParse(${JSON.stringify(JSON.stringify({kind:"sightline-amendments", version:1, planId:ctx2.plan.id, batchId:"h193e", createdAt:new Date().toISOString(), source:"assistant", basedOn:{planRevision:ctx2.plan.revision || 0}, changes:earlier}))}).file; AM = {file:F, name:"t"}; return JSON.stringify(amRows().map(x=>x.r.status)); })()`));
  ok("H8 ids made earlier in the batch (by an action or an add op, through item's either kind) count for both", !Object.keys(ec).length && es.every(x=>x === "ready"), JSON.stringify(ec) + " / " + JSON.stringify(es));
  ev("AM = null");

  // H9 a context cut short can't prove an id is missing, so the checker doesn't refuse one it can't see
  const cut = JSON.parse(JSON.stringify(ctx2)); cut.coverage.initiatives = {total:99, exported:cut.initiatives.length, omitted:99 - cut.initiatives.length}; cut.coverage.complete = false;
  const tc = check([{id:"t1", summary:"An initiative left out of the context", ops:[{op:"action", action:"initiative.setStatus", args:{id:"bar-not-exported", status:"done"}}]},
    {id:"t2", summary:"A person isn't cut short", ops:[{op:"action", action:"workstream.addMember", args:{id:ev("S.lanes[0].id"), person:"p-nobody"}}]}], cut).by;
  ok("H9 with initiatives left out, an unknown initiative isn't refused; people weren't left out, so an unknown person is", !tc.t1 && (tc.t2 || []).includes("That person isn't in the plan."), JSON.stringify(tc));

  // H10 a value of the wrong shape gets the same plain sentence from both, with no internal type names
  const shapes = [["risk.add", {id:"risk-s1", text:"x", owners:"Avery"}], ["workstream.setReserve", {id:ev("S.lanes[0].id"), reserve:"lots"}], ["decision.add", {id:"dec-s1", text:"x", due:"someday soon"}],
    ["outcome.set", {id:"dv-h1", field:"askedBy", value:7}], ["initiative.order", {ids:"m2"}], ["initiative.del", {id:5}], ["person.add", {id:"p-s1", name:"N", outside:"yes"}]].map(([a, x], i)=>({id:"s" + i, summary:a, ops:[{op:"action", action:a, args:x}]}));
  const sc = check(shapes, ctx2).by, sp = shapes.map(c=>page(c.ops).reason), sameWords = shapes.every((c, i)=>(sc[c.id] || []).join() === sp[i]);
  ok("H10b …with \"an\" before a vowel", sp.includes("id must be the id of an initiative.") && !sp.some(x=>/ a [aeiou]/.test(x)), sp.join(" | "));
  ok("H10 a wrong-shaped value: the same sentence from page and checker, in plain words", sameWords && sp.every(x=>/ must be | is one of | isn't a valid (value|id|list|number)\./.test(x) && !/Id\b|\bstr\b|\biso\b|\bint\b/.test(x)), sp.join(" | ") + " // " + shapes.map(c=>(sc[c.id] || []).join("; ")).join(" | "));
  // H11 a day in words is a date for both; a blank clears where blank is allowed
  const words = [{id:"w1", summary:"Escalate next friday", ops:[{op:"action", action:"risk.add", args:{id:"risk-w1", text:"x", escalateBy:"next friday"}}]},
    {id:"w2", summary:"Clear who asked", ops:[{op:"action", action:"outcome.set", args:{id:"dv-h1", field:"askedBy", value:""}}]}];
  const wc = check(words, ctx2).by;
  ok("H11 a day said in words, and clearing who asked, are accepted by both", words.every(c=>page(c.ops).ok) && !Object.keys(wc).length, JSON.stringify(words.map(c=>page(c.ops))) + " / " + JSON.stringify(wc));

  fs.rmSync(dir, {recursive:true, force:true});
  console.log(R.join("\n")); const n = R.length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
}, 300);
