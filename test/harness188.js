// An outcome's priority (vision.md, principle 17 and Deciding what matters): a class (rock, pebble or sand) and one
// line each for why it matters and when to reconsider it. Saved in the plan, older copies open such a plan read-only,
// the panel edits them, Roadmap cards and triage show the class, the assistant export carries them, and an app's change
// to any of them always waits for a person, whatever the level. Fixed clock; the sample plan. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const HOSTILE = '<img src=x onerror="window.pwned=1"> keeps the launch on track';
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
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); S.deliverables = []; render();
        window.P = () => clone(S); window.RA = (p, id, a) => runAction(p, id, a);`);
    const lane = J("S.lanes[0].id");

    // The data.
    const raw = {id:"dv-r", name:"Partners can sign in with their own accounts", stage:"planned", target:"2027-Q1", class:"rock", why:"Two partner launches\nwait on it", reconsider:"if the partners delay"};
    const n1 = J(`normalize({...clone(S), deliverables:${JSON.stringify([raw, {id:"dv-b", name:"B", stage:"idea", class:"boulder", why:"x".repeat(400)}, {id:"dv-c", name:"C", stage:"idea"}])}}, false).deliverables`);
    ok("N1 a class, why and reconsider load as written (one line each), a made-up class is dropped, long lines are cut, and an unclassed outcome has no class",
      n1[0].class === "rock" && n1[0].why === "Two partner launches wait on it" && n1[0].reconsider === "if the partners delay" && !("class" in n1[1]) && n1[1].why.length === 300 && !("class" in n1[2]) && !("why" in n1[2]), JSON.stringify(n1.map(x=>[x.class, x.why && x.why.length])));
    const rt = J(`(()=>{ const p = {...clone(S), deliverables:${JSON.stringify([raw])}}; return [parseText(serialize(p, "p.json")).deliverables[0], parseText(serialize(p, "p.yaml")).deliverables[0]]; })()`);
    ok("N2 JSON and YAML round-trip a priority unchanged", rt.every(x=>x.class === "rock" && x.reconsider === "if the partners delay"), JSON.stringify(rt[1]));
    const feats = ["class", "why", "reconsider"].map(k=>J(`featuresIn({deliverables:[{id:'a', name:'a', stage:'idea', ${k}:${JSON.stringify(raw[k])}}]})`).includes("priority1"));
    const unk = J("(()=>{ const i = KNOWN_FEATURES.indexOf('priority1'); if (i < 0) return null; KNOWN_FEATURES.splice(i, 1); const r = tooNew({meta:{features:featuresIn({deliverables:[{id:'a', name:'a', stage:'idea', class:'sand'}]})}}); KNOWN_FEATURES.splice(i, 0, 'priority1'); return r && r.unknown; })()");
    ok("N3 each field alone marks the plan, so a copy that doesn't know priorities opens it read-only; a plan without them isn't marked",
      feats.every(Boolean) && (unk || []).join() === "priority1" && !J("featuresIn({deliverables:[{id:'a', name:'a', stage:'idea'}]})").includes("priority1"), JSON.stringify([feats, unk]));

    // Actions.
    ev(`window.Q = P(); Q.deliverables = ${JSON.stringify([{id:"dv-a", name:"Faster plan opening", stage:"idea"}])};`);
    const set = (f, v) => J(`RA(Q, 'outcome.set', {id:'dv-a', field:'${f}', value:${JSON.stringify(v)}})`);
    const okSets = [set("class", "pebble"), set("why", "Every standup starts with it"), set("reconsider", "once plans load in under a second")];
    const a = J("Q.deliverables[0]");
    ok("A1 outcome.set sets the class, why and reconsider", okSets.every(x=>x.ok) && a.class === "pebble" && a.why === "Every standup starts with it" && a.reconsider === "once plans load in under a second", JSON.stringify(a));
    const bad = [set("class", "boulder"), set("why", "x".repeat(301)), set("reconsider", "two\nlines")];
    ok("A2 a made-up class, an overlong why and a line break are refused with a reason", bad.every(x=>!x.ok && x.reason), bad.map(x=>x.reason).join(" / "));
    ok("A3 blank clears the class", set("class", "").ok && !("class" in J("Q.deliverables[0]")));

    // An app's change to a priority always waits for a person.
    const risk = (f) => ev(`amRiskOf({ops:[{op:'action', action:'outcome.set', args:{id:'dv-a', field:'${f}', value:'rock'}}]})`);
    ok("F1 an app's change to class, why or reconsider is always reviewed; other outcome fields stay routine", ["class", "why", "reconsider"].every(f=>risk(f) === "floor") && risk("name") === "routine" && risk("line") === "routine",
      ["class", "why", "reconsider", "name", "line"].map(risk).join());
    const fw = ev(`amFloorWhy({ops:[{op:'action', action:'outcome.set', args:{id:'dv-a', field:'class', value:'rock'}}]})`);
    ok("F2 the held change says it's about priority, not deleting an initiative", /priority/.test(fw) && !/deletes/.test(fw), fw);
    const old = J(`amCheck({id:'c-old', ops:[{op:'set', type:'deliverable', id:'dv-a', field:'class', value:'rock', prev:null}]}, Q)`);
    ok("F3 the old field-by-field form can't set a class around the review", old.status === "invalid", old.status + ": " + (old.reasons || []).join(" "));
    ok("F4 the action's description says a priority change always waits", /always waits for a person/.test(J("ACTION_DESC['outcome.set'] || ''") || ""), J("ACTION_DESC['outcome.set'] || ''"));

    // Merge: my class, a teammate's why; both stand. Both set a class: theirs wins and mine is kept aside.
    const m = J(`(()=>{ const base = {...clone(S), deliverables:[{id:'dv-m', name:'M', stage:'idea'}]}, mine = clone(base), theirs = clone(base);
      mine.deliverables[0].class = 'rock'; theirs.deliverables[0].why = 'Support asks weekly';
      const one = mergePlans(base, mine, theirs).plan.deliverables[0];
      const m2 = clone(base), t2 = clone(base); m2.deliverables[0].class = 'rock'; t2.deliverables[0].class = 'sand'; const r2 = mergePlans(base, m2, t2);
      return {one, two:r2.plan.deliverables[0].class, kept:(r2.kept || []).length}; })()`);
    ok("M1 a merge keeps my class and a teammate's why; when both set a class, the teammate's wins and mine is kept aside", m.one.class === "rock" && m.one.why === "Support asks weekly" && m.two === "sand" && m.kept > 0, JSON.stringify(m));

    // The export an assistant reads.
    ev(`S = normalize({...clone(S), deliverables:${JSON.stringify([raw, {id:"dv-cap", name:"Dark mode for the planner", stage:"idea", capture:"request", class:"sand", lane, why:HOSTILE}])}}, false); render()`);
    const view = J("assistantView()"), vd = view.deliverables.find(x=>x.id === "dv-r"), guide = J("analysisGuide()");
    ok("E1 the export carries each outcome's class, why and reconsider, and both guides explain them", vd && vd.class === "rock" && vd.why === "Two partner launches wait on it" && vd.reconsider === "if the partners delay"
      && /always waits for a person/.test(JSON.stringify(view.guide)) && /`class` \(rock = committed/.test(guide), JSON.stringify(vd));

    // The panel.
    ev("goWs('roadmap'); sel = {type:'deliverable', id:'dv-r'}; render()"); await wait(10);
    const side = d.querySelector("#side"), pick = side.querySelector("#f-dvclass");
    ok("U1 the outcome panel shows Priority, Why it matters and Reconsider when with their values, in plain words", pick && pick.value === "rock" && /Committed/.test(pick.selectedOptions[0].textContent)
      && side.querySelector("#f-dvwhy").value === "Two partner launches wait on it" && side.querySelector("#f-dvreconsider").value === "if the partners delay" && /rocks first/.test(side.querySelector("#dvClassHint").textContent));
    pick.value = "pebble"; pick.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(60);
    const wy = d.querySelector("#f-dvwhy"); wy.value = "  Unblocks two partner launches  "; wy.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(60);
    const after = J("S.deliverables.find(x=>x.id === 'dv-r')");
    ok("U2 picking a class and editing why save to the plan", after.class === "pebble" && after.why === "Unblocks two partner launches", JSON.stringify([after.class, after.why]));
    ev("sel = {type:'deliverable', id:'dv-r'}; render()"); await wait(10);
    const p2 = d.querySelector("#f-dvclass"); p2.value = ""; p2.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(60);
    ok("U3 Not set yet clears the class", !("class" in J("S.deliverables.find(x=>x.id === 'dv-r')")));

    // Where people prioritize: Roadmap cards and triage.
    ev("sel = null; S.deliverables.find(x=>x.id === 'dv-r').class = 'rock'; goWs('roadmap'); UI.rmTriage = true; render()"); await wait(20);
    const card = [...d.querySelectorAll("[data-dvclass]")].map(x=>x.dataset.dvclass + ":" + x.textContent);
    const tri = d.querySelector("#rmTriage [data-cap='dv-cap'] [data-dvclass]");
    ok("U4 a Roadmap card shows Committed, and a triage row shows If there's room", card.includes("rock:Committed") && tri && tri.textContent === "If there's room", card.join());
    ok("U5 a hostile why is text in the tooltip, not markup", !w.pwned && !d.querySelector("#rmTriage img") && tri && tri.title.includes("<img"));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
