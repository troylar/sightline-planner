// Focus: one gesture to narrow to an initiative (framed in Days on the Timeline) or a person, levels that stack, a
// path above the chart to step back out, and leaving puts the view back as it was. It's this browser's view only.
// The sample plan, with tasks added here for two of its invented people. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const X = s => { try { return ev(s); } catch(e){ return undefined; } };
  const $ = s => d.querySelector(s);
  const key = (k, o = {}) => d.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, ...o}));
  const path_ = () => [...d.querySelectorAll("#drillPath li")].map(li=>li.textContent.trim());
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null;
        window.A = S.people.find(p=>p.name === "Avery").id; window.B = S.people.find(p=>p.name === "Blake").id;
        const b = S.bars.find(x=>x.id === "m2"), st = dayToIso(nearWeekday(wkDay(b.start)));
        b.tasks = [{id:"fa", label:"Avery builds", start:st, days:4, owners:[A], status:"inprogress"}, {id:"fb", label:"Blake tests", start:st, days:3, owners:[B], status:"notstarted"}];
        const c = S.bars.find(x=>x.id === "c2"); c.owners = [A]; c.tasks = [{id:"fm", label:"Morgan's part", start:st, days:2, owners:[S.people.find(p=>p.name === "Morgan").id], status:"notstarted"}];
        S.bars.find(x=>x.id === "m5").label = '<img src=x onerror="window.pwned=1">Retire';
        UI.ws = "timeline"; UI.zoom = "weeks"; UI.focus = null; UI.filter = normFilter({}); render();
        window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();
        window.TV = id => taskVisible(taskById(id).t);`);
    const lane = J(`S.bars.find(x=>x.id === "m2").lane`);
    ev(`UI.filter = normFilter({lanes:[${JSON.stringify(lane)}]}); render();`);
    const pastBefore = J("past.length"), baseVis = T("VIS()");

    // In: the card's Focus button.
    ev(`select("bar", "m2");`); await wait(20);
    ok("F1 an initiative's card offers Focus", $("#f-focus")?.textContent === "Focus", $("#f-focus")?.textContent);
    $("#f-focus")?.click(); await wait(20);
    ok("F2 Focus on an initiative shows only it, framed in Days", T("[UI.zoom, UI.focus, UI.filter.bars]")?.join("|") === "days|m2|m2" && T("VIS()")?.join() === "m2", T("[UI.zoom, UI.focus, UI.filter.bars, VIS()]")?.join("|"));
    ok("F3 the path above the chart names where you are, and the last step is the current one", path_().join(" / ") === "Current view / " + J(`chartLabel(barById("m2"))`) && $("#drillPath [aria-current]") && $("#drillPath").tagName === "NAV", path_().join(" / "));

    // A person inside it: only their work there, and the teammates' on request.
    ev(`select("person", A);`); await wait(20);
    ok("F4 a person's card offers Focus on their work, and the old Show only button is gone", $("#f-focus")?.textContent === "Focus on their work" && !/Show only Avery's work/.test($("#side").textContent));
    $("#f-focus")?.click(); await wait(20);
    ok("F5 levels stack: their work in that initiative, a teammate's task hidden", path_().length === 3 && /Avery$/.test(path_()[2]) && X(`TV("fa")`) === true && X(`TV("fb")`) === false && T("UI.filter.people")?.join() === J("A"), path_().join(" / "));
    const rest = $("#drillRest");
    ok("F6 a person level offers to show teammates' work too, off by default", rest && !rest.checked);
    if (rest){ rest.checked = true; rest.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(20); }
    ok("F7 with teammates' work on, everyone's tasks where they have work show", X(`TV("fa")`) === true && X(`TV("fb")`) === true && T("UI.filter.people")?.length === 0 && T("VIS()")?.join() === "m2", T("[UI.filter.bars, UI.filter.people]")?.join("|"));
    const r2 = $("#drillRest"); if (r2){ r2.checked = false; r2.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(20); }

    // Links and Back/Forward carry the path; the link's filter is the view under the focus.
    const st = T("navState()");
    ok("F8 a link carries the focus path and the view under it", st?.dr === "bar:m2,person:" + J("A") && JSON.parse(st?.f || "{}").lanes?.join() === lane && !JSON.parse(st?.f || "{}").people, JSON.stringify(st));
    ev(`select("person", A);`); await wait(5);

    // Changing the view under the focus.
    ev(`setFilter(x=>{ x.status = ["inprogress"]; });`); await wait(10);
    ok("F9 a filter the focus doesn't own changes the view under it, and the focus stays", X("drillOn()") === true && T("UI.drill.base.filter.status")?.join() === "inprogress" && T("UI.filter.status")?.join() === "inprogress");
    ev(`setFilter(x=>{ x.status = []; });`); await wait(10);

    // Out: a step on the path, Esc, then Leave focus puts everything back.
    $('#drillPath [data-drill="1"]')?.click(); await wait(20);
    ok("F10 clicking a step goes back to that level", path_().length === 2 && T("UI.filter.people")?.length === 0 && X(`TV("fb")`) === true);
    ev(`sel = null; render();`); key("Escape"); await wait(20);
    ok("F11 Esc with nothing selected steps out one level; from the last, it leaves", X("drillOn()") === false && !$("#drillPath"));
    ok("F12 leaving puts the view back: filters, zoom, and what was selected when you went in", T("[UI.zoom, UI.focus, UI.filter.lanes]")?.join("|") === `weeks||${lane}` && T("VIS()")?.join() === baseVis?.join() && T("sel && sel.id") === "m2", T("[UI.zoom, UI.focus, UI.filter.lanes, sel && sel.id]")?.join("|"));

    // Z on what's selected; a task focuses its initiative.
    ev(`select("task", "fa");`); await wait(5); key("z"); await wait(20);
    ok("F13 Z on a selected task focuses its initiative", T("UI.drill && UI.drill.stack.map(s=>s.k + ':' + s.id)")?.join() === "bar:m2", T("UI.drill && UI.drill.stack")?.length);
    const inp = $("#f-label") || $("#side input"); inp?.focus(); key("z"); await wait(10);
    ok("F14 Z while typing does nothing", T("UI.drill.stack.length") === 1);
    inp?.blur(); $("#drillOut")?.click(); await wait(20);
    ok("F15 Leave focus leaves from any depth", X("drillOn()") === false);

    // Two initiatives that don't nest: the second replaces the first.
    ev(`focusOn("bar", "m2"); focusOn("bar", "m4");`); await wait(10);
    ok("F16 an initiative that isn't inside the focused one takes its place", T("UI.drill.stack.map(s=>s.id)")?.join() === "m4");
    // A person changing filters the focus owns ends the focus, keeping what's shown.
    ev(`focusOn("person", A); setFilter(x=>{ x.people = [B]; });`); await wait(10);
    ok("F17 picking other people in Filters ends the focus and keeps that pick", X("drillOn()") === false && T("UI.filter.people")?.join() === J("B"));
    ev(`UI.filter = normFilter({}); render();`);

    // Something focused is deleted, or another plan opens: the focus steps back by itself.
    ev(`focusOn("bar", "m4"); commit(()=>{ S.bars = S.bars.filter(b=>b.id !== "m4"); });`); await wait(10);
    ok("F18 deleting the focused initiative steps out of the focus", X("drillOn()") === false && T("UI.filter.bars")?.length === 0);
    ev(`undo(); focusOn("bar", "m2"); UI.drill.plan = "another-plan"; render();`); await wait(10);
    ok("F19 a focus remembered from another plan is dropped", T("UI.drill") === null && !$("#drillPath"));
    ev(`UI.filter = normFilter({}); UI.zoom = "weeks"; UI.focus = null; render();`);

    // A link with a path opens focused, unknown ids are ignored.
    ev(`applyNav({ws:"timeline", plan:S.meta.planId, f:JSON.stringify({lanes:[${JSON.stringify(lane)}]}), dr:"bar:m2,person:" + A + ",bar:nope,evil:x"});`); await wait(10);
    ok("F20 a link with a focus path opens focused on top of its filters; unknown steps are skipped", T("UI.drill.stack.map(s=>s.k)")?.join() === "bar,person" && T("UI.drill.base.filter.lanes")?.join() === lane && T("UI.filter.people")?.join() === J("A"));
    ev(`applyNav({ws:"timeline", plan:S.meta.planId});`); await wait(10);
    ok("F21 Back to a place without a path leaves the focus", X("drillOn()") === false && !$("#drillPath"));

    // Their work includes an initiative they lead, even when none of its tasks are theirs (it used to vanish).
    ev(`UI.filter = normFilter({people:[A]}); render();`);
    ok("F22 a person's work includes an initiative they lead whose tasks are someone else's", T("VIS()")?.includes("c2"), T("VIS()")?.join());
    ev(`UI.filter = normFilter({}); render();`);

    // Untrusted names stay text; Present shows the path; nothing goes into the plan.
    ev(`focusOn("bar", "m5");`); await wait(10);
    ok("F23 a name from the plan is shown as text in the path", !$("#drillPath img") && /<img/.test($("#drillPath")?.textContent || "") && !w.pwned);
    ev(`present = true; drawBanners();`);
    ok("F24 Present shows the path too", !!$("#drillPath"));
    ev(`present = false; drawBanners(); drillTo(0);`);
    ok("F25 focusing never changes the plan: no undo steps, nothing saved", J("past.length") === pastBefore && !/drill/.test(J("JSON.stringify(S)")), `${pastBefore} -> ${J("past.length")} (F18's delete was undone)`);
    // Review fixes: what the focus leaves behind, and what takes over the view.
    ev(`UI.filter = normFilter({}); UI.zoom = "weeks"; UI.focus = null; render(); focusOn("bar", "m2"); UI.drill.plan = "another-plan"; render();`); await wait(5);
    ok("G1 a focus from another plan leaves no initiative pick or Days framing behind", T("[UI.drill, UI.filter.bars.length, UI.focus, UI.zoom]")?.join("|") === "|0||weeks", T("[UI.drill, UI.filter.bars, UI.focus, UI.zoom]")?.join("|"));
    ev(`focusOn("bar", "m2"); applyNav({ws:"timeline", plan:S.meta.planId, z:"weeks"});`); await wait(5);
    ok("G2 Back to before the focus drops its Days framing too", T("[UI.drill, UI.focus]")?.join("|") === "|", T("[UI.drill, UI.focus]")?.join("|"));
    ev(`UI.zoom = "weeks"; render(); focusOn("bar", "m2");`);
    ok("G3 a link keeps the zoom under the focus: none said for Weeks", T("navState()")?.dz === undefined && T("navState()")?.z === "days");
    ev(`const st = navState(); drillTo(0); applyNav(st); drillTo(0);`); await wait(5);
    ok("G3b opening that link and leaving the focus lands in Weeks", T("UI.zoom") === "weeks" && X("drillOn()") === false, T("UI.zoom"));
    ev(`focusOn("person", A); UI.drill.rest = true; drillApply(); setFilter(x=>{ x.status = ["done"]; });`); await wait(5);
    ok("G4 with teammates' work on, a filter change recomputes where the person has work", J("JSON.stringify(UI.filter) === JSON.stringify(drillFilter(UI.drill))") && !T("UI.filter.bars")?.includes("m2") && T("UI.drill.base.filter.status")?.join() === "done", T("[UI.filter.bars, UI.filter.people]")?.join("|"));
    ev(`clearView();`); await wait(5);
    ok("G5 All work ends the focus", X("drillOn()") === false && !$("#drillPath") && T("UI.filter.status")?.length === 0);
    ev(`focusOn("bar", "m2"); setZoom("weeks"); setZoom("days");`); await wait(5);
    ok("G6 Weeks then Days while focused frames the initiative again", T("UI.focus") === "m2", T("UI.focus"));
    ev(`goTo("bar", "m4");`); await wait(5);
    ok("G7 jumping to something the focus hides ends the focus and shows it", X("drillOn()") === false && T("VIS()")?.includes("m4"));
    ev(`goTo("bar", "m2"); focusOn("bar", "m2"); focusOn("person", A);`); await wait(5);
    $('#drillPath [data-drill="1"]')?.click(); await wait(5);
    ok("G8 after a step on the path, the keyboard is on the current step", d.activeElement?.classList.contains("here"), d.activeElement?.tagName);
    $("#drillOut")?.click(); await wait(5);
    ok("G8b after Leave focus, the keyboard isn't dropped on the page", d.activeElement && d.activeElement !== d.body, d.activeElement?.tagName);
    ev(`select("task", "fa");`); await wait(5);
    const q = [...d.querySelectorAll("#side .qopen")].map(b=>b.title + "|" + b.getAttribute("aria-keyshortcuts"));
    ok("G9 the one-line boxes show their shortcuts", q.join() === "Add an update (U)|U,Add a note (S)|S", q.join());
    // Peer review: one way out on screen, plain wording, a Filters count that's yours.
    ev(`drillTo(0); UI.filter = normFilter({lanes:[${JSON.stringify(lane)}]}); render(); setStatus(""); focusOn("bar", "m2"); select("bar", "m2");`); await wait(10);
    ok("H1 the header status line stays quiet; screen readers hear the focus from a live region", J(`$("#status").textContent`) === "" && /Focused on/.test(J(`$("#drillLive") && $("#drillLive").textContent`) || "") && J(`$("#drillLive").getAttribute("aria-live")`) === "polite");
    ok("H2 the card of the level you're on has no Focus or Step out button", !$("#f-focus") && !/Step out/.test($("#side").textContent));
    ev(`focusOn("person", A); select("person", A);`); await wait(10);
    ok("H3 the teammates' option says it plainly", /Show teammates' work on Avery's initiatives/.test($("#drillPath")?.textContent || ""), ($("#drillPath")?.textContent || "").slice(0, 160));
    ok("H4 the Filters count is your own filters, not the focus, and its hover says so", $("#filterBtn .fcount")?.textContent === "1" && /1 of your filters on, under the focus/.test($("#filterBtn").title), ($("#filterBtn .fcount")?.textContent || "none") + " | " + $("#filterBtn").title);
    ev(`drillTo(0); UI.filter = normFilter({}); render();`);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
