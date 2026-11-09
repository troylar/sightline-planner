// A risk or decision can be about an outcome or a captured request (1.186.0): what's kept, the saved-field rule, deleting
// one, the Affects picker, what cards, details and To triage show, the assistant's view, and the actions. Fixture:
// fixtures/sample-plan.json; every added name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; let f = 0; const ok = (n, c, x = "") => { if (!c) f++; R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + String(x).slice(0, 500) + ")" : ""}`); };
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 55000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150);
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    // The fixture plus an outcome (this quarter), a captured request, and a risk and decision about each.
    const raw = JSON.parse(FIX), bar = raw.bars[0].id;
    raw.deliverables = [{id:"dv-o1", name:"Faster search", stage:"planned"}, {id:"dv-c1", name:"Export to CSV", stage:"idea", capture:"request"}];
    raw.risks = [...raw.risks, {id:"risk-o1", sev:"high", text:"The index vendor may cap queries", item:"dv-o1"}, {id:"risk-c1", sev:"low", text:"CSV size limits", item:"dv-c1"},
      {id:"risk-shut", sev:"med", text:"Closed one", item:"dv-o1", state:"closed"}, {id:"risk-gone", sev:"med", text:"About nothing", item:"dv-nope"}];
    raw.decisions = [...raw.decisions, {id:"dec-o1", text:"Pick the search index", state:"open", item:"dv-o1"}, {id:"dec-c1", text:"Which columns to export", state:"open", item:"dv-c1"},
      {id:"dec-done", text:"Already settled", state:"decided", item:"dv-c1"}, {id:"dec-bar", text:"About an initiative", state:"open", item:bar}];
    w.RAW = JSON.stringify(raw); w.FIX = FIX;
    const fresh = () => X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(RAW), false);
      (S.deliverables.find(x=>x.id === "dv-o1") || {}).target = quarterOf(todayDay()); S = normalize(S, false); resetHistory(); file.handle = null; sel = null; render();`);
    fresh();

    // ---- what's kept ----
    const items = J(`Object.fromEntries([...S.risks, ...S.decisions].filter(x=>x.id).map(x=>[x.id, x.item]))`);
    ok("I1 normalize keeps an item that's an outcome, a captured request or an initiative", items["risk-o1"] === "dv-o1" && items["dec-c1"] === "dv-c1" && items["dec-bar"] === bar, JSON.stringify(items));
    ok("I2 …and clears one that names nothing in the plan, or a person", items["risk-gone"] === "" && J(`normalize({...JSON.parse(RAW), risks:[{id:"r-p", text:"x", item:S.people[0] ? S.people[0].id : "p-x"}]}, false).risks[0].item`) === "", JSON.stringify(items));
    ok("I3 it survives a save and a reopen", J(`normalize(JSON.parse(serialize(S, "plan.json")), false).decisions.find(x=>x.id === "dec-c1").item`) === "dv-c1");

    // ---- the saved-field rule ----
    const feats = J(`featuresIn(S)`), plain = J(`featuresIn(normalize(JSON.parse(FIX), false))`), barOnly = J(`featuresIn({...S, risks:S.risks.filter(x=>!x.item || x.item === "${bar}"), decisions:S.decisions.filter(x=>!x.item || x.item === "${bar}")})`);
    ok("F1 featuresIn names itemOutcome1 only when a risk or decision is about an outcome or request, and this copy knows it", feats.includes("itemOutcome1") && !plain.includes("itemOutcome1") && !barOnly.includes("itemOutcome1") && J("KNOWN_FEATURES").includes("itemOutcome1"), [feats.includes("itemOutcome1"), plain.includes("itemOutcome1"), barOnly.includes("itemOutcome1")].join());
    const older = J(`(()=>{ const i = KNOWN_FEATURES.indexOf("itemOutcome1"); if (i < 0) return "unknown flag"; KNOWN_FEATURES.splice(i, 1);
      try { const a = tooNew(normalize({...S, meta:{...S.meta, features:featuresIn(S)}}, false)), b = tooNew(normalize({...JSON.parse(FIX), meta:{...JSON.parse(FIX).meta, features:featuresIn(normalize(JSON.parse(FIX), false))}}, false)); return [a && a.unknown, !!b]; } finally { KNOWN_FEATURES.splice(i, 0, "itemOutcome1"); } })()`);
    ok("F2 an older copy without itemOutcome1 opens such a plan read-only (tooNew); a plan that doesn't use it opens as before", Array.isArray(older) && JSON.stringify(older[0]) === '["itemOutcome1"]' && older[1] === false, JSON.stringify(older));

    X(`(()=>{ const prev = clone(S), next = clone(S); prev.meta.savedWith = APP_VERSION; delete next.meta.savedWith; [...next.risks, ...next.decisions].forEach(x=>{ if (next.deliverables.some(d=>d.id === x.item)) x.item = ""; }); noteOlderSave(prev, next); })()`); await wait(20);
    const ban = (d.querySelector("#banners") || {}).textContent || "";
    ok("F3 when an older copy saves over such a plan, the banner says in plain words what it dropped", /dropped risks and decisions about outcomes or requests/.test(ban) && !/itemOutcome1/.test(ban), ban.slice(0, 300));
    X(`banners.delete("older"); drawBanners();`);

    // ---- deleting one ----
    const del = J(`(()=>{ const p = clone(S), r = runAction(p, "outcome.del", {id:"dv-c1"}); return {ok:r.ok, items:[...p.risks, ...p.decisions].filter(x=>["risk-c1","dec-c1","dec-done","risk-o1","dec-bar"].includes(x.id)).map(x=>x.id + "=" + x.item)}; })()`);
    ok("D1 outcome.del clears the items that pointed at it, and only those", del.ok && JSON.stringify(del.items) === JSON.stringify(["risk-o1=dv-o1", "risk-c1=", "dec-c1=", "dec-done=", `dec-bar=${bar}`]), JSON.stringify(del));
    const pre = J(`[S.risks.find(x=>x.id === "risk-c1").item, S.decisions.find(x=>x.id === "dec-c1").item]`).join();
    await X(`dvSave("deleted", s=>act("outcome.del", {id:"dv-c1"}, s))`); await wait(20);
    ok("D2 the Delete button's path (a quick update) clears them in the plan too", pre === "dv-c1,dv-c1" && J(`[S.risks.find(x=>x.id === "risk-c1").item, S.decisions.find(x=>x.id === "dec-c1").item, !dvById("dv-c1")]`).join() === ",,true", J(`[S.risks.find(x=>x.id === "risk-c1").item, S.decisions.find(x=>x.id === "dec-c1").item]`));
    fresh();

    // ---- the Affects picker and the tables ----
    X(`UI.planTab = "risks"; goWs("plan"); render();`); await wait(20);
    const pick = id => { const key = J("UI.planTab"), tr = d.querySelectorAll(`#t-${key} tbody tr`)[J(`S.${key}.findIndex(x=>x.id === "${id}")`)];
      return tr ? tr.querySelector('select[aria-label="Affects"]') : null; };
    const sr = pick("risk-o1"), groups = sr ? [...sr.querySelectorAll("optgroup")].map(g=>g.label) : [], opts = sr ? [...sr.querySelectorAll('optgroup[label="Outcomes and requests"] option')].map(o=>o.value + ":" + o.textContent) : [];
    const laneGroups = J(`S.lanes.filter(l=>S.bars.some(b=>b.lane === l.id)).map(l=>l.name)`), barLane = J(`S.lanes.find(l=>l.id === S.bars.find(b=>b.id === "${bar}").lane).name`);
    ok("P1 the Affects picker groups initiatives by workstream, as before, and ends with a group of outcomes and requests", JSON.stringify(groups) === JSON.stringify([...laneGroups, "Outcomes and requests"]) && !!sr.querySelector(`optgroup[label="${barLane}"] option[value="${bar}"]`), JSON.stringify(groups));
    ok("P2 …a request says so", opts.includes("dv-o1:Faster search") && opts.includes("dv-c1:Request: Export to CSV"), JSON.stringify(opts));
    ok("T1 the risks table shows the outcome's name in the item column", !!sr && sr.selectedOptions[0] && sr.selectedOptions[0].textContent === "Faster search", sr && sr.selectedOptions[0] ? sr.selectedOptions[0].textContent : "no picker");
    X(`UI.planTab = "decisions"; render();`); await wait(20);
    const sd = pick("dec-c1");
    ok("T2 the decisions table shows the request's name in the item column", !!sd && sd.selectedOptions[0] && sd.selectedOptions[0].textContent === "Request: Export to CSV", sd && sd.selectedOptions[0] ? sd.selectedOptions[0].textContent : "no picker");
    if (sd){ sd.value = "dv-o1"; sd.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(20); }
    ok("T3 choosing an outcome in the picker sets the decision's item", J(`S.decisions.find(x=>x.id === "dec-c1").item`) === "dv-o1");
    fresh();

    // ---- cards, details and To triage ----
    X(`UI.rmTriage = true; goWs("roadmap"); render();`); await wait(30);
    const card = d.querySelector('#roadmapWs .dvcard[data-dv="dv-o1"]'), lines = card ? [...card.querySelectorAll(".dvrdl")].map(x=>x.textContent) : [];
    ok("C1 an outcome's card shows what it's waiting on and its open risks (not closed ones)", JSON.stringify(lines) === JSON.stringify(["Waiting on: Pick the search index", "Risk (high): The index vendor may cap queries"]), card ? JSON.stringify(lines) : "no card");
    const tri = d.querySelector('#rmTriage li[data-cap="dv-c1"]'), tag = tri && tri.querySelector(".capwait");
    ok("C2 To triage tags a request with an open decision about it as waiting", !!tag && tag.textContent === "waiting" && /Which columns to export/.test(tag.title) && !/Already settled/.test(tag.title), tri ? (tag ? tag.title : "no tag") : "no row");
    X(`S.decisions.find(x=>x.id === "dec-c1").state = "decided"; render();`); await wait(20);
    ok("C3 …and not once it's decided", !d.querySelector('#rmTriage li[data-cap="dv-c1"] .capwait'));
    fresh(); X(`UI.rmTriage = true; goWs("roadmap"); sel = {type:"deliverable", id:"dv-c1"}; render();`); await wait(30);
    const side = [...d.querySelectorAll("#side #dvRd button[data-rd]")].map(b=>b.textContent);
    ok("E1 a request's details list the decisions it waits on and its risks", JSON.stringify(side) === JSON.stringify(["Waiting on: Which columns to export", "Risk (low): CSV size limits"]) && /don't change its stage, priority or dates/.test((d.querySelector("#side #dvRd") || {}).textContent || ""), JSON.stringify(side));
    X(`sel = {type:"deliverable", id:"dv-o1"}; render();`); await wait(20);
    const side2 = [...d.querySelectorAll("#side #dvRd button[data-rd]")].map(b=>b.textContent);
    ok("E2 an outcome's details do too", JSON.stringify(side2) === JSON.stringify(["Waiting on: Pick the search index", "Risk (high): The index vendor may cap queries"]), JSON.stringify(side2));
    const stageBefore = J(`[dvById("dv-o1").stage, dvById("dv-o1").target, dvById("dv-o1").class || ""]`);
    ok("E3 nothing about its stage, priority or dates changed because of them", JSON.stringify(stageBefore) === JSON.stringify(["planned", X("quarterOf(todayDay())"), ""]), JSON.stringify(stageBefore));

    // ---- the assistant's view ----
    const view = J(`assistantView().deliverables.filter(x=>["dv-o1","dv-c1"].includes(x.id)).map(x=>({id:x.id, waitingOn:x.waitingOn, risks:x.risks}))`);
    ok("A1 each deliverable in the assistant view lists waitingOn and risks (open ones only)", Array.isArray(view) && JSON.stringify(view.find(x=>x.id === "dv-o1")) === JSON.stringify({id:"dv-o1", waitingOn:[{id:"dec-o1", text:"Pick the search index"}], risks:[{id:"risk-o1", sev:"high", text:"The index vendor may cap queries"}]})
      && JSON.stringify(view.find(x=>x.id === "dv-c1").waitingOn) === JSON.stringify([{id:"dec-c1", text:"Which columns to export"}]), JSON.stringify(view));
    const none = J(`(()=>{ const p = normalize(JSON.parse(RAW), false); p.risks = []; p.decisions = []; const was = S; S = p; try { return assistantView().deliverables.map(x=>"waitingOn" in x || "risks" in x); } finally { S = was; } })()`);
    ok("A2 …and leaves both out when there are none", Array.isArray(none) && none.length === 2 && none.every(x=>x === false), JSON.stringify(none));
    const dig = J(`planDigest().requests.find(x=>x.id === "dv-c1")`);
    ok("A3 the pasted digest carries them for a request too", dig && JSON.stringify(dig.waitingOn) === JSON.stringify([{id:"dec-c1", text:"Which columns to export"}]), JSON.stringify(dig));
    ok("A4 the guide says risk.add and decision.add take an outcome's or a request's id as item", /outcome's or a captured request's id as item/.test(J("assistantView().guide")));

    // ---- the actions ----
    const person = J(`S.people.length ? S.people[0].id : null`) || "p-avery";
    if (!J(`S.people.length`)) X(`S.people.push({id:"p-avery", name:"Avery", initials:"AV", color:"#4477aa"}); S = normalize(S, false);`);
    const runs = J(`[["risk.add", {id:"risk-n1", text:"New risk", item:"dv-o1"}], ["decision.add", {id:"dec-n1", text:"New decision", item:"dv-c1"}], ["risk.set", {id:"risk-o1", field:"item", value:"dv-c1"}],
      ["decision.set", {id:"dec-bar", field:"item", value:"dv-o1"}], ["decision.add", {id:"dec-n2", text:"x", item:"${person}"}], ["risk.set", {id:"risk-o1", field:"item", value:"${person}"}]].map(([a, x])=>{ const p = clone(S), r = runAction(p, a, x); return [r.ok, r.reason || "", (actOf(p, a.startsWith("risk") ? "risks" : "decisions", x.id) || {}).item]; })`);
    ok("X1 risk.add, decision.add and both setters accept an outcome or a request as item", runs.slice(0, 4).every(r=>r[0]) && runs[0][2] === "dv-o1" && runs[1][2] === "dv-c1" && runs[2][2] === "dv-c1" && runs[3][2] === "dv-o1", JSON.stringify(runs.slice(0, 4)));
    ok("X2 …and refuse a person's id, naming both kinds", runs.slice(4).every(r=>!r[0] && r[1] === "That initiative or deliverable isn't in the plan."), JSON.stringify(runs.slice(4)));
    const typ = J(`[planActions["risk.add"].args.item, planActions["decision.set"].fields.item, rdCheck(S, "risks", "item", "${person}")]`);
    ok("X3 the type is initiativeId|outcomeId|blank, and the field check names an initiative, an outcome or a request", typ[0] === "initiativeId|outcomeId|blank?" && typ[1] === "initiativeId|outcomeId|blank" && typ[2] && typ[2].reason === "That isn't an initiative, an outcome or a request in the plan.", JSON.stringify(typ));
    ok("X4 no page errors", !J("errs").length, J("errs").join(" | "));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const n = R.length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
