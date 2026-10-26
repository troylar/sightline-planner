// Captures by asker, and a meeting recap (vision.md: computed from the plan, nothing new is saved). By asker lists
// everything each person or group raised (first ask or raised again), open first, with what became of the rest and a
// plain-text note to send back that names no one else. The recap says what's new, raised again, closed and reopened
// since a day (the last meeting by default), leaves out who asked unless asked, and says when the change log can't
// reach back that far. Fixed clock; the sample plan. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const HOSTILE = '<img src=x onerror="window.pwned=1"> Support desk';
(async()=>{
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ if (!this.open) return; this.open = false; this.dispatchEvent(new w.Event("close")); };
    Object.defineProperty(w.navigator, "clipboard", {value:{writeText:t=>{ w.copied = t; return Promise.resolve(); }}, configurable:true});
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  const T = s => { try { return J(s); } catch(e){ return undefined; } };
  const q = s => d.querySelector(s), txt = s => (q(s) || {}).textContent || "";
  try {
    await wait(150); w.FIX = FIX;
    ev(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false);
        S.groups = [{id:'grp-support', name:${JSON.stringify(HOSTILE)}, members:[]}, {id:'grp-sales', name:'Sales engineers', members:[]}]; render();`);
    const pa = J("S.people[0].id"), pn = J("S.people[0].name"), bar = J("S.bars[0].id");
    const st = at => ({by:pa, at});
    ev(`S.meetings = [{id:'mt-1', title:'Weekly sync', date:'2026-09-23'}, {id:'mt-2', title:'Weekly sync', date:'2026-09-30'}, {id:'mt-3', title:'Weekly sync', date:'2026-10-14'}].map(m=>({...m, lane:'', time:''}));
      S.deliverables = [
        {id:'dv-a', name:'Release notes for partner teams', stage:'idea', capture:'request', askedBy:{type:'group', id:'grp-support'}, raised:'2026-08-20', added:${JSON.stringify(st("2026-08-20T10:00:00Z"))},
          raisedAgain:[{id:'ask-1', who:{type:'group', id:'grp-sales'}, raised:'2026-10-02', source:'Partner review'}]},
        {id:'dv-b', name:'Who signs off a weekend release?', stage:'idea', capture:'question', askedBy:{type:'group', id:'grp-support'}, added:${JSON.stringify(st("2026-10-01T10:00:00Z"))}},
        {id:'dv-c', name:'Shared test accounts\\nfor partners', stage:'idea', capture:'idea', askedBy:{type:'person', id:${JSON.stringify(pa)}}, added:${JSON.stringify(st("2026-09-10T10:00:00Z"))}, handoff:{to:'initiative', id:${JSON.stringify(bar)}}},
        {id:'dv-d', name:'Rollback runbook', stage:'dropped', capture:'gap', dropReason:'Covered by the incident guide', askedBy:{type:'group', id:'grp-support'}, added:${JSON.stringify(st("2026-09-01T10:00:00Z"))}},
        {id:'dv-e', name:'On-call handoff gap', stage:'idea', capture:'gap', added:${JSON.stringify(st("2026-09-02T10:00:00Z"))}},
        {id:'dv-road', name:'An ordinary roadmap idea', stage:'idea'}];
      S.changes = [{id:'chg-1', by:${JSON.stringify(pa)}, at:'2026-10-03T10:00:00Z', what:'handed off', ops:[{op:'set', type:'deliverables', id:'dv-c', field:'handoff', value:{to:'initiative', id:${JSON.stringify(bar)}}}]},
        {id:'chg-2', by:${JSON.stringify(pa)}, at:'2026-10-04T10:00:00Z', what:'declined', ops:[{op:'set', type:'deliverables', id:'dv-d', field:'stage', value:'dropped'}]},
        {id:'chg-3', by:${JSON.stringify(pa)}, at:'2026-10-05T10:00:00Z', what:'reopened', ops:[{op:'set', type:'deliverables', id:'dv-e', field:'stage', value:'idea'}]},
        {id:'chg-0', by:${JSON.stringify(pa)}, at:'2026-09-20T10:00:00Z', what:'old', ops:[{op:'set', type:'deliverables', id:'dv-a', field:'stage', value:'idea'}]}];
      goWs('roadmap'); UI.rmTriage = true; UI.triBy = 'lane'; render();`); await wait(10);

    // By asker.
    const tb = q("#triBy-asker"); if (tb) tb.click(); await wait(10);
    const groups = [...d.querySelectorAll("#rmTriage .capgroup[data-asker]")].map(g=>g.dataset.asker), inG = k => [...d.querySelectorAll(`#rmTriage .capgroup[data-asker="${k}"] li[data-cap]`)].map(x=>x.dataset.cap);
    ok("B1 By asker groups captures by who raised them, most still open first, fully closed after, Not known last, and remembers the choice", groups.join() === `group:grp-support,group:grp-sales,person:${pa},none` && T("UI.triBy") === "asker"
      && d.activeElement === q("#triBy-asker") && q("#triBy-asker").getAttribute("aria-pressed") === "true", groups.join());
    ok("B2 a capture raised again by someone else shows under them too, and roadmap items never show", inG("group:grp-sales").join() === "dv-a" && inG("group:grp-support").includes("dv-a")
      && !d.querySelector('#rmTriage [data-cap="dv-road"]'), inG("group:grp-sales").join());
    const sup = inG("group:grp-support");
    ok("B3 each asker's list puts open ones first, then says what became of the rest", sup.join() === "dv-a,dv-b,dv-d" && /3 open|2 open, 1 closed/.test(txt('#rmTriage .capgroup[data-asker="group:grp-support"] h4'))
      && /declined: Covered by the incident guide/.test(txt('#rmTriage .capgroup[data-asker="group:grp-support"] [data-cap="dv-d"]'))
      && /handed off to/.test(txt(`#rmTriage .capgroup[data-asker="person:${pa}"] [data-cap="dv-c"]`)), txt('#rmTriage .capgroup[data-asker="group:grp-support"] h4'));
    ok("B4 a hostile group name is text, not markup", !q("#rmTriage img") && !w.pwned && txt('#rmTriage .capgroup[data-asker="group:grp-support"] h4').includes("<img"));
    const cb = q('#rmTriage .capgroup[data-asker="group:grp-sales"] .capnote'); w.copied = ""; if (cb) cb.click(); await wait(20);
    const note = String(w.copied || "");
    ok("B5 Copy a note for them copies plain text: each thing they raised and where it stands, naming no one else", /^Where the things you raised stand \(Oct 7, 2026\):/.test(note) && /- Release notes for partner teams: waiting for triage/.test(note)
      && !/Support desk|img/.test(note) && /Copied a note for Sales engineers/.test(txt("#status")), JSON.stringify(note));
    const cc = q(`#rmTriage .capgroup[data-asker="person:${pa}"] .capnote`); w.copied = ""; if (cc) cc.click(); await wait(20);
    ok("B6 a line break in a name can't start a new line in the note", /- Shared test accounts for partners: handed off to /.test(String(w.copied || "")), JSON.stringify(w.copied));
    ok("B7 nobody to send a note to when the asker isn't known", !!q('#rmTriage .capgroup[data-asker="none"]') && !q('#rmTriage .capgroup[data-asker="none"] .capnote'));
    const tl = q("#triBy-lane"); if (tl) tl.click(); await wait(10);
    ok("B8 By workstream is back to open captures only", !!tl && q("#triBy-lane").getAttribute("aria-pressed") === "true" && T("UI.triBy") === "lane" && !!q("#rmTriage [data-caplane]") && !q("#rmTriage [data-asker]") && !q('#rmTriage [data-cap="dv-d"]'));

    // The meeting recap.
    const rb = q("#rmRecap"); if (rb) rb.focus(), rb.click(); await wait(10);
    ok("R1 Meeting recap opens with Since set to the last meeting before today (not a future one)", q("#dlgRecap") && q("#dlgRecap").open && q("#recapSince").value === "2026-09-30" && !q("#recapNames").checked, q("#recapSince") ? q("#recapSince").value : "no dialog");
    ok("R1b the intro says what Since means", /since the date below, to read out or paste/.test(txt("#dlgRecap .hint")));
    const r1 = txt("#recapText");
    ok("R2 it lists what's new, raised again, closed and reopened since then, and what's still open", /^Captures since Sep 30, 2026/.test(r1) && /New \(1\)\n- Who signs off a weekend release\?/.test(r1)
      && /Raised again \(1\)\n- Release notes for partner teams/.test(r1) && /Closed \(2\)/.test(r1) && /Rollback runbook: declined: Covered by the incident guide/.test(r1)
      && /Reopened \(1\)\n- On-call handoff gap/.test(r1) && /Still open: 3, 2 of them for more than 30 days\./.test(r1), JSON.stringify(r1));
    ok("R3 who asked is left out unless you ask for it", /^Captures since/.test(r1) && !/Support desk|Sales engineers|img/.test(r1) && !r1.includes(pn), JSON.stringify(r1));
    const nm = q("#recapNames"); if (nm){ nm.checked = true; nm.dispatchEvent(new w.Event("change")); } await wait(10);
    const r2 = txt("#recapText");
    ok("R4 Say who asked adds them, as text", /Who signs off a weekend release\? \(<img/.test(r2) && /Release notes for partner teams \(Sales engineers\)/.test(r2) && !q("#recapText img") && !w.pwned, JSON.stringify(r2));
    const si = q("#recapSince"); if (si){ si.value = "2026-10-06"; si.dispatchEvent(new w.Event("change")); } await wait(10);
    ok("R5 a quiet stretch says nothing happened rather than showing empty headings", /Nothing new, raised again, closed or reopened\./.test(txt("#recapText")) && !/New \(/.test(txt("#recapText")));
    if (si){ si.value = "2026-09-01"; si.dispatchEvent(new w.Event("change")); } await wait(10);
    ok("R6 reaching back past the change log says so, and only then", /change log, which keeps 30 days, so they're counted from Sep 7/.test(txt("#recapText")) && !(si && (si.value = "2026-09-30", si.dispatchEvent(new w.Event("change")), /change log/.test(txt("#recapText")))), txt("#recapText").split("\n").slice(-2).join(" "));
    w.copied = ""; const cp = q("#recapCopy"); if (cp) cp.click(); await wait(20);
    ok("R7 Copy the recap copies exactly what's shown", w.copied && w.copied === txt("#recapText") && /Copied the recap/.test(txt("#status")));
    const cl = q("#recapClose"); if (cl) cl.click(); await wait(10);
    ok("R8 Close puts focus back on Meeting recap", !q("#dlgRecap") && d.activeElement && d.activeElement.id === "rmRecap");
    ok("R9 nothing in the plan changed: by asker and the recap are computed, not saved", T("S.deliverables.every(x=>!('triBy' in x))") === true && T("Object.keys(S).includes('recap')") === false && !!T("typeof capRecap === 'function'"));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
