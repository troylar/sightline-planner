// The page finds an element by its id with getElementById, not a selector search: the same element either way, and in
// jsdom a selector search for an id walked the whole page on every call (harness4 took 146s instead of 37s, and timed
// out on a loaded machine). Anything that isn't a plain id still goes through querySelector.
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
    const X = s => { try { return w.eval(s); } catch(e){ return "ERR " + e.message; } };
    X(`askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb && cb(); stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; UI.ws = "timeline"; render();`); await wait(20);
    const ids = [...d.querySelectorAll("[id]")].map(e=>e.id).filter(id=>/^[A-Za-z][\w-]*$/.test(id));
    ok("I1 for every id on the page, $ finds the same element a selector search does", ids.length > 200 && ids.every(id=>X(`$("#${id}")`) === d.querySelector("#" + id)), ids.length + " ids");
    let byId = 0, bySel = 0; const gid = d.getElementById.bind(d), qs = d.querySelector.bind(d);
    d.getElementById = id=>{ byId++; return gid(id); }; d.querySelector = q=>{ bySel++; return qs(q); };
    X(`$("#timeline"); $("#status"); $("#nothing-has-this-id")`);
    ok("I2 a plain id is looked up by id, not by searching the page", byId === 3 && bySel === 0, `${byId} by id, ${bySel} searches`);
    byId = 0; bySel = 0;
    const other = X(`[$("#gantt .track"), $(".banner"), $("#banners > div")].length`);
    ok("I3 anything else is still a selector search", other === 3 && bySel === 3 && byId === 0, `${byId} by id, ${bySel} searches`);
    ok("I4 an id that isn't there is null, as before", X(`$("#nothing-has-this-id")`) === null);
    byId = 0; bySel = 0;
    const odd = ["#a.b", "#a b", "#a:hover", "#a,b", "#a>b", "#a[x]", "#-a", "#_a", "#9a", "#", "#a\\:b"];
    odd.forEach(q=>{ try { w.eval(`$(${JSON.stringify(q)})`); } catch(e){} });
    ok("I5 only a plain id (a letter, then letters, digits, - and _) skips the selector search: compound, scoped, pseudo and odd ones don't", byId === 0 && bySel === odd.length, `${byId} by id, ${bySel} searches`);
    const det = X(`(()=>{ const el = h("div",{id:"detached-check"}); return [$("#detached-check"), document.querySelector("#detached-check"), (document.body.append(el), $("#detached-check") === el), (el.remove(), $("#detached-check"))]; })()`);
    ok("I6 an element built but not on the page isn't found, by either way, until it's added, and not after it's removed", Array.isArray(det) && det[0] === null && det[1] === null && det[2] === true && det[3] === null, JSON.stringify(det));
    d.getElementById = gid; d.querySelector = qs;
    const dup = new Set(), seen = [];
    for (const ws of ["timeline", "list", "people", "standup", "plan"]){ X(`UI.ws = "${ws}"; render();`); await wait(20); seen.push(ws);
      const all = [...d.querySelectorAll("[id]")].map(e=>e.id); all.forEach((x, i)=>{ if (all.indexOf(x) !== i) dup.add(ws + ":" + x); }); }
    ok("I7 no id is used twice on the page, on any of the main pages, so first-in-the-page is never a guess", !dup.size, [...dup].join(", ") || seen.join(" "));
    ok("no runtime errors", w.errs.length === 0, w.errs.join(" | "));
  } catch(e){ ok("ran without throwing", false, String(e && e.stack || e).slice(0, 400)); }
  console.log(R.join("\n")); const f = R.filter(r=>r.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
