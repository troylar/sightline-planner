// More keys (1.169.0). Shift + a letter is read from the Shift key and the physical key, so Caps Lock is still the plain
// letter; a key that's taken answers even when its action doesn't apply, never falling through to what Shift + that
// letter used to repeat. Moves are one undoable edit, refused on Jira-dated work with dragging's message, and do nothing
// in Present, while typing or on a held key. Every key is in Find and the help; single-key shortcuts can be switched off.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null; UI.filter = normFilter({}); UI.ws = "timeline"; UI.rows = "lanes"; UI.zoom = "weeks"; render();`); await wait(20);
    const key = async (k, o = {}) => { const code = o.code || (/^[a-z]$/i.test(k) ? "Key" + k.toUpperCase() : /^[0-9]$/.test(k) ? "Digit" + k : "");
      (o.on || d.body).dispatchEvent(new w.KeyboardEvent("keydown", {key:k, code, shiftKey:!!o.shift, repeat:!!o.repeat, isComposing:!!o.composing, bubbles:true, cancelable:true})); await wait(10); };
    const seeds = () => X("JSON.stringify(linkSeeds().map(x=>x.t + ':' + x.id))"), status = () => d.querySelector("#status").textContent;

    X(`select("bar", "c3")`); await wait(5);
    await key("c");
    ok("K1 C shows only what's linked to the selection", seeds() === '["bar:c3"]', seeds());
    await key("c");
    ok("K1b …and C again shows it all", seeds() === "[]", seeds());
    X(`select("bar", "c3")`); await key("C");
    ok("K2 with Caps Lock on, C (no Shift) is still plain c", seeds() === '["bar:c3"]', seeds());
    X(`select("bar", "m1")`); await key("C", {shift:true});
    ok("K3 Shift+C adds the selection to linked work", seeds() === '["bar:c3","bar:m1"]', seeds());
    await key("Z", {shift:true});
    ok("K3b Shift+Z switches linked work to Highlight", X("UI.filter.linkMode") === "highlight");
    await key("Z", {shift:true});
    ok("K3c …and back to only what's linked", X("UI.filter.linkMode") === "only");
    await key("X", {shift:true});
    ok("K3d Shift+X takes the selection off linked work, and marks nothing done", seeds() === '["bar:c3"]' && X(`barById("m1").status`) !== "done", seeds());
    X(`select("bar", "m2")`); await key("X", {shift:true});
    ok("K3e Shift+X on an item that isn't picked does nothing, rather than marking it done", X(`barById("m2").status`) !== "done" && seeds() === '["bar:c3"]');
    X("linkedOff()"); await wait(20);

    X(`setHiddenKinds(["gate"]); UI.filter.people = [S.people[0].id]; render();`); await wait(10); X(`select("bar", "c3")`); await key("c"); await wait(100);
    const before = X("JSON.stringify(normFilter(UI.filter))"), kinds = X("JSON.stringify(hiddenKinds())");
    await key("0");
    ok("K4 0 shows all work", !X("fActive()") && seeds() === "[]", X("JSON.stringify(UI.filter)"));
    w.history.back(); await wait(120);
    ok("K4b …Back puts back the exact filters, linked picks and their mode included, and hidden kinds were never touched", X("JSON.stringify(normFilter(UI.filter))") === before && X("JSON.stringify(hiddenKinds())") === kinds, X("JSON.stringify(normFilter(UI.filter))") + " vs " + before);
    X(`setHiddenKinds([]); UI.filter = normFilter({}); linkedOff(); render();`); await wait(20);
    await key("0");
    ok("K4c with nothing filtered, 0 says so", /Nothing is filtered/.test(status()));

    const mv = X(`(()=>{ for (const b of S.bars){ select("bar", b.id); if (selMovable() && nextSprintDay(selMovable()) != null) return b.id; } return null; })()`);
    X(`select("bar", "${mv}")`); const s0 = X(`barById("${mv}").start`), h0 = X("past.length");
    await key("N", {shift:true});
    const s1 = X(`barById("${mv}").start`);
    ok("K5 Shift+N moves the selection to the next sprint, as one change, and says where", s1 > s0 && X("past.length") === h0 + 1 && new RegExp("now starts \\w{3} \\d+").test(status()), `${mv}: ${s0} -> ${s1}; ${status()}`);
    X("undo()"); await wait(5);
    ok("K5b …one Undo puts it back", X(`barById("${mv}").start`) === s0);
    X(`select("bar", "${mv}")`); await wait(5);
    await key("}", {shift:true});
    ok("K6 } moves it a week later, as one change", X(`barById("${mv}").start`) === s0 + 1 && X("past.length") === h0 + 1, String(X(`barById("${mv}").start`)));
    await key("{", {shift:true});
    ok("K6b { moves it a week earlier", X(`barById("${mv}").start`) === s0 && X("past.length") === h0 + 2);
    await key("}", {shift:true, repeat:true});
    ok("K6c a held key doesn't keep moving it", X(`barById("${mv}").start`) === s0);
    X(`window._lock = jiraLockOf; jiraLockOf = o => o && o.id === "${mv}" ? {dates:true, key:"ABC-1", sprint:"S3", s:startDay(), e:startDay() + 9} : window._lock(o); render();`);
    X(`select("bar", "${mv}")`); await key("}", {shift:true});
    ok("K7 work Jira dates refuses, with the message dragging gives, and doesn't move", X(`barById("${mv}").start`) === s0 && status() === X(`jiraDatesMsg(jiraLockOf(barById("${mv}")))`), status());
    await key("N", {shift:true});
    ok("K7b …Shift+N too", X(`barById("${mv}").start`) === s0);
    X(`jiraLockOf = window._lock; render();`);
    X("present = true; render()"); X(`select("bar", "${mv}")`); await key("}", {shift:true}); await key("N", {shift:true});
    ok("K8 in Present, the move keys do nothing", X(`barById("${mv}").start`) === s0);
    X("present = false; render()");

    X(`select("bar", "c3")`); const inp = d.createElement("input"); d.body.append(inp); inp.focus();
    for (const [k, o] of [["c", {}], ["0", {}], ["}", {shift:true}], ["N", {shift:true}], ["T", {shift:true}], [";", {}], ["<", {}]]) await key(k, {...o, on:inp});
    ok("K9 typing in a box, none of the new keys does anything", seeds() === "[]" && X(`barById("c3").start`) === JSON.parse(FIX).bars.find(b=>b.id === "c3").start && X("UI.timeOpen") === false);
    inp.remove(); const ce = d.createElement("div"); ce.setAttribute("contenteditable", "true"); ce.tabIndex = 0; d.body.append(ce); ce.focus(); await key("c", {on:ce});
    ok("K9b …nor in editable text", seeds() === "[]"); ce.remove();
    await key("c", {composing:true});
    ok("K9c …nor while composing a character", seeds() === "[]");
    d.body.focus();

    await key("T", {shift:true});
    ok("K10 Shift+T opens the time controls and stays on the Timeline", X("UI.timeOpen") === true && X("UI.ws") === "timeline");
    await key(";");
    ok("K10b ; closes them", X("UI.timeOpen") === false);
    await key("T");
    ok("K10c Caps Lock T (no Shift) still goes to Today", X("UI.ws") === "today");
    X(`UI.ws = "timeline"; render();`); await wait(10);

    await key("D", {shift:true});
    ok("K11 Shift+D with nothing folded does nothing, and doesn't switch to Days", X("UI.zoom") === "weeks" && /Nothing needs Details/.test(status()));
    X(`setHiddenKinds(["gate"]); S.bars.find(b=>b.id === "c6").parked = true; render();`); await wait(10);
    await key("D", {shift:true});
    ok("K11b with two reasons folded, Shift+D opens Details and keeps focus on it", d.querySelector("#hsMore")?.getAttribute("aria-expanded") === "true" && d.activeElement?.id === "hsMore");
    await key("D", {shift:true}); X(`setHiddenKinds([]); delete S.bars.find(b=>b.id === "c6").parked; render();`); await wait(10);

    X("sel = null; render()"); await key("L", {shift:true});
    ok("K12 Shift+L with no milestone selected stays put, rather than going to the List", X("UI.ws") === "timeline" && /Select a milestone/.test(status()));
    X(`commit(()=>{ S.milestones.find(m=>m.id === "ms8").after = ["c4"]; }); select("ms", "ms8");`); await wait(10);
    await key("L", {shift:true});
    ok("K12b on a milestone, Shift+L goes to What leads here", !!d.activeElement?.closest?.("#f-mrunway"), d.activeElement?.className);
    d.body.focus(); await key("<");
    ok("K12c …and so does <", !!d.activeElement?.closest?.("#f-mrunway"));
    X("undo(); sel = null; render()");

    await key("O", {shift:true});
    ok("K13 Shift+O shows rows by person", X("UI.rows") === "people");
    await key("W", {shift:true});
    ok("K13b Shift+W rows by workstream, and the zoom stays", X("UI.rows") === "lanes" && X("UI.zoom") === "weeks");
    const ed = X("file.holdLock"); await key("E", {shift:true});
    ok("K13c Shift+E without Jira epics does nothing, and doesn't start editing", X("UI.rows") === "lanes" && X("file.holdLock") === ed);

    await key("U", {shift:true});
    ok("K14 Shift+U opens What's new", d.querySelector("#dlgReleases").open === true);
    d.querySelector("#dlgReleases").close(); d.activeElement?.blur(); await wait(5);
    await key("A", {shift:true});
    ok("K14b Shift+A opens the assistant, not the Add menu", X("sel && sel.type") === "amend" && d.querySelector("#addMenu").hidden);
    X("sel = null; render()");
    X(`select("bar", "c3")`); await key("J", {shift:true}); await wait(10);
    ok("K15 Shift+J on an initiative opens the Jira epic link", /epic/i.test((d.activeElement && (d.activeElement.placeholder || d.activeElement.id || d.activeElement.getAttribute("aria-label"))) || "") || /epic/i.test(status()), (d.activeElement && d.activeElement.id) + " | " + status());

    const keys = {"rows-lanes":"Shift+W","rows-people":"Shift+O","rows-epics":"Shift+E","assistant":"Shift+A","whats-new":"Shift+U","show-all":"0","link-epic":"Shift+J","linked":"C","linked-add":"Shift+C","linked-highlight":"Shift+Z","linked-only":"Shift+Z","linked-remove":"Shift+X","week-later":"}","week-earlier":"{","next-sprint":"Shift+N","time-controls":"Shift+T","hidden-details":"Shift+D","milestone-runway":"Shift+L"};
    const miss = Object.entries(keys).filter(([id, k])=>X(`(COMMANDS.find(c=>c.id === "${id}") || {}).keys?.[0]`) !== k);
    ok("K16 Find shows each new key beside its action", !miss.length, miss.map(x=>x[0]).join(", "));
    X(`openHelp("keys")`); await wait(10);
    const help = [...d.querySelectorAll("#helpBody kbd")].map(k=>k.textContent), want = Object.values(keys).concat([";", "<"]).map(k=>X(`keyLabel(${JSON.stringify(k)})`));
    ok("K16b the ? help lists every new key, in this keyboard's labels", want.every(k=>help.includes(k)), want.filter(k=>!help.includes(k)).join(" "));
    const box = d.querySelector("#charKeys");
    ok("K17 the help has a switch for single-key shortcuts, on to start", !!box && box.checked);
    box.checked = false; box.dispatchEvent(new w.Event("change", {bubbles:true})); d.querySelector("#dlgHelp").close(); await wait(5);
    X(`select("bar", "c3")`); await key("c"); await key("?"); await key("/");
    ok("K17b switched off, a letter, ? and / do nothing", seeds() === "[]" && !d.querySelector("#dlgHelp").open && X(`!document.querySelector("#findPop") || document.querySelector("#findPop").hidden`) !== false);
    d.body.dispatchEvent(new w.KeyboardEvent("keydown", {key:"k", code:"KeyK", ctrlKey:true, bubbles:true, cancelable:true})); await wait(10);
    ok("K17c …and Ctrl+K still opens Find", X(`typeof findOpen === "function" ? findOpen() : !!document.querySelector("#findPop:not([hidden]), #find:not([hidden]), dialog#dlgFind[open]")`) === true);
    ok("K17d it's remembered in this browser", JSON.parse(w.localStorage.getItem("timeline-planner-ui") || "{}").charKeys === false);
    X(`UI.charKeys = true; saveUI();`);

    X(`closeFind && closeFind()`); d.activeElement?.blur(); X("UI.zoomN = 2; render()");
    d.body.dispatchEvent(new w.KeyboardEvent("keydown", {key:")", code:"Digit0", shiftKey:true, bubbles:true, cancelable:true})); await wait(10);
    ok("K18 Shift+0 is still Fit", X("UI.zoomN") === 0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
