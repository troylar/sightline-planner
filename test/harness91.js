// Start with: a personal choice of the page Sightline opens on when it's opened fresh; links and reloads still open where
// they point, and unset it opens where you left off. Fails on the build before this.
const {JSDOM} = require("jsdom"); const fs = require("fs"); const path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname,"..","dist","sightline.html"),"utf8").replace(/<link[^>]+fonts[^>]+>/,"");
const R = []; const ok = (n,c,x="") => R.push(`${c?"PASS":"FAIL"}  ${n}${x?"  ("+x+")":""}`);
const wait = ms => new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT after " + R.length); process.exit(1); }, 40000).unref?.();
async function page(ui, hash){
  const dom = new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://local.test/" + (hash || ""),virtualConsole:new (require("jsdom").VirtualConsole)(),beforeParse(w){
    if (ui) w.localStorage.setItem("timeline-planner-ui", JSON.stringify(ui));
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;}; w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.indexedDB = undefined; w.confirm = ()=>true; w.prompt = ()=>"Tester"; w.alert=()=>{};
    w.URL.createObjectURL=()=>"blob:x"; w.URL.revokeObjectURL=()=>{}; w.Element.prototype.scrollIntoView=function(){};
    w.HTMLCanvasElement.prototype.getContext = () => ({font:"", measureText: t => ({width: String(t).length * 7})});
    w.CSS = w.CSS||{}; w.CSS.escape=s=>s; w.errs=[]; w.addEventListener("error",e=>w.errs.push(e.message)); }});
  const w = dom.window; await wait(400); return {w, d:w.document, ev:s=>w.eval(s)};
}
(async()=>{
  const sec = async fn => { try { await fn(); } catch(e){ ok("section crashed", false, String(e.message).slice(0,140)); } };
  await sec(async ()=>{ const {d, ev} = await page({ws:"timeline"});
    ok("W1 unset, it opens where you left off", ev("UI.ws") === "timeline");
    d.querySelector("#startWith").click(); await wait(10);
    const opts = [...d.querySelectorAll("#dlgStart input[name=startWith]")];
    ok("W2 File, Start with lists the pages, with where you left off chosen", opts.length === 7 && opts[0].checked, String(opts.length));
    const road = opts.find(x=>x.value === "roadmap"); road.checked = true; road.dispatchEvent(new d.defaultView.Event("change")); await wait(5);
    ok("W3 picking one keeps it for this browser", JSON.parse(ev("localStorage.getItem('timeline-planner-ui')")).startWith === "roadmap");
  });
  await sec(async ()=>{ const {ev} = await page({ws:"timeline", startWith:"roadmap"});
    ok("W4 opened fresh, it starts with the chosen page", ev("UI.ws") === "roadmap", ev("UI.ws")); });
  await sec(async ()=>{ const {ev} = await page({ws:"timeline", startWith:"roadmap"}, "#ws=standup");
    ok("W5 a link still opens where it points", ev("UI.ws") === "standup", ev("UI.ws")); });
  await sec(async ()=>{ const {ev} = await page({ws:"roadmap", startWith:"mine", todayScope:"team"});
    ok("W6 My work opens Today, just yours", ev("UI.ws") === "today" && ev("UI.todayScope") === "me"); });
  await sec(async ()=>{ const {ev} = await page({ws:"roadmap", startWith:"capacity"});
    ok("W7 Team capacity opens the Sprint tab", ev("UI.ws") === "standup" && !ev("errs.length"), ev("JSON.stringify(errs)")); });
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
