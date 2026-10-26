// Captured requests and ideas (vision.md): a roadmap idea with a capture type, who asked (a person or group already in the
// plan), the meeting's date and what became of it, kept apart from delivery stage. A date never plans a capture, a
// handoff or decline closes it without marking anything done, a new person or group always waits for review, older
// copies open such a plan read-only, merges keep both sides, and To triage lists open captures by workstream, oldest
// first, with Unassigned shown. Fixed clock; the sample plan. Every name is invented.
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
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false);
        S.groups = [{id:'grp-support', name:${JSON.stringify(HOSTILE)}, members:[]}]; S.deliverables = []; render();
        window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const pa = J("S.people[0].id"), lane = J("S.lanes[0].id"), bar = J("S.bars[0].id");

    // The data: kept on load and save, junk dropped, and a feature older copies don't know.
    const raw = {id:"dv-c1", name:"Tell the support desk about release-process changes", stage:"idea", capture:"request", askedBy:{type:"group", id:"grp-support"}, raised:"2026-10-05", handoff:{to:"jira", key:"ABC-120"}, source:"Weekly sync"};
    const bad = {id:"dv-c2", name:"Junk", stage:"idea", capture:"wish", askedBy:{type:"team", id:"x"}, raised:"10/05/2026", handoff:{to:"email", key:"x"}};
    const n1 = J(`normalize({...clone(S), deliverables:${JSON.stringify([raw, bad])}}, false).deliverables`);
    ok("N1 a capture's fields load as written, and invalid ones are dropped", n1[0].capture === "request" && n1[0].askedBy.id === "grp-support" && n1[0].raised === "2026-10-05" && n1[0].handoff.key === "ABC-120"
      && !("capture" in n1[1]) && !("askedBy" in n1[1]) && !("raised" in n1[1]) && !("handoff" in n1[1]), JSON.stringify(n1[1]));
    const rt = J(`(()=>{ const p = {...clone(S), deliverables:${JSON.stringify([raw])}}; return [parseText(serialize(p, "p.json")).deliverables[0], parseText(serialize(p, "p.yaml")).deliverables[0]]; })()`);
    ok("N2 JSON and YAML round-trip a capture unchanged", rt.every(x=>x.capture === "request" && x.askedBy.type === "group" && x.raised === "2026-10-05" && x.handoff.to === "jira"), JSON.stringify(rt[1]));
    const feats = ["capture", "askedBy", "raised", "handoff"].map(k=>J(`featuresIn({deliverables:[{id:'a', name:'a', stage:'idea', ${k}:${JSON.stringify(raw[k])}}]})`).includes("captures1"));
    ok("N3 each capture field alone marks the plan, so a copy that doesn't know captures opens it read-only", feats.every(Boolean) && J("KNOWN_FEATURES").includes("captures1")
      && J("(()=>{ const i = KNOWN_FEATURES.indexOf('captures1'); KNOWN_FEATURES.splice(i, 1); const r = tooNew({meta:{features:featuresIn({deliverables:[{id:'a', name:'a', stage:'idea', capture:'idea'}]})}}); KNOWN_FEATURES.splice(i, 0, 'captures1'); return r && r.unknown; })()").join() === "captures1", feats.join());

    // Actions.
    ev(`window.Q = P(); window.r1 = RA(Q, 'outcome.add', {id:'dv-a', name:'Release notes for teams that use us', capture:'request', askedBy:{type:'group', id:'grp-support'}, raised:'2026-10-05', source:'Platform review', lane:${JSON.stringify(lane)}, target:'2027-Q1'})`);
    const a = J("Q.deliverables.find(x=>x.id === 'dv-a')");
    ok("A1 a capture with a target stays an idea: a date never plans it", J("r1.ok") && a.stage === "idea" && a.target === "2027-Q1" && a.capture === "request" && a.lane === lane && /Platform review/.test(a.source), JSON.stringify(a));
    const refused = [
      ["unknown person", `RA(P(), 'outcome.add', {name:'x', capture:'idea', askedBy:{type:'person', id:'nobody'}})`],
      ["unknown group", `RA(P(), 'outcome.add', {name:'x', capture:'idea', askedBy:{type:'group', id:'nogroup'}})`],
      ["bad capture type", `RA(P(), 'outcome.add', {name:'x', capture:'wish'})`],
      ["askedBy not a person or group", `RA(P(), 'outcome.add', {name:'x', capture:'idea', askedBy:{type:'team', id:'grp-support'}})`]].filter(([, s])=>J(s).ok);
    ok("A2 who asked must already be in the plan, and the capture type must be one of four", !refused.length, refused.map(x=>x[0]).join(", "));
    ev(`RA(Q, 'outcome.set', {id:'dv-a', field:'askedBy', value:{type:'person', id:${JSON.stringify(pa)}}})`);
    ok("A3 outcome.set changes who asked, and null clears it", J("Q.deliverables.find(x=>x.id === 'dv-a').askedBy").id === pa && J(`(RA(Q, 'outcome.set', {id:'dv-a', field:'askedBy', value:null}), Q.deliverables.find(x=>x.id === 'dv-a').askedBy || null)`) === null);
    const h1 = J(`RA(Q, 'outcome.handoff', {id:'dv-a', initiative:${JSON.stringify(bar)}})`), after = J("Q.deliverables.find(x=>x.id === 'dv-a')");
    ok("A4 handing off closes the capture and marks nothing planned or done", h1.ok && after.handoff.id === bar && after.stage === "idea" && ev("capOpen(Q.deliverables.find(x=>x.id === 'dv-a'))") === false);
    const both = J(`RA(clone(Q), 'outcome.handoff', {id:'dv-a', initiative:${JSON.stringify(bar)}, jira:'ABC-1'})`), plain = J(`(()=>{ const p = clone(Q); p.deliverables.push({id:'dv-plain', name:'Plain', stage:'idea'}); return RA(p, 'outcome.handoff', {id:'dv-plain', jira:'ABC-1'}); })()`);
    ok("A5 a handoff names one initiative or one Jira issue, and only a capture is handed off", !both.ok && !plain.ok, both.reason + " / " + plain.reason);
    ev("RA(Q, 'outcome.reopen', {id:'dv-a'})");
    const noWhy = J("RA(clone(Q), 'outcome.drop', {id:'dv-a'})"), dropped = J("(RA(Q, 'outcome.drop', {id:'dv-a', reason:'Covered by the release digest'}), Q.deliverables.find(x=>x.id === 'dv-a'))");
    ok("A6 declining a capture needs a reason, for whoever asked", !noWhy.ok && dropped.stage === "dropped" && dropped.dropReason === "Covered by the release digest", noWhy.reason);
    const re = J("(RA(Q, 'outcome.reopen', {id:'dv-a'}), Q.deliverables.find(x=>x.id === 'dv-a'))");
    ok("A7 reopening puts it back on the list: an idea again, no reason, no handoff", re.stage === "idea" && !re.dropReason && !re.handoff && ev("capOpen(Q.deliverables.find(x=>x.id === 'dv-a'))") === true);
    const lc = J(`(()=>{ const p = clone(Q), q = clone(Q); RA(p, 'outcome.drop', {id:'dv-a', reason:'Not this year'}); RA(q, 'outcome.handoff', {id:'dv-a', jira:'ABC-7'});
      return [RA(p, 'outcome.handoff', {id:'dv-a', jira:'ABC-7'}), RA(q, 'outcome.drop', {id:'dv-a', reason:'Changed our mind'})]; })()`);
    ok("A8 a declined capture can't be handed off, nor a handed-off one declined, until it's reopened", !lc[0].ok && !lc[1].ok && /Reopen it first/.test(lc[0].reason) && /Reopen it first/.test(lc[1].reason), lc.map(x=>x.reason).join(" / "));
    const rv = J(`(()=>{ const p = clone(Q); RA(p, 'outcome.drop', {id:'dv-a', reason:'Not this year'}); const q = clone(Q); RA(q, 'outcome.handoff', {id:'dv-a', jira:'ABC-8'});
      return [amCheck({id:'c-ho', ops:[{op:'action', action:'outcome.handoff', args:{id:'dv-a', jira:'ABC-9'}}]}, p), amCheck({id:'c-dr', ops:[{op:'action', action:'outcome.drop', args:{id:'dv-a', reason:'Changed our mind'}}]}, q)]; })()`);
    ok("A9 an assistant's proposal to hand off a declined capture, or decline a handed-off one, is refused at review with the same reason", rv.every(x=>x.status === "invalid" && x.reasons.some(y=>/Reopen it first/.test(y))), rv.map(x=>x.status + ": " + x.reasons.join(" ")).join(" / "));
    const risk = k => ev(`amRiskOf({ops:[{op:'action', action:'${k}', args:{}}]})`);
    ok("R1 a new person, group or skill always waits for a person; a capture itself is routine", risk("person.add") === "floor" && risk("group.add") === "floor" && risk("skill.add") === "floor" && risk("outcome.add") === "routine",
      ["person.add", "group.add", "skill.add", "outcome.add"].map(risk).join());
    const why = k => ev(`(()=>{ try { return amFloorWhy({ops:[{op:'action', action:'${k}', args:{}}]}); } catch(e){ return "none: " + e.message; } })()`);
    ok("R3 a held change says why it waits: adding a person, group or skill isn't called deleting an initiative", /adds a person/.test(why("person.add")) && /adds a group/.test(why("group.add")) && /adds a skill/.test(why("skill.add")) && /deletes a workstream/.test(why("workstream.del")),
      ["person.add", "group.add", "skill.add"].map(why).join(" | "));
    const g = J("(()=>{ const p = P(); const r = RA(p, 'group.add', {id:'grp-agents', name:'Agent builders'}); return [r.ok, (p.groups || []).find(x=>x.id === 'grp-agents')]; })()");
    ok("R2 group.add adds a named group, with no members when none are known", g[0] && g[1] && g[1].name === "Agent builders" && Array.isArray(g[1].members) && !g[1].members.length);

    // Merge: one person says who asked, a teammate hands it off; both stand.
    const m = J(`(()=>{ const base = {...clone(S), deliverables:[{id:'dv-m', name:'M', stage:'idea', capture:'gap'}]}, mine = clone(base), theirs = clone(base);
      mine.deliverables[0].askedBy = {type:'group', id:'grp-support'}; theirs.deliverables[0].handoff = {to:'jira', key:'ABC-121'};
      return mergePlans(base, mine, theirs).plan.deliverables[0]; })()`);
    ok("M1 a merge keeps my requester and a teammate's handoff", m.askedBy && m.askedBy.id === "grp-support" && m.handoff && m.handoff.key === "ABC-121", JSON.stringify(m));

    const m2 = J(`(()=>{ const base = {...clone(S), deliverables:[{id:'dv-m2', name:'M2', stage:'idea', capture:'request'}]}, mine = clone(base), theirs = clone(base);
      RA(mine, 'outcome.drop', {id:'dv-m2', reason:'Out of scope'}); RA(theirs, 'outcome.handoff', {id:'dv-m2', jira:'ABC-130'});
      const d = mergePlans(base, mine, theirs).plan.deliverables[0]; let st = ""; try { st = capState(d); } catch(e){ st = "none: " + e.message; } return {d, st, open:capOpen(d)}; })()`);
    ok("M2 if one person declines while a teammate hands it off, the card says both and asks for a reopen, never picking one quietly",
      m2.d.handoff && m2.d.stage === "dropped" && !m2.open && /two ways/.test(m2.st) && /ABC-130/.test(m2.st) && /Out of scope/.test(m2.st) && /Reopen/.test(m2.st), m2.st);

    // The export an assistant reads.
    ev(`S.deliverables = Q.deliverables.concat([
      {id:'dv-old', name:'Old question about rollback', stage:'idea', capture:'question', added:{by:${JSON.stringify(pa)}, at:'2026-08-01T10:00:00Z'}, lane:${JSON.stringify(lane)}},
      {id:'dv-new', name:'New gap in on-call handoff', stage:'idea', capture:'gap', added:{by:${JSON.stringify(pa)}, at:'2026-10-06T10:00:00Z'}, lane:${JSON.stringify(lane)}, askedBy:{type:'group', id:'grp-support'}},
      {id:'dv-loose', name:'Somewhere to put it', stage:'idea', capture:'idea'},
      {id:'dv-closed', name:'Handed off already', stage:'idea', capture:'request', handoff:{to:'jira', key:'ABC-122'}},
      {id:'dv-road', name:'An ordinary roadmap idea', stage:'idea'}]); render()`);
    const view = J("assistantView()"), vd = view.deliverables.find(x=>x.id === "dv-new");
    ok("E1 the export carries each capture's type, who asked, date and handoff, and the guide says how to capture", vd && vd.capture === "gap" && vd.askedBy.id === "grp-support"
      && view.deliverables.find(x=>x.id === "dv-closed").handoff.key === "ABC-122" && /Captured from meetings/.test(view.guide.join ? view.guide.join("\n") : view.guide) && view.planning.groups.some(x=>x.id === "grp-support"));

    // To triage, on the Roadmap.
    ev("goWs('roadmap'); UI.rmTriage = true; renderRoadmap()"); await wait(10);
    const tri = d.querySelector("#rmTriage"), ids = [...(tri ? tri.querySelectorAll("li[data-cap]") : [])].map(x=>x.dataset.cap);
    const lanes = [...(tri ? tri.querySelectorAll(".capgroup") : [])].map(x=>x.dataset.caplane);
    ok("U1 To triage lists open captures only: by workstream, oldest first, unknown dates last", tri && !ids.includes("dv-closed") && !ids.includes("dv-road") && ids.indexOf("dv-old") < ids.indexOf("dv-new") && ids.indexOf("dv-new") < ids.indexOf("dv-a"), ids.join());
    ok("U2 a capture without a workstream sits under Unassigned, last, never hidden", lanes[lanes.length - 1] === "none" && tri.querySelector('[data-caplane="none"] [data-cap="dv-loose"]'), lanes.join());
    ok("U3 each row says who asked or that it isn't known, and how long it's been open", /asked by/.test(tri.querySelector('[data-cap="dv-new"]').textContent) && /asked by: not known/.test(tri.querySelector('[data-cap="dv-loose"]').textContent)
      && /open 1 day/.test(tri.querySelector('[data-cap="dv-new"]').textContent) && /not recorded/.test(tri.querySelector('[data-cap="dv-a"]').textContent));
    ok("U4 the button counts what's waiting, closed ones are counted as findable, and captures stay out of Ideas to sort", /To triage \(4\)/.test(d.querySelector("#rmTriageBtn").textContent) && /1 handed off or declined/.test(tri.textContent)
      && ![...d.querySelectorAll("#rmIdeas [data-idea]")].some(x=>x.dataset.idea.startsWith("dv-") && x.dataset.idea !== "dv-road"));
    ok("U5 a hostile group name is text, not markup", !d.querySelector("#rmTriage img") && !w.pwned && tri.querySelector('[data-cap="dv-new"]').textContent.includes("<img"));
    ev("sel = {type:'deliverable', id:'dv-new'}; render()"); await wait(10);
    const side = d.querySelector("#side");
    ok("U6 the card shows Captured as, Asked by, Raised on, and hand off or decline", side.querySelector("#f-dvcap").value === "gap" && side.querySelector("#f-dvasked").value === "group:grp-support" && !!side.querySelector("#f-dvhogo") && !!side.querySelector("#f-dvdecline"));
    const hand = side.querySelector("#f-dvhandoff"), lab = hand && hand.querySelector("label[for='f-dvhobar']");
    ok("U8 the open capture reads cleanly: titled by its type, Hand off to is labeled and styled like the panel, one 'open', no Kind until handed off",
      /Captured process gap/.test(d.querySelector("#side .sidehead h3").textContent) && hand.classList.contains("field") && lab && /Hand off to/.test(lab.textContent)
      && /^Open 1 day\./.test(side.querySelector("#f-dvcapstate").textContent) && !side.querySelector("#f-dvkind"), side.querySelector("#f-dvcapstate").textContent);
    ev("sel = {type:'deliverable', id:'dv-closed'}; render()"); await wait(10);
    ok("U9 once handed off, Kind is back for the release notes", !!d.querySelector("#f-dvkind"));
    ok("U7 a handed-off capture says where it went, that Jira keeps the issue, and offers Reopen", /Handed off to ABC-122/.test(d.querySelector("#f-dvcapstate").textContent) && /Jira owns the issue/.test(d.querySelector("#f-dvcapstate").textContent) && !!d.querySelector("#f-dvreopen"));

    // Capture in one step, from the Add menu (A, then C) or To triage.
    ev("sel = null; goWs('roadmap'); UI.rmTriage = true; render(); openAddMenu({left:0, top:0, bottom:0}, {})"); await wait(10);
    const cm = [...d.querySelectorAll("#addMenu button")].find(b=>/Capture a request or idea/.test(b.textContent));
    ok("C1 the Add menu offers Capture a request or idea, first on the Roadmap, with the letter C", cm && cm.dataset.key === "C" && d.querySelector("#addMenu button") === cm, cm ? cm.dataset.key : "missing");
    ev("closeAddMenu(false); sel = {type:'lane', id:" + JSON.stringify(lane) + "}; render()"); await wait(10);
    d.querySelector("#rmCapture").click(); await wait(10);
    const dlg = () => d.querySelector("#dlgCapture"), n0 = J("S.deliverables.length");
    ok("C2 To triage opens the capture form; with a workstream selected it still starts Unassigned and who asked Not known (never guessed)",
      dlg() && dlg().open && d.querySelector("#capLane").value === "" && d.querySelector("#capWho").value === "" && d.querySelector("#capRaised").value === "2026-10-07" && d.activeElement === d.querySelector("#capWhat"));
    d.querySelector("#capGo").click(); await wait(30);
    ok("C3 nothing is captured without saying what was raised", J("S.deliverables.length") === n0 && /Say what was raised/.test(d.querySelector("#capMsg").textContent));
    d.querySelector("#capWhat").value = "Shared test accounts for partner teams"; d.querySelector("#capType").value = "idea"; d.querySelector("#capWho").value = "group:grp-support";
    d.querySelector("#capLane").value = lane; d.querySelector("#capFrom").value = "Weekly sync"; d.querySelector("#capRaised").value = "2026-10-05";
    d.querySelector("#capAgain").click(); await wait(60);
    const c1 = J("S.deliverables.find(x=>x.name === 'Shared test accounts for partner teams') || null");
    ok("C4 Capture and add another saves it with type, who asked, workstream, where from and the date, and keeps the form open for the next",
      c1 && c1.capture === "idea" && c1.stage === "idea" && c1.askedBy.id === "grp-support" && c1.lane === lane && c1.source === "Weekly sync" && c1.raised === "2026-10-05" && !!c1.added
      && dlg() && dlg().open && d.querySelector("#capWhat").value === "" && d.querySelector("#capFrom").value === "Weekly sync" && d.querySelector("#capWho").value === "", JSON.stringify(c1));
    d.querySelector("#capWhat").value = "Who signs off a weekend release?"; d.querySelector("#capType").value = "question"; d.querySelector("#capGo").click(); await wait(60);
    const c2 = J("S.deliverables.find(x=>x.name === 'Who signs off a weekend release?') || null");
    ok("C5 Capture saves and closes; with nothing else chosen it has no workstream and no requester, and waits under Unassigned",
      c2 && c2.capture === "question" && !c2.lane && !c2.askedBy && c2.raised === "2026-10-05" && !dlg() && !!d.querySelector('#rmTriage [data-caplane="none"] [data-cap="' + c2.id + '"]'), JSON.stringify(c2));
    d.querySelector("#rmCapture").click(); await wait(10);
    ok("C6 the next capture this session starts with the same meeting and date", d.querySelector("#capFrom").value === "Weekly sync" && d.querySelector("#capRaised").value === "2026-10-05" && d.querySelector("#capType").value === "question");
    d.querySelector("#capCancel").click(); await wait(10);
    ok("C7 Cancel closes the form and adds nothing", !dlg() && J("S.deliverables.length") === n0 + 2);
    const addWhy = d.querySelector("#rmAddWhy");
    ok("C8 the roadmap's own add row says it's for things we might ship, and points meeting asks to Capture", /New roadmap idea/.test(d.querySelector("#rmAdd").textContent) && /Add to the roadmap/.test(d.querySelector("#rmAddGo").textContent)
      && addWhy && /Capture it/.test(addWhy.textContent) && /To triage/.test(addWhy.textContent));
    addWhy.querySelector("#rmAddCapture").click(); await wait(10);
    ok("C9 its Capture it link opens the capture form", !!d.querySelector("#dlgCapture") && d.querySelector("#dlgCapture").open); d.querySelector("#capCancel").click(); await wait(10);
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
