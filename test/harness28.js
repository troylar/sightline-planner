// 1.19 foundation: one storage interface, a pure merge, plans from a newer Sightline open read-only, saves by an older
// copy are noticed, the read cap is 5 MB while writes stay under 2 MB, and undo history is capped by size.
// Each check fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; }}; },
  async queryPermission(){ return "granted"; }, async requestPermission(){ return "granted"; } }; return h; }
async function page(fileText){
  const handle = makeHandle("plan.json", fileText || plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(250);
  const ev = s => w.eval(s);
  w.document.querySelector("#link").click(); await wait(200);
  ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb();");
  return {w, d: w.document, ev, handle};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };

  await sec(async ()=>{ const {ev, handle} = await page();
    await ev("startEditing(false)"); await wait(50);
    ev("commit(s=>{ s.bars[0].label = 'Changed'; })"); await ev("save()"); await wait(50);
    ok("F1: a save stamps which Sightline wrote it", JSON.parse(handle._text).meta.savedWith === ev("APP_VERSION"));
    ok("F1: the storage interface is one seam with a file and a browser backend", ev("typeof FileStore.read === 'function' && typeof FileStore.writeIfUnchanged === 'function' && typeof LocalStore.load === 'function' && activeStore() === FileStore") === true);
    const t0 = handle._text; const r = await ev(`FileStore.writeIfUnchanged(file.handle, ${JSON.stringify("not what's there")}, "x")`);
    ok("F1: it refuses to write over a file that changed since it was read", r === "changed" && handle._text === t0); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.features = ["someFutureThing"]; j.meta.savedWith = "9.0.0";
    const {d, ev} = await page(JSON.stringify(j));
    ok("N1: a plan with a part this copy doesn't know opens read-only", ev("editable()") === false && !!ev("tooNew()"));
    ok("N1: and says why", /saved by Sightline 9\.0\.0/.test(d.querySelector("#banners").textContent), d.querySelector("#banners").textContent.slice(0,120));
    const r = await ev("quickSave('x', s=>{ s.bars[0].label = 'y'; })");
    ok("N1: quick updates are refused too, so nothing is saved over what it can't see", r === false); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.schema = 99;
    const {ev} = await page(JSON.stringify(j));
    ok("N2: so is a plan with a newer format", ev("editable()") === false && ev("S.meta.schema") === 99); });

  await sec(async ()=>{ const j = JSON.parse(plan); j.meta.savedWith = "1.19.0";
    const {d, ev, handle} = await page(JSON.stringify(j, null, 2));
    const older = JSON.parse(handle._text); delete older.meta.savedWith; older.meta.revision = (older.meta.revision || 0) + 1; handle._text = JSON.stringify(older, null, 2);
    await ev("refresh(true)"); await wait(60);
    ok("O1: when an older copy saves over the plan, the page says so", /older copy of Sightline/.test(d.querySelector("#banners").textContent), d.querySelector("#banners").textContent.slice(0,160)); });

  await sec(async ()=>{ const {ev} = await page();
    const big = JSON.parse(plan); big.notes = Array.from({length:1800}, (_, i)=>({id:"n" + i, lane:big.lanes[0].id, date:big.meta.start, text:"x".repeat(1500), author:"", color:"yellow"}));
    const txt = JSON.stringify(big); ev(`window.BIG = ${JSON.stringify(txt)}`);
    ok("C1: a plan between 2 and 5 MB can be opened", txt.length > 2.2e6 && ev("(()=>{ try { return parseText(BIG).notes.length > 0; } catch(e){ return e.message; } })()") === true);
    ok("C1: but saving stays under 2 MB, so every copy can open it", !!ev("overLimit(BIG)")); });

  // Under 2 MB but more values than a reader accepts (MAX_NODES): a save must refuse it, or nobody can open the plan again.
  const VC = `window.__vc = v => { let n = 0; (function walk(x){ n++; if (x && typeof x === "object") for (const k of Object.keys(x)) walk(x[k]); })(v); return n; }`;   // counted here, so the check runs on older builds too
  const snapsOf = n => `(n => ({id:"snap" + n, name:"Review " + n, takenAt:new Date().toISOString(), by:"", base:{}, info:{b:Object.fromEntries(Array.from({length:n}, (_, i)=>["x" + i, ["Item " + i, "2026-10-01", "2026-10-09", "done", "", 0]])), t:{}, m:{}, dv:{}}}))`;
  await sec(async ()=>{ const {d, ev, handle} = await page();
    ev(VC); await ev("startEditing(false)"); await wait(30);
    ev(`commit(s=>{ const mk = ${snapsOf()}; s.snapshots = [mk(4600), mk(4601)]; s.snapshots[1].id = "snap-b"; })`);
    const w0 = handle.writes, size = ev(`new Blob([serialize(planOfRecord(S), "plan.json")]).size`), values = ev("__vc(portablePlan(planOfRecord(S)))");
    await ev("save()"); await wait(50);
    const st = d.querySelector("#status")?.textContent || "";
    ok("C2: a plan under 2 MB with more entries than a reader accepts isn't saved", size < ev("MAX_BYTES") && values > ev("MAX_NODES") && handle.writes === w0, `${size} bytes, ${values} values, ${handle.writes - w0} writes`);
    ok("C2: so the file on disk still opens", ev(`(()=>{ try { parseText(${JSON.stringify(handle._text)}); return true; } catch(e){ return e.message; } })()`) === true);
    ok("C2: and the page says why, naming what takes the room", /more than 60,000 entries/.test(st) && /snapshots/.test(st), st.slice(0, 200));
    ev(`UI.planTab = "activity"; setWs("plan"); render();`); await wait(10);
    const t = d.querySelector("#planSize")?.textContent || "";
    ok("C3: the plan-size readout counts entries when that's the closer limit", /Plan file: [\d,]+ of 60,000 entries/.test(t) && /Snapshots [\d,]+ entries/.test(t) && d.querySelector("#planSize").classList.contains("bad"), t.slice(0, 240)); });

  await sec(async ()=>{ const {d, ev, handle} = await page();
    ev(VC); await ev("startEditing(false)"); await wait(30);
    // fill the plan to just under the limit, leaving less room than one more snapshot takes
    const fill = ev(`(()=>{ const one = __vc(snapOf("probe")), base = __vc(portablePlan(planOfRecord(S))), mk = ${snapsOf()};
      const s1 = mk(0), empty = __vc(s1); const n = Math.floor((MAX_NODES - base - empty - Math.floor(one / 2)) / 7);
      commit(s=>{ s.snapshots = [mk(n)]; }); return {one, n, now:__vc(portablePlan(planOfRecord(S)))}; })()`);
    await ev("save()"); await wait(50); const w0 = handle.writes;
    const r = await ev(`saveSnapshot("One more")`); await wait(30); const st = d.querySelector("#status")?.textContent || "";
    ok("C4: a snapshot that would put the plan over the limit isn't taken", r === false && ev("S.snapshots.length") === 1 && /^No snapshot saved: with it, the plan would hold more than 60,000 entries/.test(st) && /try again\.$/.test(st), JSON.stringify(fill) + " " + st.slice(0, 160));
    const unwritten = handle.writes === w0; ev(`commit(s=>{ s.bars[0].label = "Saved after"; })`); await ev("save()"); await wait(40);
    ok("C4: and the plan still saves", unwritten && handle.writes === w0 + 1 && ev(`(()=>{ try { return parseText(file.handle._text).bars[0].label; } catch(e){ return e.message; } })()`) === "Saved after"); });

  // A file right at the limit: marking it as being edited must not push it over.
  await sec(async ()=>{ const probe = await page(); probe.ev(VC);
    const K = 4;   // a snapshot keeps at most 5,000 items, so the filler is spread over four
    const build = (n, hol) => { const j = JSON.parse(plan); j.snapshots = Array.from({length:K}, (_, i)=>({...probe.ev(`(${snapsOf()})(${Math.floor(n / K) + (i < n % K ? 1 : 0)})`), id:"snap-" + i}));
      j.holidays = Array.from({length:hol}, (_, i)=>({date:new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10), name:"h"})); return JSON.stringify(j, null, 2); };
    const count = t => probe.ev(`__vc(portablePlan(parseText(${JSON.stringify(t)})))`);
    const v0 = count(build(0, 0)), want = 59999, d0 = want - v0, h = ((d0 % 7) * 5) % 7, n = (d0 - 3 * h) / 7, text = build(n, h), v = count(text);
    const {d, ev, handle} = await page(text); ev(VC);
    await ev("startEditing(false)"); await wait(50); const st = d.querySelector("#status")?.textContent || "";
    ok("C6: a plan at the limit isn't marked as being edited when the mark would push it over", v === want && handle.writes === 0 && /^Couldn't start editing/.test(st), `${v} entries, ${handle.writes} writes: ${st.slice(0, 140)}`);
    ok("C6: so every copy can still open it", ev(`__vc(JSON.parse(file.handle._text))`) <= 60000); });

  await sec(async ()=>{ const {d, ev} = await page(); ev(VC);
    await ev("startEditing(false)"); await wait(30);
    // room for the snapshot itself, but not for the Activity record the save adds with it
    const fill = ev(`(()=>{ const one = __vc(snapOf("probe")), base = __vc(portablePlan(planOfRecord(S))), mk = ${snapsOf()}, empty = __vc(mk(0));
      const n = Math.floor((MAX_NODES - 64 - base - empty - one - Math.floor(one / 2)) / 7); commit(s=>{ s.snapshots = [mk(n)]; }); return {one, now:__vc(portablePlan(planOfRecord(S)))}; })()`);
    const r = await ev(`saveSnapshot("Edge")`); await wait(30); const st = d.querySelector("#status")?.textContent || "";
    ok("C7: a snapshot is refused when its Activity record would put the save over", r === false && ev("S.snapshots.length") === 1 && /^No snapshot saved/.test(st), JSON.stringify(fill) + " " + st.slice(0, 120)); });

  // A file already over the limit (saved before 1.175.5) can be brought back down: deleting snapshots saves while it shrinks.
  await sec(async ()=>{ const probe = await page();
    const j = JSON.parse(plan); j.snapshots = Array.from({length:6}, (_, i)=>({...probe.ev(`(${snapsOf()})(1700)`), id:"snap-" + i, name:"Review " + i}));
    const {d, ev, handle} = await page(JSON.stringify(j, null, 2)); ev(VC);
    const count = () => ev(`__vc(JSON.parse(file.handle._text))`), del = id => ev(`quickSave("deleted snapshot", s=>{ s.snapshots = (s.snapshots || []).filter(z=>z.id !== "${id}"); })`);
    const c0 = count(); await del("snap-0"); await wait(40); const c1 = count();
    ok("C8: in a plan over the limit, deleting a snapshot saves even though it's still over", c0 > 60000 && c1 > 60000 && c1 < c0 && handle.writes === 1, `${c0} -> ${c1}, ${handle.writes} writes: ${(d.querySelector("#status")?.textContent || "").slice(0, 120)}`);
    await del("snap-1"); await wait(40); const c2 = count();
    await ev("startEditing(false)"); await wait(50);
    ok("C8: and once it fits, editing starts again", c2 <= 60000 && ev("editable()") === true, `${c2} entries: ${(d.querySelector("#status")?.textContent || "").slice(0, 120)}`);
    const before = handle.writes; ev(`commit(s=>{ s.snapshots.push({...s.snapshots[0], id:"grow"}); })`); await ev("save()"); await wait(40);
    ok("C8: a save that grows a plan back over is still refused", handle.writes === before && /more than 60,000 entries/.test(d.querySelector("#status")?.textContent || "")); });

  await sec(async ()=>{ const {ev} = await page();
    const j = JSON.parse(plan); j.notes = Array.from({length:12000}, (_, i)=>({id:"v" + i, lane:j.lanes[0].id, date:j.meta.start, text:"n", author:"", color:"yellow", tags:["a", "b", "c"]}));
    ev(`window.MANY = ${JSON.stringify(JSON.stringify(j))}`);
    ok("C5: a plan with more than 60,000 entries still opens, so a later copy can raise what it writes", ev("(()=>{ try { return parseText(MANY).notes.length; } catch(e){ return e.message; } })()") === 12000);
    ok("C5: and a save still keeps to the old limit", /more than 60,000 entries/.test(ev(`overLimit(serialize(parseText(MANY), "plan.json"))`))); });

  await sec(async ()=>{ const {ev} = await page();
    const r = ev(`(()=>{ const base = clone(S), mine = clone(S), theirs = clone(S);
      mine.bars[0].label = "Mine"; mine.bars[1].label = "Also mine"; theirs.bars[0].label = "Theirs";
      const m = mergePlans(base, mine, theirs); return JSON.stringify([m.plan.bars[0].label, m.plan.bars[1].label, m.kept.length]); })()`);
    ok("M1: the merge is a pure function: a teammate's newer edit wins, my other edits land", r === JSON.stringify(["Theirs", "Also mine", 1]), r); });

  await sec(async ()=>{ const {ev} = await page();
    await ev("startEditing(false)"); await wait(30);
    ev("HISTORY_BYTES = JSON.stringify(S).length * 3.5; for (let i = 0; i < 10; i++) commit(s=>{ s.meta.title = 'T' + i; });");
    ok("H1: undo history stays within its memory budget (older steps kept as change records)", ev("past.reduce((a, x)=>a + histSize(x), 0)") <= ev("HISTORY_BYTES") && ev("past.length") === 10 && ev("past.slice(0, -1).every(x=>typeof x !== 'string')"), String(ev("past.length"))); });

  await sec(async ()=>{ const {w} = await page(); ok("no page errors", !w.errs.length, w.errs.join("; ")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
