// Declutter (docs/workspaces.md): hide kinds of item to clear the chart, per plan in this browser and kept with a saved
// view. The Show menu and its keys, G / M / H / Shift+H, the Focus preset, three-state kind chips in Filters (hide wins),
// "N hidden · Show everything", Hide all from an item's panel, Find bringing a hidden kind back, pinned top rows, and an
// unchanged plan file. Synthetic plan: the sample plan plus a team meeting, a process block, a deliverable and a release.
const {JSDOM} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 50000).unref();
const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>({measureText:t=>({width:String(t).length * 7})});
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const w = dom.window, d = w.document, ev = s=>w.eval(s), wait = ms=>new Promise(r=>setTimeout(r, ms)), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
const key = (k, o = {}) => d.body.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, ...o}));
const has = s => !!d.querySelector(s), status = () => d.querySelector("#status")?.textContent || "";
const setup = `
  S.meta.planId = "p-declutter";
  S.meetings = [{id:"mt", title:"Standup", lane:"", date:"2026-10-05", time:"09:30", end:"09:45", recur:normRecur({freq:"daily", weekdays:true}, "2026-10-05"), skip:[]}];
  S.types = [{id:"ty-rev", name:"Security review", shape:"window", days:3, lane:""}];
  S.blocks = [{id:"blk-rev", type:"ty-rev", date:"2026-10-12", days:3, label:"Security review", after:[], status:"planned"}];
  S.deliverables = [{id:"dv-one", name:"Faster search", stage:"planned", date:"2026-10-30"}];
  S.bars.find(b=>b.id === "m2").status = "done";
  S.bars.find(b=>b.id === "m1").tasks = [{id:"t-done", label:"Finished task", start:"2026-09-22", days:2, status:"done", owners:[], dependsOn:[], tags:[]}, {id:"t-open", label:"Open task", start:"2026-09-24", days:2, status:"inprogress", owners:[], dependsOn:[], tags:[]}];
  S = normalize(S, false);
  JIRA = {kind:"sightline-jira-status", version:1, generatedAt:"2026-10-07T08:00:00Z", sprints:[], issues:{}, rollups:{}, releases:[{id:"rel-one", name:"Synthetic release", project:"ABC", date:"2026-10-20"}]};
  dropJiraMemos(); resetHistory(); sel = null; render();`;
