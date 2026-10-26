// A capture raised again (vision.md): the first ask stays in askedBy/raised/source, and each later time is a record in
// raisedAgain {id, who?, raised?, source?}. Records load clean and capped, an older copy opens such a plan read-only,
// merges keep both sides' records by id (a removal stays removed, a replay adds nothing twice), the assistant can propose
// one, and the page shows the count in To triage, lists the records on the card, and offers likely matches in the capture
// form, recorded only on a click. Fixed clock; the sample plan. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const HOSTILE = '<img src=x onerror="window.pwned=1"> Support desk';
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ if (!this.open) return; this.open = false; this.dispatchEvent(new w.Event("close")); };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };   // one check's error fails that check, not the run
  const q = s => d.querySelector(s), txt = s => (q(s) || {}).textContent || "";
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false);
        S.groups = [{id:'grp-support', name:${JSON.stringify(HOSTILE)}, members:[]}, {id:'grp-sales', name:'Sales engineers', members:[]}]; S.deliverables = []; render();
        window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const pa = J("S.people[0].id"), lane = J("S.lanes[0].id");
    const CAP = {id:"dv-c1", name:"Release notes for partner teams", stage:"idea", capture:"request", askedBy:{type:"group", id:"grp-support"}, raised:"2026-09-01", source:"Weekly sync"};

    // The data.
    const recs = [{id:"ask-1", who:{type:"group", id:"grp-sales"}, raised:"2026-09-15", source:"Partner review"}, {id:"ask-2"}, {id:"ask-1", raised:"2026-09-20"},
      {id:"bad id!", raised:"2026-09-21"}, {id:"ask-3", who:{type:"team", id:"x"}, raised:"09/22/2026", source:"x".repeat(80)}, "junk"];
    const n1 = T(`normalize({...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:${JSON.stringify(recs)}}]}, false).deliverables[0].raisedAgain`);
    ok("N1 raised-again records load as written; a repeated or bad id, bad who, bad date and junk are dropped, and where from is cut to 60",
      Array.isArray(n1) && n1.length === 3 && n1[0].who.id === "grp-sales" && n1[0].source === "Partner review" && n1[1].id === "ask-2" && !n1[1].who
      && n1[2].id === "ask-3" && !n1[2].who && !n1[2].raised && n1[2].source.length === 60, JSON.stringify(n1));
    const many = Array.from({length:70}, (_, i)=>({id:"ask-" + i}));
    ok("N2 a capture keeps at most 50 raised-again records", T(`normalize({...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:${JSON.stringify(many)}}]}, false).deliverables[0].raisedAgain.length`) === 50);
    const rt = T(`(()=>{ const p = {...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:${JSON.stringify(recs.slice(0, 2))}}]}; return [parseText(serialize(p, "p.json")).deliverables[0].raisedAgain, parseText(serialize(p, "p.yaml")).deliverables[0].raisedAgain]; })()`);
    ok("N3 JSON and YAML round-trip the records unchanged", Array.isArray(rt) && rt.every(L=>Array.isArray(L) && L.length === 2 && L[0].who.id === "grp-sales" && L[0].raised === "2026-09-15"), JSON.stringify(rt));
    const ro = T(`(()=>{ const f = featuresIn({deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:[{id:'ask-1'}]}]}), i = KNOWN_FEATURES.indexOf('captureAgain1'); if (i < 0) return null;
      KNOWN_FEATURES.splice(i, 1); const r = tooNew({meta:{features:f}}); KNOWN_FEATURES.splice(i, 0, 'captureAgain1'); return {has:f.includes('captureAgain1'), unknown:r && r.unknown, plain:featuresIn({deliverables:[${JSON.stringify(CAP)}]}).includes('captureAgain1')}; })()`);
    ok("N4 a raised-again record marks the plan, so a copy that doesn't know it opens the plan read-only instead of dropping it", ro && ro.has && !ro.plain && (ro.unknown || []).join() === "captureAgain1", JSON.stringify(ro));

    // Actions.
    ev(`window.Q = P(); Q.deliverables = [clone(${JSON.stringify(CAP)}), {id:'dv-road', name:'An ordinary roadmap idea', stage:'idea'}]`);
    const a1 = T(`[RA(Q, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-a', who:{type:'person', id:${JSON.stringify(pa)}}, raised:'2026-10-02', source:'Quarterly planning'}), Q.deliverables[0]]`);
    ok("A1 outcome.raiseAgain records who, where and when, and leaves the first ask as it was", a1 && a1[0].ok && a1[1].raisedAgain.length === 1 && a1[1].raisedAgain[0].who.id === pa
      && a1[1].raisedAgain[0].source === "Quarterly planning" && a1[1].askedBy.id === "grp-support" && a1[1].raised === "2026-09-01", JSON.stringify(a1 && a1[1]));
    const refusals = [
      ["not a capture", `RA(clone(Q), 'outcome.raiseAgain', {id:'dv-road', ask:'ask-x'})`],
      ["bad ask id", `RA(clone(Q), 'outcome.raiseAgain', {id:'dv-c1', ask:'no spaces'})`],
      ["unknown person", `RA(clone(Q), 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-y', who:{type:'person', id:'nobody'}})`],
      ["over the cap", `(()=>{ const p = clone(Q); p.deliverables[0].raisedAgain = Array.from({length:50}, (_, i)=>({id:'r' + i})); return RA(p, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-z'}); })()`]]
      .map(([n, s])=>[n, T(s)]).filter(([, r])=>!r || r.ok);
    ok("A2 refused: a record on something that isn't a capture, a bad id, someone not in the plan, or more than 50", T("amHas(planActions, 'outcome.raiseAgain')") === true && !refusals.length, refusals.map(x=>x[0]).join(", "));
    const rep = T(`(()=>{ const p = clone(Q), r = RA(p, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-a', source:'Replayed'}); return [r.ok, p.deliverables[0].raisedAgain]; })()`);
    ok("A2b the same ask again (a replay) changes nothing: still one record, as first written", rep && Array.isArray(rep[1]) && rep[1].length === 1 && rep[1][0].source === "Quarterly planning", JSON.stringify(rep));
    const un = T(`(()=>{ const p = clone(Q); RA(p, 'outcome.unraise', {id:'dv-c1', ask:'ask-nope'}); return [p.deliverables[0].raisedAgain.length, RA(Q, 'outcome.unraise', {id:'dv-c1', ask:'ask-a'}), Q.deliverables[0]]; })()`);
    ok("A3 outcome.unraise removes one record (the field goes when it's empty); one that isn't there changes nothing", un && un[0] === 1 && un[1].ok && !("raisedAgain" in un[2]), JSON.stringify(un && un[2]));
    const risk = k => T(`amRiskOf({ops:[{op:'action', action:'${k}', args:{}}]})`);
    ok("A4 an assistant's raised-again record is routine to review; removing one is risky", risk("outcome.raiseAgain") === "routine" && risk("outcome.unraise") === "risky" && !!T("ACTION_DESC['outcome.raiseAgain']"), [risk("outcome.raiseAgain"), risk("outcome.unraise")].join());
    const chk = T(`(()=>{ const p = clone(Q); return [amCheck({id:'c-1', ops:[{op:'action', action:'outcome.raiseAgain', args:{id:'dv-c1', ask:'ask-q', source:'Weekly sync'}}]}, p), amCheck({id:'c-2', ops:[{op:'action', action:'outcome.raiseAgain', args:{id:'dv-road', ask:'ask-q'}}]}, p)].map(x=>x.status); })()`);
    ok("A5 a proposal to record it is checked like any action: fine on a capture, invalid on a roadmap item", chk && chk[0] !== "invalid" && chk[1] === "invalid", JSON.stringify(chk));

    // Merges.
    const base = `{...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:[{id:'ask-0', source:'Kickoff'}]}]}`;
    const m1 = T(`(()=>{ const b = ${base}, mine = clone(b), theirs = clone(b); RA(mine, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-m', source:'Mine'}); RA(theirs, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-t', source:'Theirs'});
      return mergePlans(b, mine, theirs).plan.deliverables[0].raisedAgain.map(x=>x.id).sort(); })()`);
    ok("M1 two people record it raised again at once: a merge keeps both records", Array.isArray(m1) && m1.join() === "ask-0,ask-m,ask-t", JSON.stringify(m1));
    const m2 = T(`(()=>{ const b = ${base}, mine = clone(b), theirs = clone(b); RA(mine, 'outcome.unraise', {id:'dv-c1', ask:'ask-0'}); RA(theirs, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-t'});
      return mergePlans(b, mine, theirs).plan.deliverables[0].raisedAgain.map(x=>x.id); })()`);
    ok("M2 a record I removed stays removed while a teammate's new one is kept", Array.isArray(m2) && m2.join() === "ask-t", JSON.stringify(m2));
    const m3 = T(`(()=>{ const b = ${base}, mine = clone(b), theirs = clone(b); RA(mine, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-m'}); RA(theirs, 'outcome.raiseAgain', {id:'dv-c1', ask:'ask-t'});
      const ops = diffPlans(b, mine), once = applyOps(theirs, ops).plan, twice = applyOps(once, ops).plan; return [once.deliverables[0].raisedAgain.map(x=>x.id).sort(), twice.deliverables[0].raisedAgain.map(x=>x.id).sort()]; })()`);
    ok("M3 replaying my change on a teammate's newer file keeps their record and adds mine once, however often it's replayed", Array.isArray(m3) && m3[0].join() === "ask-0,ask-m,ask-t" && m3[1].join() === m3[0].join(), JSON.stringify(m3));
    const m4 = T(`(()=>{ const mine = {...clone(S), deliverables:[]}, theirs = {...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:[{id:'ask-t'}]}]}, after = {...clone(S), deliverables:[{...${JSON.stringify(CAP)}, raisedAgain:[{id:'ask-m'}]}]};
      return applyOps(theirs, diffPlans(mine, after)).plan.deliverables[0].raisedAgain.map(x=>x.id).sort(); })()`);
    ok("M4 when both sides added the same capture, its records from both are kept", Array.isArray(m4) && m4.join() === "ask-m,ask-t", JSON.stringify(m4));

    // The export an assistant reads.
    ev(`S.deliverables = [{...${JSON.stringify(CAP)}, lane:${JSON.stringify(lane)}, raisedAgain:[{id:'ask-1', who:{type:'group', id:'grp-support'}, raised:'2026-09-15', source:'Partner review'}, {id:'ask-2', raised:'2026-10-01'}]},
      {id:'dv-c2', name:'Who signs off a weekend release?', stage:'idea', capture:'question', added:{by:${JSON.stringify(pa)}, at:'2026-10-06T10:00:00Z'}},
      {id:'dv-road', name:'An ordinary roadmap idea', stage:'idea'}]; render()`);
    const view = T("assistantView()"), guide = view ? [].concat(view.guide).join("\n") : "";
    ok("E1 the export carries the records, and the guide says to record a repeat with outcome.raiseAgain rather than capture it twice", view && (view.deliverables.find(x=>x.id === "dv-c1").raisedAgain || []).length === 2
      && /outcome\.raiseAgain/.test(guide), guide.match(/[^\n]*raiseAgain[^\n]*/) ? "" : "guide has no raiseAgain line");

    // To triage and the card.
    ev("goWs('roadmap'); UI.rmTriage = true; render()"); await wait(10);
    const row = q('#rmTriage [data-cap="dv-c1"]');
    ok("U1 a triage row says how many times it's been raised; one raised once says nothing extra", row && /raised 3 times/.test(row.textContent) && !/raised \d+ times/.test(txt('#rmTriage [data-cap="dv-c2"]')), row ? row.textContent : "no row");
    ev("sel = {type:'deliverable', id:'dv-c1'}; render()"); await wait(10);
    const items = [...d.querySelectorAll("#f-dvagain li[data-ask]")];
    ok("U2 the card lists each later ask (who, where, when), with Remove", /Raised again \(2\)/.test(txt("#f-dvagain h4")) && items.length === 2 && items[0].textContent.includes("<img") && /Partner review/.test(items[0].textContent)
      && /asked by: not known/.test(items[1].textContent) && items.every(li=>li.querySelector("button")), txt("#f-dvagain"));
    ok("U3 a hostile group name in a record is text, not markup", items.some(li=>li.textContent.includes("<img")) && !q("#f-dvagain img") && !w.pwned);
    if (q("#f-dvagwho")){ q("#f-dvagwho").value = "person:" + pa; q("#f-dvagfrom").value = "Release retro"; q("#f-dvagon").value = "2026-10-06"; q("#f-dvaggo").click(); } await wait(60);
    const rec = T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain");
    ok("U4 Record it adds a record with who, where and the date, and focus stays on the button", Array.isArray(rec) && rec.length === 3 && rec[2].who.id === pa && rec[2].source === "Release retro" && rec[2].raised === "2026-10-06"
      && d.activeElement && d.activeElement.id === "f-dvaggo", JSON.stringify(rec && rec[2]));
    const rm = [...d.querySelectorAll("#f-dvagain li[data-ask]")].find(li=>li.dataset.ask === "ask-2"); if (rm) rm.querySelector("button").click(); await wait(60);
    const left = (T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain.map(x=>x.id)") || []).join(), said = txt("#status");
    ev("undo()"); await wait(30); const back = (T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain.map(x=>x.id)") || []).join(); ev("redo()"); await wait(30);
    ok("U5 Remove takes out just that record, says which one, and one Undo puts it back", left === `ask-1,${rec && rec[2] ? rec[2].id : "?"}` && /Removed "asked by: not known · Oct 1"/.test(said) && /Undo puts it back/.test(said)
      && back === `ask-1,ask-2,${rec && rec[2] ? rec[2].id : "?"}`, said + " / " + back);

    // The capture form offers likely matches; only a click records it there.
    ev("sel = null; render()"); await wait(10);
    q("#rmCapture").click(); await wait(10);
    const type = v => { const i = q("#capWhat"); i.value = v; i.dispatchEvent(new w.Event("input", {bubbles:true})); };
    type("Weekend deploy freeze"); await wait(10);
    const none = !d.querySelectorAll("#capSame [data-same]").length;
    type("Partner teams want release notes"); await wait(10);
    const offers = [...d.querySelectorAll("#capSame [data-same]")].map(x=>x.dataset.same);
    ok("C1 typing something close to an existing capture offers it; something unrelated offers nothing", none && offers.join() === "dv-c1" && /Record it on that one, or capture it separately/.test(txt("#capSame")), offers.join() + " / " + none);
    const n0 = T("S.deliverables.length");
    q("#capWho").value = "group:grp-sales"; q("#capFrom").value = "Sales sync"; q("#capRaised").value = "2026-10-07";
    const sb = q('#capSame [data-same="dv-c1"] button'); if (sb) sb.click(); await wait(60);
    const after = T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain"), last = after && after[after.length - 1];
    ok("C2 Same thing records it on that capture with the form's who, where and date, adds nothing new, and closes the form",
      T("S.deliverables.length") === n0 && last && last.who && last.who.id === "grp-sales" && last.source === "Sales sync" && last.raised === "2026-10-07" && !q("#dlgCapture") && /Recorded "Partner teams want release notes" on "Release notes for partner teams", raised 4 times now/.test(txt("#status")),
      JSON.stringify(last) + " / " + txt("#status"));
    ev("undo()"); await wait(30); const undone = T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain.length"); ev("redo()"); await wait(30);
    ok("C2b one Undo takes the record back off that capture", undone === 2 && T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain.length") === 3, String(undone));
    q("#rmCapture").click(); await wait(10); type("Partner teams want release notes"); await wait(10); q("#capGo").click(); await wait(60);
    ok("C3 Capture still keeps it separate when matches were offered: never merged on its own", T("S.deliverables.length") === n0 + 1 && T("S.deliverables.find(x=>x.id === 'dv-c1').raisedAgain.length") === 3);
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
