// J and K move through the items of the view you're in, without switching views: Timeline and List select as they go,
// Today, Sprint and Capacity move keyboard focus (Enter opens). A hidden live region says where you are, the ends hold,
// and typing never moves you. The sample plan; every name is invented.
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
        b.tasks = [{id:"fa", label:"Avery builds", start:st, days:4, owners:[A, B], status:"inprogress"}, {id:"fb", label:"Blake tests", start:st, days:3, owners:[B], status:"notstarted"}];
        const c = S.bars.find(x=>x.id === "c2"); c.owners = [A]; c.tasks = [{id:"fm", label:"Morgan's part", start:st, days:2, owners:[S.people.find(p=>p.name === "Morgan").id], status:"notstarted"}];
        S.bars.find(x=>x.id === "m5").label = '<img src=x onerror="window.pwned=1">Retire';
        UI.ws = "timeline"; UI.zoom = "weeks"; UI.focus = null; UI.filter = normFilter({}); render();
        window.VIS = () => S.bars.filter(b=>barVisible(b)).map(b=>b.id).sort();
        window.TV = id => taskVisible(taskById(id).t);`);
    const live = () => $("#navLive")?.textContent || "";
    const at = () => d.activeElement;
    const go = async (ws, n = 1, k = "j") => { for (let i = 0; i < n; i++){ key(k); await wait(15); } };
    const plan0 = X("JSON.stringify(S)");

    // Today: J stays on Today and moves focus through its rows
    ev(`sel = null; goWs("today"); render();`); await wait(20);
    const todayRows = d.querySelectorAll("#today li.trow").length;
    await go("today");
    ok("N1 J on Today stays on Today and focuses its first row", X("UI.ws") === "today" && !!at()?.closest?.("#today li.trow") && at() === (d.querySelector("#today li.trow button.tname, #today li.trow a.tname") && at()), [X("UI.ws"), at()?.tagName, todayRows].join(" "));
    ok("N2 …and says where you are", /^1 of \d+/.test(live()), live());
    ev(`document.activeElement && document.activeElement.blur()`); key("k"); await wait(15);
    const lastRow = [...d.querySelectorAll("#today li.trow")].pop();
    ok("N3 K with nothing focused starts from the last row", !!lastRow && lastRow.contains(at()), live());
    key("j"); await wait(15);
    ok("N4 J at the last row stays put and says so", lastRow.contains(at()) && live() === "Last item", live());

    // Sprint: cards get focus, nothing opens
    ev(`window.opened = 0; window.open = ()=>{ window.opened++; return null; }; window.ST0 = [taskById("fa").t.start, taskById("fb").t.start]; taskById("fa").t.start = taskById("fb").t.start = dayToIso(nearWeekday(todayDay())); taskById("fa").t.jira = "ABC-1"; taskById("fb").t.jira = "ABC-2"; sel = null; goWs("standup"); render();`); await wait(20);
    const cards = d.querySelectorAll("#standupWs .sucard[data-card]").length;
    await go("standup", 2);
    ok("N5 J on Sprint stays on Sprint and moves focus card to card, opening nothing", X("UI.ws") === "standup" && cards >= 2 && at()?.matches?.(".sucard") && /^2 of /.test(live()) && X("window.opened") === 0 && !X("sel"), [cards, live(), X("window.opened"), JSON.stringify(T("sel"))].join(" "));

    ev(`taskById("fa").t.start = ST0[0]; taskById("fb").t.start = ST0[1]; delete taskById("fa").t.jira; delete taskById("fb").t.jira; render();`);
    // Capacity: stays put
    ev(`goWs("people"); render();`); await wait(20); await go("people");
    ok("N6 J on Capacity stays on Capacity", X("UI.ws") === "people", X("UI.ws"));

    // List: selects as before, stays on List, says where you are
    ev(`sel = null; goWs("list"); render();`); await wait(20); await go("list");
    ok("N7 J on the List stays on the List, selects the first row and says 1 of N", X("UI.ws") === "list" && !!X("sel") && /^1 of \d+$/.test(live()), [X("UI.ws"), live()].join(" "));

    // Timeline, rows by person: a task on two people's rows is two stops, and each selects the task itself
    ev(`sel = null; goWs("timeline"); UI.rows = "people"; UI.zoom = "weeks"; render();`); await wait(20);
    const occ = [...d.querySelectorAll('#gantt [data-sel="task:fa"]')].length;
    const ids = []; for (let i = 0; i < 40; i++){ key("j"); await wait(5); const s = T("sel"); if (s) ids.push(s.type + ":" + s.id); if (live() === "Last item") break; }
    ok("N8 rows by person: J selects real items (no person stuck to the id)", ids.length > 0 && ids.every(x=>/^(bar|task|story):[^:]+$/.test(x)) && ids.includes("task:fa"), ids.slice(0, 8).join(" "));
    ok("N9 …and a task shown on two people's rows is reached twice", occ >= 2 && ids.filter(x=>x === "task:fa").length >= 2, `${occ} drawn, ${ids.filter(x=>x === "task:fa").length} stops`);

    // The focused item is where J goes on from, even if the selection is elsewhere
    ev(`UI.rows = "lanes"; sel = null; render();`); await wait(20);
    const stops = [...d.querySelectorAll('#gantt [data-sel^="bar:"], #gantt [data-sel^="task:"]')];
    ev(`select("bar", "c2")`); await wait(10);
    const order = stops.map(e=>e.dataset.sel), want = order[order.indexOf("bar:m2") + 1];
    const fm = d.querySelector('#gantt [data-sel="bar:m2"]'); fm?.focus(); key("j"); await wait(20);
    const after = T("sel");
    ok("N10 J goes on from the focused item, not an older selection", !!fm && !!want && after && after.type + ":" + after.id === want, JSON.stringify([want, after]));

    // Typing never moves you
    ev(`select("bar", "m2")`); await wait(10);
    const s0 = JSON.stringify(T("sel")), inp = d.createElement("input"); d.body.append(inp); inp.focus(); key("j"); await wait(10);
    const ed = d.createElement("div"); ed.setAttribute("contenteditable", "true"); ed.tabIndex = 0; d.body.append(ed); ed.focus(); key("j"); await wait(10);
    ev(`openFind()`); await wait(10); $("#findIn").focus(); key("j"); await wait(10); ev(`closeFind()`);
    ok("N11 J does nothing while typing: in a field, in rich text, in Find", JSON.stringify(T("sel")) === s0 && X("UI.ws") === "timeline", JSON.stringify(T("sel")));
    inp.remove(); ed.remove();

    // Present: moves, changes nothing in the plan
    ev(`document.activeElement && document.activeElement.blur(); setPresent(true); sel = null; render();`); await wait(20); key("j"); await wait(20);
    ok("N12 in Present, J still moves through the chart and the plan is unchanged", !!X("sel") && X("JSON.stringify(S)") === plan0, JSON.stringify(T("sel")));
    ev(`setPresent(false)`);
    ok("N13 the keyboard help says J and K work in this view", (T("SHORTCUTS.flatMap(([g, rows])=>rows.filter(r=>r[0].includes('J')).map(r=>r[1]))") || []).some(x=>/in this view/.test(x)));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
