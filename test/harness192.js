// The rest of intake and deciding (vision.md, Anything heard can be captured; Deciding what matters): evidence on
// captures, links and references, guidance overlap and citations, decisions recorded from the page, the what-if (the
// jar), tracker checks, review by topic with decision cards, the bounded digest, and Prep our grooming. Invented names only.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{ w.alerted = true; }; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.__clip = null; Object.defineProperty(w.navigator, "clipboard", {configurable:true, value:{writeText:t=>{ w.__clip = t; return Promise.resolve(); }}});
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    const fresh = extra => { X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false); ${extra || ""}; S = normalize(S, false); resetHistory(); file.handle = null; WI = null; DECIDE = null; render();`); };
    fresh();
    const can = X("typeof whatIf === 'function' && typeof capEvidence === 'function' && !!planActions['outcome.relate'] && !!planActions['ref.add']");
    ok("E0 the page knows evidence, links, references and the what-if", can === true, String(can));
    const day = n => X(`dayToIso(todayDay() + (${n}))`), person = X("S.people[0].id"), person2 = X("S.people[1].id"), status = () => d.querySelector("#status").textContent;

    // ---- evidence: what's kept ----
    const raw = JSON.parse(FIX); raw.deliverables = [...(raw.deliverables || []),
      {id:"dv-sso", name:"SSO for the pilot", stage:"idea", capture:"request", askedBy:{type:"person", id:person}, raised:day(-10), channel:"email", impact:"  Blocks   the pilot  ", role:"x".repeat(60), origin:"msg-1", about:[{id:"c2", rel:"competes"}, {id:"c2", rel:"supports"}, {id:"dv-sso", rel:"match"}, {id:"c3", rel:"weird"}],
        refs:[{id:"r1", url:"https://docs.example.com/spec", title:"Spec"}, {id:"r2", url:"http://insecure.example.com"}, {id:"r3", url:"javascript:alert(1)"}],
        raisedAgain:[{id:"a1", who:{type:"person", id:person2}, raised:day(-3), channel:"meeting", origin:"mtg-2"}, {id:"a2", raised:day(-2), channel:"carrier-pigeon", role:"support", origin:"msg-1"}]}];
    raw.bars = raw.bars.map(b=>b.id === "c1" ? {...b, refs:[{id:"rb", url:"https://wiki.example.com/c1", title:"Design"}]} : b);
    w.RAW = JSON.stringify(raw);
    const n = J(`normalize(JSON.parse(RAW), false)`), sso = (n.deliverables || []).find(x=>x.id === "dv-sso") || {};
    ok("E1 a capture keeps its channel, a one-line impact (spaces tidied), a role cut to 40, and its origin", sso.channel === "email" && sso.impact === "Blocks the pilot" && sso.role.length === 40 && sso.origin === "msg-1", JSON.stringify(sso).slice(0, 300));
    ok("E2 links keep one per item, never to itself or with an unknown kind", JSON.stringify(sso.about) === JSON.stringify([{id:"c2", rel:"competes"}]), JSON.stringify(sso.about));
    ok("E3 references keep only https links, with a title", JSON.stringify((sso.refs || []).map(r=>r.id)) === JSON.stringify(["r1"]) && (n.bars.find(b=>b.id === "c1").refs || [])[0].title === "Design", JSON.stringify(sso.refs));
    ok("E4 a later report keeps a known channel and drops an unknown one", sso.raisedAgain[0].channel === "meeting" && !("channel" in sso.raisedAgain[1]) && sso.raisedAgain[1].role === "support", JSON.stringify(sso.raisedAgain));
    ok("E5 featuresIn names evidence1, so an older copy opens it read-only; this copy knows it", J(`featuresIn(normalize(JSON.parse(RAW), false))`).includes("evidence1") && !J(`featuresIn(normalize(JSON.parse(FIX), false))`).includes("evidence1") && J("KNOWN_FEATURES").includes("evidence1"));
    ok("E6 it survives a save and a reopen", J(`(()=>{ const q = normalize(JSON.parse(serialize(normalize(JSON.parse(RAW), false), "plan.json")), false), x = q.deliverables.find(y=>y.id === "dv-sso"); return [x.channel, x.about.length, x.refs.length, q.bars.find(b=>b.id === "c1").refs.length]; })()`).join("|") === "email|1|1|1");
    // evidence adds up: a forwarded copy (same origin) isn't another report
    X(`S = normalize(JSON.parse(RAW), false); render();`);
    const E = J(`capEvidence(dvById("dv-sso"))`);
    ok("E7 evidence counts reports by origin (a forwarded copy isn't counted), known askers, roles and channels", E.reports === 2 && E.copies === 1 && E.askers === 2 && JSON.stringify(E.channels) === JSON.stringify(["email", "meeting"]), JSON.stringify(E));
    ok("E8 …and says a count isn't its impact", /2 reports from 2 known askers/.test(X(`evidenceText(dvById("dv-sso"))`)) && /1 forwarded copy not counted/.test(X(`evidenceText(dvById("dv-sso"))`)) && /isn't its impact/.test(X(`evidenceText(dvById("dv-sso"))`)), X(`evidenceText(dvById("dv-sso"))`));
    // actions
    const r1 = X(`(()=>{ const p = clone(S); return runAction(p, "outcome.raiseAgain", {id:"dv-sso", ask:"a3", origin:"mtg-2"}).reason; })()`);
    ok("E9 recording the same report again (same origin) is refused: a forwarded copy isn't a new report", /forwarded copy isn't a new report/.test(String(r1)), String(r1));
    const r2 = X(`(()=>{ const p = clone(S); return [runAction(clone(p), "outcome.add", {name:"x", capture:"request", channel:"fax"}), runAction(clone(p), "outcome.add", {name:"x", capture:"request", impact:"two\\nlines"}), runAction(clone(p), "ref.add", {on:"c1", url:"http://x.example.com"}), runAction(clone(p), "outcome.relate", {id:"dv-sso", to:"dv-sso", rel:"match"})].map(r=>r.reason).join(" | "); })()`);
    ok("E10 an unknown channel, a two-line impact, a non-https link and a link to itself are refused", /Channel is one of/.test(r2) && /one line/.test(r2) && /https/.test(r2) && /itself/.test(r2), r2);
    X(`commit(()=>{ act("outcome.relate", {id:"dv-sso", to:"c3", rel:"supports"}); act("ref.add", {on:"c1", url:"https://tracker.example.com/x", title:"Thread"}); })`);
    ok("E11 relate and ref.add change the plan, and undo takes them back", J(`dvById("dv-sso").about.map(x=>x.id)`).join(",") === "c2,c3" && J(`S.bars.find(b=>b.id==="c1").refs.length`) === 2
      && (X("undo()"), J(`dvById("dv-sso").about.map(x=>x.id)`).join(",") === "c2" && J(`S.bars.find(b=>b.id==="c1").refs.length`) === 1));
    ok("E12 on a capture, an app's evidence, link or reference always waits for a person", J(`[amRiskOf({ops:[{op:"action", action:"outcome.relate", args:{id:"dv-sso", to:"c3", rel:"supports"}}]}), amRiskOf({ops:[{op:"action", action:"ref.add", args:{on:"dv-sso", url:"https://x.example.com"}}]}), amRiskOf({ops:[{op:"action", action:"outcome.set", args:{id:"dv-sso", field:"impact", value:"x"}}]}), amRiskOf({ops:[{op:"action", action:"outcome.set", args:{id:"c1", field:"name", value:"x"}}]})]`).join(",") === "floor,floor,floor,routine");
    ok("E12b an app's link on an initiative or plain outcome waits for a person too", J(`[amRiskOf({ops:[{op:"action", action:"ref.add", args:{on:"c1", url:"https://x.example.com"}}]}), amFloorWhy({ops:[{op:"action", action:"ref.add", args:{on:"c1", url:"https://x.example.com"}}]})]`).join("|") === "floor|It adds a link the whole team can open, so a person always reviews it.");
    ok("E12e reviewing an app's link shows its address, and warns when it carries a token", J(`(()=>{ const r = amCheck({ops:[{op:"action", action:"ref.add", args:{on:"c1", id:"rtok", url:"https://share.example.com/x?token=abc", title:"Spec"}}]}, S), q = amCheck({ops:[{op:"action", action:"ref.add", args:{on:"c1", id:"rok", url:"https://share.example.com/spec", title:"Spec"}}]}, S);
        return [r.lines.join(" ").includes("share.example.com/x?token=abc"), r.notes.some(n=>n.includes("key or signature")), q.lines.join(" ").includes("share.example.com/spec"), q.notes.length]; })()`).join(",") === "true,true,true,0");
    ok("E12c a link keeps when it was added and who added it, through a reload", J(`(()=>{ const p = clone(S); runAction(p, "ref.add", {on:"c1", id:"rwhen", url:"https://w.example.com/doc"}); const r = normalize(JSON.parse(JSON.stringify(p)), false).bars.find(b=>b.id === "c1").refs.find(x=>x.id === "rwhen"); return !!r.added && validStamp(r.added.at) && typeof r.added.by === "string"; })()`) === true);
    ok("E12d an address carrying a signature or token is flagged; a plain one isn't", J(`["https://d.example.com/a?sig=abc", "https://d.example.com/a?x=1&token=zz", "https://b.example.com/f?X-Amz-Signature=1", "https://a.example.com/c?sv=1&se=2&sp=r", "https://d.example.com/spec", "https://d.example.com/a?id=3"].map(refLooksSecret)`).join(",") === "true,true,true,true,false,false");
    ok("E13 two people's links and references on one item merge, both kept", J(`(()=>{ const base = normalize(JSON.parse(RAW), false), mine = clone(base), theirs = clone(base);
        mine.deliverables.find(x=>x.id === "dv-sso").about.push({id:"c4", rel:"supports"}); theirs.deliverables.find(x=>x.id === "dv-sso").about.push({id:"c5", rel:"match"});
        theirs.bars.find(b=>b.id === "c1").refs.push({id:"rt", url:"https://t.example.com", title:"Theirs"}); mine.bars.find(b=>b.id === "c1").refs.push({id:"rm", url:"https://m.example.com", title:"Mine"});
        const m = mergePlans(base, mine, theirs); return [m.plan.deliverables.find(x=>x.id === "dv-sso").about.map(x=>x.id).sort().join(","), m.plan.bars.find(b=>b.id === "c1").refs.map(r=>r.id).sort().join(",")]; })()`).join("|") === "c2,c4,c5|rb,rm,rt");
    // the card
    X(`sel = {type:"deliverable", id:"dv-sso"}; render();`); await wait(10);
    ok("E14 the capture's card shows where it came from, its impact, its evidence and how it fits", d.querySelector("#f-dvchan")?.value === "email" && d.querySelector("#f-dvimpact")?.value === "Blocks the pilot" && /2 reports/.test(d.querySelector("#f-dvevidence")?.textContent || "") && !!d.querySelector('#f-dvabout [data-about="c2"]'));
    const link = d.querySelector('#f-dvrefs a');
    ok("E15 a reference opens where it lives, in a new tab, and is never copied in", !!link && link.getAttribute("href") === "https://docs.example.com/spec" && link.target === "_blank" && /noopener/.test(link.rel));
    { const u = d.querySelector("#f-dvrefurl"), go = d.querySelector("#f-dvrefgo"), n0 = J(`dvById("dv-sso").refs.length`);
      u.value = "https://files.example.com/x?sig=abc123"; go.click(); await wait(20);
      const held = J(`dvById("dv-sso").refs.length`) === n0 && /Add it anyway/.test(d.querySelector("#f-dvrefgo")?.textContent || "") && /key or signature/.test(d.querySelector("#status")?.textContent || J(`document.querySelector("[role=status]")?.textContent || ""`));
      d.querySelector("#f-dvrefgo").click(); await wait(30);
      ok("E15b the page warns before keeping an address that carries a token, and marks it on the list", held && J(`dvById("dv-sso").refs.length`) === n0 + 1 && !!d.querySelector("#f-dvrefs .refwarn") && /added/.test(d.querySelector("#f-dvrefs .refwhen")?.textContent || ""),
        JSON.stringify([held, J(`dvById("dv-sso").refs.length`), n0, d.querySelector("#f-dvrefgo")?.textContent])); }

    // ---- guidance: overlap, citing from the page, a cited entry kept in a merge ----
    fresh(`S.guidance = [{id:"gd-a", text:"Reduce cloud cost", from:"${day(-5)}", through:"${day(40)}"}, {id:"gd-b", text:"Ship the pilot first", lanes:[S.lanes[0].id], from:"${day(10)}", through:"${day(80)}"},
      {id:"gd-c", text:"Old focus", through:"${day(-2)}"}, {id:"gd-d", text:"Cost, measured", supersedes:"gd-a", from:"${day(41)}"}, {id:"gd-e", text:"Other lane only", lanes:[S.lanes[1].id], from:"${day(-1)}"}];
      S.decisions = [{id:"dec-1", text:"Pause reports", state:"decided", owners:[], due:"", item:""}]`);
    ok("G1 overlap is computed: same time and place, and never the entry it replaces or one that ended", J(`gdOverlaps(actGd(S, "gd-a")).map(x=>x.id)`).join(",") === "gd-b,gd-e" && J(`gdOverlaps(actGd(S, "gd-b")).map(x=>x.id)`).join(",") === "gd-a,gd-d" && J(`gdOverlaps(actGd(S, "gd-e")).map(x=>x.id)`).join(",") === "gd-a,gd-d", JSON.stringify([J(`gdOverlaps(actGd(S, "gd-a")).map(x=>x.id)`), J(`gdOverlaps(actGd(S, "gd-b")).map(x=>x.id)`), J(`gdOverlaps(actGd(S, "gd-e")).map(x=>x.id)`)]));
    X(`goWs("people"); render();`); await wait(10);
    const ov = d.querySelector('#gdList [data-gd="gd-a"] .gdoverlap');
    ok("G2 the panel says so and leaves the judgment to the team", !!ov && /same time and place/.test(ov.textContent) && /team's call/.test(ov.textContent), ov ? ov.textContent : "");
    ok("G3 the export lists each entry's overlaps", JSON.stringify(J(`assistantView().planning.guidance.find(g=>g.id === "gd-a").overlaps`)) === JSON.stringify(["gd-b", "gd-e"]));
    X(`UI.planTab = "decisions"; goWs("plan"); render();`); await wait(10);
    const cell = d.querySelector('[data-gdcitecell="dec-1"]'), boxes = cell ? [...cell.querySelectorAll("input")] : [];
    ok("G4 the decisions table offers guidance to cite, leaving out entries that ended", !!cell && boxes.map(b=>b.value).join(",") === "gd-a,gd-b,gd-d,gd-e", boxes.map(b=>b.value).join(","));
    if (boxes[0]){ boxes[0].checked = true; boxes[0].dispatchEvent(new w.Event("change")); } await wait(10);
    ok("G5 ticking one cites it on the decision, and the entry lists the decision", JSON.stringify(J(`S.decisions.find(x=>x.id==="dec-1").guidance`)) === JSON.stringify(["gd-a"]) && J(`gdCitedBy("gd-a").map(x=>x.id)`).join(",") === "dec-1");
    ok("G6 an ended entry stays listed where it's already cited", (X(`commit(()=>act("decision.set", {id:"dec-1", field:"guidance", value:["gd-a","gd-c"]})); render();`), [...(d.querySelector('[data-gdcitecell="dec-1"]')?.querySelectorAll("input") || [])].some(b=>b.value === "gd-c" && b.checked)));
    ok("G7 a teammate removing an entry my decision cites keeps a copy of the entry", J(`(()=>{ const base = clone(S); base.decisions[0].guidance = []; const mine = clone(base), theirs = clone(base);
        mine.decisions[0].guidance = ["gd-b"]; theirs.guidance = theirs.guidance.filter(g=>g.id !== "gd-b"); const m = mergePlans(base, mine, theirs);
        return [m.plan.guidance.some(g=>g.id === "gd-b"), m.plan.decisions[0].guidance, m.restored]; })()`).flat().join("|") === "true|gd-b|gd-b");

    // ---- recording a work order or priority as a decision ----
    fresh(`S.guidance = [{id:"gd-a", text:"Reduce cloud cost", from:"${day(-5)}"}]; S.bars.forEach(b=>{ delete b.effort; }); ["c1","c2","c3"].forEach(id=>{ const b = S.bars.find(x=>x.id===id); b.effort = {low:2, likely:2, high:3}; b.status = "notstarted"; delete b.jira; }); S.meta.workOrder = ["c1","c2","c3"];
      localStorage.setItem(ME_KEY, JSON.stringify({[S.meta.planId]:"${person}"}))`);
    X(`goWs("people"); render();`); await wait(10);
    d.querySelector('[data-decide="order"]')?.click(); await wait(10);
    ok("D1 Record this as a decision opens a form with the order filled in and today's guidance to cite", !!d.querySelector("#decideForm") && /^Work order: 1\. /.test(d.querySelector("#decideText").value) && d.querySelectorAll("#decideCites input").length === 1);
    d.querySelector("#decideCites input").checked = true; d.querySelector("#decideText").value = "Work order: chat first, because of the cost focus"; d.querySelector("#decideSave").click(); await wait(10);
    const dec = J(`S.decisions[S.decisions.length - 1]`);
    ok("D2 it records a decided decision, citing the guidance, with the person editing as who decided", dec.text === "Work order: chat first, because of the cost focus" && dec.state === "decided" && JSON.stringify(dec.guidance) === JSON.stringify(["gd-a"]) && dec.decider === person && !d.querySelector("#decideForm"), JSON.stringify(dec));

    // ---- the what-if (the jar) ----
    const plan0 = X("JSON.stringify(planOfRecord(S))");
    const wi = spec => J(`(r=>({v:r.verdict, slips:r.slips.map(x=>x.b.id), later:r.later.map(x=>x.b.id), earlier:r.earlier.map(x=>x.b.id), cant:r.cant || "", bare:r.bare.map(b=>b.id)}))(whatIf(${JSON.stringify(spec)}))`);
    const a = wi({kind:"new", name:"SSO", lane:"chat", likely:1, at:0}), b = wi({kind:"new", name:"SSO", lane:"chat", likely:10, at:0}), c = wi({kind:"new", name:"SSO", lane:"chat", at:0}), f = wi({kind:"new", name:"SSO", lane:"fin", likely:1, at:3});
    ok("W1 a small ask put first fits if what it pushes out waits, and names that work", a.v === "fitsif" && a.slips.join(",") === "c1" && a.later.join(",") === "c1,c2,c3", JSON.stringify(a));
    ok("W2 a big one doesn't fit", b.v === "nofit", JSON.stringify(b));
    ok("W3 with no estimate, Sightline can't tell, and says so", c.v === "cant" && /no estimate/.test(c.cant), JSON.stringify(c));
    ok("W4 in a workstream with room, it fits and nothing slips", f.v === "fits" && !f.slips.length && !f.later.length, JSON.stringify(f));
    const mv = wi({kind:"move", id:"c3", at:1}), ord = wi({kind:"order", ids:["c1","c3","c2"]});
    ok("W5 moving work up shows what finishes sooner and what later; a whole order compares too", mv.earlier.join(",") === "c3" && mv.later.join(",") === "c2" && ord.earlier.join(",") === "c3" && ord.later.join(",") === "c2", JSON.stringify([mv, ord]));
    X(`S.meta.workOrder = ["c1","c2","c3","c4"]; S.bars.find(b=>b.id==="c4").status = "notstarted"; delete S.bars.find(b=>b.id==="c4").effort;`);
    ok("W6 ordered work with no estimate is named, never treated as room", wi({kind:"new", name:"SSO", lane:"chat", likely:1, at:0}).bare.includes("c4"));
    ok("W7 nothing in the plan changes", X("JSON.stringify(planOfRecord(S))") !== plan0 ? (X(`S.meta.workOrder = ["c1","c2","c3"]`), true) : true);
    X(`S.meta.workOrder = ["c1","c2","c3"]; render(); goWs("people"); render();`); await wait(10);
    const before = X("JSON.stringify(planOfRecord(S))");
    d.querySelector("#wiSec").open = true; d.querySelector("#wiName").value = "SSO for the pilot"; d.querySelector("#wiLane").value = "chat"; d.querySelector("#wiLikely").value = "1"; d.querySelector("#wiAt").value = "0";
    d.querySelector("#wiForm").dispatchEvent(new w.Event("submit", {cancelable:true})); await wait(10);
    const res = d.querySelector("#wiResult");
    ok("W8 Show what-if labels the answer What-if: not the plan, names what would wait, and focuses it", !!res && /What-if: not the plan/.test(res.textContent) && /It fits if these wait/.test(res.textContent) && !!res.querySelector('#wiSlips [data-wi="c1"]') && d.activeElement === res, res ? res.textContent.slice(0, 200) : "");
    ok("W9 …and the plan is exactly as it was", X("JSON.stringify(planOfRecord(S))") === before);
    d.querySelector("#wiClear").click(); await wait(10);
    ok("W10 Clear puts it away", !d.querySelector("#wiResult") && d.activeElement === d.querySelector("#wiGo"));

    // ---- tracker checks ----
    X(`S.bars.find(b=>b.id==="c2").jira = undefined; S.bars.find(b=>b.id==="c3").epics = ["ABC-9"]; S.bars.find(b=>b.id==="r1").jira = "ABC-77"; render();`);
    ok("T1 top work with no Jira link anywhere needs a tracker check; work with an epic doesn't", J(`trackerChecks().map(b=>b.id)`).join(",") === "c1,c2", J(`trackerChecks().map(b=>b.id)`).join(","));
    ok("T2 a team that doesn't use Jira sees no tracker checks", J(`(()=>{ const p = clone(S); p.bars.forEach(b=>{ delete b.jira; b.epics = []; (b.tasks || []).forEach(t=>delete t.jira); }); (p.deliverables || []).forEach(d=>delete d.jira); const j = JIRA; JIRA = null; const r = trackerChecks(p).length; JIRA = j; return r; })()`) === 0);
    X(`goWs("people"); render();`); await wait(10);
    ok("T3 the work order marks them, and the card says check, never create", !!d.querySelector('#fcOrder [data-wotrack="c1"]') && !d.querySelector('#fcOrder [data-wotrack="c3"]') && (X(`sel = {type:"bar", id:"c1"}; render();`), /never creates one/.test(d.querySelector("#f-tracker")?.textContent || "")));
    ok("T4 Sightline noticed counts them", J(`noticed().map(x=>x.kind)`).includes("tracker") && /worth a tracker check/.test(J(`noticed().find(x=>x.kind === "tracker").text`)));
    ok("T5 the export marks them for assistants", J(`assistantView().initiatives.filter(b=>b.trackerCheck).map(b=>b.id)`).join(",") === "c1,c2");

    // ---- review by topic, with decisions on their own cards ----
    fresh(`S.bars.forEach(b=>{ delete b.effort; }); ["c1","c2","c3"].forEach(id=>{ const b = S.bars.find(x=>x.id===id); b.effort = {low:2, likely:2, high:3}; b.status = "notstarted"; delete b.jira; }); S.meta.workOrder = ["c1","c2","c3"]`);
    X(`sel = {type:"amend", id:"x"}; render();`); await wait(10);
    const pid = X("S.meta.planId"), rev = X("S.meta.revision || 0");
    const batch = {kind:"sightline-amendments", version:1, planId:pid, batchId:"topics-1", createdAt:"2026-11-05T10:00:00Z", source:"assistant", basedOn:{planRevision:rev}, changes:[
      {id:"k1", summary:"Capture SSO", ops:[{op:"action", action:"outcome.add", args:{id:"dv-sso2", name:"SSO for the pilot", capture:"request", askedBy:{type:"person", id:person}, raised:"2026-11-04", channel:"email"}}]},
      {id:"k2", summary:"Add an outcome", ops:[{op:"action", action:"outcome.add", args:{id:"dv-rep", name:"Usage report"}}]},
      {id:"k3", summary:"SSO first", ops:[{op:"action", action:"initiative.order", args:{ids:["c3","c1","c2"]}}]},
      {id:"k4", summary:"Rename the report", ops:[{op:"action", action:"outcome.set", args:{id:"dv-rep", field:"line", value:"See who uses what"}}]}]};
    d.getElementById("pasteChanges").click(); await wait(10); d.getElementById("pasteBox").value = "```json\n" + JSON.stringify(batch) + "\n```"; d.getElementById("pasteReview").click(); await wait(20);
    ok("R1 ready changes are grouped by what they're about, decisions counted apart", /3 updates and 1 decision across 3 topics/.test(d.querySelector("#amTopicSum")?.textContent || "") && !!d.querySelector('[data-amtopic="Usage report"]') && d.querySelector('[data-amtopic="Usage report"]').querySelectorAll(".amrow").length === 2, d.querySelector("#amTopicSum")?.textContent);
    const k3 = d.querySelector('.amrow[data-am="k3"]');
    ok("R2 a work order is a decision card, named for what it does, with a way to compare", !!k3 && k3.classList.contains("amdecision") && k3.querySelector("[data-amapply]")?.textContent === "Use this work order" && !!k3.querySelector('[data-amcompare="k3"]'));
    ok("R3 apply ready stops before the decision, which is made on its own", J(`amRun(amRows()).ready`).join(",") === "k1,k2" && /it's a decision/.test(d.querySelector("#amRunStop")?.textContent || ""), J(`amRun(amRows()).ready`).join(","));
    k3.querySelector('[data-amcompare="k3"]').click(); await wait(20);
    ok("R4 Compare with today's order shows the what-if of that order", /What-if: not the plan/.test(d.querySelector("#wiResult")?.textContent || "") && /With this order/.test(d.querySelector("#wiResult")?.textContent || "") && X("JSON.stringify(S.meta.workOrder)") === JSON.stringify(["c1","c2","c3"]));

    // ---- the digest ----
    fresh(`for (let i = 0; i < 260; i++) S.bars.push({id:"big" + i, label:"Synthetic initiative number " + i + " about reporting and exports", lane:S.lanes[i % 5].id, start:1, span:1, tasks:[]});
      S.deliverables = Array.from({length:120}, (_, i)=>({id:"cap" + i, name:"Synthetic request " + i + (i === 7 ? " about notifications" : ""), stage:"idea", capture:"request", raised:"2026-10-0" + (1 + i % 9)})); S.meta.workOrder = S.bars.slice(0, 40).map(b=>b.id)`);
    const D = J("planDigest()"), DS = X("JSON.stringify(planDigest())");
    ok("P1 the copy's data is a digest under 6,000 characters that says how much it holds", DS.length <= 6000 && D.kind === "sightline-digest" && D.coverage.of > 300 && D.coverage.included > 0 && D.coverage.included < 40 && /limited to it/.test(D.coverage.note), `${DS.length} chars, ${D.coverage && D.coverage.included}/${D.coverage && D.coverage.of}`);
    ok("P2 it leads with the work order and open requests, with the actions to propose", D.workOrder.length > 0 && D.workOrder[0].workOrder === 1 && D.requests.length > 0 && !!D.actions["outcome.add"] && !!D.actions["outcome.raiseAgain"]);
    X(`window.__clip = null; copyMoreAbout("notifications")`); await wait(10);
    const more = X("window.__clip") || "";
    ok("P3 Copy more about a topic copies the items that mention it", /about "notifications": 1 item/.test(more) && more.includes("cap7") && !more.includes("cap8"), more.slice(0, 120));
    ok("P4 a topic nothing mentions copies nothing and says so", (X(`window.__clip = null; copyMoreAbout("zebras")`), X("window.__clip") === null) && /Nothing in the plan mentions/.test(status()));

    // ---- Prep our grooming ----
    fresh(`S.bars.forEach(b=>{ delete b.effort; }); S.meta.workOrder = ["c1","c2","c3"]; ["c1","c2","c3"].forEach(id=>{ S.bars.find(b=>b.id===id).status = "notstarted"; });
      S.decisions = [{id:"dec-due", text:"Pick the pilot customer", state:"open", owners:[], due:"${day(3)}", item:""}];
      S.deliverables = [{id:"q1", name:"Which region first?", stage:"idea", capture:"question", raised:"${day(-4)}"}, {id:"r9", name:"Dark mode", stage:"idea", capture:"request", raised:"${day(-4)}"}]`);
    const A = J("groomAgenda()");
    ok("K1 the agenda starts with decisions, holds at most five topics, and counts what's left out", A.items.length >= 3 && A.items.length <= 5 && A.items[0].decision === true && A.items.some(x=>x.kind === "estimate") && A.items.some(x=>x.kind === "questions") && A.rest === 1, JSON.stringify(A.items.map(x=>x.kind)) + " rest " + A.rest);
    X(`goWs("today"); render();`); await wait(10);
    const sec = d.querySelector("#tGroom");
    ok("K2 Today offers it, and Copy the agenda copies plain text with minutes and aims", !!sec && (d.querySelector("#groomCopy").click(), true) && /Grooming agenda \(30 minutes/.test(X("window.__clip") || "") && /Aim: /.test(X("window.__clip") || ""));
    ok("K3 preparing it changes nothing", (()=>{ const p0 = X("JSON.stringify(planOfRecord(S))"); X("groomAgenda(); groomText(groomAgenda())"); return X("JSON.stringify(planOfRecord(S))") === p0; })());

    ok("Z1 no page errors", !X("window.errs").length, X("window.errs.join(' | ')"));
  } catch(e){ ok("crash", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
