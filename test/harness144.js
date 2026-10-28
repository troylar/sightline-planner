// Cards: the plan's Jira work as cards. Rows by workstream (grouped by initiative), person or epic; columns by status or
// sprint; filters; totals that say what they leave out; a team layout in the plan and your own in this browser; dropping a
// card on another workstream places it like Sort Jira work; dropping it on a status or sprint only proposes the change; a
// keyboard move; hiding the plan's own ways, with a reason and a Hidden list; the assistant's actions and the Python mirror.
// Fixed clock; the plan from fixtures/cards-plan.js. Every name and key is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path"), {spawnSync} = require("child_process");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), CARDS = require("./fixtures/cards-plan.js");
const SYNC = path.join(__dirname, "..", "tools", "sightline-jira-sync.py");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
async function open(){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{ w.alerted = true; }; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s);
  await wait(150); w.FIX = FIX; ev(CARDS);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); UI.cv = {}; UI.cardLayoutBy = {}; UI.cvStatusPick = {}; UI.cvHiddenOpen = false; cardsPlan(); UI.planTab = 'cards'; goWs('plan')");
  return {w, d, ev, J:s=>JSON.parse(ev(`JSON.stringify(${s})`))};
}
(async()=>{
  try {
    const {w, d, ev, J} = await open();
    const card = k => [...d.querySelectorAll("#cardsWs .cvcard")].find(c=>c.querySelector(".jkey")?.textContent === k || c.querySelector(".cvt")?.textContent === k);
    const keysIn = el => [...el.querySelectorAll(".cvcard .jkey")].map(x=>x.textContent);
    const row = id => d.querySelector(`#cardsWs .cvrow[data-row="${id}"]`), colOf = c => c.closest(".cvcell").dataset.col, grpOf = c => c.closest(".cvgrp").dataset.bar;
    const fire = (el, type) => { const e = new w.Event(type, {bubbles:true, cancelable:true}); el.dispatchEvent(e); return e; };
    const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent("keydown", {key:k, bubbles:true, cancelable:true}));
    // The page
    ok("P1 Cards is under Work, next to Sort Jira work", d.querySelector("#snp-work #work-sort").closest(".snrow").nextElementSibling?.querySelector(".snp")?.id === "work-cards" && ev("workspaceGroup('plan', 'cards')") === "work");
    ok("P1 …and Settings has a Cards page for the layout", !!d.querySelector('#snp-settings [data-section="cardlayout"]') && ev("workspaceGroup('plan', 'cardlayout')") === "settings");
    ok("P2 the board draws with no errors", !!d.querySelector("#cardsWs .cvboard") && !J("errs").length, J("errs").join(" | "));
    // Rows: workstreams in plan order; within one, cards group under their initiative, with "Not on an initiative" last.
    const rows = [...d.querySelectorAll("#cardsWs .cvrow")].map(r=>r.dataset.row);
    ok("R1 rows are the workstreams, in plan order", JSON.stringify(rows) === JSON.stringify(J("S.lanes.map(l=>l.id)")), rows.join(","));
    const gs = [...row("chat").querySelectorAll(":scope > .cvgrp:not(.empty)")].map(g=>g.dataset.bar);
    ok("R2 API v2's cards group under c3, c4 (the parent of a one-issue initiative), then not on an initiative", JSON.stringify(gs) === JSON.stringify(["c3","c4",""]), gs.join(","));
    ok("R2 …a one-issue initiative with no parent is a loose card", grpOf(card("ABC-120")) === "" && grpOf(card("ABC-122")) === "c4");
    ok("R3 a Jira task is a card in its initiative", grpOf(card("ABC-301")) === "f2" && card("ABC-301").closest(".cvrow").dataset.row === "fin");
    ok("R4 empty initiatives that take Jira work are there to drop on, hidden until a move starts", !!row("rag").querySelector('.cvgrp.empty[data-bar="r2"]'));
    // Columns
    const heads = () => [...d.querySelectorAll("#cardsWs .cvch")].map(x=>[...x.childNodes].filter(n=>!(n.classList && (n.classList.contains("cnt") || n.tagName === "I"))).map(n=>n.textContent).join("").trim());
    ok("C1 by default the columns are status categories: to do, in progress, done", JSON.stringify(heads()) === JSON.stringify(["To do","In progress","Done"]), heads().join(","));
    ok("C1 …each card in its category's column", colOf(card("ABC-101")) === "done" && colOf(card("ABC-102")) === "inprogress" && colOf(card("ABC-202")) === "inprogress" && colOf(card("ABC-103")) === "notstarted");
    ok("C2 canceled is hidden unless asked", !card("ABC-105"));
    d.querySelector("#cvCanceled").click();
    ok("C2 …and shown in its own column when asked", heads().includes("Canceled") && colOf(card("ABC-105")) === "abandoned");
    d.querySelector("#cvCanceled").click();
    d.querySelector("#cv-cols-sprint").click();
    ok("C3 by sprint: the active sprint, the next, then no sprint", JSON.stringify(heads()) === JSON.stringify(["Sprint 1","Sprint 2","No sprint"]), heads().join(","));
    ok("C3 …cards sit in their Jira sprint", colOf(card("ABC-101")) === "sp:11" && colOf(card("ABC-103")) === "sp:12" && colOf(card("ABC-104")) === "none");
    ok("C3 …the active sprint is marked as now", d.querySelector("#cardsWs .cvch.now")?.textContent.startsWith("Sprint 1"));
    d.querySelector("#cv-cols-state").click();
    d.querySelector("#cv-rows-person").click();
    ok("C4 rows by person: team order, then unassigned", JSON.stringify([...d.querySelectorAll("#cardsWs .cvrow")].map(r=>r.dataset.row)) === JSON.stringify(["pa","pb","pc",""]), [...d.querySelectorAll("#cardsWs .cvrow")].map(r=>r.dataset.row).join(","));
    d.querySelector("#cv-rows-epic").click();
    ok("C4 rows by epic, with No epic last", JSON.stringify([...d.querySelectorAll("#cardsWs .cvrow")].map(r=>r.dataset.row)) === JSON.stringify(["ABC-100","ABC-200","ABC-300",""]));
    d.querySelector("#cv-rows-lane").click();
    // Totals and filters
    const tot = () => d.querySelector("#cvTotal").textContent, rtot = id => row(id).querySelector(".cvrt").textContent;
    ok("T1 the board total: cards, estimated points, the not-estimated count", tot() === "12 cards, 48 pts · 2 not estimated · 1 filtered out", tot());
    ok("T1 …a row's total too", rtot("chat") === "7 cards, 33 pts · 2 not estimated · 1 filtered out", rtot("chat"));
    const t = d.querySelector("#cvText"); t.focus(); t.value = "cursor"; fire(t, "input");
    ok("F1 text finds cards by summary", JSON.stringify(keysIn(d.querySelector("#cardsWs .cvboard"))) === JSON.stringify(["ABC-101"]) && /12 filtered out/.test(tot()), tot());
    ok("F1 …and keeps focus in the box", d.activeElement?.id === "cvText");
    t.value = "abc-20"; fire(t, "input");
    ok("F1 …and by key", keysIn(d.querySelector("#cardsWs .cvboard")).sort().join() === "ABC-201,ABC-202,ABC-203");
    d.querySelector("#cvClear").click();
    ev("meId = () => 'pa'; renderCardsWs()"); d.querySelector("#cvMine").click();
    ok("F2 Mine: only my cards", keysIn(d.querySelector("#cardsWs .cvboard")).sort().join() === "ABC-101,ABC-201", keysIn(d.querySelector("#cardsWs .cvboard")).join());
    d.querySelector("#cvClear").click();
    const pick = (id, v) => { const s = d.querySelector("#" + id); s.value = v; fire(s, "change"); };
    pick("cvSprint", "none");
    ok("F3 sprint filter", keysIn(d.querySelector("#cardsWs .cvboard")).join() === "ABC-104");
    pick("cvSprint", ""); pick("cvStatus", "done");
    ok("F3 status filter", keysIn(d.querySelector("#cardsWs .cvboard")).join() === "ABC-101");
    pick("cvStatus", ""); pick("cvEpic", "ABC-200");
    ok("F3 epic filter", keysIn(d.querySelector("#cardsWs .cvboard")).sort().join() === "ABC-201,ABC-202,ABC-203");
    pick("cvEpic", ""); pick("cvPerson", "~");
    ok("F3 person filter, unassigned", keysIn(d.querySelector("#cardsWs .cvboard")).sort().join() === "ABC-106,ABC-122,ABC-203,ABC-302");
    d.querySelector("#cvClear").click();
    // Cards: hostile text, status without color, Jira links
    const hc = card("ABC-106");
    ok("H1 a hostile summary is drawn as text", hc.querySelector(".cvt").textContent === "<img src=x onerror=alert(1)> literal title" && !d.querySelector("#cardsWs img") && !w.alerted);
    ok("S1 status reads without color: a symbol and the real status name", /◐ Code Review/.test(card("ABC-202").querySelector(".cvst").textContent) && /● Done/.test(card("ABC-101").querySelector(".cvst").textContent));
    const a = card("ABC-101").querySelector("a.jkey");
    ok("K1 the key opens in Jira in a new tab", a.href === "https://jira.example.com/browse/ABC-101" && a.target === "_blank" && /noopener/.test(a.rel) && /noreferrer/.test(a.rel));
    ok("K2 no points is shown as such, and the card is drawn differently", card("ABC-104").classList.contains("nopts") && /no points/.test(card("ABC-104").textContent));
    card("ABC-202").querySelector(".cvt").click();
    ok("K3 clicking a card opens its panel, beside the board", ev("sel && sel.type") === "story" && ev("sel.id") === "ABC-202" && ev("UI.ws") === "plan" && !d.querySelector("#side").hidden);
    ev("sel = null; render()");
    // Layout: the team's (in the plan), yours (this browser), reset
    ok("L1 the built-in layout: key, summary, status, assignee, points", [...card("ABC-101").querySelectorAll(".cvfi")].map(x=>x.dataset.f).join() === "status,assignee,points");
    ev("commit(s=>{ s.meta.cardLayout = {fields:['key','summary','sprint','labels','priority'], density:'normal', width:'fixed'}; })");
    ok("L2 the team's layout, from the plan", [...card("ABC-101").querySelectorAll(".cvfi")].map(x=>x.dataset.f).join() === "sprint,labels,priority" && /High/.test(card("ABC-101").textContent));
    ev("UI.planTab = 'cardlayout'; goWs('plan')");
    const lw = d.querySelector("#cardLayoutWs");
    ok("L3 Settings, then Cards: you're using the team's layout", /using the team's layout/.test(lw.querySelector("#clWhich").textContent) && !lw.querySelector("#clReset"));
    lw.querySelector('[data-add-f="due"]').click();
    ok("L4 changing it there makes it yours, in this browser only", J("cardLayoutMine().fields").join() === "key,summary,sprint,labels,priority,due" && J("S.meta.cardLayout.fields").join() === "key,summary,sprint,labels,priority");
    d.querySelector('#clFields [data-f="due"] [data-d="-1"]').click();
    ok("L4 …fields move up and down", J("cardLayoutMine().fields").join() === "key,summary,sprint,labels,due,priority");
    d.querySelector('input[name="clDensity"][value="compact"]').click();
    ev("UI.planTab = 'cards'; goWs('plan')");
    ok("L5 compact: key and summary only", !card("ABC-101").querySelector(".cvfi") && !!card("ABC-101").querySelector(".cvt"));
    ev("UI.planTab = 'cardlayout'; goWs('plan')"); d.querySelector("#clReset").click();
    ok("L6 Reset to the team's layout", ev("cardLayoutMine()") === null && J("cardLayout().fields").join() === "key,summary,sprint,labels,priority");
    ok("L7 another plan's own layout is kept apart", (ev("UI.cardLayoutBy = {other:{fields:['key'], density:'compact', width:'fixed'}}; saveUI()"), ev("cardLayoutMine()") === null));
    d.querySelector("#clTeam").click(); d.querySelector("#clWidth").click();
    ok("L8 the team's layout can be changed there too, in the plan", J("S.meta.cardLayout.width") === "points");
    ev("UI.planTab = 'cards'; goWs('plan')");
    ok("L8 …wider for more points, capped, and no points keeps the smallest width", card("ABC-101").style.width === "200px" && card("ABC-103").style.width === "280px" && !card("ABC-104").style.width, [card("ABC-101").style.width, card("ABC-103").style.width].join());
    ev("commit(s=>{ delete s.meta.cardLayout; })");
    // Feature markers: an older copy opens the plan read-only instead of dropping the layout or the reasons
    ev("commit(s=>{ s.meta.cardLayout = normCardLayout({fields:['key'], density:'compact'}); s.meta.hideWhy = {'ABC-104':'later'}; })");
    const fs1 = J("featuresIn(planOfRecord(S))");
    ok("M1 the plan says it needs a copy that knows the card layout and hide reasons", fs1.includes("cardLayout1") && fs1.includes("hideWhy1") && ev("KNOWN_FEATURES.includes('cardLayout1') && KNOWN_FEATURES.includes('hideWhy1')"));
    ok("M1 …so an older copy opens it read-only", !!ev("tooNew({meta:{features:['cardLayout1','laterThing9']}})") && !ev("tooNew({meta:{features:featuresIn(S)}})"));
    const rt = J("parseText(serialize(S, 'p.json')).meta");
    ok("M2 both survive a save and a load", rt.cardLayout.density === "compact" && rt.hideWhy["ABC-104"] === "later");
    const bad = J("(()=>{ const p = JSON.parse(FIX); p.meta.cardLayout = {fields:['nope','points','points'], density:'huge', width:'x'}; p.meta.hideWhy = {'not a key':'x', 'ABC-1':'', 'ABC-2':'y'.repeat(300)}; return normalize(p, false).meta; })()");
    ok("M3 a bad layout or reason is cleaned on load", JSON.stringify(bad.cardLayout) === JSON.stringify({fields:["points"], density:"normal", width:"fixed"}) && JSON.stringify(Object.keys(bad.hideWhy)) === '["ABC-2"]' && bad.hideWhy["ABC-2"].length === 200, JSON.stringify(bad.cardLayout));
    ok("M4 hide reasons merge key by key", J("objMerge({}, {'ABC-1':'a'}, {'ABC-2':'b'})")["ABC-2"] === "b" && ev("OBJ_FIELDS.includes('hideWhy') && SYNC_META.includes('cardLayout')"));
    ev("commit(s=>{ delete s.meta.cardLayout; delete s.meta.hideWhy; })");
    // Moving a card to another workstream: the same change Sort Jira work makes
    const snap = ev("JSON.stringify(planOfRecord(S))");
    const c102 = card("ABC-102"), target = row("rag").querySelector(':scope > .cvgrp[data-bar=""] .cvcell[data-col="inprogress"]');
    fire(c102, "dragstart"); ok("D0 a drag shows the empty initiatives to drop on", d.querySelector("#cardsWs").classList.contains("dragging"));
    fire(target, "dragover"); ok("D0 …and lights up the cell under it", target.classList.contains("over"));
    fire(target, "drop"); await wait(20);
    const lf = J("S.bars.filter(b=>upKey(b.jira) === 'ABC-102').map(b=>({lane:b.lane, kind:b.kind, epics:b.epics, tasks:b.tasks.length}))");
    ok("D1 dropped on Search: switched off in its epic's initiative, and placed there as its own initiative", J("barById('c3').storiesOff").includes("ABC-102") && lf.length === 1 && lf[0].lane === "rag", JSON.stringify(lf));
    ok("D1 …and the card is in Search now", card("ABC-102")?.closest(".cvrow").dataset.row === "rag" && grpOf(card("ABC-102")) === "");
    const viaCards = ev("JSON.stringify(S.bars.filter(b=>upKey(b.jira) === 'ABC-102').map(({id, added, edited, ...b})=>b))");
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); render(); commit(s=>{ s.bars.find(b=>b.id === 'c3').storiesOff = ['ABC-102']; })`);
    ev("sortMove(['ABC-102'], 'lane:rag')"); await wait(20);
    ok("D2 it's exactly what Sort Jira work makes for the same issue", ev("JSON.stringify(S.bars.filter(b=>upKey(b.jira) === 'ABC-102').map(({id, added, edited, ...b})=>b))") === viaCards, viaCards);
    ev("undo(); undo()"); ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    ev("cardDrop('story:ABC-102', {row:'rag', bar:'r1', col:'inprogress'})"); await wait(20);
    ok("D3 dropped on an initiative: it becomes a Jira task there", J("barById('r1').tasks.map(t=>t.jira)").includes("ABC-102") && J("barById('c3').storiesOff").includes("ABC-102"));
    ev("cardDrop('task:' + barById('r1').tasks.find(t=>t.jira === 'ABC-102').id, {row:'chat', bar:'c3', col:'inprogress'})"); await wait(20);
    ok("D4 a Jira task dropped back on its epic's initiative is a story there again", !J("barById('r1').tasks.map(t=>t.jira)").includes("ABC-102") && !J("barById('c3').storiesOff || []").includes("ABC-102") && grpOf(card("ABC-102")) === "c3");
    ok("D5 one save each, with Undo", (ev("undo()"), J("barById('r1').tasks.map(t=>t.jira)").includes("ABC-102")));
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    ev("cardDrop('bar:lf1', {row:'rag', bar:'', col:'inprogress'})"); await wait(20);
    ok("D6 a one-issue initiative changes workstream, as it is", ev("barById('lf1').lane") === "rag" && ev("barById('lf1').blocked.reason") === "Waiting on the gateway team");
    ev("cardDrop('bar:lf1', {row:'rag', bar:'r1', col:'inprogress'})"); await wait(20);
    ok("D6 …and isn't dropped inside another initiative (that's its parent, in its panel)", ev("barById('lf1').lane") === "rag" && !ev("barById('lf1').parent") && /moves between workstreams/.test(d.querySelector("#status").textContent));
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    // Moving a card to another status or sprint: a proposal only
    const plan1 = ev("JSON.stringify(planOfRecord(S).bars)");
    ev("cardDrop('story:ABC-201', {row:'rag', bar:'r1', col:'inprogress'})"); await wait(20);
    const ch = d.querySelector("#cvChoose");
    ok("J1 a category with several statuses asks which, never picks one", !!ch && [...ch.querySelectorAll("input[type=radio]")].map(x=>x.value).join() === "In Progress,Code Review,QA" && !J("S.proposals || []").length);
    ch.querySelector('input[value="Code Review"]').click(); d.querySelector("#cvChooseGo").click(); await wait(20);
    const pr = J("S.proposals");
    ok("J2 it proposes the chosen status for Jira, and nothing else changes", pr.length === 1 && pr[0].key === "ABC-201" && pr[0].field === "status" && pr[0].value === "Code Review" && ev("JSON.stringify(planOfRecord(S).bars)") === plan1);
    ok("J2 …the card stays where Jira has it, marked as proposed", colOf(card("ABC-201")) === "notstarted" && /✎ Change status to Code Review/.test(card("ABC-201").querySelector(".cvprop").textContent));
    ev("cardDrop('story:ABC-203', {row:'rag', bar:'r1', col:'notstarted'})"); await wait(20);
    ok("J3 a category with one status proposes it at once", !d.querySelector("#cvChoose") && J("S.proposals").some(p=>p.key === "ABC-203" && p.value === "To Do"));
    ev("cardDrop('story:ABC-106', {row:'chat', bar:'c3', col:'inprogress'})"); await wait(20);
    ok("J4 the last choice is remembered as the default", d.querySelector("#cvChoose input:checked")?.value === "Code Review");
    d.querySelector("#cvChooseNo").click();
    ok("J4 …and Cancel proposes nothing", !J("S.proposals").some(p=>p.key === "ABC-106"));
    d.querySelector("#cv-cols-sprint").click();
    ev("cardDrop('story:ABC-104', {row:'chat', bar:'c3', col:'sp:12'})"); await wait(20);
    ok("J5 by sprint, a drop proposes the sprint", J("S.proposals").some(p=>p.key === "ABC-104" && p.field === "sprint" && p.value.id === 12) && colOf(card("ABC-104")) === "none");
    d.querySelector("#cv-cols-state").click();
    ok("J6 no Jira write anywhere: the Jira files are as they were", ev("JIRA.issues['ABC-201'].status") === "To Do" && ev("JIRA.issues['ABC-104'].sprint") === undefined);
    // Keyboard: M picks a card up, arrows choose, Enter drops, Esc cancels
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    { d.activeElement?.blur?.(); const cards = [...d.querySelectorAll("#cardsWs .cvcard[data-card]")], live = () => d.querySelector("#navLive")?.textContent || "";
      key(d.body, "j"); const f1 = d.activeElement; key(f1, "j"); const f2 = d.activeElement;
      ok("K7 J on Cards focuses each card's title in turn, never its Jira link, and says where you are", f1?.matches(".cvt") && f1.closest(".cvcard") === cards[0] && f2?.matches(".cvt") && f2.closest(".cvcard") === cards[1] && /^2 of \d+: /.test(live()), [f1?.className, f2?.className, live()].join(" | "));
      key(f2, "ArrowUp");
      ok("K8 …and the up arrow goes back, with the plan unchanged", d.activeElement?.closest(".cvcard") === cards[0] && ev("JSON.stringify(planOfRecord(S))") === snap, d.activeElement?.className);
      key(d.activeElement, "m"); const lifted = d.activeElement; key(lifted, "j");
      ok("K9 while a card is picked up (M), J doesn't walk off to another card", ev("cvPick") !== null && d.activeElement?.closest(".cvcard")?.dataset.card === cards[0].dataset.card, d.activeElement?.closest(".cvcard")?.dataset.card);
      key(d.activeElement, "Escape"); }
    let b103 = card("ABC-103").querySelector(".cvt"); b103.focus(); key(b103, "m");
    ok("K4 M picks the card up and says where it would go", d.querySelector("#cardsWs .cvcard.lifted")?.contains(d.activeElement) && /Moving ABC-103/.test(d.querySelector("#status").textContent), d.querySelector("#status").textContent);
    key(d.activeElement, "Escape");
    ok("K4 …Esc puts it down where it was", !d.querySelector("#cardsWs .cvcard.lifted") && ev("cvPick") === null && ev("JSON.stringify(planOfRecord(S))") === snap);
    b103 = card("ABC-103").querySelector(".cvt"); b103.focus(); key(b103, "m");
    const T0 = ev("cvPick.ti"), Tn = J("cardTargets(cvUI(), [...document.querySelectorAll('#cardsWs .cvrow')].map(r=>({id:r.dataset.row, groups:[...r.querySelectorAll(':scope > .cvgrp')].map(g=>({id:g.dataset.bar}))})))"), toRag = Tn.findIndex(x=>x.row === "rag" && x.bar === "");
    for (let i = T0; i < toRag; i++) key(d.activeElement, "ArrowDown");
    key(d.activeElement, "ArrowRight");
    ok("K5 arrows move the target, shown on the board", d.querySelector(".cvrow[data-row='rag'] > .cvgrp[data-bar=''] .cvcell[data-col='inprogress']").classList.contains("kbtarget"));
    key(d.activeElement, "Enter"); await wait(30);
    ok("K6 Enter drops it: placed in Search, and a status proposal asked for", J("S.bars.filter(b=>upKey(b.jira) === 'ABC-103').map(b=>b.lane)").join() === "rag" && !!d.querySelector("#cvChoose"));
    d.querySelector("#cvChooseNo").click();
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    // Hiding
    card("ABC-106").querySelector(".cvhide").click(); await wait(10);
    ok("X1 Hide asks why, optionally", d.activeElement?.id === "cvHideWhy");
    d.querySelector("#cvHideWhy").value = "Duplicate of the export story"; d.querySelector("#cvHideGo").click(); await wait(20);
    ok("X2 a story is switched off in its initiative, with the reason", J("barById('c3').storiesOff").includes("ABC-106") && ev("S.meta.hideWhy['ABC-106']") === "Duplicate of the export story" && !card("ABC-106"));
    ok("X3 totals leave it out and say so, apart from what filters hide", rtot("chat") === "6 cards, 32 pts · 2 not estimated · 1 hidden · 1 filtered out" && /· 1 hidden · 1 filtered out$/.test(tot()), rtot("chat"));
    ok("X4 it's hidden from the timeline too: the same switch", !J("storiesOf(barById('c3')).filter(x=>x.drawn).map(x=>x.key)").includes("ABC-106"));
    d.querySelector("#cvHiddenBtn").click();
    const hr = d.querySelector('#cvHidden tr[data-hidden="ABC-106"]');
    ok("X5 the Hidden list says how and why", !!hr && /Switched off in its initiative/.test(hr.textContent) && /Duplicate of the export story/.test(hr.textContent) && /<img src=x/.test(hr.textContent) && !d.querySelector("#cvHidden img"));
    hr.querySelector("[data-back]").click(); await wait(20);
    ok("X6 Bring back: on again, and the reason is gone", !J("barById('c3').storiesOff || []").includes("ABC-106") && !J("S.meta.hideWhy || {}")["ABC-106"] && !!card("ABC-106"));
    card("ABC-120").querySelector(".cvhide").click();
    ok("X7 plan work can't be hidden: the page says why, and nothing changes", /on the plan as its own initiative, so it can't be hidden/.test(d.querySelector("#status").textContent) && !d.querySelector("#cvHideWhy"));
    // The assistant
    const run = (id, a) => J(`(()=>{ const p = clone(S), r = runAction(p, ${JSON.stringify(id)}, ${JSON.stringify(a)}); return {r:{ok:r.ok, code:r.code, reason:r.reason, value:r.value, nochange:r.nochange}, p}; })()`);
    const h1 = run("jira.hide", {keys:["ABC-200"], why:"Next quarter"});
    ok("A1 jira.hide on an epic parks it the plan's way, and reports how: an initiative with other work lets go of it", h1.r.ok && !h1.p.bars.find(b=>b.id === "r1").epics.includes("ABC-200") && !h1.p.bars.find(b=>b.id === "r1").parked && h1.p.meta.jiraSkip.includes("ABC-200") && h1.r.value[0].how === "park" && h1.p.meta.hideWhy["ABC-200"] === "Next quarter");
    ok("A2 the review says so before it's applied", /ABC-200 \(this parks the epic: its stories leave "[^"]+", which keeps its other work/.test(ev("actLine('jira.hide', {keys:['ABC-200']}, S)")), ev("actLine('jira.hide', {keys:['ABC-200']}, S)"));
    const h3 = run("jira.hide", {keys:["ABC-300"]});
    ok("A2 …an initiative made from the epic alone is parked, and the review says it leaves the timeline", h3.r.ok && h3.p.bars.find(b=>b.id === "ep3").parked === true && /this parks the epic: its initiative and stories leave the timeline\. Bring back from Hidden or Settings/.test(ev("actLine('jira.hide', {keys:['ABC-300']}, S)")));
    ok("A2 …and how each story would be hidden", /ABC-102 \(switched off in "/.test(ev("actLine('jira.hide', {keys:['ABC-102']}, S)")));
    const h2 = run("jira.hide", {keys:["ABC-120"]});
    ok("A3 plan work is refused, with the reason", !h2.r.ok && h2.r.code === "blocked" && /own initiative/.test(h2.r.reason));
    ok("A4 a long reason is refused", run("jira.hide", {keys:["ABC-104"], why:"x".repeat(201)}).r.code === "invalid");
    ev("S = parseText(JSON.stringify(" + JSON.stringify(h3.p) + ")); dropJiraMemos(); render()");
    const u1 = run("jira.unhide", {keys:["ABC-300"]});
    ok("A5 jira.unhide brings the epic back and drops the reason", u1.r.ok && !u1.p.bars.find(b=>b.id === "ep3").parked && !(u1.p.meta.jiraSkip || []).includes("ABC-300"));
    ok("A5 …a story hidden with its parked epic says to bring the epic back", run("jira.unhide", {keys:["ABC-302"]}).r.code === "blocked" && run("jira.hide", {keys:["ABC-302"]}).r.code === "blocked", JSON.stringify([run("jira.unhide", {keys:["ABC-302"]}).r, run("jira.hide", {keys:["ABC-302"]}).r, J("hideWay(S, 'ABC-302').how")]));
    ev("S = parseText(JSON.stringify(" + JSON.stringify(h1.p) + ")); dropJiraMemos(); render()");
    ok("A6 the context lists what's hidden, and the layout", J("assistantView().cards.hidden").some(x=>x.key === "ABC-200" && x.how === "park" && x.why === "Next quarter") && J("assistantView().cards.fields").length === 13);
    ev(`S = parseText(${JSON.stringify(snap)}); dropJiraMemos(); resetHistory(); render()`);
    const s1 = run("cards.set", {field:"density", value:"detailed", prev:"normal"});
    ok("A7 cards.set changes the team's layout, with prev", s1.r.ok && s1.p.meta.cardLayout.density === "detailed" && s1.p.meta.cardLayout.fields.join() === "key,summary,status,assignee,points");
    ok("A7 …a stale prev is caught", run("cards.set", {field:"density", value:"compact", prev:"detailed"}).r.code === "stale");
    ok("A7 …bad fields are refused", run("cards.set", {field:"fields", value:["key","nope"]}).r.code === "invalid" && run("cards.set", {field:"colour", value:"x"}).r.code === "invalid");
    ok("A7 …and the review line says it plainly", ev("actLine('cards.set', {field:'fields', value:['key','points']}, S)") === "Cards show key, points");
    // The Python mirror
    const py = spawnSync("python3", ["-I", "-c", `import importlib.util, json, sys; sp = importlib.util.spec_from_file_location('s', sys.argv[1]); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
ids = {"bar": set(), "lane": set()}
print(json.dumps({"fields": m.CARD_LAYOUT_FIELDS, "density": m.CARD_DENSITY, "max": m.HIDE_REASON_MAX,
  "bad": m.check_action_op({"op":"action","action":"cards.set","args":{"field":"fields","value":["key","nope"]}}, "c1", ids, {}),
  "good": m.check_action_op({"op":"action","action":"cards.set","args":{"field":"density","value":"compact","prev":"normal"}}, "c1", ids, {}),
  "long": m.check_action_op({"op":"action","action":"jira.hide","args":{"keys":["ABC-1"],"why":"x"*201}}, "c1", ids, {}),
  "hide": m.check_action_op({"op":"action","action":"jira.hide","args":{"keys":["ABC-1"],"why":"ok"}}, "c1", ids, {})}))`, SYNC], {encoding:"utf8"});
    const P = py.status === 0 ? JSON.parse(py.stdout) : {};
    ok("Y1 the checker has the page's card fields and densities", JSON.stringify(P.fields) === JSON.stringify(J("CARD_LAYOUT_FIELDS.map(x=>x[0])")) && JSON.stringify(P.density) === JSON.stringify(J("CARD_DENSITY.map(x=>x[0])")) && P.max === ev("HIDE_REASON_MAX"), py.stderr.slice(0, 200));
    ok("Y2 …and checks cards.set and jira.hide the same way", /nope isn't a card field/.test(P.bad) && P.good === "" && /up to 200 characters/.test(P.long) && P.hide === "", JSON.stringify(P));
    // 2,000 cards
    ev(`(()=>{ const kids = []; for (let i = 0; i < 2000; i++){ const k = 'ABC-' + (1000 + i); kids.push(k); JIRA.issues[k] = {summary:'Load story ' + i, status:['To Do','In Progress','Done'][i % 3], category:['todo','inprogress','done'][i % 3], type:'Story', points:i % 8, sprint:'Sprint 1', sprintId:11, sprintStart:'2026-10-05', sprintEnd:'2026-10-16', sprintState:'active'}; } JIRA.rollups['ABC-100'].children.push(...kids); dropJiraMemos(); })()`);
    const t0 = Date.now(); ev("renderCardsWs()"); const ms = Date.now() - t0;
    ok("Z1 2,000 more cards draw in under 3 seconds here", d.querySelectorAll("#cardsWs .cvcard").length >= 2000 && ms < 3000, `${ms} ms, ${d.querySelectorAll("#cardsWs .cvcard").length} cards`);
    ok("Z2 no errors on the way", !J("errs").length, J("errs").join(" | "));
  } catch(e){ ok("no crash", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
