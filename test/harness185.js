// History files (vision.md, The plan and its history): one file per calendar quarter in history/<planId>/ beside the
// plan. These checks cover the store on its own, in a stand-in folder: which quarter an entry goes in, reading a file
// without guessing, merging two copies without writing over either, splitting a big quarter, and writing with a read-back.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
// An in-memory folder with the parts of the File System Access API the store uses. writes counts every file written.
const FAKE = `window.mkDir = (name = "team") => { const kids = new Map(), stats = {writes:0};
  const nf = n => { const e = new Error(n + " not found"); e.name = "NotFoundError"; return e; };
  const fileH = (n, rec) => ({kind:"file", name:n, getFile: async () => ({size:new Blob([rec.text]).size, text: async () => rec.text}),
    createWritable: async () => { let buf = ""; return {write: async t => { buf += t; }, close: async () => { rec.text = buf; stats.writes++; if (window.onClose) window.onClose(n); }}; }});
  const dirH = (n, map) => ({kind:"directory", name:n, kids:map, stats,
    getDirectoryHandle: async (k, o) => { let v = map.get(k); if (!v){ if (!(o && o.create)) throw nf(k); v = {dir:new Map()}; map.set(k, v); } if (!v.dir) throw new Error(k + " is a file"); return dirH(k, v.dir); },
    getFileHandle: async (k, o) => { let v = map.get(k); if (!v){ if (!(o && o.create)) throw nf(k); v = {text:""}; map.set(k, v); } if (v.dir) throw new Error(k + " is a folder"); return fileH(k, v); }});
  return dirH(name, kids); };
  window.filesIn = (dir, planId) => { const h = dir.kids.get("history"); const p = h && h.dir.get(planId); return p ? Object.fromEntries([...p.dir].map(([k, v])=>[k, v.text])) : null; };
  window.putFile = (dir, planId, name, text) => { if (!dir.kids.get("history")) dir.kids.set("history", {dir:new Map()}); const h = dir.kids.get("history").dir; if (!h.get(planId)) h.set(planId, {dir:new Map()}); h.get(planId).dir.set(name, {text}); };`;
