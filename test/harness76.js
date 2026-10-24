// One storage boundary: every store has load/apply/subscribe, and a confirmed quick update draws the page once and
// notifies subscribers once, including after a retry; a refused one notifies nobody and leaves nothing unsaved on screen.
// Fails on the build before this (it has no subscribe); S7 also caught a refused change left on screen.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const plan = fs.readFileSync(path.join(__dirname,"fixtures","sample-plan.json"),"utf8");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
function makeHandle(name, text){ const h = {name,_text:text,writes:0,
  async getFile(){ const t=h._text; return {size:t.length,lastModified:Date.now(),text:async()=>t}; },
  async createWritable(){ let b=""; return {write:async x=>{b+=x;}, close:async()=>{ h._text=b; h.writes++; if (h.cross){ const c = h.cross; h.cross = null; h._text = c(h._text); } }}; },
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
  // spy after a pause: the first load's deferred draws can land inside the count under a loaded suite
  const spy = ev => ev(`window.__r = 0; window.__n = []; const __render = render; render = function(){ __r++; return __render.apply(this, arguments); };
    FileStore.subscribe(k=>__n.push(k));`);
  await sec(async ()=>{ const {ev} = await page(); await wait(500); spy(ev);
    ok("S1 every store has load, apply and subscribe", ev("['load','apply','subscribe'].every(k=>typeof FileStore[k] === 'function' && typeof LocalStore[k] === 'function')"));
    const r = await ev("quickSave('a note', s=>{ s.notes.push({id:'n1', lane:s.lanes[0].id, date:s.meta.start, text:'hi', author:''}); })"); await wait(40);
    ok("S2 a quick update draws the page once", r === true && ev("__r") === 1, `saved ${r}, draws ${ev("__r")}`);
    ok("S3 and notifies subscribers once", ev("JSON.stringify(__n)") === '["quick"]', ev("JSON.stringify(__n)"));
  });
  await sec(async ()=>{ const {ev, handle} = await page(); await wait(500); spy(ev);
    handle.cross = t => { const o = JSON.parse(t); o.meta.title = "Teammate title"; o.meta.revision = (o.meta.revision||0) + 1; return JSON.stringify(o, null, 2) + "\n"; };
    const r = await ev("quickSave('a note', s=>{ s.notes.push({id:'n2', lane:s.lanes[0].id, date:s.meta.start, text:'hi', author:''}); })"); await wait(40);
    const f = JSON.parse(handle._text);
    ok("S4 a save that crossed a teammate's retries and keeps both", r === true && f.notes.filter(n=>n.id === "n2").length === 1 && f.meta.title === "Teammate title", `saved ${r}, title ${f.meta.title}`);
    ok("S5 the retry still draws once and notifies once", ev("__r") === 1 && ev("__n.length") === 1, `draws ${ev("__r")}, notices ${ev("__n.length")}`);
  });
  await sec(async ()=>{ const {ev} = await page(); await wait(500); spy(ev);
    const r = await ev("quickSave('too big', s=>{ s.notes.push({id:'n3', lane:s.lanes[0].id, date:s.meta.start, text:'x'.repeat(2200000), author:''}); })"); await wait(40);
    ok("S6 a refused update notifies nobody", r === false && ev("__n.length") === 0, `saved ${r}, notices ${ev("__n.length")}`);
    ok("S7 and puts the file's version back on screen once", ev("__r") === 1 && !ev("S.notes.some(n=>n.id === 'n3')"), `draws ${ev("__r")}, n3 ${ev("S.notes.some(n=>n.id === 'n3')")}, status ${ev("document.querySelector('#status')?.textContent")}`);
  });
  await sec(async ()=>{ const {ev} = await page(); await wait(500); spy(ev); await ev("startEditing(false)"); await wait(30); ev("__r = 0; __n.length = 0");
    ev("commit(s=>{ s.meta.title = 'Mine'; })"); await ev("save()"); await wait(40);
    ok("S8 a full save notifies once", ev("JSON.stringify(__n)") === '["save"]', ev("JSON.stringify(__n)"));
  });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
