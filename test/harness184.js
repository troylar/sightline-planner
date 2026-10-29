// Find without losing your place: going to an item your view hides (from Find, a star or a link) is a visit. Find says
// before you go why a result isn't shown as it is; going there changes the view in one step of history; Back to where
// I was, or one press of the browser's Back, puts everything back: the linked chain, filters, zoom, folds, hidden kinds
// and selection. Show linked work is a way back of its own. The sample plan (every name invented), with a synthetic task
// on r2, outside the chain c1 -> c3 -> c4 -> c5 -> c6, c3 -> u4 -> u5.
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
       S.bars.find(b=>b.id === "r2").tasks = [{id:"rt1", label:"Synthetic outside task", start:"2026-11-02", days:3}];
       S.milestones.find(m=>m.id === "ms9").lane = ""; S = normalize(S, false); resetHistory(); file.handle = null; JIRA = null; dropJiraMemos();
       UI.filter = normFilter({}); UI.ws = "timeline"; UI.rows = "lanes"; UI.zoom = "weeks"; UI.collapsed = {}; sel = null; render();`); await wait(20);
    const find = async q => { X(`openFind()`); await wait(10); const i = d.querySelector("#findIn"); i.value = q; i.dispatchEvent(new w.Event("input", {bubbles:true})); await wait(10); };
    const enter = async () => { d.querySelector("#findIn").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true})); await wait(60); };
    const hit = text => [...d.querySelectorAll("#findList .fhit")].find(b=>b.querySelector(".ft")?.textContent === text);
    const view = () => J(`[UI.filter.linked, UI.zoom, zoomN(), hiddenKinds(), UI.collapsed, sel && sel.type + ":" + sel.id]`);
    const status = () => d.querySelector("#status").textContent;

    // a chain on screen, then Find a task outside it
    X(`zoomPreset(2); render(); select("bar", "c3"); render(); setHiddenQuiet(["milestone"]); UI.collapsed = {u4:true}; render();`); await wait(10);
    const z0 = X("zoomN()"); d.querySelector("#f-linked").click(); await wait(30);
    X(`select("bar", "c4"); render();`); await wait(10);
    const chain = view(), h0 = X("history.length");
    ok("V1 Show linked work, started from no picks, offers Back to where I was in its strip", /Back to where I was/.test(d.querySelector("#showStrip #showBack")?.textContent || ""), d.querySelector("#showStrip")?.textContent);

    await find("Synthetic outside task");
    ok("V2 Find says a result is outside your linked work before you go", hit("Synthetic outside task")?.querySelector(".fout")?.textContent === "Outside linked work", hit("Synthetic outside task")?.textContent);
    await find("Core: runtime");
    ok("V3 …and says nothing for a result your view shows", !!hit(X(`chartLabel(barById("c3"))`)) && !hit(X(`chartLabel(barById("c3"))`)).querySelector(".fout"));
    await find("Synthetic outside task"); await enter();
    ok("V4 Enter shows the task: selected, on the Timeline, and drawn", X(`sel && sel.type + ":" + sel.id`) === "task:rt1" && X(`taskVisible(taskById("rt1").t) && barVisible(barById("r2"))`) === true);
    ok("V5 …as one step of history", X("history.length") === h0 + 1, X("history.length") + " vs " + h0);
    ok("V6 …and a strip above the chart says what changed and offers the way back", /Showing Synthetic outside task/.test(d.querySelector("#backStrip")?.textContent || "") && !!d.querySelector("#backStrip #backGo") && /Back to where I was puts it back/.test(status()), status());

    // a second search from the visit still goes back to the chain
    await find("Runtime library spike"); await enter();
    ok("V7 a second Find from the visit names the new item", /Showing Runtime library spike/.test(d.querySelector("#backStrip")?.textContent || ""), d.querySelector("#backStrip")?.textContent);
    d.querySelector("#backGo")?.click(); await wait(60);
    ok("V8 Back to where I was puts the chain, zoom, hidden kinds, folds and selection back exactly", JSON.stringify(view()) === JSON.stringify(chain), JSON.stringify(view()) + " vs " + JSON.stringify(chain));
    ok("V9 …and the chain's own way back is still offered, the visit's strip isn't", !d.querySelector("#backStrip") && !!d.querySelector("#showStrip #showBack"));

    // the browser's Back does the same
    await find("Synthetic outside task"); await enter();
    w.history.back(); await wait(120);
    ok("V10 one browser Back after Find restores the chain, zoom, hidden kinds, folds and selection", JSON.stringify(view()) === JSON.stringify(chain), JSON.stringify(view()) + " vs " + JSON.stringify(chain));
    ok("V11 …and the strip goes", !d.querySelector("#backStrip"));
    w.history.forward(); await wait(120);
    ok("V12 Forward opens the task again", X(`sel && sel.type + ":" + sel.id`) === "task:rt1", X(`sel && sel.type + ":" + sel.id`));
    w.history.back(); await wait(120);

    // a milestone outside the chain is shown, not left hidden behind its details
    const msOut = X(`S.milestones.find(m=>m.at != null && m.lane && !linkedScope().ms.has(m.id)).id`);
    await find(X(`S.milestones.find(m=>m.id === "${msOut}").what`));
    ok("V13 a milestone outside the chain says so in Find", hit(X(`S.milestones.find(m=>m.id === "${msOut}").what`))?.querySelector(".fout")?.textContent === "Outside linked work");
    hit(X(`S.milestones.find(m=>m.id === "${msOut}").what`))?.click(); await wait(60);
    ok("V14 going to it draws it on the chart", X(`msVisible(S.milestones.find(m=>m.id === "${msOut}"))`) === true && !!d.querySelector(`#gantt [data-peek-id="${msOut}"]`), msOut);
    d.querySelector("#backGo")?.click(); await wait(60);
    ok("V15 …and Back to where I was puts the chain back", (J("UI.filter.linked") || []).length === 1);

    // the chain's own way back
    d.querySelector("#showStrip #showBack")?.click(); await wait(60);
    ok("V16 the chain's Back to where I was returns to before Show linked work: no picks, the zoom you had, hidden kinds back", !(J("UI.filter.linked") || []).length && X("zoomN()") === z0 && z0 !== chain[2] && JSON.stringify(J("hiddenKinds()")) === JSON.stringify(["milestone"]) && X(`sel && sel.id`) === "c3", JSON.stringify(view()));
    ok("V17 …and nothing older is offered after it", !d.querySelector("#backStrip") && !d.querySelector("#showBack") && !X("wayBack()"));

    // what Find says about other results
    X(`setHiddenQuiet([]); UI.collapsed = {r1:true}; select("bar", "c3"); render();`);
    X(`showLinked("bar", "c3", false, "both", "highlight"); render();`); await wait(20);
    await find("Synthetic outside task");
    ok("V18 with Highlight instead, a result that isn't linked is said to be dimmed", hit("Synthetic outside task")?.querySelector(".fout")?.textContent === "Dimmed: not linked", hit("Synthetic outside task")?.textContent);
    X(`linkedOff(); render();`);
    ok("V19 taking the last chip off yourself drops the chain's way back", !X("wayBack()") && !d.querySelector("#showBack"));
    X(`barById("r2").parent = "r1"; S = normalize(S, false); UI.collapsed = {r1:true}; render();`);
    await find("Synthetic outside task");
    ok("V20 a result in a folded row says so", hit("Synthetic outside task")?.querySelector(".fout")?.textContent === "Folded row", hit("Synthetic outside task")?.textContent);
    await find(X(`S.milestones.find(m=>m.id === "ms9").what`));
    ok("V21 a milestone with no date or workstream is said not to be on the Timeline", hit(X(`S.milestones.find(m=>m.id === "ms9").what`))?.querySelector(".fout")?.textContent === "Not on Timeline");
    X(`closeFind()`);

    // selecting what's already shown isn't a visit; Keep this view drops it; another plan doesn't see it
    X(`UI.collapsed = {}; UI.filter = normFilter({lanes:["chat"]}); render();`);
    await find(X(`S.people[0].name`)); await enter();
    ok("V22 going to a person keeps your filter and offers no way back", JSON.stringify(J("UI.filter.lanes")) === '["chat"]' && !d.querySelector("#backStrip") && !X("wayBack()"));
    await find("Synthetic outside task"); await enter();
    ok("V23 going to a task your filter hides offers the way back", !!d.querySelector("#backStrip"));
    d.querySelector("#backKeep")?.click(); await wait(20);
    ok("V24 Keep this view keeps the view and drops the strip", !d.querySelector("#backStrip") && !(J("UI.filter.lanes") || []).length && X(`sel && sel.id`) === "rt1");
    X(`UI.filter = normFilter({lanes:["chat"]}); render(); goTo("task", "rt1"); render();`);
    ok("V25 Back to where I was is an action in Find while it applies", X(`cmdOn(COMMANDS.find(c=>c.id === "back-where"))`) === true);
    // a view you changed yourself after a visit is where the next visit goes back to
    X(`UI.filter = normFilter({lanes:["rag"]}); render(); goTo("bar", "c3"); render();`);
    d.querySelector("#backGo")?.click(); await wait(60);
    ok("V26 after you change the view yourself, the next visit goes back to that view, not the first", JSON.stringify(J("UI.filter.lanes")) === '["rag"]', JSON.stringify(J("UI.filter.lanes")));
    // each step of history keeps its own view: Back, then Forward, and a visit from a visit
    X(`backs = []; S.bars.find(b=>b.id === "c5").tasks = [{id:"ct1", label:"Synthetic second task", start:"2026-11-09", days:2}]; S = normalize(S, false);
       UI.filter = normFilter({}); UI.collapsed = {r2:true, c5:true}; sel = null; render();`); await wait(20);
    X(`goTo("task", "rt1");`); await wait(20); X(`goTo("task", "ct1");`); await wait(20);
    const fold = () => JSON.stringify(J("UI.collapsed")), strip = () => d.querySelector("#backStrip")?.textContent || "";
    ok("V29 two visits: both rows unfolded, and the strip names the second", fold() === "{}" && /Showing Synthetic second task/.test(strip()), fold() + " " + strip());
    w.history.back(); await wait(120);
    ok("V30 Back to the first visit shows that step as it was: only its row unfolded, and the strip names it", X(`sel && sel.id`) === "rt1" && fold() === '{"c5":true}' && /Showing Synthetic outside task/.test(strip()), X(`sel && sel.id`) + " " + fold() + " " + strip());
    w.history.back(); await wait(120);
    ok("V31 Back again: where you started, both rows folded, no strip", fold() === '{"r2":true,"c5":true}' && !d.querySelector("#backStrip"), fold());
    w.history.forward(); await wait(120);
    ok("V32 Forward returns to the visit whole: its row unfolded and the way back offered again", X(`sel && sel.id`) === "rt1" && fold() === '{"c5":true}' && /Showing Synthetic outside task/.test(strip()), X(`sel && sel.id`) + " " + fold() + " " + strip());
    // a toast's way back belongs to its own visit
    X(`backs = []; UI.collapsed = {}; UI.filter = normFilter({}); select("bar", "c3"); render(); showLinked("bar", "c3"); render();`); await wait(20);
    await find("Synthetic outside task"); await enter();
    const tb = d.querySelector("#toast button"); d.querySelector("#backKeep")?.click(); await wait(20);
    tb?.click(); await wait(40);
    ok("V33 after Keep this view, the visit's toast doesn't go back to before linked work", !!tb && !(J("UI.filter.linked") || []).length && X(`sel && sel.id`) === "rt1" && /That way back is gone/.test(status()), status());
    // Starred and Recent results say so too
    X(`backs = []; linkedOff(); UI.filter = normFilter({lanes:["chat"]}); localStorage.removeItem("sightline-stars"); starMemo = null; toggleStar("task", "rt1"); render(); openFind();`); await wait(20);
    ok("V34 a starred result your filter hides says so in Find", d.querySelector('#findList [data-star="task:rt1"] .fout')?.textContent === "Outside your filter", d.querySelector('#findList [data-star="task:rt1"]')?.textContent);
    X(`closeFind(); UI.filter = normFilter({}); render();`);
    // changes you make on a visit stay with that step
    X(`backs = []; setHiddenQuiet([]); UI.filter = normFilter({}); UI.collapsed = {r2:true, c5:true}; sel = null; render();`); await wait(20);
    X(`goTo("task", "rt1");`); await wait(20); X(`setHiddenQuiet(["gate"]); render(); goWs("list"); render();`); await wait(20);
    w.history.back(); await wait(120);
    ok("V35 Back to a visit keeps what you changed there (gates you hid stay hidden)", JSON.stringify(J("hiddenKinds()")) === '["gate"]' && X(`sel && sel.id`) === "rt1", JSON.stringify(J("hiddenKinds()")));
    // jumping back past where a way back was taken from sets it aside
    X(`setHiddenQuiet([]); backs = []; UI.collapsed = {}; UI.filter = normFilter({}); select("bar", "c3"); render(); showLinked("bar", "c3"); render();`); await wait(20);
    X(`goTo("task", "rt1");`); await wait(20);
    w.history.go(-2); await wait(150);
    ok("V36 jumping back two steps, to before Show linked work, offers no way back", !d.querySelector("#backStrip") && !d.querySelector("#showBack") && !X("wayBack()") && !(J("UI.filter.linked") || []).length, String(X("wayBack() && wayBack().why")));
    w.history.go(2); await wait(150);
    ok("V37 …and jumping forward again brings the visit's way back", /Showing Synthetic outside task/.test(strip()) && X("wayBack() && wayBack().why") === "visit");
    // a fork in history keeps the first way back
    X(`linkedOff(); backs = []; UI.filter = normFilter({}); UI.collapsed = {r2:true, c5:true}; sel = null; render();`); await wait(20);
    X(`goTo("task", "rt1");`); await wait(20); X(`goTo("task", "ct1");`); await wait(20);
    w.history.back(); await wait(120); X(`goTo("task", "ct1");`); await wait(20);
    d.querySelector("#backGo")?.click(); await wait(60);
    ok("V38 Back, then Find again from the first visit: Back to where I was still returns to where you started", fold() === '{"r2":true,"c5":true}' && !X(`sel`), fold() + " " + X(`sel && sel.id`));
    // Forward names what the step showed, even when getting there changed nothing more
    X(`backs = []; UI.filter = normFilter({lanes:["chat"]}); UI.collapsed = {}; sel = null; render();`); await wait(20);
    X(`goTo("task", "rt1");`); await wait(20); X(`goTo("bar", "c3");`); await wait(20);
    w.history.back(); await wait(120); w.history.forward(); await wait(120);
    ok("V39 Forward to a step that needed no more changes names its item", X(`sel && sel.id`) === "c3" && new RegExp("Showing " + X(`chartLabel(barById("c3"))`).slice(0, 12)).test(strip()), strip());
    // going to the item you'd already selected, when only its fold changes, is still a step Back undoes
    X(`backs = []; UI.filter = normFilter({}); UI.collapsed = {}; select("task", "rt1"); render(); UI.collapsed = {r2:true}; render();`); await wait(20);
    const h1 = X("history.length"); X(`goTo("task", "rt1");`); await wait(20);
    ok("V41 Find on the selected item, when only its fold changes, adds a step", X("history.length") === h1 + 1 && fold() === "{}", X("history.length") + " vs " + h1);
    w.history.back(); await wait(120);
    ok("V42 …and Back folds it again with it still selected", fold() === '{"r2":true}' && X(`sel && sel.id`) === "rt1", fold() + " " + X(`sel && sel.id`));
    // what's kept stays small, going to stars over and over
    X(`for (let i = 0; i < 30; i++) goTo(i % 2 ? "task" : "bar", i % 2 ? "rt1" : "c3", true);`); await wait(20);
    const biggest = X(`Math.max(...Object.values(wayBack()).map(v=>v && typeof v === "object" ? Object.keys(v).length : 0))`);
    ok("V40 many visits keep a bounded record", X(`typeof steps === "undefined" || steps.size <= 60`) === true && biggest <= 25, String(biggest));
    X(`goTo("bar", "c3"); render(); S.meta.planId = "another-plan"; render();`);
    ok("V27 another plan doesn't offer this plan's way back", !d.querySelector("#backStrip") && !X("wayBack()"));
    ok("V28 no page errors", !X("errs.length"), J("errs"));
  } catch(e){ ok("ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
