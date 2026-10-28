// Commands: Find (/ or Ctrl+K) runs actions by name as well as finding plan items, shows each action's shortcut, offers
// only what applies right now, and every shortcut it shows is in the keyboard help. Shortcuts stay quiet while typing,
// including in rich text and while an input method is composing. The sample plan; every name is invented.
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
  const chips = () => [...d.querySelectorAll("#showStrip .showchip")].map(c=>c.dataset.show);
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
    const open = q => { ev(`openFind(); renderFind(${JSON.stringify(q)})`); return [...d.querySelectorAll("#findList .fhit")]; };
    const acts = q => open(q).filter(b=>b.classList.contains("fcmd")).map(b=>b.querySelector(".ft").textContent);
    ev(`UI.filter = normFilter({}); UI.zoom = "weeks"; sel = null; render();`);

    // By name, with its shortcut
    let hits = open("days");
    ok("K1 typing an action's name offers it first, marked as an action with its key", hits[0]?.classList.contains("fcmd") && hits[0].querySelector(".ft").textContent === "Days view" && hits[0].querySelector("kbd")?.textContent === "D", hits[0]?.textContent);
    d.querySelector("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await wait(20);
    ok("K2 Enter runs it, and Find closes", X("UI.zoom") === "days" && d.querySelector("#findPop").hidden);
    ok("K3 only what applies now: Days view isn't offered in Days, Weeks view is", !acts("view").includes("Days view") && acts("view").includes("Weeks view"), acts("view").join("|"));
    ev(`setZoom("weeks"); closeFind();`);

    // Actions and plan items together
    hits = open("search");
    ok("K4 plan items still come up, after any actions", hits.some(b=>!b.classList.contains("fcmd")) && hits.findIndex(b=>!b.classList.contains("fcmd")) >= hits.filter(b=>b.classList.contains("fcmd")).length);
    ok("K5 a plan item's click still goes to it", (()=>{ const b = hits.find(x=>!x.classList.contains("fcmd")); b?.click(); return !!b && X("sel") && d.querySelector("#findPop").hidden; })());

    // Selection actions appear with a selection, and act on it
    ev(`sel = null; render();`);
    ok("K6 with nothing selected, there's no Show only the selection", !acts("show only").includes("Show only the selection"));
    ev(`select("bar", "m2");`); await wait(10);
    open("show only"); d.querySelector("#findList .fcmd")?.click(); await wait(20);
    ok("K7 with an initiative selected, Show only the selection makes its chip", T("UI.filter.bars")?.join() === "m2", JSON.stringify(T("UI.filter.bars")));
    ok("K8 Show all work is offered while a filter is on, and clears it", acts("show all").includes("Show all work (clear every filter)") && (d.querySelector("#findList .fcmd")?.click(), !X("fActive()")));

    // A command that no longer applies doesn't run
    ok("K9 an action that doesn't apply right now says so instead of running", X(`runCmd("redo")`) === false && /doesn't apply/.test(d.querySelector("#status")?.textContent || ""));

    // Every shortcut shown on an action is in the keyboard help (one source can't drift from the other)
    const help = new Set(T("SHORTCUTS.flatMap(([g, rows])=>rows.flatMap(r=>r[0]))") || []);
    const bad = (T("COMMANDS.flatMap(c=>(c.keys || []).map(k=>c.id + ':' + k))") || []).filter(x=>{ const k = x.slice(x.indexOf(":") + 1); return !help.has(k) && !help.has(k.replace(/^Ctrl\+/, "")) && !(T("SHORTCUTS.flatMap(([g, rows])=>rows.map(r=>r[0].join('+')))") || []).includes(k); });
    ok("K10 every key an action shows is in the keyboard help", !bad.length, bad.join(" "));
    ok("K11 every action has a plain, US English label without em dashes", (T("COMMANDS.map(c=>c.label)") || []).every(l=>l && !/\u2014|colour|behaviour|organis/i.test(l)));

    // Typing: rich text and an input method composing keep the keys
    ev(`closeFind(); sel = null; setZoom("weeks"); const ed = document.createElement("div"); ed.setAttribute("contenteditable", "true"); ed.tabIndex = 0; ed.id = "rt"; document.body.append(ed);`);
    d.querySelector("#rt").focus(); key("d"); await wait(10);
    ok("K12 a key typed in rich text doesn't run a shortcut", d.activeElement?.id === "rt" && X("UI.zoom") === "weeks", d.activeElement?.id);
    d.activeElement?.blur(); ev(`document.querySelector("#rt").remove(); document.activeElement && document.activeElement.blur()`); key("d", {isComposing:true}); await wait(10);
    ok("K13 a key while an input method is composing doesn't run a shortcut", X("UI.zoom") === "weeks");
    key("d"); await wait(10);
    ok("K14 the same key otherwise still works", X("UI.zoom") === "days", [X("UI.zoom"), d.activeElement && d.activeElement.tagName, X("dlg.open"), X("dd.open")].join(" "));
    ev(`setZoom("weeks")`);

    // From the review: a menu opened from Find stays open, a status action never toggles back, focus lands somewhere you can see
    const click = el => el && el.dispatchEvent(new w.MouseEvent("click", {bubbles:true}));
    open("filters"); click([...d.querySelectorAll("#findList .fcmd")].find(b=>b.querySelector(".ft").textContent === "Filters")); await wait(20);
    ok("K15 clicking Filters in Find opens Filters, and it stays open", !$("#filterPop").hidden && $("#filterBtn").getAttribute("aria-expanded") === "true");
    ev(`closeFilterPop(); taskById("fa").t.status = "done"; render(); select("task", "fa");`); await wait(10);
    ok("K16 on finished work, Find offers Mark in progress but not Mark done (which would reopen it)", acts("mark the selection").includes("Mark the selection in progress") && !acts("mark the selection").includes("Mark the selection done"), acts("mark the selection").join("|"));
    ev(`taskById("fa").t.status = "inprogress"; sel = null; render();`);
    open("notes"); $("#findIn").focus(); $("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await wait(20);
    ok("K17 after an action from Find, focus is on Find's button, not the hidden search box", d.activeElement === $("#findBtn"), d.activeElement && (d.activeElement.id || d.activeElement.tagName));
    ev(`UI.notes = "all"; saveUI(); render();`);
    ev(`window.HD0 = file.handle; file.handle = {name:"plan.json"}; quickDone.push({what:"x", ops:[], hd:file.handle});`);
    ok("K18 a quick update you can undo offers Undo in Find", acts("undo").includes("Undo"), acts("undo").join("|"));
    ev(`quickDone.length = 0; file.handle = HD0; closeFind(); render();`);
    ev(`window.JL0 = jiraLockOf; jiraLockOf = ()=>({status:true}); select("task", "fa");`); await wait(10);
    ok("K19 when Jira owns the selection's status, Find doesn't offer to change it, and Blocked stays", !acts("mark the selection").some(x=>/in progress|done/.test(x)) && acts("mark the selection").includes("Mark the selection blocked"), acts("mark the selection").join("|"));
    ev(`jiraLockOf = JL0; S.meta.features = ["from-a-newer-copy"];`);
    ok("K20 a plan from a newer copy (opened read-only) offers no updates on the selection", !acts("selection").some(x=>/^(Mark|Write|Add a sticky)/.test(x)), acts("selection").join("|"));
    ev(`S.meta.features = []; sel = null; render();`);
    open("view"); $("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true})); ev(`renderFind("view")`);
    const ad = $("#findIn").getAttribute("aria-activedescendant");
    const ad0 = !!$("#fhit0"); ev(`renderFind("zzzzqq")`);
    ok("K21 the highlighted result read out is always one on screen: the first after typing, none when nothing matches", ad === "fhit0" && ad0 && !$("#findIn").hasAttribute("aria-activedescendant"), String(ad));
    ev(`closeFind()`); open("days"); $("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", isComposing:true, bubbles:true})); await wait(10);
    ok("K22 Enter while an input method is composing doesn't run the highlighted result", X("UI.zoom") === "weeks" && !$("#findPop").hidden);
    ev(`closeFind(); document.activeElement && document.activeElement.blur()`); key("/", {isComposing:true}); await wait(10);
    ok("K23 / while composing doesn't open Find", $("#findPop").hidden);
    ok("K24 the row commands don't claim R, which steps through groupings instead", T(`COMMANDS.filter(c=>/^rows-/.test(c.id)).every(c=>!(c.keys || []).length)`) === true);
    ev(`sel = null; render();`);
    ok("K25 actions match the start of a word: \"lis\" offers Go to List, \"s\" doesn't", acts("lis").includes("Go to List") && !acts("s").includes("Go to List"), [acts("lis").join("|"), acts("s").join("|")].join(" / "));
    ok("K26 a one- or two-letter search offers at most three actions, so plan items stay in view", acts("s").length <= 3 && acts("sh").length <= 3 && open("s").some(b=>!b.classList.contains("fcmd")), acts("s").join("|"));
    ev(`closeFind()`);
    const enter = () => $("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true}));
    ev(`UI.filter = normFilter({}); sel = null; render();`);
    const f0 = JSON.stringify(T("UI.filter")); open("s"); const hl = $("#findList .fhit.on"); enter(); await wait(20);
    ok("K27 a one-letter search highlights the first plan item, so Enter opens it and leaves the filters alone", !!hl && !hl.classList.contains("fcmd") && !!X("sel") && JSON.stringify(T("UI.filter")) === f0, [hl && hl.textContent, JSON.stringify(T("sel"))].join(" "));
    ev(`UI.filter = normFilter({}); render(); select("bar", "m2");`); await wait(10);
    open("show"); enter(); await wait(20);
    ok("K28 from three letters on, the first action is highlighted: show + Enter shows only the selection", T("UI.filter.bars")?.join() === "m2", JSON.stringify(T("UI.filter.bars")));
    ev(`UI.filter = normFilter({}); sel = null; setHiddenQuiet([]); UI.notes = "all"; render();`);
    const g1 = acts("gates"); ev(`setHiddenQuiet(["gate"]); UI.notes = "none"; render();`); const g2 = acts("gates"), n2 = acts("notes");
    ok("K29 the toggles say what they'll do now: Hide gates while shown, Show gates while hidden, and Show notes while notes are off", g1.includes("Hide gates") && g2.includes("Show gates") && n2.includes("Show notes"), [g1, g2, n2].map(x=>x.join("|")).join(" / "));
    ok("K30 either word finds a toggle: hide finds Show gates, show finds it too", acts("hide gat").includes("Show gates") && acts("show gat").includes("Show gates"), acts("hide gat").join("|"));
    ev(`setHiddenQuiet([]); UI.notes = "all"; saveUI(); closeFind(); render();`);
    // I and X are refused, not written, when Jira owns the item's status: nothing is saved or logged for Jira to undo
    ev(`window.JL0 = jiraLockOf; jiraLockOf = o => o === taskById("fa").t ? {status:true} : JL0(o); window.QS0 = quickSave; window.QSN = 0; quickSave = (...a)=>{ QSN++; return QS0(...a); };
      taskById("fa").t.status = "inprogress"; select("task", "fa"); render(); document.activeElement && document.activeElement.blur();`); await wait(10);
    key("x"); await wait(20);
    ok("K31 X on an item whose status Jira owns changes nothing and saves nothing, and says why", X(`taskById("fa").t.status`) === "inprogress" && X("QSN") === 0 && /from Jira/.test($("#status")?.textContent || ""), [X(`taskById("fa").t.status`), X("QSN"), $("#status")?.textContent].join(" | "));
    ev(`taskById("fa").t.status = "todo"; render(); select("task", "fa");`); await wait(10); key("i"); await wait(20);
    ok("K32 …and I the same", X(`taskById("fa").t.status`) === "todo" && X("QSN") === 0, [X(`taskById("fa").t.status`), X("QSN")].join(" | "));
    ev(`jiraLockOf = JL0; quickSave = QS0; taskById("fa").t.status = "inprogress"; sel = null; render();`);
    // O: change who owns the selection, from the keyboard, through the item's own owner picker
    ev(`closeFind(); UI.ws = "timeline"; render(); select("task", "fa"); render(); document.activeElement && document.activeElement.blur();`); await wait(10);
    key("o"); await wait(20);
    ok("K33 O on a selected task puts the cursor in its owner picker", d.activeElement?.id === "f-towner", d.activeElement && (d.activeElement.id || d.activeElement.tagName));
    { const inp = $("#f-towner"); if (inp){ inp.value = "Blake"; inp.dispatchEvent(new w.Event("input", {bubbles:true})); inp.dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); } } await wait(20);
    ok("K34 …typing a name and Enter adds that person and keeps the owner already there", X(`taskById("fa").t.owners.join()`) === X("[A, B].join()"), X(`taskById("fa").t.owners.join()`));
    ev(`undo(); render();`); await wait(10);
    ok("K35 …and Undo takes it back", X(`taskById("fa").t.owners.join()`) === X("A"), X(`taskById("fa").t.owners.join()`));
    ev(`select("bar", "m2"); render(); document.activeElement && document.activeElement.blur();`); await wait(10); key("o"); await wait(20);
    ok("K36 O on an initiative whose owners come from its tasks says so and focuses nothing", !/owner/.test(d.activeElement?.id || "") && /from what's inside/.test($("#status")?.textContent || ""), $("#status")?.textContent);
    ev(`window.HD1 = file.handle; file.handle = {name:"plan.json"}; file.holdLock = null; select("task", "fa"); render(); document.activeElement && document.activeElement.blur();`); await wait(10); key("o"); await wait(20);
    ok("K37 O while you're not editing says to start editing, and Find doesn't offer it", d.activeElement?.id !== "f-towner" && /Start editing/.test($("#status")?.textContent || "") && !acts("owns").includes("Change who owns the selection"), $("#status")?.textContent);
    ev(`closeFind(); file.handle = HD1; select("task", "fa"); UI.ws = "today"; render(); document.activeElement && document.activeElement.blur(); setStatus("");`); await wait(10); key("o"); await wait(20);
    ok("K38 O on Today, where the row you're on isn't the selection, does nothing", d.activeElement?.id !== "f-towner" && !$("#status")?.textContent);
    ev(`UI.ws = "timeline"; render(); select("task", "fa"); render();`); await wait(10);
    ok("K39 Find offers Change who owns the selection, with its key, and the keyboard help lists O", acts("owner").includes("Change who owns the selection") && (T("SHORTCUTS.flatMap(([g, rows])=>rows.filter(r=>r[0].includes('O')).map(r=>r[1]))") || []).some(x=>/owns/.test(x)), acts("owner").join("|"));
    ev(`closeFind(); sel = null; render();`);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
