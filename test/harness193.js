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
  ok("H1b decision.add and risk.add say item is an initiative's or an outcome's id", ["decision.add", "risk.add"].every(id=>acts.find(a=>a.id === id).args.item === "initiativeId|outcomeId|blank?") && ["decision.set", "risk.set"].every(id=>acts.find(a=>a.id === id).fields.item === "initiativeId|outcomeId|blank"));
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
      for (const [kk, tt] of Object.entries(A.args)){ if (kk === "prev") continue; if (kk === "id" && A.creates){ args.id = "new-" + A.id.replace(/\W/g, "-") + "-" + k + (fld ? "-" + fld : ""); continue; }   // one id per argument: in one batch, an add with an id made earlier is already done
        if (tt.endsWith("?") && kk !== k) continue; if (kk === "field"){ args.field = fld || Object.keys(A.fields)[0]; continue; }
        const v = kk === "value" ? fill(A.fields ? A.fields[args.field] : tt) : fill(tt); if (v === undefined){ skip = true; break; } args[kk] = v; }
      if (skip) continue;
      const put = v => ({...args, [k]: refAlts.length && alts(t).some(a=>a.endsWith("[]")) && refAlts[0].endsWith("[]") ? [v] : v});
      const where = A.id + "." + (fld ? "value(" + fld + ")" : k);
      const gone = /^[a-z]+\.del$/.test(A.id) && k === "id";          // deleting what isn't there is already done, for both
      if (gone){ cases.push({where, kind:"gone", A, args:put("zz-missing"), want:"nochange"}); continue; }
      if (refAlts.length){ const r = refOf(refAlts[0]), miss = refAlts.length > 1 ? "That isn't an initiative, an outcome or a request in the plan." : refs[r].missing, other = Object.keys(have).find(o=>o !== r && o !== "itemId" && !(r === "itemId" && (o === "outcomeId" || o === "initiativeId")) && have[o].length && !refAlts.map(refOf).some(x=>have[x].includes(have[o][0])));
        cases.push({where, kind:"missing", A, args:put("zz-missing"), want:miss});
        if (other) cases.push({where, kind:"other kind", A, args:put(have[other][0]), want:miss});
        if (have[r].length) cases.push({where, kind:"exists", A, args:put(have[r][0]), want:null}); }
      else cases.push({where, kind:"unlisted word", A, args:{...args, [k]:"zz-not-a-choice"}, want:"one of"}); } }
  // One new id per case: in one batch, an add whose id an earlier add used may be a replay, already done, so it's never refused
  cases.forEach((c, i)=>{ if (c.A.creates && typeof c.args.id === "string" && c.args.id.startsWith("new-")) c.args = {...c.args, id:c.args.id.slice(0, 52) + "-" + i}; });
  const changes = cases.map((c, i)=>({id:"c" + i, summary:c.where, ops:[{op:"action", action:c.A.id, args:c.args}]}));
  const {by} = check(changes);
  // A change that moves an own item into a task makes it a task for the changes after it, as the page would: check those alone
  cases.forEach((c, i)=>{ if (c.A.id === "own.toTask") by["c" + i] = check([changes[i]]).by["c" + i]; });
  const bad = [], quiet = [], loud = [], TABLE = x => / isn't in the plan\.$| is one of | isn't a valid /.test(x);    // what the shared table decides
  cases.forEach((c, i)=>{ const pg = page([{action:c.A.id, args:c.args}]), py = by["c" + i] || [];
    if (c.want === "nochange"){ if (!pg.ok || !pg.nochange) bad.push(`${c.where}: page said ${pg.reason || "it changed something"}`); if (py.length) loud.push(`${c.where}: checker said ${py.join("; ")}`); }
    else if (c.want && c.want !== "one of"){ if (pg.ok || pg.reason !== c.want) bad.push(`${c.where} ${c.kind}: page said ${pg.ok ? "ok" : pg.reason}`); if (!py.includes(c.want)) quiet.push(`${c.where} ${c.kind}: checker said ${py.join("; ") || "ok"}`); }
    else if (c.want === "one of"){ if (pg.ok || !/ is one of /.test(pg.reason)) bad.push(`${c.where}: page said ${pg.ok ? "ok" : pg.reason}`); if (!py.some(x=>x === pg.reason)) quiet.push(`${c.where}: page "${pg.reason}", checker "${py.join("; ") || "ok"}"`); }
    else if (py.some(TABLE) && (pg.ok || !py.filter(TABLE).every(x=>x === pg.reason))) loud.push(`${c.where}: checker said ${py.join("; ")}, page ${pg.ok ? "accepted it" : "said " + pg.reason}`); });
  const nRef = cases.filter(c=>c.kind !== "unlisted word").length, nWord = cases.length - nRef;
  ok(`H2 the page refuses every missing or wrong-kind reference with "That … isn't in the plan." or, for an item, "That isn't an initiative, an outcome or a request in the plan." (${nRef} reference cases)`, !bad.length && nRef > 150, bad.slice(0, 8).join(" | "));
  ok(`H3 the checker refuses the same ones with the same words, and every unlisted value the way the page does (${nWord} value cases)`, !quiet.length && nWord >= 12, quiet.slice(0, 8).join(" | "));
  ok("H4 the checker raises nothing about a reference that exists, unless the page refuses it with the same words", !loud.length, loud.slice(0, 8).join(" | "));

  // H5 the issue's repro, since 1.186.0: a decision about a capture added in the same change is accepted by both.
  const lane = ev("S.lanes[0].id"), repro = [{id:"r1", summary:"A capture and its decision", ops:[
    {op:"action", action:"outcome.add", args:{id:"dv-new", name:"Example request", lane, capture:"request"}},
    {op:"action", action:"decision.add", args:{id:"dec-new", text:"Example decision", item:"dv-new"}}]}];
  const pr = page(repro[0].ops), cr = check(repro).by.r1 || [];
  ok("H5 a decision whose item is a new capture: page and checker both accept it", pr.ok && !cr.length, JSON.stringify(pr) + " / " + cr.join("; "));
  // H5c an outcome or a capture already in the plan is a good item for both; a person's id is refused by both, naming both kinds
  const person = ev("S.people[0].id"), UNION = "That isn't an initiative, an outcome or a request in the plan.", kinds = [["out", "risk.add", {id:"risk-o1", text:"Example", item:"dv-h1"}], ["cap", "decision.add", {id:"dec-c1", text:"Example", item:"dv-h2"}],
    ["setcap", "risk.set", {id:"risk-h1", field:"item", value:"dv-h2"}], ["who", "decision.add", {id:"dec-p1", text:"Example", item:person}], ["setwho", "risk.set", {id:"risk-h1", field:"item", value:person}]].map(([id, action, args])=>({id, summary:action, ops:[{op:"action", action, args}]}));
  const kc = check(kinds).by, kp = kinds.map(c=>page(c.ops));
  ok("H5c an outcome id and a capture id are good items for page and checker (add and set)", kp.slice(0, 3).every(x=>x.ok) && !kc.out && !kc.cap && !kc.setcap, JSON.stringify(kp.slice(0, 3)) + " / " + JSON.stringify(kc));
  ok("H5d a person's id as item: both refuse it, naming an initiative, an outcome or a request", kp.slice(3).every(x=>!x.ok && x.reason === UNION) && (kc.who || []).join() === UNION && (kc.setwho || []).join() === UNION, JSON.stringify(kp.slice(3)) + " / " + JSON.stringify(kc));
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

  // H12 ops run in order (1.187.1): what an earlier op in the change did, or a ready change before it, decides whether
  // a later op is allowed, for the page and the checker alike. Each case says what the page must answer.
  const set12 = ev(`(()=>{ const b = S.bars[0].id, r = [["outcome.add", {id:"dv-o1", name:"Faster export"}], ["outcome.add", {id:"dv-c1", name:"Bulk edit", capture:"request"}],
    ["outcome.add", {id:"dv-c2", name:"Dark mode", capture:"idea"}], ["outcome.handoff", {id:"dv-c2", jira:"ABC-9"}], ["ref.add", {on:"dv-o1", id:"ref-o1", url:"https://docs.example.com/a"}],
    ["own.add", {id:"own-o1", text:"Book the room", owner:S.people[0].id}], ["own.add", {id:"own-o2", text:"Draft the memo", owner:S.people[0].id}], ["own.close", {id:"own-o1", as:"done"}],
    ["task.add", {id:"task-a", bar:b, start:"2026-12-14", days:2, label:"First"}], ["task.add", {id:"task-b", bar:b, after:["task-a"], days:2, label:"Second"}],
    ["initiative.add", {id:"b-x1", lane:S.lanes[0].id, label:"One", day:"2026-12-07"}], ["initiative.add", {id:"b-x2", lane:S.lanes[0].id, label:"Two", day:"2026-12-07"}],
    ["link.add", {id:"b-x2", after:"b-x1"}], ["outcome.add", {id:"dv-t1", name:"Partner API", target:"2027-Q2"}], ["outcome.raiseAgain", {id:"dv-c1", ask:"a0", origin:"rep-0"}],
    ["initiative.add", {id:"b-x3", parent:"b-x1", label:"Inside one", day:"2026-12-07"}], ["ref.add", {on:"b-x2", id:"ref-x2", url:"https://docs.example.com/x2"}]].map(([a, x])=>[a, runAction(S, a, x)]); render(); return JSON.stringify(r.filter(([, x])=>!x.ok)); })()`);
  ok("H12 (setup) the items for the order cases are in the plan", set12 === "[]", set12);
  const ctx3 = JSON.parse(ev("JSON.stringify(assistantView())")), A = (action, args) => ({op:"action", action, args}), stage = (id, value) => A("outcome.set", {id, field:"stage", value});
  const S_BAR = ev("S.bars[0].id"), S_LANE = ev("S.lanes[0].id"), PREV_O1 = JSON.parse(ev("JSON.stringify(dvSeen(dvById('dv-o1')))")), PLAN = "Pick a target to plan it.", ORDER = [
    ["plan-first", [stage("dv-o1", "planned"), A("outcome.setTarget", {id:"dv-o1", target:"2027-Q4"})], PLAN],
    ["target-first", [A("outcome.setTarget", {id:"dv-o1", target:"2027-Q4"}), stage("dv-o1", "planned")], null],
    ["target-cleared", [A("outcome.setTarget", {id:"dv-o1", target:"2027-Q4"}), A("outcome.setTarget", {id:"dv-o1"}), stage("dv-o1", "planned")], PLAN],
    ["dated", [A("outcome.add", {id:"dv-o9", name:"Audit log", target:"2027-Q2"}), stage("dv-o9", "planned")], null],
    ["handoff-uncaptured", [A("outcome.handoff", {id:"dv-o1", jira:"ABC-7"})], "Only a captured item is handed off. Give it a capture type first."],
    ["capture-then-handoff", [A("outcome.set", {id:"dv-o1", field:"capture", value:"request"}), A("outcome.handoff", {id:"dv-o1", jira:"ABC-7"})], null],
    ["declined-handoff", [A("outcome.drop", {id:"dv-c1", reason:"Out of scope"}), A("outcome.handoff", {id:"dv-c1", jira:"ABC-7"})], "It's declined. Reopen it first to hand it off."],
    ["reopen-handoff", [A("outcome.drop", {id:"dv-c1", reason:"Out of scope"}), A("outcome.reopen", {id:"dv-c1"}), A("outcome.handoff", {id:"dv-c1", jira:"ABC-7"})], null],
    ["drop-handed", [A("outcome.drop", {id:"dv-c2", reason:"Not now"})], "It's handed off already. Reopen it first to decline it."],
    ["reopen-drop", [A("outcome.reopen", {id:"dv-c2"}), A("outcome.drop", {id:"dv-c2", reason:"Not now"})], null],
    ["drop-capture-no-reason", [A("outcome.set", {id:"dv-o1", field:"capture", value:"idea"}), A("outcome.drop", {id:"dv-o1"})], "Say why it's declined: whoever asked will want to know."],
    ["open-already", [A("outcome.reopen", {id:"dv-c1"})], "It's open already."],
    ["ask-twice", [A("outcome.raiseAgain", {id:"dv-c1", ask:"a1"}), A("outcome.raiseAgain", {id:"dv-c1", ask:"a1"})], null],      // the same ask again is already done
    ["forwarded", [A("outcome.raiseAgain", {id:"dv-c1", ask:"a2", origin:"rep-1"}), A("outcome.raiseAgain", {id:"dv-c1", ask:"a3", origin:"rep-1"})], "That report is already recorded on it: a forwarded copy isn't a new report."],
    ["closed-to-task", [A("own.close", {id:"own-o2", as:"done"}), A("own.toTask", {id:"own-o2", initiativeId:S_BAR})], "It's closed. Reopen it first."],
    ["reopened-to-task", [A("own.reopen", {id:"own-o1"}), A("own.toTask", {id:"own-o1", initiativeId:S_BAR})], null],
    ["task-loop", [A("task.link", {id:"task-a", after:"task-b"})], "That would create a loop."],
    ["task-loop-new", [A("task.add", {id:"task-c", bar:S_BAR, after:["task-b"], days:1, label:"Third"}), A("task.link", {id:"task-a", after:"task-c"})], "That would create a loop."],
    ["after-nothing", [A("task.move", {id:"task-a", start:"after"})], "It waits for no task, so there's no after. Link it first (task.link), or give a date."],
    ["bar-loop", [A("link.add", {id:"b-x1", after:"b-x2"})], "That would create a loop."],
    ["bar-unlinked", [A("link.remove", {id:"b-x2", after:"b-x1"}), A("link.add", {id:"b-x1", after:"b-x2"})], null],
    ["same-link", [A("ref.add", {on:"dv-o1", id:"ref-o2", url:"https://docs.example.com/a"})], "That link is already on it."],
    ["link-twice", [A("ref.add", {on:"dv-o1", id:"ref-o3", url:"https://docs.example.com/b"}), A("ref.add", {on:"dv-o1", id:"ref-o4", url:"https://docs.example.com/b"})], "That link is already on it."],
    // what the page treats as already done is never refused, and changes nothing the ops after it read
    ["link-replayed", [A("ref.add", {on:"dv-o1", id:"ref-o1", url:"https://docs.example.com/a"})], null],
    ["add-replayed", [A("outcome.add", {id:"dv-t1", name:"Partner API"}), stage("dv-t1", "planned")], null],
    ["ask-removed", [A("outcome.unraise", {id:"dv-c1", ask:"a0"}), A("outcome.raiseAgain", {id:"dv-c1", ask:"a5", origin:"rep-0"})], null],
    ["not-https", [A("ref.add", {on:"dv-o1", id:"ref-o5", url:"http://docs.example.com/c"})], "A link starts with https:// and has no spaces."],
    ["handoff-nowhere", [A("outcome.handoff", {id:"dv-c1"})], "Hand it off to one initiative or one Jira issue."],
    ["deleted-and-back", [A("task.del", {id:"task-a"}), A("task.add", {id:"task-a", bar:S_BAR, start:"2026-12-14", days:1, label:"First again"}), A("task.link", {id:"task-a", after:"task-b"})], null],
    ["reason-not-doing", [A("own.close", {id:"own-o2", as:"done", why:"Not needed"})], "A reason goes with not doing it."],
    ["add-replayed-bad-lane", [A("outcome.add", {id:"dv-t1", name:"Partner API", lane:"lane-missing"})], null],
    ["closed-replayed", [A("own.close", {id:"own-o1", as:"done", why:""})], null],
    ["detached", [A("initiative.setParent", {id:"b-x3", parent:"", prev:"b-x1"}), A("link.add", {id:"b-x3", after:"b-x1"})], null],
    ["moved-out", [A("initiative.setLane", {id:"b-x3", lane:S_LANE}), A("link.add", {id:"b-x3", after:"b-x1"})], null],
    ["inside", [A("link.add", {id:"b-x3", after:"b-x1"})], "One of these is inside the other, so it can't wait for it."],
    ["deleted-bar-link", [A("initiative.del", {id:"b-x2"}), A("initiative.add", {id:"b-x2", lane:S_LANE, label:"Two", day:"2026-12-07"}), A("ref.add", {on:"b-x2", id:"ref-x9", url:"https://docs.example.com/x2"})], null],
    ["byte-order-mark", [A("ref.add", {on:"dv-o1", id:"ref-o6", url:"\uFEFFhttps://docs.example.com/bom"})], null],
    ["next-line", [A("ref.add", {on:"dv-o1", id:"ref-o7", url:"https://docs.example.com/nel\u0085"})], null],
    ["task-add-replayed", [A("task.add", {id:"task-a", bar:S_BAR, start:"2026-12-14", days:2, label:"First"}), A("task.move", {id:"task-b", start:"after"})], null],
    ["deleted-seen-and-back", [A("outcome.del", {id:"dv-o1", prev:PREV_O1}), A("outcome.add", {id:"dv-o1", name:"Checkout v2"}), A("ref.add", {on:"dv-o1", id:"ref-o8", url:"https://docs.example.com/a"})], null],
    ["to-task-then-task", [A("own.toTask", {id:"own-o2", initiativeId:S_BAR}), A("task.set", {id:"own-o2", field:"label", value:"Now a task"})], null],
    ["to-task-twice", [A("own.toTask", {id:"own-o2", initiativeId:S_BAR}), A("own.toTask", {id:"own-o2", initiativeId:S_BAR})], null],
    ["reid-then-rename", [A("workstream.reid", {lane:S_LANE, id:"lane-new"}), A("workstream.rename", {id:"lane-new", name:"Platform"})], null],
    ["group-replayed", [A("group.add", {id:"grp-new", name:"Example"}), A("group.add", {id:"grp-new", name:"Example", members:["person-left"]})], null]];
  const oc = ORDER.map(([id, ops, want])=>({id, summary:id, ops, want}));      // each its own batch: a ready change would change the next
  const od = oc.map(c=>{ const pg = page(c.ops), py = check([{id:c.id, summary:c.id, ops:c.ops}], ctx3).by[c.id] || [];
    return pg.ok === !c.want && (pg.ok || pg.reason === c.want) && (pg.ok ? !py.length : py.length === 1 && py[0] === c.want) ? null : `${c.id}: page ${pg.ok ? "ok" : pg.reason}, checker ${py.join("; ") || "ok"}`; }).filter(Boolean);
  ok(`H12 page and checker give the same answer when an earlier op in the change decides it (${oc.length} cases)`, !od.length && oc.length >= 20, od.join(" | "));
  // H12b a ready change before it counts too, in the panel's own reading of the batch: a target set in one change lets
  // the next plan it; after a refused one, the next is checked without it. H12c the checker never refuses a change the
  // panel finds ready because of a change before it that the panel refused and the checker couldn't tell.
  const ready = changes => JSON.parse(ev(`(()=>{ const F = amParse(${JSON.stringify(JSON.stringify({kind:"sightline-amendments", version:1, planId:ctx3.plan.id, batchId:"h193o" + Math.random().toString(36).slice(2, 8), createdAt:new Date().toISOString(), source:"assistant", basedOn:{planRevision:ctx3.plan.revision || 0}, changes}))}).file; AM = {file:F, name:F.batchId, hash:F.batchId}; amMemo = null; const r = amRows().map(x=>["ready", "done"].includes(x.r.status)); AM = null; return JSON.stringify(r); })()`));
  const across = [{id:"x1", summary:"Target", ops:[A("outcome.setTarget", {id:"dv-o1", target:"2027-Q4"})]}, {id:"x2", summary:"Plan it", ops:[stage("dv-o1", "planned")]}];
  const failed = [{id:"y1", summary:"Bad target", ops:[A("outcome.setTarget", {id:"dv-o1", target:"2027-Q4", date:"2027-01-04"})]}, {id:"y2", summary:"Plan it", ops:[stage("dv-o1", "planned")]}];
  const xa = check(across, ctx3).by, xb = check(failed, ctx3).by, ra = ready(across), rb = ready(failed);
  ok("H12b a change after a ready one is checked after it; after a refused one, without it", !Object.keys(xa).length && ra.join() === "true,true"
    && (xb.y1 || []).join() === "Give a target or a date, not both." && (xb.y2 || []).join() === PLAN && rb.join() === "false,false", JSON.stringify(xa) + " / " + JSON.stringify(xb) + " / " + ra + " / " + rb);
  const blind = [{id:"z1", summary:"Decline, and a length the page refuses", ops:[A("outcome.drop", {id:"dv-c1", reason:"Not now"}), A("task.move", {id:"task-a", days:999})]},
    {id:"z2", summary:"Hand it off", ops:[A("outcome.handoff", {id:"dv-c1", jira:"ABC-7"})]}];
  const zc = check(blind, ctx3).by, rz = ready(blind);
  ok("H12c a change the panel refuses (and the checker can't tell) doesn't make the checker refuse the next one", rz.join() === "false,true" && !zc.z2, rz + " / " + JSON.stringify(zc));
  // H12d a plain set before an action: the checker doesn't know what it did, so it doesn't refuse what follows
  const plain = [{id:"p1", summary:"Target by a plain set, then plan it", ops:[{op:"set", type:"deliverable", id:"dv-o1", field:"target", prev:null, value:"2027-Q1"}, stage("dv-o1", "planned")]}];
  const pc = check(plain, ctx3).by, rp = ready(plain);
  ok("H12d a plain set that gives a target, then planning it: the panel and the checker both accept it", rp.join() === "true" && !pc.p1, rp + " / " + JSON.stringify(pc));
  // H12e an add that may be a replay is never refused: with tasks left out of the context, a task's own add (no start)
  // is already done on the page. H12f an add replayed after an earlier change touched the item doesn't reset it.
  const cut3 = JSON.parse(JSON.stringify(ctx3)); cut3.coverage.complete = false; cut3.coverage.tasks = {total:99, exported:0, omitted:99}; cut3.initiatives.forEach(b=>{ b.tasks = []; });
  const re1 = [{id:"q1", summary:"Add a task that's there", ops:[A("task.add", {id:"task-a", bar:S_BAR, label:"First"})]}];
  ok("H12e with tasks left out of the context, replaying a task's add is accepted by both", page(re1[0].ops).ok && !check(re1, cut3).by.q1, JSON.stringify(page(re1[0].ops)) + " / " + JSON.stringify(check(re1, cut3).by));
  const re2 = [{id:"q2", summary:"Edit the request", ops:[A("outcome.set", {id:"dv-c1", field:"name", value:"Bulk edit, all rows"})]},
    {id:"q3", summary:"Its add again, then hand it off", ops:[A("outcome.add", {id:"dv-c1", name:"Bulk edit, all rows"}), A("outcome.handoff", {id:"dv-c1", jira:"ABC-7"})]}];
  const rq = ready(re2), cq = check(re2, ctx3).by;
  ok("H12f an add replayed after an earlier change edited the item doesn't make the checker refuse what follows", rq.join() === "true,true" && !Object.keys(cq).length, rq + " / " + JSON.stringify(cq));

  fs.rmSync(dir, {recursive:true, force:true});
  console.log(R.join("\n")); const n = R.length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
}, 300);
