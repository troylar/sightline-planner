// Old captures on Today: in the Team view, captures open over 30 days are listed under Waiting in triage, oldest first,
// and counted in Needs attention. Younger ones, closed ones and ones with no added date aren't. Mine doesn't list them,
// and the sidebar badge (urgent work only) doesn't count them. Fixed clock (Wed Oct 7, 2026); invented captures.
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
  const w = dom.window, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  try {
    await wait(150); w.FIX = FIX;
    const cap = (id, name, added, extra) => ({id, name, stage:"idea", capture:"request", raised:added ? added.slice(0, 10) : "", ...(added ? {added:{by:"", at:added}} : {}), ...extra});
    w.CAPS = [cap("k-old", "Export the plan as a spreadsheet", "2026-08-20T10:00:00Z", {source:"Platform review"}),
      cap("k-older", "Show holidays from the team calendar", "2026-07-01T10:00:00Z"),
      cap("k-new", "Dark mode for Present", "2026-09-30T10:00:00Z"),
      cap("k-closed", "A gantt export", "2026-07-15T10:00:00Z", {stage:"dropped", dropReason:"Covered by another request"}),
      cap("k-nodate", "Bigger fonts in Present")];
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); const p = JSON.parse(FIX); p.deliverables = (p.deliverables || []).concat(CAPS);
        S = normalize(p, false); S.deliverables.filter(d=>d.id.startsWith("k-")).forEach(d=>{ const c = CAPS.find(x=>x.id === d.id); if (c.added) d.added = c.added; else delete d.added; });
        file.handle = null; UI.todayScope = "team"; goWs("today"); render();`); await wait(30);
    ok("C0 the setup: the captures are in the plan, open or declined as written", T(`["k-old","k-older","k-new","k-closed","k-nodate"].map(id=>capOpen(S.deliverables.find(d=>d.id === id)))`)?.join() === "true,true,true,false,true");
    const sec = $('#today [data-tsec="Waiting in triage"]');
    const rows = sec ? [...sec.querySelectorAll("li")].map(li=>li.dataset.tkey) : [];
    ok("C1 Team lists only open captures over 30 days, oldest first", JSON.stringify(rows) === '["capture:k-older","capture:k-old"]', JSON.stringify(rows));
    const row = sec && sec.querySelector('[data-tkey="capture:k-old"]');
    ok("C2 a row says what it is, who asked and how long it's been open", !!row && /Export the plan as a spreadsheet/.test(row.textContent) && /Request/.test(row.textContent) && /asked by: not known/.test(row.textContent) && /Platform review/.test(row.textContent) && /Platform review · open 48 days/.test(row.querySelector("small")?.textContent || ""), row && row.textContent);
    const order = $$("#today .tcol:first-child .tsec").map(x=>x.dataset.tsec);
    ok("C2b it's the last work section, after what's due this week", order[order.length - 1] === "Waiting in triage" && order.indexOf("Due in the next 3 working days") === order.length - 2, JSON.stringify(order));
    const chip = $('#todaySum [data-tchip="Waiting in triage"]');
    ok("C3 Needs attention counts them, and the count jumps to the list", chip && chip.textContent === "2 waiting in triage", chip && chip.textContent);
    ok("C4 the sidebar badge stays urgent work only", T(`todayCounts()`) === T(`(()=>{ const d = todayData(); return d.blocked.length + d.late.length + d.stale.length + d.escalate.length; })()`));
    const tb = [...sec.querySelectorAll('[data-tkey="capture:k-older"] .tacts button')];
    ok("C5a each row has one Triage button, like the rest of Today", tb.length === 1 && tb[0].textContent === "Triage");
    tb[0].click(); await wait(30);
    ok("C5 Triage opens it in To triage on the Roadmap", J(`UI.ws`) === "roadmap" && J(`UI.rmTriage`) === true && J(`sel`)?.type === "deliverable" && J(`sel`)?.id === "k-older" && !!$("#rmTriage"), `${J(`UI.ws`)} ${JSON.stringify(J(`sel`))}`);
    ev(`setMe(S.people[0].id); UI.todayScope = "me"; goWs("today"); render();`); await wait(30);
    ok("C6 Mine doesn't list them", J(`todayScope()`) === "me" && !$('#today [data-tsec="Waiting in triage"]') && !$('#todaySum [data-tchip="Waiting in triage"]'));
    ev(`UI.todayScope = "team"; S.deliverables = S.deliverables.filter(d=>!["k-old","k-older"].includes(d.id)); render();`); await wait(30);
    ok("C7 with none that old, the section goes and the all-clear line names it", !$('#today [data-tsec="Waiting in triage"]') && /waiting in triage for over 30 days/.test($("#today .tclear")?.textContent || ""), $("#today .tclear")?.textContent);
    ok("E1 no page errors", !J("errs").length, J("errs").join("; "));
  } catch(e){ R.push("FAIL  harness threw: " + e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length;
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
