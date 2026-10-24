// Editing: the strip counts what differs from the saved file, lists it, and undoing back to the saved file reads as
// saved. Each check fails on the build before this.
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
(async()=>{
  const handle = makeHandle("plan.json", plan);
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/",virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.showOpenFilePicker = async()=>[handle]; w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){}; w.HTMLAnchorElement.prototype.click=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s => w.eval(s); await wait(250);
  const strip = () => d.querySelector("#editstrip").textContent;
  try {
    d.querySelector("#link").click(); await wait(200);
    ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb) => cb();");
    await ev("startEditing(false)"); await wait(60);
    ok("setup: editing the shared plan", ev("editable() && file.holdLock") === true);
    ev("commit(s=>{ s.bars[0].label = 'Renamed'; })"); ev("commit(s=>{ s.bars[1].kind = s.bars[1].kind === 'gated' ? 'work' : 'gated'; })"); ev("commit(s=>{ s.milestones[0].what = 'Beta'; })"); ev("render()"); await wait(20);
    ok("U1: the strip counts the changes since the last save", /3 unsaved changes/.test(strip()), strip());
    d.querySelector("#esUnsaved").click(); await wait(10);
    const pop = d.querySelector("#unsavedPop");
    ok("U2: clicking it lists each one: what changed on which item", !pop.hidden && /Initiative "Renamed": title/.test(pop.textContent) && /: kind/.test(pop.textContent) && /Milestone "Beta": name/.test(pop.textContent), pop.textContent.slice(0, 200));
    ev("undo(); render();"); await wait(20);
    ok("U3: undo takes one back, and the count follows", /2 unsaved changes/.test(strip()), strip());
    ev("undo(); undo(); render();"); await wait(20);
    ok("U4: undoing all the way back reads as saved, not unsaved", !/unsaved/.test(strip()) && ev("file.dirty") === false, strip());
    ev("commit(s=>{ s.bars[0].label = s.bars[0].label + 'x'; })"); ev("commit(s=>{ s.bars[0].label = s.bars[0].label.slice(0, -1); })"); ev("render()"); await wait(20);
    ok("U5: typing something and then putting it back also reads as saved", !/unsaved/.test(strip()), strip());
    ok("no page errors", !w.errs.length, w.errs.join("; "));
  } catch(e){ ok("crashed", false, String(e.message).slice(0,160)); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
