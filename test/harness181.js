// Stars: mark any item to get back to it fast. , stars or unstars the selection; the card's star button does the same;
// Starred in the menu and an empty Find (/) list them; going to one remembers everything about where you were, so Back to
// where I was undoes all of it. Yours alone: this browser, per plan, never in the plan file. A Jira-backed item keeps
// its star by key wherever it shows; a workstream follows its former ids; a star that can't be found says why and stays.
// The sample plan (every name invented), with a synthetic Jira issue ABC-1 on a task.
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
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } }, J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false);
       const c4 = S.bars.find(b=>b.id === "c4"); c4.tasks = [{id:"tk1", label:"Wire the tools", start:"2026-11-02", days:3, jira:"ABC-1"}, {id:"tk2", label:"Docs pass", start:"2026-11-05", days:2}];
       S = normalize(S, false); resetHistory(); file.handle = null;
       JIRA = {kind:"sightline-jira-status", generatedAt:"2026-10-27T10:00:00Z", sprints:[], releases:[], rollups:{}, issues:{"ABC-1":{summary:"Wire the tools", status:"In Progress", category:"inprogress", type:"Story"}}}; dropJiraMemos();
       UI.filter = normFilter({}); UI.ws = "timeline"; UI.rows = "lanes"; UI.zoom = "weeks"; sel = null; render();`); await wait(20);
    const key = async (k, o = {}) => { (o.on || d.body).dispatchEvent(new w.KeyboardEvent("keydown", {key:k, code:o.code || "", shiftKey:!!o.shift, repeat:!!o.repeat, bubbles:true, cancelable:true})); await wait(10); };
    const status = () => d.querySelector("#status").textContent, store = () => J(`JSON.parse(localStorage.getItem("sightline-stars") || "{}")`), plan = () => X("JSON.stringify(planOfRecord(S))");
    const plan0 = plan(), hist0 = X("JSON.stringify([undoStack.length, redoStack.length])"), keys = () => J(`starsAll().map(x=>x.k)`);

    await key(","); ok("T1 , with nothing selected says how to star, and stars nothing", /Select something to star it\. Press \/ to see your stars/.test(status()) && !keys().length, status());
    X(`select("bar", "c3"); render();`); await wait(10);
    const sb = d.querySelector("#sideStar");
    ok("T2 the card has a star button, not pressed, with a label", !!sb && sb.getAttribute("aria-pressed") === "false" && sb.getAttribute("aria-label") === "Star it" && /\(,\)/.test(sb.title));
    await key(",", {code:"Comma"});
    ok("T3 , stars the selection: it's saved for this plan in this browser, the button is pressed, and the status line says how to get back", keys().join() === "bar:c3" && Object.keys(store()).join() === X("S.meta.planId")
      && d.querySelector("#sideStar").getAttribute("aria-pressed") === "true" && /^Starred .*Press \/ to get back to it\.$/.test(status()), status());
    ok("T4 Starred in the menu lists it", !!d.querySelector('#snstars:not([hidden]) [data-star="bar:c3"]') && d.querySelector("#snStarH")?.textContent === "Starred");
    ok("T4b …with only real text in it (no stray 'null' after the last row)", !/null/.test(d.querySelector("#snstars").textContent), d.querySelector("#snstars").textContent);
    ok("T5 the plan, its undo history and the plan file don't change", plan() === plan0 && X("JSON.stringify([undoStack.length, redoStack.length])") === hist0);
    await key(",", {repeat:true}); ok("T6 a held-down , doesn't flicker it off", keys().join() === "bar:c3");
    d.querySelector("#sideStar").click(); await wait(10);
    ok("T7 the card's button unstars it, and Starred goes away when it's empty", !keys().length && d.querySelector("#snstars").hidden && d.querySelector("#sideStar").getAttribute("aria-pressed") === "false");

    X(`select("task", "tk1"); render(); toggleStar("task", "tk1"); select("ms", "ms3"); render(); toggleStar("ms", "ms3"); select("lane", S.lanes[1].id); render(); toggleStar("lane", S.lanes[1].id); sel = null; render();`); await wait(10);
    ok("T8 a task linked to Jira is starred by its key; a milestone and a workstream by id", JSON.stringify(keys()) === JSON.stringify(["jira:ABC-1", "ms:ms3", "lane:" + X("S.lanes[1].id")]), JSON.stringify(keys()));
    X(`openFind();`); await wait(20);
    const hits = [...d.querySelectorAll("#findList .fstar")].map(b=>b.dataset.star);
    ok("T9 an empty Find (/) lists your stars first, in order, the first one ready for Enter", d.querySelector("#findStarsH")?.textContent === "Starred" && hits.join() === keys().join() && d.querySelector("#findList .fstar.on")?.dataset.star === "jira:ABC-1", hits.join());
    d.querySelector("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true})); d.querySelector("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true})); await wait(80);
    ok("T10 arrow down and Enter go to the milestone", J("sel") && X("sel.type") === "ms" && X("sel.id") === "ms3" && d.querySelector("#findPop").hidden, JSON.stringify(J("sel")));

    // the story becomes another task: the star follows the key
    X(`const c4 = S.bars.find(b=>b.id === "c4"); c4.tasks = c4.tasks.filter(t=>t.id !== "tk1"); S.bars.find(b=>b.id === "c5").tasks = [{id:"tk9", label:"Wire the tools", start:"2026-11-16", days:2, jira:"ABC-1"}]; S = normalize(S, false); dropJiraMemos(); render();`);
    ok("T11 when the Jira item moves to another task, its star goes with it", JSON.stringify(J(`starWhere(starsAll()[0])`)) === JSON.stringify({t:"task", id:"tk9"}) && X("starOf('task', 'tk9')?.k") === "jira:ABC-1");
    X(`S.bars.find(b=>b.id === "c5").tasks = []; S = normalize(S, false); dropJiraMemos(); render();`);
    ok("T12 in the last sync but on no task or initiative: says so, doesn't guess, and keeps the star", J(`starWhere(starsAll()[0])`).kind === "unplaced" && keys().includes("jira:ABC-1"));
    X(`JIRA.issues = {}; dropJiraMemos(); render();`);
    ok("T13 not in the last sync: says so and keeps it", J(`starWhere(starsAll()[0])`).kind === "nosync" && /not in the last sync\. The star stays/.test(X(`starWhere(starsAll()[0]).why`)));
    X(`JIRA = null; dropJiraMemos(); render();`);
    ok("T14 with no Jira loaded it says that, not that the item is gone", J(`starWhere(starsAll()[0])`).kind === "nojira");
    X(`starGo(starsAll()[0]);`); ok("T15 going to it then explains instead of moving anything", /Jira isn't loaded/.test(status()) && X("sel.id") === "ms3");
    const gone = d.querySelector('#snstars [data-star="jira:ABC-1"]');
    ok("T16 in Starred it's grayed, with the reason on hover, and it can still be unstarred", !!gone && gone.classList.contains("gone") && /Jira isn't loaded/.test(gone.title) && !!gone.parentElement.querySelector(".snpinx"));
    const lid = X("S.lanes[1].id");
    X(`const l = S.lanes[1], old = l.id; l.was = [old]; l.id = "ws-renamed"; S.bars.forEach(b=>{ if (b.lane === old) b.lane = "ws-renamed"; }); S.milestones.forEach(m=>{ if (m.lane === old) m.lane = "ws-renamed"; }); render();`);
    ok("T17 a workstream that got a new id keeps its star through its former id", JSON.stringify(J(`starWhere(starsAll().find(x=>x.k === "lane:${lid}"))`)) === JSON.stringify({t:"lane", id:"ws-renamed"}) && !!X(`starOf("lane", "ws-renamed")`));
    X(`S.milestones = S.milestones.filter(m=>m.id !== "ms3"); sel = null; render();`);
    ok("T18 a deleted item says it isn't in the plan any more and keeps its star", J(`starWhere(starsAll().find(x=>x.k === "ms:ms3"))`).kind === "gone" && keys().includes("ms:ms3"));
    X(`unstar(starsAll().find(x=>x.k === "ms:ms3")); unstar(starsAll().find(x=>x.k === "jira:ABC-1"));`);
    ok("T19 unstarring from Starred works for those too", JSON.stringify(keys()) === JSON.stringify(["lane:" + lid]), JSON.stringify(keys()));

    // Back to where I was, after a star brings out something hidden
    X(`S = normalize(JSON.parse(FIX), false); dropJiraMemos(); localStorage.removeItem("sightline-stars"); starMemo = null; UI.ws = "list"; UI.zoom = "weeks"; sel = null;
       setHiddenQuiet(["milestone"]); UI.filter = normFilter({lanes:[S.lanes[0].id]}); UI.collapsed = {c1:true}; render();
       toggleStar("ms", S.milestones.find(m=>m.lane && m.lane !== S.lanes[0].id && m.at != null).id); sel = null; UI.ws = "list"; render();`); await wait(20);
    const before = J(`[UI.ws, hiddenKinds(), UI.filter.lanes, UI.collapsed, sel]`), msId = X(`starsAll()[0].k.slice(3)`);
    X(`starGo(starsAll()[0]);`); await wait(40);
    const moved = J(`[UI.ws, hiddenKinds(), UI.filter.lanes, sel && sel.id]`);
    ok("T20 going to a starred milestone that's hidden by kind and by a workstream filter shows it on the Timeline and selects it", moved[0] === "timeline" && !moved[1].includes("milestone") && !moved[2].length && moved[3] === msId, JSON.stringify(moved));
    ok("T21 Back to where I was is offered in the menu and the toast", !!d.querySelector("#snstars #starBack") && /Back to where I was/.test(d.querySelector("#toast").textContent));
    d.querySelector("#snstars #starBack").click(); await wait(60);
    ok("T22 …and puts the page, hidden kinds, filter, folds and selection back exactly", JSON.stringify(J(`[UI.ws, hiddenKinds(), UI.filter.lanes, UI.collapsed, sel]`)) === JSON.stringify(before) && !d.querySelector("#starBack"), JSON.stringify(J(`[UI.ws, hiddenKinds(), UI.filter.lanes, UI.collapsed, sel]`)));
    w.history.back(); await wait(80);
    ok("T23 browser Back from there goes to the star again", X("UI.ws") === "timeline" && X("sel && sel.id") === msId, X("UI.ws"));
    ok("T24 the plan still hasn't changed", X("JSON.stringify(planOfRecord(S))") === X("JSON.stringify(planOfRecord(normalize(JSON.parse(FIX), false)))"));

    // isolation, storage trouble, the ceiling
    X(`S.meta.planId = "other-plan"; starMemo = null; render();`);
    ok("T25 another plan has its own stars (none)", !keys().length && d.querySelector("#snstars").hidden);
    X(`localStorage.setItem("sightline-stars", "{not json"); starMemo = null;`);
    ok("T26 unreadable storage reads as no stars, without an error, and starring still works", !keys().length && X(`toggleStar("bar", "c1")`) === true && keys().join() === "bar:c1");
    X(`S.bars.slice(0, 30).forEach(b=>{ if (!starOf("bar", b.id)) toggleStar("bar", b.id); });`);
    ok("T27 24 stars at most: the 25th is refused with what to do, and none is dropped", keys().length === 24 && /up to 24 items\. Unstar one first/.test(status()), keys().length + " " + status());
    X(`const P = Storage.prototype, real = P.setItem; P.setItem = function(){ throw new Error("full"); }; window.R0 = toggleStar("bar", "c1"); P.setItem = real;`);
    ok("T28 when the browser can't save, it says so and nothing changes", X("R0") === false && /Couldn't save your stars/.test(status()) && keys().includes("bar:c1"));

    // where , and / don't act
    X(`unstar(starOf("bar", "c2")); select("bar", "c2"); render();`); await wait(10); const n0 = keys().length;
    const inp = d.createElement("input"); d.body.append(inp); inp.focus(); await key(",", {on:inp});
    ok("T29 typing a comma in a field doesn't star anything", keys().length === n0 && !X(`starOf("bar", "c2")`));
    inp.remove(); X(`UI.charKeys = false;`); await key(",");
    ok("T30 with single-key shortcuts off, , does nothing", !X(`starOf("bar", "c2")`)); X(`UI.charKeys = true;`);
    const dlg = d.createElement("dialog"); d.body.append(dlg); dlg.setAttribute("open", ""); await key(","); await key("/", {code:"Slash"});
    ok("T31 with a dialog open, neither , nor / acts (/ used to open Find over it)", !X(`starOf("bar", "c2")`) && d.querySelector("#findPop").hidden); dlg.remove();
    ok("T32 Find offers Star and Unstar by name, with the , key", J(`COMMANDS.filter(c=>["star","unstar"].includes(c.id) && c.when()).map(c=>c.id)`).join() === "star" && J(`COMMANDS.find(c=>c.id === "star").keys`).join() === ",");
    ok("T33 the keyboard help lists ,", [...d.querySelectorAll("kbd")].some(k=>k.textContent === ",") || X(`JSON.stringify(HELP_KEYS || null)`).includes('[","]') || X("document.documentElement.outerHTML").includes("Star the selection or unstar it"));
    // Codex review: a relinked task, zoom outside the Timeline, unstarring from the keyboard
    X(`S = normalize(JSON.parse(FIX), false); const c4 = S.bars.find(b=>b.id === "c4"); c4.tasks = [{id:"tk1", label:"Wire the tools", start:"2026-11-02", days:3, jira:"ABC-1"}, {id:"tk2", label:"Docs pass", start:"2026-11-05", days:2}];
       S = normalize(S, false); JIRA = {kind:"sightline-jira-status", generatedAt:"2026-10-27T10:00:00Z", sprints:[], releases:[], rollups:{}, issues:{"ABC-1":{summary:"Wire the tools", status:"In Progress", category:"inprogress", type:"Story"}, "ABC-2":{summary:"Other", status:"To Do", category:"todo", type:"Story"}}};
       dropJiraMemos(); localStorage.removeItem("sightline-stars"); starMemo = null; starBack = null; setHiddenQuiet([]); UI.filter = normFilter({}); sel = null; render(); toggleStar("task", "tk1");
       S.bars.find(b=>b.id === "c4").tasks[0].jira = "ABC-2"; dropJiraMemos(); render();`);
    ok("T34 a starred task relinked to another Jira issue isn't that star any more: the new issue isn't starred, and the old one's star doesn't open the task", !X(`starOf("task", "tk1")`) && J(`starWhere(starsAll()[0])`).t !== "task", JSON.stringify(J(`starWhere(starsAll()[0])`)));
    X(`toggleStar("task", "tk2"); UI.ws = "list"; UI.zoom = "weeks"; sel = null; render(); starGo(starsAll().find(x=>x.k === "task:tk2"));`); await wait(30);
    const zIn = X("UI.zoom"); X(`backWhereIWas();`); await wait(30);
    ok("T35 Back to where I was puts the zoom back from the List too (going to a task switches to days)", zIn === "days" && X("UI.ws") === "list" && X("UI.zoom") === "weeks", zIn + " -> " + X("UI.ws") + " " + X("UI.zoom"));
    const ux = d.querySelector('#snstars [data-unstar="task:tk2"]');
    ok("T36 each Unstar in Starred can be reached with Tab, so a star that can't be opened can still be cleared from the keyboard", !!ux && ux.getAttribute("tabindex") !== "-1" && ux.tabIndex >= 0);
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
