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
    createWritable: async () => { let buf = ""; return {write: async t => { if (window.failWrite && window.failWrite(n)){ const e = new Error("not enough space"); e.name = "QuotaExceededError"; throw e; } buf += t; }, abort: async () => {}, close: async () => { rec.text = buf; stats.writes++; if (window.onClose) window.onClose(n); }}; }});
  const dirH = (n, map) => ({kind:"directory", name:n, kids:map, stats,
    values: async function*(){ for (const [k, v] of map) yield v.dir ? {kind:"directory", name:k} : fileH(k, v); },
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
      removed:{u9:{by:"avery", at:"2026-01-07T00:00:00Z"}, __proto__x:{at:"bad"}, "bad id":{at:"2026-01-07T00:00:00Z"}}}), P, "2026-Q1"); return [f.updates.map(x=>x.text).join(","), Object.keys(f.removed).join(","), Object.getPrototypeOf(f.removed) === null]; })()`);
    ok("H4 a read keeps only good entries for that quarter: one copy of an id, no other quarter's, no odd ids; removals need a date and can't reach built-in names", Array.isArray(cleaned) && cleaned[0] === "dup" && cleaned[1] === "u9" && cleaned[2] === true, JSON.stringify(cleaned));

    const m = X(`(()=>{ const T = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","theirs"), up("u2","2026-01-06T00:00:00Z","their edit","2026-01-09T00:00:00Z"), up("u3","2026-01-07T00:00:00Z","only theirs")]},
      M = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine, same id, no edit"), up("u2","2026-01-06T00:00:00Z","my older edit","2026-01-08T00:00:00Z"), up("u4","2026-01-04T00:00:00Z","only mine"), up("u5","2026-01-08T00:00:00Z","mine, newer edit","2026-01-10T00:00:00Z")], removed:{u3:{by:"avery", at:"2026-01-10T00:00:00Z"}}};
      T.updates.push(up("u5","2026-01-08T00:00:00Z","theirs, older edit","2026-01-09T00:00:00Z"));
      const a = histMerge(T, M), b = histMerge(histMerge(T, M), T); return [a.updates.map(x=>x.id + ":" + x.text).join(" | "), Object.keys(a.removed).join(","), JSON.stringify(a) === JSON.stringify(b)]; })()`);
    ok("H5 merging keeps both sides' entries, a teammate's on a tie, an edit only when it's newer, oldest first", Array.isArray(m) && m[0] === "u4:only mine | u1:theirs | u2:their edit | u5:mine, newer edit", m && m[0]);
    ok("H6 a removal takes the entry out and stays with the file, so merging the teammate's copy again doesn't bring it back", Array.isArray(m) && m[1] === "u3" && !/only theirs/.test(m[0]) && m[2] === true, JSON.stringify(m));

    const split = X(`(()=>{ const f = histEmpty(P, "2026-Q3"), pad = "x".repeat(3000);
      for (let i = 0; i < 1500; i++) f.updates.push(up("u" + i, new Date(Date.UTC(2026, 6, 1) + i * 60000).toISOString(), pad));
      const parts = histLayout(f, []), back = parts.map(t=>histParse(t, P, "2026-Q3")).reduce((a, b)=>histMerge(a, b));
      return [parts.length, Math.max(...parts.map(t=>new Blob([t]).size)) <= MAX_BYTES, parts.every(t=>valueCount(JSON.parse(t)) <= MAX_NODES), back.updates.length, back.updates[0].id, back.updates[1499].id]; })()`);
    ok("H7 a big quarter splits into parts that each fit the plan's write limits, and reading them all back gives every entry in order", Array.isArray(split) && split[0] >= 3 && split[1] && split[2] && split[3] === 1500 && split[4] === "u0" && split[5] === "u1499", JSON.stringify(split));
    const huge = X(`(()=>{ try { histLayout({...histEmpty(P, "2026-Q3"), snapshots:[{id:"s1", takenAt:"2026-07-01T00:00:00Z", name:"x".repeat(6 * 1024 * 1024)}]}, []); return "split"; } catch(e){ return e.message; } })()`);
    ok("H8 one entry bigger than a history file can be read back with is refused, not written", /snapshot entry from 2026-Q3 is too large/.test(huge), huge);

    X(`window.D = mkDir();`);
    const noCreate = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","a")]})`);
    ok("H9 a quarter with no file isn't started unless the caller asks to, and nothing is written", noCreate && /no history file for 2026-Q1/.test(noCreate.error) && X(`filesIn(D, P)`) === null && X(`D.stats.writes`) === 0, JSON.stringify(noCreate));
    const made = await A(`HistoryStore.write(D, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","a")]}, {create:true})`);
    const read1 = await A(`HistoryStore.read(D, P, "2026-Q1").then(r=>[Object.keys(filesIn(D, P)).join(","), r.file.updates.map(x=>x.text).join(",")])`);
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

    // Removing almost everything from a quarter that needed two parts: each removal sits in the part its entry was in, and no file is deleted.
    X(`window.D3 = mkDir(); window.big = histEmpty(P, "2026-Q3"); for (let i = 0; i < 900; i++) big.updates.push(up("u" + i, new Date(Date.UTC(2026, 6, 1) + i * 60000).toISOString(), "x".repeat(3000)));`);
    await A(`HistoryStore.write(D3, P, "2026-Q3", big, {create:true})`);
    const n2 = Object.keys(X(`filesIn(D3, P)`)).length;
    X(`window.rm = histEmpty(P, "2026-Q3"); for (let i = 0; i < 899; i++) rm.removed["u" + i] = {by:"avery", at:"2026-09-01T00:00:00Z"};`);
    const shrink = await A(`HistoryStore.write(D3, P, "2026-Q3", rm).then(r=>r.ok && r.file.updates.map(x=>x.id).join(","))`);
    const files3 = X(`Object.entries(filesIn(D3, P)).map(([k, t])=>{ const o = JSON.parse(t); return k + ":" + o.updates.length + "/" + Object.keys(o.removed).length; }).join(" ")`);
    ok("H18 removals sit in the part their entry was in, so each part changes on its own; no file is deleted", n2 >= 2 && shrink === "u899" && files3.split(" ").length === n2 && X(`Object.values(filesIn(D3, P)).reduce((n, t)=>n + Object.keys(JSON.parse(t).removed).length, 0)`) === 899, `${n2} parts; ${files3}`);

    // An edit that a crossing write put back to its older version is noticed and written again.
    X(`window.D4 = mkDir(); putFile(D4, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","old text")]}));
      window.raced = 0; window.onClose = n => { if (raced++ === 0) putFile(D4, P, n, JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","old text")]})); };`);
    const edit = await A(`HistoryStore.write(D4, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","new text","2026-01-09T00:00:00Z")]}).then(r=>r.ok)`);
    X(`window.onClose = null;`);
    const edited = await A(`HistoryStore.read(D4, P, "2026-Q1").then(r=>r.file.updates[0].text)`);
    ok("H20 an edit that a crossing write put back to the older text is written again, not reported saved", edit === true && edited === "new text", JSON.stringify([edit, edited, X(`raced`)]));

    const wrongQ = await A(`HistoryStore.write(D4, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u2","2026-05-05T00:00:00Z","Q2's"), up("toString","2026-01-05T00:00:00Z","odd id")]})`);
    ok("H21 entries that don't belong in that quarter are refused before anything is written", wrongQ && /2 entries don't belong in 2026-Q1/.test(wrongQ.error) && !/Q2's/.test(X(`filesIn(D4, P)["2026-Q1.json"]`)), JSON.stringify(wrongQ));
    const names = await A(`Promise.all([HistoryStore.write(D4, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("toString","2026-01-05T00:00:00Z","odd id")]}),
      HistoryStore.write(D4, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u.valueOf:1","2026-01-05T00:00:00Z","a"), up("hasOwnPropertyX","2026-01-05T00:00:00Z","b")]})]).then(([a, b])=>[a.error || "ok", b.ok && b.file.updates.map(x=>x.id).join(",")])`);
    ok("H22 an id that is a built-in name is refused with a reason, never dropped while reporting saved; ids that only contain one are kept", Array.isArray(names) && /1 entry doesn't belong/.test(names[0]) && /hasOwnPropertyX/.test(names[1]) && /u\.valueOf:1/.test(names[1]), JSON.stringify(names));

    // Many removals and a few entries stay a handful of files, and a quarter that would need too many files is refused whole.
    X(`window.D5 = mkDir(); window.many = histEmpty(P, "2026-Q2"); for (let i = 0; i < 25000; i++) many.removed["gone" + i] = {by:"avery", at:"2026-05-01T00:00:00Z"}; for (let i = 0; i < 300; i++) many.updates.push(up("k" + i, new Date(Date.UTC(2026, 3, 2) + i * 60000).toISOString(), "y".repeat(2000)));`);
    const mres = await A(`HistoryStore.write(D5, P, "2026-Q2", many, {create:true}).then(r=>[r.ok, D5.stats.writes, Object.keys(filesIn(D5, P)).length])`);
    const mback = await A(`HistoryStore.read(D5, P, "2026-Q2").then(r=>[r.file.updates.length, Object.keys(r.file.removed).length])`);
    ok("H23 25,000 removals and 300 entries take a few files and one write each, and all read back", Array.isArray(mres) && mres[0] === true && mres[2] <= 3 && mres[1] === mres[2] && Array.isArray(mback) && mback[0] === 300 && mback[1] === 25000, JSON.stringify([mres, mback]));
    X(`window.D6 = mkDir(); window.huge2 = histEmpty(P, "2026-Q2"); for (let i = 0; i < 101; i++) huge2.snapshots.push({id:"s" + i, takenAt:new Date(Date.UTC(2026, 3, 2) + i * 60000).toISOString(), name:"z".repeat(1900000)});`);
    const tooMany = await A(`HistoryStore.write(D6, P, "2026-Q2", huge2, {create:true})`);
    ok("H24 a quarter that would need more than 100 files is refused before any file is written", tooMany && /more than 100 files/.test(tooMany.error) && X(`D6.stats.writes`) === 0 && X(`filesIn(D6, P)`) === null, JSON.stringify(tooMany).slice(0, 200));

    // A write that fails partway loses nothing: what was in each part is still in some part.
    X(`window.D7 = mkDir(); window.two = histEmpty(P, "2026-Q3"); for (let i = 0; i < 700; i++) two.updates.push(up("v" + String(i).padStart(4, "0"), new Date(Date.UTC(2026, 6, 2) + i * 60000).toISOString(), "w".repeat(3000)));`);
    await A(`HistoryStore.write(D7, P, "2026-Q3", two, {create:true})`);
    X(`window.failWrite = n => n !== "2026-Q3.json";`);
    const fail = await A(`HistoryStore.write(D7, P, "2026-Q3", {...histEmpty(P, "2026-Q3"), updates:[up("early","2026-07-01T00:00:00Z","older than all of them"), ...Array.from({length:400}, (_, i)=>up("n" + i, "2026-09-0" + (1 + i % 9) + "T00:00:00Z", "q".repeat(3000)))]})`);
    X(`window.failWrite = null;`);
    const kept = await A(`HistoryStore.read(D7, P, "2026-Q3").then(r=>r.error || r.file.updates.filter(x=>/^v/.test(x.id)).length)`);
    ok("H25 a write that fails partway says why, and every entry that was saved before is still saved", fail && /couldn't save 2026-Q3's history: not enough space/.test(fail.error) && kept === 700, JSON.stringify([fail, kept]));

    X(`window.D8 = mkDir(); putFile(D8, P, "2026-Q1.json", JSON.stringify(histEmpty(P, "2026-Q1"))); putFile(D8, P, "2026-Q1.3.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("t9","2026-01-02T00:00:00Z","a teammate's third part")]}));`);
    const gap = await A(`Promise.all([HistoryStore.read(D8, P, "2026-Q1"), HistoryStore.write(D8, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine")]})])`);
    ok("H26 a part missing from the middle is named, and nothing is written past it", Array.isArray(gap) && /2026-Q1.2.json is missing/.test(gap[0].error) && /2026-Q1.2.json is missing/.test(gap[1].error) && /third part/.test(X(`filesIn(D8, P)["2026-Q1.3.json"]`)) && !X(`filesIn(D8, P)["2026-Q1.2.json"]`), JSON.stringify(gap));

    const tz = X(`[histQuarter("2026-04-01T00:30:00"), histQuarter("April 1, 2026 00:30"), histQuarter("2026-04-01"), JSON.stringify(histMerge(histEmpty(P, "2026-Q1"), {...histEmpty(P, "2026-Q1"), updates:[up("a","2026-01-01T10:00:00+05:00","5am UTC"), up("b","2026-01-01T06:00:00Z","6am UTC")]}).updates.map(x=>x.id))]`);
    ok("H27 a date without its time zone has no quarter (copies in different zones would disagree), and entries sort by the moment, not the text", Array.isArray(tz) && tz[0] === "" && tz[1] === "" && tz[2] === "" && tz[3] === '["a","b"]', JSON.stringify(tz));

    const order = X(`(()=>{ const A1 = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","one text")], removed:Object.assign(Object.create(null), {r1:{by:"avery", at:"2026-01-06T00:00:00Z"}})},
      B1 = {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","another text")], removed:Object.assign(Object.create(null), {r1:{by:"blake", at:"2026-01-06T00:00:00Z"}})};
      return JSON.stringify(histMerge(A1, B1)) === JSON.stringify(histMerge(B1, A1)); })()`);
    ok("H28 two copies merge to the same result whichever is merged into which, even on a tie", order === true, String(order));
    const dup = X(`histParse(JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-05-01T00:00:00Z","wrong quarter"), up("u1","2026-01-05T00:00:00Z","first"), up("u1","2026-01-05T00:00:00Z","edited","2026-01-08T00:00:00Z")]}), P, "2026-Q1").updates.map(x=>x.text).join(",")`);
    ok("H29 the same id twice in one file keeps its newest edit, and a copy from another quarter doesn't hide the good one", dup === "edited", dup);

    const undo = X(`(()=>{ const was = up("u1","2026-01-05T00:00:00Z","text"), gone = {...histEmpty(P, "2026-Q1"), updates:[was], removed:Object.assign(Object.create(null), {u1:{by:"avery", at:"2026-01-07T00:00:00Z"}})};
      const back = histMerge(gone, {...histEmpty(P, "2026-Q1"), updates:[{...was, edited:{by:"avery", at:"2026-01-08T00:00:00Z"}}]}), again = histMerge(back, gone);
      const later = histMerge(again, {...histEmpty(P, "2026-Q1"), removed:Object.assign(Object.create(null), {u1:{by:"blake", at:"2026-01-09T00:00:00Z"}})});
      return [histMerge(histEmpty(P, "2026-Q1"), gone).updates.length, back.updates.length, again.updates.length, later.updates.length]; })()`);
    ok("H30 a removal hides only older versions: undo (an edit after it) brings the entry back, an old copy of the removal doesn't take it away again, a newer removal does", JSON.stringify(undo) === "[0,1,1,0]", JSON.stringify(undo));

    X(`window.D9 = mkDir(); putFile(D9, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("m1","2026-01-05T00:00:00Z","removed later")], removed:{m1:{by:"blake", at:"2026-01-06T00:00:00Z"}}}));`);
    const onePart = await A(`HistoryStore.read(D9, P, "2026-Q1").then(r=>r.file.updates.length)`);
    ok("H31 a quarter in one file applies its own removals when read", onePart === 0, String(onePart));

    X(`window.D10 = mkDir(); window.odd = JSON.stringify({...histEmpty(P, "2026-Q1"), decisions:[{id:"d1"}], updates:[up("n1","2026-01-05T00:00:00","no time zone"), up("ok1","2026-01-05T00:00:00Z","fine")]}); putFile(D10, P, "2026-Q1.json", odd);`);
    const unk = await A(`(async ()=>{ const r = await HistoryStore.read(D10, P, "2026-Q1"), w = await HistoryStore.write(D10, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-07T00:00:00Z","mine")]});
      const e = await HistoryStore.write(D10, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("ok1","2026-01-05T00:00:00Z","my edit","2026-01-08T00:00:00Z")]});
      return [r.file.updates.map(x=>x.id).join(","), (r.unreadable || []).join(), w.ok, Object.keys(filesIn(D10, P)).join(), JSON.parse(filesIn(D10, P)["2026-Q1.2.json"] || "{}").updates?.map(x=>x.id).join(), e.error || "written"]; })()`);
    ok("H32 a part with entries or lists this copy can't read is read for what it can and never written over: new entries go in a new part, and an edit to an entry in it is refused", Array.isArray(unk) && unk[0] === "ok1" && unk[1] === "2026-Q1.json" && unk[2] === true && unk[3] === "2026-Q1.json,2026-Q1.2.json" && unk[4] === "u1" && /2026-Q1.json has entries this copy of Sightline can't read/.test(unk[5]) && X(`filesIn(D10, P)["2026-Q1.json"] === odd`), JSON.stringify(unk));

    X(`window.D11 = mkDir(); window.ahead = up("a1", new Date(Date.now() + 4 * 60000).toISOString().replace(/\.\d+Z$/, "Z"), "from a computer whose clock is ahead"); window.aq = histQuarter(ahead.at); putFile(D11, P, aq + ".json", JSON.stringify({...histEmpty(P, aq), updates:[ahead]}));`);
    const skew = await A(`(async ()=>{ const naive = await HistoryStore.write(D11, P, aq, {...histEmpty(P, aq), removed:{a1:{by:"avery", at:new Date().toISOString()}}});
      const fixed = await HistoryStore.write(D11, P, aq, {...histEmpty(P, aq), removed:{a1:histRemoval("updates", ahead, "avery")}});
      const r = await HistoryStore.read(D11, P, aq); return [naive.ok, (naive.kept || []).join(), fixed.ok, (fixed.kept || []).join(), r.file.updates.length]; })()`);
    ok("H33 a removal that doesn't hide its entry (a teammate's clock is ahead, or their undo came later) saves and says the entry was kept; histRemoval stamps one that hides it", JSON.stringify(skew) === '[true,"a1",true,"",0]', JSON.stringify(skew));

    X(`window.D12 = mkDir(); putFile(D12, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("p1","2026-01-02T00:00:00Z","in the part")]}));
      putFile(D12, P, "2026-Q1.02.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("z1","2026-01-03T00:00:00Z","in an odd name")]}));
      putFile(D12, P, "2026-Q1-DESKTOP-ABC.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("c1","2026-01-04T00:00:00Z","in a conflict copy")]}));
      window.copyText = filesIn(D12, P)["2026-Q1-DESKTOP-ABC.json"];`);
    const copies = await A(`(async ()=>{ const r = await HistoryStore.read(D12, P, "2026-Q1"); const w = await HistoryStore.write(D12, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine")]});
      return [r.file.updates.map(x=>x.id).join(","), r.copies.sort().join(","), w.ok, JSON.parse(filesIn(D12, P)["2026-Q1.json"]).updates.map(x=>x.id).join(","), filesIn(D12, P)["2026-Q1-DESKTOP-ABC.json"] === copyText]; })()`);
    ok("H34 another file named for the quarter (a sync conflict copy, a part with a leading zero) is read and merged, its entries are saved into the parts, and it is never written", Array.isArray(copies) && copies[0] === "p1,z1,c1" && copies[1] === "2026-Q1-DESKTOP-ABC.json,2026-Q1.02.json" && copies[2] === true && copies[3] === "p1,z1,c1,u1" && copies[4] === true, JSON.stringify(copies));

    X(`window.D13 = mkDir(); putFile(D13, P, "2026-Q1.json", JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("p1","2026-01-02T00:00:00Z","in the part")]})); putFile(D13, P, "2026-Q1 notes.json", "my own notes, not JSON"); putFile(D13, P, "2026-Q1-DESKTOP-XYZ.json", "");`);
    const stray = await A(`(async ()=>{ const r = await HistoryStore.read(D13, P, "2026-Q1"), w = await HistoryStore.write(D13, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("u1","2026-01-05T00:00:00Z","mine")]});
      return [r.file && r.file.updates.map(x=>x.id).join(","), (r.ignored || []).length, w.ok, filesIn(D13, P)["2026-Q1 notes.json"]]; })()`);
    ok("H35 another file named for the quarter that isn't its history (someone's notes, an empty conflict copy) is named and left alone, and never blocks the quarter", Array.isArray(stray) && stray[0] === "p1" && stray[1] === 2 && stray[2] === true && stray[3] === "my own notes, not JSON", JSON.stringify(stray));
    const future = X(`histParse(JSON.stringify({...histEmpty(P, "2026-Q1"), updates:[up("f1","2026-01-05T00:00:00Z","edit from 2099","2099-01-01T00:00:00Z"), up("f2","2026-01-05T00:00:00Z","fine")], removed:{f3:{by:"x", at:"2099-01-01T00:00:00Z"}}}), P, "2026-Q1")`);
    ok("H36 an edit or removal dated far in the future is refused, so it can't win every merge", future && future.updates.map(x=>x.id).join() === "f2" && !Object.keys(future.removed).length && future.unreadable === 2, JSON.stringify(future && [future.updates.map(x=>x.id), future.unreadable]));

    // A part this copy can't fully read: adding an entry still works when its entries are out of date order, or one is hidden by its own removal.
    const beside = async (name, updates, removed) => { X(`window.Dx = mkDir(); window.oddx = JSON.stringify({...histEmpty(P, "2026-Q1"), extra:true, updates:${JSON.stringify(updates)}, removed:${JSON.stringify(removed)}}); putFile(Dx, P, "2026-Q1.json", oddx);`);
      return await A(`HistoryStore.write(Dx, P, "2026-Q1", {...histEmpty(P, "2026-Q1"), updates:[up("n1","2026-01-05T00:00:00Z","mine")]}).then(r=>[r.ok || r.error, Object.keys(filesIn(Dx, P)).join(), filesIn(Dx, P)["2026-Q1.json"] === oddx])`); };
    const good = r => Array.isArray(r) && r[0] === true && r[1] === "2026-Q1.json,2026-Q1.2.json" && r[2] === true;
    const outOfOrder = await beside("order", [X(`up("b1","2026-01-09T00:00:00Z","later, listed first")`), X(`up("a1","2026-01-02T00:00:00Z","earlier")`)], {});
    ok("H37 adding an entry beside a part this copy can't fully read works when that part's entries are out of date order", good(outOfOrder), JSON.stringify(outOfOrder));
    const hidden = await beside("hidden", [X(`up("h1","2026-01-03T00:00:00Z","hidden by its removal")`)], {h1:{by:"blake", at:"2026-01-04T00:00:00Z"}});
    ok("H38 …and when that part holds an entry its own removal hides", good(hidden), JSON.stringify(hidden));

    const noId = await A(`HistoryStore.write(D, "", "2026-Q1", histEmpty("", "2026-Q1"), {create:true}).catch(e=>({thrown:e.message}))`);
    ok("H19 a plan with no id never gets a history folder", noId && /no id/.test(noId.thrown || noId.error || "") && !X(`D.kids.get("history").dir.has("")`), JSON.stringify(noId));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
