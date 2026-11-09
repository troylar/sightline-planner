// Your own work, beside the team's (1.187.0): each person's own list, saved in the plan as `own`, first on Today in Mine.
// Cleaning on load, the older-copy flag, every own.* action (toTask with undo), merging item by item, the Today order and
// pins, checking off into Done today with undo, not doing, Jira issues matched by user key and never by name, the prompt
// to link, the team's count, read-only views, the Q shortcut. The sample plan (every name invented).
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), {spawnSync} = require("child_process");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const SYNC = path.join(__dirname, "..", "tools", "sightline-jira-sync.py");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
      w.HTMLDialogElement.prototype.close = function(){ this.open = false; this.dispatchEvent(new w.Event("close")); }; w.CSS = w.CSS || {}; w.CSS.escape = s=>s;
      w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window, d = w.document; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const J = s => { const v = X(`JSON.stringify(${s})`); try { return JSON.parse(v); } catch(e){ return v; } };
    const day = n => X(`dayToIso(todayDay() + (${n}))`);
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); startAuto = ()=>{}; localStorage.clear(); S = normalize(JSON.parse(FIX), false); resetHistory(); file.handle = null;`);
    const P = J(`team().map(p=>({id:p.id, name:p.name}))`), me = P[0].id, other = P[1].id, bar = J(`S.bars.find(b=>!b.parked && !(b.tasks || []).length).id`), bar2 = J(`S.bars.filter(b=>!b.parked)[3].id`);

    // ---- the saved shape: what normalize keeps
    w.RAW = JSON.stringify({...JSON.parse(FIX), deliverables:[{id:"dv-a", name:"Partner API", stage:"idea"}], own:[
      {id:"o-1", text:"  Draft the   rollout note  ", owner:"__ME__", pin:day(-2), rel:[{type:"bar", id:"__BAR__"}, {type:"bar", id:"gone"}, {type:"deliverable", id:"dv-a"}, {jira:"abc-12"}, {jira:"nope"}, {type:"risk", id:"x"}]},
      {id:"o-1", text:"A repeat of o-1"}, {id:"bad id!", text:"Bad id"}, {id:"__proto__", text:"Sneaky"}, {id:"o-2", text:"x".repeat(600), owner:"nobody", pin:"tomorrow"},
      {id:"o-3", text:"   "}, {id:"o-4", text:"Skip the old importer", owner:"__ME__", closed:{as:"notdoing", by:"__ME__", at:"2026-11-01T10:00:00Z", why:"y".repeat(300)}},
      {id:"o-5", text:"Ship it", owner:"__ME__", closed:{as:"done", by:"__ME__", at:"2026-11-01T10:00:00Z", why:"not kept"}}, {id:"o-6", text:"Odd close", closed:{as:"maybe", at:"x"}}]}).replace(/__ME__/g, me).replace(/__BAR__/g, bar);
    const N = J(`normalize(JSON.parse(RAW), false).own`), byId = id => (N || []).find(x=>x.id === id) || {};
    ok("N1 normalize drops bad, repeated and empty items, and keeps the rest", JSON.stringify((N || []).map(x=>x.id)) === '["o-1","o-2","o-4","o-5","o-6"]', JSON.stringify((N || []).map(x=>x.id)));
    ok("N2 …one line of text, capped at 500 characters", byId("o-1").text === "Draft the rollout note" && byId("o-2").text.length === 500);
    ok("N3 …an owner who isn't a person and a pin that isn't a date are dropped", byId("o-1").owner === me && !("owner" in byId("o-2")) && byId("o-1").pin === day(-2) && !("pin" in byId("o-2")));
    ok("N4 …related items that exist and Jira keys that look like keys are kept, nothing else", JSON.stringify(byId("o-1").rel) === JSON.stringify([{type:"bar", id:bar}, {type:"deliverable", id:"dv-a"}, {jira:"ABC-12"}]), JSON.stringify(byId("o-1").rel));
    ok("N5 …closed keeps how and when, a reason only for not doing, capped at 200", byId("o-4").closed.why.length === 200 && byId("o-4").closed.as === "notdoing" && byId("o-5").closed.as === "done" && !("why" in byId("o-5").closed) && !("closed" in byId("o-6")));
    ok("N6 strict loading refuses two own items with one id", /Duplicate id "o-1" in own/.test(X(`(()=>{ try { normalize(JSON.parse(RAW), true); return "ok"; } catch(e){ return e.message; } })()`)));

    // ---- the format: older copies open it read-only
    ok("F1 featuresIn names ownItems1 only when there are own items, and this copy knows it", J(`featuresIn(normalize(JSON.parse(RAW), false))`).includes("ownItems1") && !J(`featuresIn(normalize(JSON.parse(FIX), false))`).includes("ownItems1") && J("KNOWN_FEATURES").includes("ownItems1"));
    ok("F2 a copy that doesn't know ownItems1 opens the plan read-only", X(`(()=>{ const p = JSON.parse(serialize(normalize(JSON.parse(RAW), false), "p.json")); const k = KNOWN_FEATURES.splice(KNOWN_FEATURES.indexOf("ownItems1"), 1); try { const t = tooNew(p); return !!t && t.unknown.includes("ownItems1"); } finally { KNOWN_FEATURES.push(...k); } })()`) === true);
    X(`(()=>{ const prev = normalize(JSON.parse(RAW), false); prev.meta.savedWith = "1.187.0"; const next = normalize(JSON.parse(FIX), false); delete next.meta.savedWith; noteOlderSave(prev, next); })()`);
    ok("F3 when an older copy drops them, the banner names people's own lists", /dropped[^.]*people's own lists/.test(d.body.textContent), (d.body.textContent.match(/It dropped[^.]*\./) || [""])[0]);
    X(`clearBanner("older")`);
    ok("F4 own is stamped like every plan item, and merged and diffed by item", J(`STAMPED.includes("own") && SYNC_COLS.includes("own")`) === true);

    // ---- actions
    X(`setMe("${me}"); S = normalize(JSON.parse(RAW), false); resetHistory(); goWs("today"); UI.todayScope = "me"; render();`); await wait(20);
    const run = (id, a) => J(`(()=>{ let r; const ok = commit(s=>{ r = runAction(s, ${JSON.stringify(id)}, ${JSON.stringify(a)}); if (!r.ok || r.nochange) return NOCHANGE; }); return {ok:r.ok, nochange:!!r.nochange, reason:r.reason || "", committed:ok}; })()`);
    const own = id => J(`(S.own || []).find(x=>x.id === ${JSON.stringify(id)}) || null`);
    let r = run("own.add", {id:"o-new", text:"  Call the vendor  "});
    ok("A1 own.add puts it on my list, newest first, stamped with who added it", r.ok && own("o-new").owner === me && own("o-new").text === "Call the vendor" && J("S.own[0].id") === "o-new" && own("o-new").added && own("o-new").added.by === me, JSON.stringify(r));
    ok("A2 …again with the same id and text changes nothing", run("own.add", {id:"o-new", text:"Call the vendor"}).nochange === true);
    r = run("own.add", {id:"o-b", text:"Review the PR", owner:other, pin:"tomorrow", rel:[bar, "dv-a", "ABC-7"]});
    ok("A3 …on someone else's list, pinned by a day in words, part of an initiative, an outcome and a Jira issue", r.ok && own("o-b").owner === other && own("o-b").pin === day(1) && JSON.stringify(own("o-b").rel) === JSON.stringify([{type:"bar", id:bar}, {type:"deliverable", id:"dv-a"}, {jira:"ABC-7"}]), JSON.stringify(own("o-b")));
    ok("A4 own.add refuses empty or too-long text, an unknown owner, a related id that isn't anything, and an id in use", !run("own.add", {text:"  "}).ok && !run("own.add", {text:"x".repeat(501)}).ok && /person isn't in the plan/.test(run("own.add", {text:"t", owner:"zz"}).reason)
      && /isn't an initiative, an outcome or a Jira key/.test(run("own.add", {text:"t", rel:["dv-1"]}).reason) && /already used/.test(run("own.add", {id:bar, text:"t"}).reason));
    ok("A5 own.set changes text, owner, pin and what it's part of", run("own.set", {id:"o-b", field:"text", value:"Review the API PR"}).ok && run("own.set", {id:"o-b", field:"owner", value:me}).ok && run("own.set", {id:"o-b", field:"pin", value:""}).ok && run("own.set", {id:"o-b", field:"rel", value:["ABC-7"]}).ok
      && JSON.stringify(own("o-b")).includes('"text":"Review the API PR"') && own("o-b").owner === me && !("pin" in own("o-b")) && JSON.stringify(own("o-b").rel) === '[{"jira":"ABC-7"}]', JSON.stringify(own("o-b")));
    ok("A6 …refuses a field it can't set, and a stale prev", /can't set|can't be set/.test(run("own.set", {id:"o-b", field:"closed", value:"x"}).reason) && J(`runAction(clone(S), "own.set", {id:"o-b", field:"text", value:"z", prev:"old words"}).code`) === "stale");
    r = run("own.close", {id:"o-new", as:"done"});
    ok("A7 own.close done records who and when", r.ok && own("o-new").closed.as === "done" && own("o-new").closed.by === me && X(`stampDay(S.own.find(x=>x.id === "o-new").closed.at) === todayDay()`) === true);
    ok("A8 …not doing keeps an optional reason; a reason on done is refused", run("own.close", {id:"o-b", as:"notdoing", why:"Someone else took it"}).ok && own("o-b").closed.why === "Someone else took it" && /reason goes with not doing/.test(run("own.close", {id:"o-new", as:"done", why:"x"}).reason));
    ok("A9 own.reopen opens it again", run("own.reopen", {id:"o-b"}).ok && !("closed" in own("o-b")));
    ok("A10 own.del removes it", run("own.del", {id:"o-b"}).ok && own("o-b") === null);
    run("own.reopen", {id:"o-new"});
    const addedBefore = own("o-new").added;
    r = run("own.toTask", {id:"o-new", initiativeId:bar2});
    const task = J(`(()=>{ const f = actTask(S, "o-new"); return f ? {bar:f.b.id, label:f.t.label, owners:f.t.owners, added:f.t.added, start:f.t.start} : null; })()`);
    ok("A11 own.toTask makes a plan task with the same id, creator and owner, and it leaves the list", r.ok && own("o-new") === null && task && task.bar === bar2 && task.label === "Call the vendor" && JSON.stringify(task.owners) === JSON.stringify([me]) && JSON.stringify(task.added) === JSON.stringify(addedBefore), JSON.stringify([r, task]));
    X(`undo(); render();`);
    ok("A12 …and undo puts it back on the list, not in the initiative", !!own("o-new") && J(`!!actTask(S, "o-new")`) === false);
    ok("A13 …a closed item has to be reopened first", run("own.close", {id:"o-new", as:"done"}).ok && /Reopen it first/.test(run("own.toTask", {id:"o-new", initiativeId:bar2}).reason));
    run("own.reopen", {id:"o-new"});

    // ---- the assistant sees the list and the actions
    const view = J(`assistantView()`), acts = (view.actions || []).filter(a=>/^own\./.test(a.id)).map(a=>a.id);
    ok("C1 the assistant view lists own items and every own action, with what an add makes and a delete removes", (view.planning.own || []).some(x=>x.id === "o-new" && x.owner === me) && JSON.stringify(acts.sort()) === JSON.stringify(["own.add","own.close","own.del","own.reopen","own.set","own.toTask"])
      && view.actions.find(a=>a.id === "own.add").creates === "ownId" && JSON.stringify(view.actions.find(a=>a.id === "own.del").removes) === '["id"]' && view.argTypes.refs.ownId && view.coverage.own.total === J("S.own.length"), JSON.stringify(acts));
    const py = spawnSync("python3", ["-c", `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); print(json.dumps({k: [v[0], v[1]] for k, v in m.ACTIONS.items() if k.startswith('own.')}))`, SYNC], {encoding:"utf8"});
    let pyA = null; try { pyA = JSON.parse(py.stdout); } catch(e){}
    const pageA = J(`Object.fromEntries(Object.values(planActions).filter(a=>/^own\\./.test(a.id)).map(a=>[a.id, [a.args, !!a.cur]]))`);
    ok("C2 the offline checker knows the same own actions", !!pyA && Object.keys(pageA).length === 6 && JSON.stringify(pyA) === JSON.stringify(pageA), (py.stderr || "").slice(0, 200));

    // ---- teammates' edits merge item by item
    X(`window.BASE = clone(planOfRecord(S)); BASE.own = [{id:"m-a", text:"Alpha", owner:"${me}"}, {id:"m-b", text:"Beta", owner:"${other}"}, {id:"m-c", text:"Gamma", owner:"${me}"}];
      window.MINE = clone(BASE); MINE.own[0].closed = {as:"done", by:"${me}", at:"2026-11-09T09:00:00.000Z"}; MINE.own.push({id:"m-d", text:"Mine new", owner:"${me}"});
      window.THEIRS = clone(BASE); THEIRS.own[1].closed = {as:"notdoing", by:"${other}", at:"2026-11-09T09:30:00.000Z", why:"Dropped"}; THEIRS.own[2].text = "Gamma, renamed";`);
    const M = J(`(()=>{ const m = mergePlans(BASE, MINE, THEIRS); return m ? {own:m.plan.own, kept:m.kept.length} : null; })()`), mo = id => ((M && M.own) || []).find(x=>x.id === id) || {};
    ok("M1 two people closing different items both keep their change", mo("m-a").closed && mo("m-a").closed.as === "done" && mo("m-b").closed && mo("m-b").closed.why === "Dropped", JSON.stringify(M));
    ok("M2 …a teammate's rename and my new item both stay, with nothing kept aside", mo("m-c").text === "Gamma, renamed" && mo("m-d").text === "Mine new" && M.kept === 0);

    // ---- Today, Mine: the list first
    X(`S.own = [
      {id:"t-old", text:"Older open item", owner:"${me}", added:{by:"${me}", at:"2026-11-01T09:00Z"}},
      {id:"t-new", text:"Newest open item", owner:"${me}", added:{by:"${me}", at:"2026-11-08T09:00Z"}},
      {id:"t-later", text:"Pinned for later", owner:"${me}", pin:"${day(5)}", added:{by:"${me}", at:"2026-11-02T09:00Z"}},
      {id:"t-today", text:"Pinned to today", owner:"${me}", pin:"${day(0)}", added:{by:"${me}", at:"2026-11-03T09:00Z"}},
      {id:"t-passed", text:"Pinned last week", owner:"${me}", pin:"${day(-6)}", rel:[{type:"bar", id:"${bar}"}, {jira:"ABC-12"}], added:{by:"${me}", at:"2026-10-20T09:00Z"}},
      {id:"t-theirs", text:"Someone else's", owner:"${other}", added:{by:"${other}", at:"2026-11-08T10:00Z"}},
      {id:"t-gone", text:"Closed last week", owner:"${me}", closed:{as:"done", by:"${me}", at:"2026-10-01T09:00:00Z"}}]; S = normalize(S, false); resetHistory(); render();`); await wait(20);
    const rows = () => [...d.querySelectorAll("#ownList > li[data-own]")].map(x=>x.dataset.own), top = () => [...d.querySelectorAll("#today > *")].map(x=>x.id || x.className);
    ok("T1 in Mine, the list comes first on Today: right under the heading, above the summary and What matters now", top().indexOf("ownGrid") === 1 && top().indexOf("todaySum") === 2 && !!d.getElementById("ownSec") && !!d.getElementById("ownAdd"), JSON.stringify(top().slice(0, 4)));
    ok("T2 pinned to a passed day or today first, then open items newest first; someone else's and old closed ones aren't here", JSON.stringify(rows()) === '["t-passed","t-today","t-new","t-later","t-old"]', JSON.stringify(rows()));
    const pinOf = id => d.querySelector(`[data-own="${id}"] [data-opin]`);
    ok("T3 a passed pin is marked with its day; today's says Today; a later one shows its day", pinOf("t-passed").dataset.opin === "passed" && pinOf("t-passed").textContent.includes("Since") && pinOf("t-passed").textContent.includes(X(`fmtDay(todayDay() - 6)`))
      && pinOf("t-today").textContent === "Today" && pinOf("t-later").dataset.opin === "later", pinOf("t-passed").textContent);
    ok("T4 related items show as chips that open them", d.querySelectorAll('[data-own="t-passed"] [data-orel]').length === 2 && d.querySelector(`[data-own="t-passed"] button[data-orel="${bar}"]`) !== null);
    d.querySelector(`[data-own="t-passed"] button[data-orel="${bar}"]`).click(); await wait(20);
    ok("T5 …and the initiative's chip opens it", X("UI.ws") === "timeline" && J("sel") && J("sel").id === bar, X("UI.ws"));
    X(`goWs("today"); render();`); await wait(10);
    ok("T6 the add line asks what you're working on", d.getElementById("ownAdd").placeholder === "What are you working on?");
    const input = d.getElementById("ownAdd"); input.value = "Write the demo script"; input.dispatchEvent(new w.Event("input", {bubbles:true}));
    d.getElementById("ownAddForm").dispatchEvent(new w.Event("submit", {bubbles:true, cancelable:true})); await wait(20);
    ok("T7 Enter adds it to the top of the open items and keeps the cursor in the add line", rows()[2] && J(`S.own.find(x=>x.id === "${rows()[2]}").text`) === "Write the demo script" && d.activeElement === d.getElementById("ownAdd") && d.getElementById("ownAdd").value === "", JSON.stringify(rows()));
    d.querySelector('[data-own="t-old"] .ownmore').click(); await wait(10);
    ok("T9 ⋯ opens a small menu: Pin to today, Not doing, Part of, Move into an initiative, Delete", JSON.stringify([...d.querySelectorAll('[data-own="t-old"] [data-omi]')].map(x=>x.dataset.omi)) === '["pin","notdoing","rel","move","del"]' && d.activeElement && d.activeElement.dataset.omi === "pin");
    d.querySelector('[data-own="t-old"] [data-omi="pin"]').click(); await wait(20);
    ok("T10 …Pin to today puts it with today's pins, at the top", rows().indexOf("t-old") < rows().indexOf("t-new") && J(`S.own.find(x=>x.id === "t-old").pin`) === day(0), JSON.stringify(rows()));
    d.querySelector('[data-own="t-passed"] .ownmore').click(); await wait(10);
    ok("T11 an item pinned to a passed day offers Unpin and Pin to today", JSON.stringify([...d.querySelectorAll('[data-own="t-passed"] [data-omi]')].map(x=>x.dataset.omi).slice(0, 2)) === '["unpin","pin"]');
    d.querySelector('[data-own="t-passed"] [data-omi="unpin"]').click(); await wait(20);
    ok("T12 …Unpin drops it back among the open items by when it was added", rows()[rows().length - 1] === "t-passed" && !J(`"pin" in S.own.find(x=>x.id === "t-passed")`), JSON.stringify(rows()));

    // ---- checking off
    const cb = d.querySelector('[data-own="t-new"] .owncheck'); cb.checked = true; cb.dispatchEvent(new w.Event("change", {bubbles:true})); await wait(20);
    const doneRows = () => [...d.querySelectorAll("#ownDone [data-own]")].map(x=>x.dataset.own);
    ok("K1 checking an item off moves it into Done today, with a check mark", !rows().includes("t-new") && JSON.stringify(doneRows()) === '["t-new"]' && !!d.querySelector('#ownDone [data-own="t-new"] .ownmark .ic'), JSON.stringify(doneRows()));
    ok("K2 …and the status line offers undo", /Checked off "Newest open item"\. Ctrl\+Z undoes it\./.test(d.getElementById("status").textContent) && /Undo/.test(d.getElementById("toast").textContent), d.getElementById("status").textContent);
    X(`undo(); render();`); await wait(20);
    ok("K3 …undo puts it back on the list", rows().includes("t-new") && !doneRows().length && !J(`"closed" in S.own.find(x=>x.id === "t-new")`));
    w.ANIM = []; w.Element.prototype.animate = function(k){ w.ANIM.push(this.dataset && this.dataset.own || this.className); return {cancel(){}}; }; w.REDUCE = false; const rect = w.Element.prototype.getBoundingClientRect; w.Element.prototype.getBoundingClientRect = function(){ const t = this.closest && this.closest("#ownDone") ? 240 : 60; return {top:t, bottom:t + 30, left:0, right:400, width:400, height:30, x:0, y:t}; }; w.matchMedia = q => ({matches:/reduce/.test(q) && w.REDUCE, addEventListener(){}, removeEventListener(){}});
    const check = id => { const c = d.querySelector(`[data-own="${id}"] .owncheck`); c.checked = true; c.dispatchEvent(new w.Event("change", {bubbles:true})); };
    check("t-new"); await wait(20);
    ok("K4 the checked item glides into Done today and its check mark lands", w.ANIM.includes("t-new") && w.ANIM.includes("ownmark"), JSON.stringify(w.ANIM));
    X(`undo(); render();`); await wait(20); w.ANIM = []; w.REDUCE = true;
    check("t-new"); await wait(20);
    ok("K5 …with reduced motion, nothing animates and it still moves", !w.ANIM.length && doneRows().includes("t-new"), JSON.stringify(w.ANIM));
    X(`undo(); render();`); await wait(20); delete w.Element.prototype.animate; w.Element.prototype.getBoundingClientRect = rect; w.REDUCE = false;

    // ---- not doing
    d.querySelector('[data-own="t-later"] .ownmore').click(); await wait(10);
    d.querySelector('[data-own="t-later"] [data-omi="notdoing"]').click(); await wait(10);
    ok("ND1 Not doing… asks why, optionally, with the cursor there", d.activeElement && d.activeElement.id === "ownWhy");
    d.getElementById("ownWhy").value = "The partner pulled out"; d.getElementById("ownWhy").closest("form").dispatchEvent(new w.Event("submit", {bubbles:true, cancelable:true})); await wait(20);
    ok("ND2 …it closes as not doing, with the reason, under Done today, and isn't struck through as done", J(`S.own.find(x=>x.id === "t-later").closed.as`) === "notdoing" && /Not doing: The partner pulled out/.test(d.querySelector('#ownDone [data-own="t-later"]').textContent) && d.querySelector('#ownDone [data-own="t-later"]').classList.contains("notdoing"));
    d.querySelector('#ownDone [data-oreopen="t-later"]').click(); await wait(20);
    ok("ND3 Reopen brings it back", rows().includes("t-later") && !doneRows().includes("t-later"));

    // ---- part of, move into an initiative, delete, from the menu
    d.querySelector('[data-own="t-old"] .ownmore').click(); await wait(10); d.querySelector('[data-own="t-old"] [data-omi="rel"]').click(); await wait(10);
    d.getElementById("ownRelKey").value = "xyz-9"; d.getElementById("ownRelKey").closest("form").dispatchEvent(new w.Event("submit", {bubbles:true, cancelable:true})); await wait(20);
    ok("P1 Part of… takes a Jira key", JSON.stringify(J(`S.own.find(x=>x.id === "t-old").rel`)) === '[{"jira":"XYZ-9"}]' && d.querySelector('[data-own="t-old"] [data-orel="XYZ-9"]') !== null);
    d.querySelector('[data-own="t-old"] .ownmore').click(); await wait(10); d.querySelector('[data-own="t-old"] [data-omi="move"]').click(); await wait(10);
    d.getElementById("ownMovePick").value = bar2; d.getElementById("ownMovePick").closest("form").dispatchEvent(new w.Event("submit", {bubbles:true, cancelable:true})); await wait(20);
    ok("P2 Move into an initiative… makes it a task you own there, and it leaves the list", !rows().includes("t-old") && J(`(actTask(S, "t-old") || {}).b?.id`) === bar2 && /Moved "Older open item" into/.test(d.getElementById("status").textContent));
    X(`undo(); render();`); await wait(20);
    ok("P3 …undo brings it back to the list", rows().includes("t-old") && !J(`!!actTask(S, "t-old")`));
    d.querySelector('[data-own="t-old"] .ownmore').click(); await wait(10); d.querySelector('[data-own="t-old"] [data-omi="del"]').click(); await wait(20);
    ok("P4 Delete removes it, and undo is offered", !rows().includes("t-old") && /Deleted "Older open item"\./.test(d.getElementById("status").textContent));
    X(`undo(); render();`); await wait(10);

    // ---- My Jira issues: by linked user key, never by name
    const myName = P[0].name, iss = (sum, key, name, cat, extra = {}) => ({summary:sum, status:cat === "done" ? "Done" : cat === "inprogress" ? "In Progress" : "To Do", category:cat, type:"Story", assigneeKey:key, assignee:name, ...extra});
    w.JS = JSON.stringify({kind:"sightline-jira-status", version:1, generatedAt:new Date().toISOString(), jiraBase:"https://jira.example.com/browse/", missing:[], rollups:{}, sprints:[], issues:{
      "ABC-1":iss("Fix the login timeout", "U1", "Someone", "inprogress"), "ABC-2":iss("Name twin's issue", "U9", myName, "todo"), "ABC-3":iss("Closed today", "U1", "x", "done", {resolution:"Done", resolvedAt:day(0)}),
      "ABC-4":iss("Closed last week", "U1", "x", "done", {resolution:"Done", resolvedAt:day(-7)}), "ABC-5":iss("An epic of mine", "U1", "x", "inprogress", {type:"Epic", isEpic:true})}});
    w.JI = JSON.stringify({kind:"sightline-jira-issues", version:2, generatedAt:new Date().toISOString(), searches:[{name:"Mine", keys:["ABC-8", "ABC-9"]}], issues:[{key:"ABC-8", ...iss("From the search", "U1", "x", "todo")}, {key:"ABC-9", ...iss("Not mine either", "", myName, "todo")}]});
    X(`JIRA = parseJiraStatus(JS); JIRA_ISSUES = parseJiraIssues(JI); S.meta.jiraBase = "https://jira.example.com/browse/"; render();`); await wait(20);
    ok("J1 not linked to Jira: one line asks me to link, and nothing is matched by my name", !!d.getElementById("myJiraLink") && !d.querySelector("#myJira [data-ojira]") && /never guesses from names/.test(d.getElementById("myJiraLink").textContent), (d.getElementById("myJira") || {}).textContent);
    d.getElementById("myJiraLinkGo").click(); await wait(20);
    ok("J2 …its button opens my card where I pick my Jira user", J("sel") && J("sel").type === "person" && J("sel").id === me && !!d.getElementById("f-jpick"), JSON.stringify(J("sel")) + " " + X("UI.ws"));
    X(`S.people.find(p=>p.id === "${me}").jira = {key:"U1", user:"u1", name:"Someone"}; goWs("today"); render();`); await wait(20);
    const jk = () => [...d.querySelectorAll("#myJira [data-ojira]")].map(x=>x.dataset.ojira);
    ok("J3 linked: my open issues from the placed sync and the search file, then any that closed today; never by name, never epics", JSON.stringify(jk()) === '["ABC-1","ABC-8","ABC-3"]', JSON.stringify(jk()));
    ok("J4 …read-only, with Jira's status and key, marked as Jira's", /In Progress/.test(d.querySelector('[data-ojira="ABC-1"]').textContent) && /ABC-1/.test(d.querySelector('[data-ojira="ABC-1"]').textContent) && !!d.querySelector('[data-ojira="ABC-1"] .jtag')
      && !d.querySelector("#myJira input, #myJira select") && /done today/.test(d.querySelector('[data-ojira="ABC-3"]').textContent));
    ok("J5 a related Jira key the sync doesn't have says so, and one it has shows its title", /ABC-12 · not in the last sync/.test(d.querySelector('[data-own="t-passed"] [data-orel="ABC-12"]').textContent)
      && J(`(()=>{ const o = S.own.find(x=>x.id === "t-passed"); o.rel = [{jira:"ABC-1"}]; render(); return document.querySelector('[data-own="t-passed"] [data-orel="ABC-1"]').textContent; })()`) === "ABC-1 Fix the login timeout");

    // ---- Team: a count, grouped by owner; hidden people counted
    X(`UI.todayScope = "team"; render();`); await wait(20);
    const nOpen = J(`S.own.filter(o=>!o.closed).length`);
    ok("TM1 Team shows how many open items are on people's lists, and no add line", !d.getElementById("ownSec") && !d.getElementById("ownAdd") && new RegExp(`^${nOpen} open items on people's lists`).test(d.querySelector("#ownTeam summary").textContent.trim()), d.querySelector("#ownTeam summary")?.textContent);
    ok("TM2 …which opens to the items grouped by owner", JSON.stringify([...d.querySelectorAll("#ownTeam [data-oteam]")].map(x=>x.dataset.oteam)) === JSON.stringify([me, other]) && d.querySelectorAll(`#ownTeam [data-oteam="${other}"] li`).length === 1);
    X(`setHide(h=>{ h.people.push("${other}"); });`); await wait(20);
    ok("TM3 someone your view hides is counted, not listed", /1 hidden by your view/.test(d.querySelector("#ownTeam summary").textContent) && !d.querySelector(`#ownTeam [data-oteam="${other}"]`) && new RegExp(`^${nOpen} open`).test(d.querySelector("#ownTeam summary").textContent.trim()));
    X(`setHide(h=>{ h.people = []; }); UI.todayScope = "me"; render();`); await wait(20);

    // ---- read-only: viewers, Present, a plan from a newer copy
    const inputs = () => d.querySelectorAll("#ownSec input, #ownSec .ownmore, #ownSec .ownreopen").length;
    X(`locked = true; render();`); await wait(10);
    ok("R1 a viewer sees the list without inputs", !!d.getElementById("ownList") && rows().length > 0 && inputs() === 0 && !!d.querySelector("#ownSec .ownbox"));
    X(`locked = false; present = true; render();`); await wait(10);
    ok("R2 …so does Present", !!d.getElementById("ownList") && inputs() === 0);
    X(`present = false; S.meta.features = [...(S.meta.features || []), "fromTheFuture9"]; render();`); await wait(10);
    ok("R3 …and a plan from a newer copy", !!d.getElementById("ownList") && inputs() === 0);
    X(`S.meta.features = S.meta.features.filter(f=>f !== "fromTheFuture9"); render();`); await wait(10);

    // ---- Q from anywhere
    X(`goWs("timeline"); render();`); await wait(20);
    d.body.dispatchEvent(new w.KeyboardEvent("keydown", {key:"q", code:"KeyQ", bubbles:true})); await wait(20);
    ok("Q1 Q from the Timeline opens Today with the cursor in the add line", X("UI.ws") === "today" && d.activeElement && d.activeElement.id === "ownAdd", X("UI.ws"));
    ok("Q2 Q is listed in the shortcut help and the command palette, and taken by nothing else", J(`SHORTCUTS.flatMap(g=>g[1]).filter(r=>r[0].includes("Q")).length`) === 1 && J(`COMMANDS.filter(c=>(c.keys || []).includes("Q")).map(c=>c.id)`).join() === "own-add");

    ok("Z1 no script errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("no exception", false, e.stack); }
  console.log(R.join("\n")); const n = R.length, f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${n - f}/${n} passed`); process.exit(f ? 1 : 0);
})();
