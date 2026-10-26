// Owner avatars on Jira items: initials in a circle, one component everywhere a Jira item is drawn. Initials and
// colors are stable across redraws, two owners with the same initials get a third letter, unassigned is a dashed empty
// circle, outside owners are outlined, the spotlighted person gets a ring, every avatar has an accessible name, a
// hostile name renders as text, and nothing is fetched. Fixed clock; the plan from fixtures/shelf-plan.js. Every name is invented.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8"), SHELF = require("./fixtures/shelf-plan.js");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 90000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const HOSTILE = '<img src=x onerror="window.pwned=1"> Ada Sato';
(async()=>{
  const fetched = [];
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00").getTime();
    w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.fetch = (...a)=>{ fetched.push(String(a[0])); return Promise.reject(new Error("no network")); };
    w.HTMLCanvasElement.prototype.getContext = ()=>null; w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
  const w = dom.window, d = w.document, ev = s=>w.eval(s), J = s=>JSON.parse(ev(`JSON.stringify(${s})`));
  try {
    Object.defineProperty(w.HTMLElement.prototype, "clientWidth", {configurable:true, get(){ return this.id === "gscroll" ? 1100 : 0; }});
    await wait(150); w.FIX = FIX; ev(SHELF);
    ev("askWhoOnStart = ()=>{}; whoAmI = (x, cb)=>cb(); stopAuto(); S = parseText(FIX); UI.zoom = 'weeks'; UI.zoomN = 0; UI.zoomSp = null; UI.rows = 'lanes'; UI.shelfOpen = {}; UI.spot = null; delete UI.shelves; goWs('timeline'); shelfPlan()");
    // An unassigned story, an assignee nobody linked (with a hostile name), an outside owner, and two people who share initials.
    ev(`JIRA.issues['ABC-104'].assignee = ''; JIRA.issues['ABC-104'].assigneeKey = '';
        JIRA.issues['ABC-120'].assignee = ${JSON.stringify(HOSTILE)}; JIRA.issues['ABC-120'].assigneeKey = 'u-ada';
        S.people.find(p=>p.id === 'pc').external = true;
        S.people.push({id:'pd', name:'Avery Sloan', initials:'AS', color:'#7d4aa8', jira:{key:'u-sloan', user:'asloan', name:'Avery Sloan'}});
        S.people.find(p=>p.id === 'pa').initials = 'AS'; S = normalize(S, false); setZoomN(1, 1); UI.zoomSp = '2026-10-05'; dropJiraMemos(); render()`);   // one sprint: shelves show tiles
    const avs = (root = d) => [...root.querySelectorAll(".oav")];
    const snap = () => avs(d.querySelector("#gantt")).map(a=>[a.closest("[data-key]")?.dataset.key, a.dataset.who || "", a.textContent, a.style.getPropertyValue("--pc")].join("|")).sort();
    const s1 = snap(); ev("render()"); const s2 = snap(); ev("dropJiraMemos(); render()"); const s3 = snap();
    ok("A1 shelf tiles show an avatar for every story, and initials and colors are the same on every redraw", s1.length >= 8 && s1.join() === s2.join() && s2.join() === s3.join(), `${s1.length} avatars`);
    const byWho = k => avs().find(a=>a.dataset.who === k);
    ok("A2 two people with the same initials each get a third letter", byWho("pa")?.textContent === "ASt" && J("avIndex().ini.get('pd')") === "ASl" && byWho("pb")?.textContent === "BI", `${byWho("pa")?.textContent} / ${J("avIndex().ini.get('pd')")} / ${byWho("pb")?.textContent}`);
    const un = d.querySelector('[data-key="story:ABC-104"] .oav');
    ok("A3 an unassigned story shows a dashed empty circle called Unassigned, never a person", un && un.classList.contains("none") && un.textContent === "" && un.title === "Unassigned" && un.getAttribute("aria-label") === "Unassigned" && /\.oav\.none\{[^}]*dashed/.test(html), un && un.outerHTML);
    const ext = byWho("pc");
    ok("A4 an outside owner is outlined and says so", ext && ext.classList.contains("ext") && /outside the team/.test(ext.title) && /\.oav\.ext\{[^}]*inset 0 0 0 1\.5px var\(--pc\)/.test(html));
    ok("A5 every avatar is an image with an accessible name: Owner and the full name, or Unassigned", avs().length && avs().every(a=>a.getAttribute("role") === "img" && /^(Owner: .+|Unassigned)$/.test(a.getAttribute("aria-label")) && a.title === a.getAttribute("aria-label")));
    const hos = byWho("~" + HOSTILE);
    ok("A6 a hostile assignee name renders as text: no element is made from it", hos && hos.title === "Owner: " + HOSTILE && !d.querySelector("#gantt img") && !w.pwned, hos && hos.outerHTML.slice(0, 120));
    ok("A6 …and an unlinked assignee gets a color from the person palette, the same every time", hos && J("PERSON_COLORS").includes(hos.style.getPropertyValue("--pc")) && hos.style.getPropertyValue("--pc") === J(`avColor(${JSON.stringify(HOSTILE)})`));
    ev("UI.spot = 'pb'; render()");
    ok("A7 Spotlight rings the spotlighted person's avatars and no one else's", avs().filter(a=>a.dataset.who === "pb").length >= 2 && avs().filter(a=>a.dataset.who === "pb").every(a=>a.classList.contains("spot")) && !avs().some(a=>a.dataset.who !== "pb" && a.classList.contains("spot")));
    ev("UI.spot = null; render()");
    // Other surfaces.
    ev("UI.zoom = 'days'; render()");
    const dayStories = [...d.querySelectorAll("#gantt .tbar.story")];
    ok("S1 Days: every story bar ends with its owner's avatar", dayStories.length >= 4 && dayStories.every(b=>b.lastElementChild && b.lastElementChild.classList.contains("oav") || b.querySelector(":scope > .oav")), `${dayStories.length} bars`);
    ev("UI.zoom = 'weeks'; UI.rows = 'people'; render()");
    const wkStories = [...d.querySelectorAll('#gantt .bar.story')];
    ok("S2 Weeks by person: story bars carry the avatar outside the label wrap, so it stays at the right end", wkStories.length >= 2 && wkStories.every(b=>b.querySelector(":scope > .oav") && !b.querySelector(".bin .oav")), `${wkStories.length} bars`);
    ev("UI.rows = 'lanes'; render()");
    const pk = ev("(()=>{ const c = peekContent('story', 'ABC-102'); document.body.append(c); c.id = 'pkTest'; return c.outerHTML.length; })()");
    ok("S3 the story's hover card shows the avatar with the name", pk && d.querySelector("#pkTest .oav")?.dataset.who === "pb" && /Blake Ito/.test(d.querySelector("#pkTest").textContent));
    ev("select('story', 'ABC-102')"); await wait(10);
    ok("S4 the story's side panel shows the avatar with the name", d.querySelector("#side .oav")?.dataset.who === "pb");
    ok("S4 …where the name is written beside it, the avatar is hidden from screen readers, so the name isn't read twice", d.querySelector("#side .oav").getAttribute("aria-hidden") === "true" && !d.querySelector("#side .oav").hasAttribute("role") && d.querySelector("#side .oav").title === "Owner: Blake Ito");
    ev("goWs('list')"); await wait(10);
    const lr = [...d.querySelectorAll('#listTable tr[data-lk^="list:story:"]')];
    ok("S5 List: story rows show the avatar in Owner", lr.length >= 4 && lr.every(r=>r.querySelector('[data-col="owner"] .oav')), `${lr.length} rows`);
    ev("goWs('timeline'); sel = null; render()");
    ok("N1 nothing is fetched and no image is made: initials only, under the same policy", !fetched.length && !d.querySelector("img") && /connect-src 'none'/.test(html) && !/\.oav[^{]*\{[^}]*url\(/.test(html), fetched.join());
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