(async()=>{
  try {
    await wait(150); ev("askWhoOnStart = ()=>{}; reschedule = ()=>({moved:0})");
    ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev(setup); ev("goWs('timeline'); setZoom('weeks')"); await wait(10);
    const before = ev("JSON.stringify(planOfRecord(S))");
    const strips = () => ["gaterow", "relrow", "dvrow", "meetrow", "blkrow"].filter(c=>has(`#gantt .lane.${c}`));
    ok("D0 the fixture draws every top row: gates, releases, deliverables, meetings, process", strips().join() === "gaterow,relrow,dvrow,meetrow,blkrow", strips().join());
    ok("D1 Show is in the Timeline toolbar, with nothing hidden", has("#showBtn") && !d.querySelector("#showBtn").hidden && d.querySelector("#showBtn").textContent.trim() === "Show");
    ev("goWs('today')"); ok("D1 …and isn't offered where filters don't apply", d.querySelector("#showBtn").hidden); ev("goWs('list')"); ok("D1 …but is on List", !d.querySelector("#showBtn").hidden); ev("goWs('timeline')");

    key("h"); await wait(5);
    const items = [...d.querySelectorAll("#showMenu [data-show]")];
    ok("D2 H opens the Show menu: an eye for each kind, all showing", !d.querySelector("#showMenu").hidden && items.map(b=>b.dataset.show).join() === "gate,release,deliverable,meeting,process,milestone,done" && items.every(b=>b.getAttribute("role") === "menuitemcheckbox" && b.getAttribute("aria-checked") === "true"), items.map(b=>b.dataset.show).join());
    ok("D2 …with Focus, Show everything and Pin the top rows", has("#showFocus") && has("#showAll") && d.querySelector("#showAll").disabled && has("#showPin"));
    d.querySelector('#showMenu [data-show="release"]').click(); await wait(5);
    ok("D3 one click hides Releases, and the menu stays open with it unchecked", !strips().includes("relrow") && !has("#gantt .flag.release") && !d.querySelector("#showMenu").hidden && d.querySelector('#showMenu [data-show="release"]').getAttribute("aria-checked") === "false");
    d.querySelector('#showMenu [data-show="release"]').dispatchEvent(new w.KeyboardEvent("keydown", {key:"r", bubbles:true})); await wait(5);
    ok("D3 …and a letter inside the menu toggles it back", strips().includes("relrow"));
    d.querySelector("#showMenu button").dispatchEvent(new w.KeyboardEvent("keydown", {key:"d", bubbles:true})); await wait(5);
    ok("D3 D in the menu hides Deliverables (outside it, D is still Days)", !strips().includes("dvrow") && ev("UI.zoom") === "weeks");
    d.querySelector("#showMenu button").dispatchEvent(new w.KeyboardEvent("keydown", {key:"Escape", bubbles:true})); await wait(5);
    ok("D3 Escape closes the menu and returns focus to Show", d.querySelector("#showMenu").hidden && d.activeElement === d.querySelector("#showBtn"));
    ok("D4 the toolbar says how many kinds are hidden", /1 hidden/.test(d.querySelector("#showBtn").textContent) && d.querySelector("#showBtn").classList.contains("factive"));
    ok("D4 …and the strip under it names them, with Show everything", /1 hidden: deliverables\./.test(d.querySelector("#hsKinds")?.textContent || "") && !d.querySelector("#hiddenStrip").hidden && has("#hsShowAll"));
    d.querySelector("#hsShowAll").click(); await wait(5);
    ok("D4 Show everything brings them back", ev("hiddenKinds().length") === 0 && strips().length === 5 && !has("#hsKinds"));

    d.body.focus(); key("g"); await wait(5);
    ok("D5 G hides gates: the row, its header and the flags", !strips().includes("gaterow") && !has('[data-fold="sec:gates"]') && !has("#gantt .flag.gate") && /Gates hidden/.test(status()), status());
    key("g"); await wait(5); ok("D5 …and G again shows them", strips().includes("gaterow") && /Gates shown/.test(status()));
    key("m"); await wait(5);
    ok("D6 M hides meetings, team-wide and in workstreams", !strips().includes("meetrow") && J('meetingsIn("")').length === 0 && J("S.lanes.flatMap(l=>meetingsIn(l.id))").length === 0);
    key("m"); await wait(5);
    const inp = d.createElement("input"); d.body.append(inp); inp.focus(); inp.dispatchEvent(new w.KeyboardEvent("keydown", {key:"g", bubbles:true})); await wait(5);
    ok("D7 the keys do nothing while typing", ev("hiddenKinds().length") === 0); inp.remove();
    ev("goWs('today')"); d.body.focus(); key("g"); ok("D7 …or on a page filters don't apply to", ev("hiddenKinds().length") === 0); ev("goWs('timeline')");

    key("h"); d.querySelector("#showFocus").click(); await wait(5);
    ok("D8 Focus hides meetings, process blocks and done work", J("hiddenKinds()").join() === "meeting,process,done" && !strips().includes("meetrow") && !strips().includes("blkrow") && strips().includes("gaterow"), J("hiddenKinds()").join());
    ok("D8 …a done initiative leaves the chart, an open one stays", !has('#gantt [data-key="bar:m2"]') && has('#gantt [data-key="bar:m3"]'));
    ev("setZoom('days')"); await wait(5);
    ok("D8 …a done task leaves the Days view, an open one stays", !has('#gantt [data-key="task:t-done"]') && has('#gantt [data-key="task:t-open"]'));
    ev("goWs('list')"); await wait(5);
    const lk = [...d.querySelectorAll("#listTable tr[data-lk]")].map(r=>r.dataset.lk);
    ok("D9 hiding works on List too: done work is gone", !lk.includes("list:task:t-done") && lk.includes("list:task:t-open") && !lk.includes("list:bar:m2"), lk.slice(0, 6).join());
    ok("D9 …and the strip still says what's hidden", /3 hidden: meetings, process blocks, done work\./.test(d.querySelector("#hsKinds")?.textContent || ""), d.querySelector("#hsKinds")?.textContent);
    ev("goWs('people')"); await wait(5);
    ok("D9 …and in People", !J("personItems('p1', fRangeDays())").some(x=>x.key === "task:t-done" || x.key === "bar:m2"));
    ev("goWs('timeline'); setZoom('weeks')"); d.body.focus(); key("H", {shiftKey:true}); await wait(5);
    ok("D10 Shift+H shows everything", ev("hiddenKinds().length") === 0 && has('#gantt [data-key="bar:m2"]') && /every kind/.test(status()));

    ev("openFilterPop()"); await wait(5);
    const chip = v => d.querySelector(`#filterPop [data-fkey="kinds:${v}"]`);
    ok("D11 Filters has a chip for every kind, releases, deliverables and done work included", ["work","gated","waiting","milestone","gate","meeting","process","release","deliverable","done"].every(v=>chip(v)));
    chip("gate").click(); await wait(5);
    ok("D11 a kind chip cycles: first Show only", J("UI.filter.kinds").join() === "gate" && !ev("hidKind('gate')") && /only Gates/.test(chip("gate").textContent));
    chip("gate").click(); await wait(5);
    ok("D11 …then Hide", J("UI.filter.kinds").length === 0 && ev("hidKind('gate')") && /not Gates/.test(chip("gate").textContent) && !strips().includes("gaterow"));
    chip("gate").click(); await wait(5);
    ok("D11 …then off", J("UI.filter.kinds").length === 0 && !ev("hidKind('gate')") && strips().includes("gaterow"));
    chip("release").click(); await wait(5); ok("D11 a kind with no Show only goes straight to Hide", ev("hidKind('release')") && /not Releases/.test(chip("release").textContent));
    chip("release").click(); await wait(5); ok("D11 …and back to off", !ev("hidKind('release')"));
    ev("UI.filter.kinds = ['gate']; setHiddenKinds(['gate'])"); await wait(5);
    ok("D12 hide wins over Show only", !strips().includes("gaterow") && !J("gateItems()").some(g=>ev(`gateVisible(gateItems().find(x=>x.id === ${JSON.stringify(g.id)}))`)));
    chip("gate").click(); await wait(5);
    d.querySelector('#filterPop [data-fkey="clear"]').click(); await wait(5);
    ok("D12 Clear filters clears hidden kinds as well", ev("hiddenKinds().length") === 0 && !ev("fActive()"));
    ev("closeFilterPop()");

    ev("setHiddenKinds(['meeting', 'done'])");
    ok("D13 the choice is kept per plan, in this browser", JSON.parse(w.localStorage.getItem("sightline-declutter") || "{}")["p-declutter"].join() === "meeting,done");
    const other = JSON.parse(sample); other.meta.planId = "p-other";
    ev(`loadExternal(${JSON.stringify(JSON.stringify(other))}, "other")`); await wait(40); ev("dropJiraMemos(); render()");
    ok("D13 …so another plan opens with nothing hidden", ev("S.meta.planId") === "p-other" && ev("hiddenKinds().length") === 0, ev("S.meta.planId"));
    ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev(setup);
    ok("D13 …and this one comes back with its own", J("hiddenKinds()").join() === "meeting,done");

    ev("UI.view = null");
    const pv = J("currentDef()");
    ok("D14 a saved view records what's hidden", (pv.hide || []).join() === "meeting,done", JSON.stringify(pv.hide));
    ev(`applyView("personal", {id:"pv-x", name:"Quiet", def:{...currentDef(), hide:["gate"]}})`); await wait(5);
    ok("D14 opening a view applies its hidden kinds", J("hiddenKinds()").join() === "gate" && !strips().includes("gaterow") && strips().includes("meetrow"));
    ok("D14 …and a change to them counts as Modified", ev(`defKey(normViewDef({...currentDef(), hide:["gate"]}))`) === ev("defKey(currentDef())") && ev(`defKey(normViewDef({...currentDef(), hide:[]}))`) !== ev("defKey(currentDef())"));
    ev("clearView()"); ok("D14 All work clears them", ev("hiddenKinds().length") === 0);
    ok("D15 a team view with hidden kinds marks the plan, so an older copy opens it read-only", J(`featuresIn({views:[{id:"v", name:"V", def:{hide:["meeting"]}}]})`).includes("viewHide1") && J("KNOWN_FEATURES").includes("viewHide1") && !J(`featuresIn({views:[{id:"v", name:"V", def:{}}]})`).includes("viewHide1"));
    ok("D15 …and normalizing keeps only known kinds", J(`normViewDef({hide:["meeting", "bogus", "meeting"]}).hide`).join() === "meeting" && !("hide" in J("normViewDef({})")));

    ev("select('meeting', 'mt')"); await wait(5);
    ok("D16 a meeting's panel offers Hide all meetings", (d.querySelector("#sideHideKind")?.textContent || "") === "Hide all meetings");
    d.querySelector("#sideHideKind").click(); await wait(5);
    ok("D16 …which hides them, closes the panel, and offers Show them", ev("hidKind('meeting')") && ev("sel") === null && !strips().includes("meetrow") && /Show them/.test(d.querySelector("#toast, .toast")?.textContent || ""), d.querySelector("#toast, .toast")?.textContent);
    ev("setHiddenKinds([])");
    ev("select('block', liveBlocks()[0].id)"); await wait(5); ok("D16 a process block's panel says Hide all process blocks", (d.querySelector("#sideHideKind")?.textContent || "") === "Hide all process blocks");
    ev("select('release', 'rel-one')"); await wait(5); ok("D16 …a release's, Hide all releases", (d.querySelector("#sideHideKind")?.textContent || "") === "Hide all releases");
    ev("select('bar', 'm1')"); await wait(5); ok("D16 …an initiative's panel doesn't", !has("#sideHideKind"));
    ev("sel = null; goWs('roadmap'); select('deliverable', 'dv-one')"); await wait(5); ok("D16 …nor a deliverable on the Roadmap, where hiding doesn't apply", !has("#sideHideKind")); ev("sel = null; goWs('timeline')");

    ev("setHiddenKinds(['gate', 'done'])"); const gid = ev("S.gates[0].id");
    ev(`goTo("gate", ${JSON.stringify(gid)})`); await wait(80);
    ok("D17 Find brings a hidden kind back to show the result", !ev("hidKind('gate')") && ev("hidKind('done')") && /Showing gates/.test(status()), status());
    ev(`goTo("bar", "m2")`); await wait(80);
    ok("D17 …and done work, for a done initiative", !ev("hidKind('done')"));
    ev("setZoom('weeks'); sel = null; render()");

    ev("UI.pinTop = true; render()"); await wait(5);
    const pinned = [...d.querySelectorAll("#gantt > .pinned")];
    ok("D18 Pin the top rows makes them stick: headers and rows, not the workstreams", pinned.length >= 10 && pinned.every(el=>el.style.top !== "") && !has("#gantt > .lane.pinned:not(.gaterow):not(.relrow):not(.dvrow):not(.meetrow):not(.blkrow)") && d.querySelectorAll("#gantt > .pinlast").length === 1, String(pinned.length));
    ok("D18 …the toolbar says so, and the menu shows it checked", /pinned/.test(d.querySelector("#showBtn").textContent) && (ev("openShowMenu()"), d.querySelector("#showPin").getAttribute("aria-checked") === "true")); ev("closeShowMenu()");
    ev("setZoom('days')"); await wait(5);
    ok("D18 …in the Days view too", d.querySelectorAll("#gantt > .pinned").length >= 4 && has("#gantt > .lane.markrow.pinned, #gantt > .lane.meetrow.pinned"));
    ev("setZoom('weeks')"); Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", {configurable:true, get(){ return 100; }}); ev("render()");
    const pk = [...d.querySelectorAll("#gantt > .pinned")].map(el=>el.classList.contains("sechdr") ? "hdr" : el.className.split(" ")[1]);
    ok("D18 …whole sections only: a header is never pinned without its rows, and they stop at half the height", pk.join() === "hdr,gaterow", pk.join());
    delete w.HTMLElement.prototype.offsetHeight; ev("render()");
    ev("openShowMenu()"); d.querySelector("#showPin").click(); await wait(5);
    ok("D18 …and unpinning lets them scroll", !ev("UI.pinTop") && !has("#gantt > .pinned")); ev("closeShowMenu()");

    ok("D19 none of this changes the plan file", ev("JSON.stringify(planOfRecord(S))") === before);
    ok("D20 the help lists the keys", /Shift\+H/.test(J("JSON.stringify(SHORTCUTS)")) && J("SHORTCUTS").flatMap(g=>g[1]).some(r=>r[0].join() === "G,M"));
    const keysUsed = J("SHORTCUTS").flatMap(g=>g[1]).flatMap(r=>r[0]).map(k=>k.toLowerCase());
    ok("D20 G, M and H aren't used by another shortcut", ["g","m","h"].every(k=>keysUsed.filter(x=>x === k).length === 1), keysUsed.join(" "));
    ev("setHiddenKinds(['done', 'meeting'])"); ev("goWs('standup')");
    ok("D22 Today and Sprint, which have no Show, always show everything", !ev("hidKind('done')") && !ev("hidKind('meeting')") && ev("barVisible(barById('m2'))") && (ev("goWs('today')"), J('meetingsIn("")').length === 1));
    ev("goWs('timeline')"); ok("D22 …and the choice is still there back on Timeline", ev("hidKind('done')")); ev("setHiddenKinds([])");
    ok("D21 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