(async()=>{
  try {
    const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
      w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>""; w.Element.prototype.scrollIntoView = ()=>{};
      w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
    const w = dom.window; await wait(150); w.FIX = FIX;
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    const A = async s => { try { return await w.eval(s); } catch(e){ return "ERR " + e.message; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; render();`); await wait(20);
    X(FAKE);
    X(`window.P = "p-hist01"; window.up = (id, at, text, ed) => ({id, item:"x", at, by:"avery", text, ...(ed ? {edited:{by:"blake", at:ed}} : {})});`);

    const qs = X(`["2026-03-31T23:59:59Z","2026-04-01T00:00:00Z","2026-04-01T01:00:00+02:00","2026-12-31T23:00:00-05:00","nope","",null].map(histQuarter)`);
    ok("H1 an entry's quarter comes from its own date in UTC, the same on every copy; a bad date has none", JSON.stringify(qs) === JSON.stringify(["2026-Q1","2026-Q2","2026-Q1","2027-Q1","","",""]), JSON.stringify(qs));

    const g = X(`JSON.stringify(histGroup({snapshots:[{id:"s1", takenAt:"2026-02-01T00:00:00Z"}], reports:[{id:"r1", at:"2026-05-01T00:00:00Z"}],
      updates:[up("u1","2026-02-03T00:00:00Z","a"), up("u2","bad","b"), {id:"__proto__", at:"2026-02-03T00:00:00Z"}], changes:[{id:"c1", at:"2026-08-09T00:00:00Z"}]}))`);
    ok("H2 history already in a plan sorts into quarters; an entry with no valid date or a bad id stays out", g === JSON.stringify({"2026-Q1":{snapshots:[{id:"s1",takenAt:"2026-02-01T00:00:00Z"}],reports:[],updates:[X(`up("u1","2026-02-03T00:00:00Z","a")`)],changes:[]},"2026-Q2":{snapshots:[],reports:[{id:"r1",at:"2026-05-01T00:00:00Z"}],updates:[],changes:[]},"2026-Q3":{snapshots:[],reports:[],updates:[],changes:[{id:"c1",at:"2026-08-09T00:00:00Z"}]}}), g);

    const refuse = X(`(()=>{ const good = {sightlineHistory:1, planId:P, quarter:"2026-Q1", updates:[]}, why = t => { try { histParse(t, P, "2026-Q1"); return "read"; } catch(e){ return e.message; } };
      return [why("{nope"), why("[]"), why(JSON.stringify({...good, sightlineHistory:2})), why(JSON.stringify({...good, planId:"p-other"})), why(JSON.stringify({...good, quarter:"2026-Q2"})), why(JSON.stringify({planId:P, quarter:"2026-Q1"})), why(JSON.stringify(good))]; })()`);
    ok("H3 a file that isn't JSON, a newer format, another plan's file or another quarter's is refused with the reason, never guessed at", Array.isArray(refuse) && refuse[0] === "it isn't valid JSON" && refuse[1] === "it isn't a Sightline history file" && refuse[2] === "a newer copy of Sightline wrote it" && refuse[3] === "it belongs to another plan" && /for 2026-Q2, not 2026-Q1/.test(refuse[4]) && refuse[5] === "it isn't a Sightline history file" && refuse[6] === "read", JSON.stringify(refuse));
    const cleaned = X(`(()=>{ const f = histParse(JSON.stringify({sightlineHistory:1, planId:P, quarter:"2026-Q1", updates:[up("u1","2026-01-05T00:00:00Z","a"), up("u1","2026-01-06T00:00:00Z","dup"), up("u2","2026-04-05T00:00:00Z","next quarter"), up("constructor","2026-01-05T00:00:00Z","x"), "text", null, [1]],
      removed:{u9:{by:"avery", at:"2026-01-07T00:00:00Z"}, __proto__x:{at:"bad"}, "bad id":{at:"2026-01-07T00:00:00Z"}}}), P, "2026-Q1"); return [f.updates.map(x=>x.text).join(","), Object.keys(f.removed).join(","), Object.getPrototypeOf(f.removed) === Object.prototype]; })()`);
    ok("H4 a read keeps only good entries for that quarter: no repeats, no other quarter's, no odd ids; removals need a date", Array.isArray(cleaned) && cleaned[0] === "a" && cleaned[1] === "u9" && cleaned[2] === true, JSON.stringify(cleaned));

    const m = X(`(()=>{ const T = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","theirs"), up("u2","2026-01-06T00:00:00Z","their edit","2026-01-09T00:00:00Z"), up("u3","2026-01-07T00:00:00Z","only theirs")]},
      M = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine, same id, no edit"), up("u2","2026-01-06T00:00:00Z","my older edit","2026-01-08T00:00:00Z"), up("u4","2026-01-04T00:00:00Z","only mine"), up("u5","2026-01-08T00:00:00Z","mine, newer edit","2026-01-10T00:00:00Z")], removed:{u3:{by:"avery", at:"2026-01-10T00:00:00Z"}}};
      T.updates.push(up("u5","2026-01-08T00:00:00Z","theirs, older edit","2026-01-09T00:00:00Z"));
      const a = histMerge(T, M), b = histMerge(histMerge(T, M), T); return [a.updates.map(x=>x.id + ":" + x.text).join(" | "), Object.keys(a.removed).join(","), JSON.stringify(a) === JSON.stringify(b)]; })()`);
    ok("H5 merging keeps both sides' entries, a teammate's on a tie, an edit only when it's newer, oldest first", Array.isArray(m) && m[0] === "u4:only mine | u1:theirs | u2:their edit | u5:mine, newer edit", m && m[0]);
    ok("H6 a removal takes the entry out and stays with the file, so merging the teammate's copy again doesn't bring it back", Array.isArray(m) && m[1] === "u3" && !/only theirs/.test(m[0]) && m[2] === true, JSON.stringify(m));

    const split = X(`(()=>{ const f = histEmpty(P, "2026-Q3"), pad = "x".repeat(3000);
      for (let i = 0; i < 1500; i++) f.updates.push(up("u" + i, new Date(Date.UTC(2026, 6, 1) + i * 60000).toISOString(), pad));
      const parts = histParts(f), back = parts.map(t=>histParse(t, P, "2026-Q3")).reduce((a, b)=>histMerge(a, b));
      return [parts.length, Math.max(...parts.map(t=>new Blob([t]).size)) <= MAX_BYTES, parts.every(t=>valueCount(JSON.parse(t)) <= MAX_NODES), back.updates.length, back.updates[0].id, back.updates[1499].id]; })()`);
    ok("H7 a big quarter splits into parts that each fit the plan's write limits, and reading them all back gives every entry in order", Array.isArray(split) && split[0] >= 3 && split[1] && split[2] && split[3] === 1500 && split[4] === "u0" && split[5] === "u1499", JSON.stringify(split));
    const huge = X(`(()=>{ try { histParts({...histEmpty(P, "2026-Q3"), snapshots:[{id:"s1", takenAt:"2026-07-01T00:00:00Z", name:"x".repeat(6 * 1024 * 1024)}]}); return "split"; } catch(e){ return e.message; } })()`);
    ok("H8 one entry bigger than a history file can be read back with is refused, not written", /snapshot entry from 2026-Q3 is too large/.test(huge), huge);

    X(`window.D = mkDir();`);
    const noCreate = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","a")]})`);
    ok("H9 a quarter with no file isn't started unless the caller asks to, and nothing is written", noCreate && /no history file for 2026-Q1/.test(noCreate.error) && X(`filesIn(D, P)`) === null && X(`D.stats.writes`) === 0, JSON.stringify(noCreate));
    const made = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","a")]}, {create:true})`);
    const read1 = await A(`HistoryStore.read(D, P, "2026-Q1").then(r=>[Object.keys(r.texts).join(","), r.file.updates.map(x=>x.text).join(",")])`);
    ok("H10 asked to, it starts history/<planId>/2026-Q1.json, and reading it back gives the entry", made && made.ok && Array.isArray(read1) && read1[0] === "2026-Q1.json" && read1[1] === "a" && Object.keys(X(`filesIn(D, P)`)).join() === "2026-Q1.json", JSON.stringify([made, read1]));
    const missing = await A(`Promise.all([HistoryStore.read(D, P, "2025-Q4"), HistoryStore.read(D, "p-nofolder", "2026-Q1"), HistoryStore.read(D, P, "2026-Q5")])`);
    ok("H11 a quarter or plan with no files reads as missing, not as empty history; a bad quarter is an error", Array.isArray(missing) && missing[0].missing && missing[1].missing && /isn't a quarter/.test(missing[2].error), JSON.stringify(missing));

    X(`putFile(D, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","a"), up("t1","2026-01-06T00:00:00Z","a teammate's")]}) + "\\n");`);
    const w0 = X(`D.stats.writes`);
    const merged = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u2","2026-01-07T00:00:00Z","mine")]}).then(r=>r.file.updates.map(x=>x.id).join(","))`);
    ok("H12 a write merges with what the file has now, so a teammate's entry saved meanwhile is kept", merged === "u1,t1,u2" && X(`D.stats.writes`) === w0 + 1, merged);
    const w1 = X(`D.stats.writes`);
    const same = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u2","2026-01-07T00:00:00Z","mine")]})`);
    ok("H13 a write that changes nothing writes no file", same && same.ok && X(`D.stats.writes`) === w1, JSON.stringify([w1, X(`D.stats.writes`)]));

    X(`putFile(D, P, "2026-Q2.json", "{not json");`);
    const bad = await A(`HistoryStore.write(D, P, "2026-Q2", {...histEmpty(P, "2026-Q2"), updates:[up("u7","2026-04-07T00:00:00Z","mine")]}, {create:true})`);
    ok("H14 a quarter whose file can't be read is never written, even when asked to start one: the file stays as it was", bad && /2026-Q2.json can't be used: it isn't valid JSON/.test(bad.error) && X(`filesIn(D, P)["2026-Q2.json"]`) === "{not json", JSON.stringify(bad));
    X(`putFile(D, P, "2026-Q2.json", JSON.stringify({...histEmpty(P, "2026-Q2"), sightlineHistory:2}));`);
    const newer = await A(`HistoryStore.write(D, P, "2026-Q2", {...histEmpty(P, "2026-Q2"), updates:[up("u7","2026-04-07T00:00:00Z","mine")]}, {create:true})`);
    ok("H15 a quarter written by a newer copy is never written over", newer && /newer copy of Sightline/.test(newer.error) && /"sightlineHistory":2/.test(X(`filesIn(D, P)["2026-Q2.json"]`)), JSON.stringify(newer));
    X(`putFile(D, P, "2026-Q2.json", JSON.stringify(histEmpty(P, "2026-Q2"))); putFile(D, P, "2026-Q2.2.json", "garbage");`);
    const badPart = await A(`HistoryStore.write(D, P, "2026-Q2", {...histEmpty(P, "2026-Q2"), updates:[up("u7","2026-04-07T00:00:00Z","mine")]})`);
    ok("H16 one unreadable part stops the whole quarter, so no part is written from half a quarter", badPart && /2026-Q2.2.json can't be used/.test(badPart.error) && X(`filesIn(D, P)["2026-Q2.2.json"]`) === "garbage", JSON.stringify(badPart));

    // A teammate's save lands between our write and our read-back, written from a copy that hadn't seen ours.
    X(`window.D2 = mkDir(); putFile(D2, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("t1","2026-01-02T00:00:00Z","theirs")]}));
      window.raced = 0; window.onClose = n => { if (raced++ === 0) putFile(D2, P, n, JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("t1","2026-01-02T00:00:00Z","theirs"), up("t2","2026-01-03T00:00:00Z","theirs too")]})); };`);
    const race = await A(`HistoryStore.write(D2, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine")]}).then(r=>[r.ok, r.file && r.file.updates.map(x=>x.id).join(",")])`);
    X(`window.onClose = null;`);
    const after = await A(`HistoryStore.read(D2, P, "2026-Q1").then(r=>r.file.updates.map(x=>x.id).join(","))`);
    ok("H17 when a teammate's write crosses ours, the read-back sees our entry missing and writes again, keeping both", Array.isArray(race) && race[0] === true && after === "t1,t2,u1", JSON.stringify([race, after]));

    X(`window.raced = 0; window.onClose = n => { if (raced++ === 0) putFile(D2, P, n, JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("t1","2026-01-02T00:00:00Z","theirs"), up("t2","2026-01-03T00:00:00Z","theirs too"), up("u1","2026-01-05T00:00:00Z","mine")]})); };`);
    const rmRace = await A(`HistoryStore.write(D2, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), removed:{t2:{by:"avery", at:"2026-01-08T00:00:00Z"}}}).then(r=>r.ok)`);
    X(`window.onClose = null;`);
    const afterRm = await A(`HistoryStore.read(D2, P, "2026-Q1").then(r=>[r.file.updates.map(x=>x.id).join(","), Object.keys(r.file.removed).join(",")])`);
    ok("H17b a removal that a crossing write lost is written again, so the entry stays removed", rmRace === true && Array.isArray(afterRm) && afterRm[0] === "t1,u1" && afterRm[1] === "t2", JSON.stringify([rmRace, afterRm]));

    // Shrinking: a quarter that needed two parts and now needs one empties the second part instead of deleting it.
    X(`window.D3 = mkDir(); window.big = histEmpty(P, "2026-Q3"); for (let i = 0; i < 900; i++) big.updates.push(up("u" + i, new Date(Date.UTC(2026, 6, 1) + i * 60000).toISOString(), "x".repeat(3000)));`);
    await A(`HistoryStore.write(D3, P, "2026-Q3", big, {create:true})`);
    const n2 = Object.keys(X(`filesIn(D3, P)`)).length;
    X(`window.rm = histEmpty(P, "2026-Q3"); for (let i = 0; i < 899; i++) rm.removed["u" + i] = {by:"avery", at:"2026-09-01T00:00:00Z"};`);
    const shrink = await A(`HistoryStore.write(D3, P, "2026-Q3", rm).then(r=>r.file.updates.map(x=>x.id).join(","))`);
    const files3 = X(`Object.entries(filesIn(D3, P)).map(([k, t])=>k + ":" + JSON.parse(t).updates.length).join(" ")`);
    ok("H18 a quarter that shrinks empties the parts it no longer needs rather than deleting files, and removals stay recorded", n2 >= 2 && shrink === "u899" && files3.split(" ").length === n2 && files3.split(" ").slice(1).every(x=>/:0$/.test(x)) && X(`Object.keys(JSON.parse(filesIn(D3, P)["2026-Q3.json"]).removed).length`) === 899, `${n2} parts; ${files3}`);

    const noId = await A(`HistoryStore.write(D, "", "2026-Q1", histEmpty("", "2026-Q1"), {create:true}).catch(e=>({thrown:e.message}))`);
    ok("H19 a plan with no id never gets a history folder", noId && /no id/.test(noId.thrown || noId.error || "") && !X(`D.kids.get("history").dir.has("")`), JSON.stringify(noId));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
