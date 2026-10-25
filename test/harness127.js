// Every control answers (the interaction system): one set of state tokens in light and both dark blocks; hover, press,
// selected and focus rules for each control family; segmented controls as a pill on a track with no clipping parent;
// filled buttons keep their own border on hover; wrapped link-style buttons read left to right; reduced motion and
// forced colors are honored. Motion answers what a person did: a bar a change moved glides from where it was and glows
// once, a view change (most of the chart moving) doesn't, reduced motion doesn't, and a drop doesn't; the selected pill
// slides; the status line settles in for operations only. The interface font is embedded. Fixture: sample-plan.json.
const {JSDOM, VirtualConsole} = require("jsdom"), fs = require("fs"), path = require("path");
const DIST = process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html");
const html = fs.readFileSync(DIST, "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const plan = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 60000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
async function page(opts = {}){
  const dom = new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", virtualConsole:new VirtualConsole(), beforeParse(w){
    w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
    w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
    w.URL.createObjectURL = ()=>"blob:test"; w.URL.revokeObjectURL = ()=>{}; w.HTMLCanvasElement.prototype.getContext = ()=>({font:"", measureText:t=>({width:String(t).length * 7})});
    w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message));
    w.matchMedia = q => ({matches: !!opts.reduce && /prefers-reduced-motion: reduce/.test(q), media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
    // Layout for the glide: each bar's box comes from its own left/width percentages, the chart is 1000px wide.
    w.animations = []; w.Element.prototype.animate = function(k, o){ w.animations.push({el:this, k, o}); return {cancel(){}, finished:Promise.resolve()}; };
    const pct = (v, def) => { const m = /([\d.]+)%/.exec(v || ""); return m ? +m[1] : def; };
    w.Element.prototype.getBoundingClientRect = function(){ if (this.id === "gantt") return {left:0, top:0, width:1000, height:600, right:1000, bottom:600};
      if (this.matches && this.matches(".bar,.tbar")){ const l = pct(this.style.left, 0) * 10, wd = pct(this.style.width, 5) * 10, t = this.closest("[data-lane]") ? [...this.ownerDocument.querySelectorAll("[data-lane]")].indexOf(this.closest("[data-lane]")) * 40 : 0; return {left:l, top:t, width:wd, height:24, right:l + wd, bottom:t + 24}; }
      if (this.matches && this.matches(".seg button")){ const i = [...this.parentElement.children].indexOf(this); return {left:i * 90, top:0, width:80, height:26, right:i * 90 + 80, bottom:26}; }
      return {left:0, top:0, width:0, height:0, right:0, bottom:0}; }; }});
  await wait(150); const w = dom.window, ev = s=>w.eval(s), d = w.document; w.FIX = plan;
  ev(`stopAuto(); S = normalize(JSON.parse(FIX), false); file.handle = null; resetHistory(); askWhoOnStart = ()=>{}; setMe(S.people[0].id); goWs('timeline'); render();`);
  return {w, ev, d};
}
(async()=>{
  try {
    let {w, ev, d} = await page();
    const css = [...d.querySelectorAll("style")].map(s=>s.textContent).join("\n"), rules = [];
    const walk = (list, media) => { for (const r of list){ if (r.cssRules && !r.selectorText) walk(r.cssRules, (media ? media + " " : "") + (r.conditionText || r.media && r.media.mediaText || "")); else if (r.selectorText) rules.push({sel:r.selectorText.replace(/\s*,\s*/g, ", ").replace(/\[role=(\w+)\]/g, '[role="$1"]').replace(/\s*>\s*/g, " > "), text:r.cssText, media:media || ""}); } };
    for (const sh of d.styleSheets) walk(sh.cssRules, "");
    const has = (re, extra = () => true) => rules.some(r=>re.test(r.sel) && extra(r));
    const decl = (selRe, prop) => rules.filter(r=>selRe.test(r.sel)).map(r=>(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;}]+)`).exec(r.text) || [])[1]).filter(Boolean);

    // ---- type ----
    ok("T1 the interface font is Instrument Sans, embedded, with tabular figures", /--font-ui:\s*"Instrument Sans"/.test(css) && /@font-face\{font-family:"Instrument Sans"[^}]*src:url\(data:font\/woff2;base64,/.test(css.replace(/\s+/g, " ").replace(/: /g, ":")) && decl(/^body$/, "font-variant-numeric").includes("tabular-nums"));
    ok("T1 …and nothing names IBM Plex or a font server", !/IBM Plex/.test(html) && !/fonts\.(googleapis|gstatic)\.com/.test(html));
    ok("T2 headings, the title and sprint names use its narrow width", ["h1, h2, h3", ".top input.title", ".gsprint"].every(sel=>decl(new RegExp("^" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), "font-stretch").length));
    ok("T2 bar labels use it too, and the label fit is measured in the same face", decl(/^\.bar, \.tbar$/, "font-stretch").includes("87.5%") && /11px "Instrument Sans"/.test(html) && /fontStretch = "semi-condensed"/.test(html));
    ok("T3 code-like text (Jira keys, commands, key hints) uses the system monospace", /--font-code:\s*ui-monospace/.test(css) && decl(/^\.jkey$/, "font-family").some(v=>/var\(--font-code\)/.test(v)) && decl(/^\.jcmd$/, "font").some(v=>/var\(--font-code\)/.test(v)));

    // ---- tokens ----
    const tokens = ["--track", "--edge", "--hov", "--prs", "--lift", "--ring", "--state", "--fast"];
    const blocks = css.split(/@media \(prefers-color-scheme:\s*dark\)|:root\[data-theme="dark"\]\{/);
    ok("K1 one set of state tokens on :root", tokens.every(t=>new RegExp(t + ":").test(blocks[0])));
    ok("K1 …with dark values in both dark blocks (the system setting and the switch)", ["--track", "--edge", "--hov", "--prs", "--lift"].every(t=>(css.match(new RegExp(t + ":", "g")) || []).length >= 3));

    // ---- the broken corners and the dead hover ----
    const seg = decl(/^\.seg$/, "overflow"), segBorder = decl(/^\.seg$/, "border");
    ok("C1 a segmented control no longer clips its segments (no overflow:hidden, no outer border)", !seg.includes("hidden") && !segBorder.some(v=>/solid/.test(v)), JSON.stringify([seg, segBorder]));
    ok("C1 …it's a track, and the selected segment is a raised pill drawn inside it", decl(/^\.seg$/, "background").includes("var(--track)") && has(/\.seg button\[aria-pressed="true"\]::before/, r=>/background:\s*var\(--surface\)/.test(r.text) && /box-shadow/.test(r.text)));
    ok("C1 …List's layout control uses the same pill, not its own accent fill", !/\.listbar \.seg \.btn\.on/.test(css) && has(/\.seg button\.on::before/));
    ok("C2 hovering a filled button keeps its own color: no gray ring around primary or on", has(/^\.btn\.primary:hover:not\(:disabled\)$/, r=>/border-color:\s*transparent/.test(r.text)) && has(/^\.btn\.on:hover:not\(:disabled\)$/, r=>/border-color:\s*transparent/.test(r.text)));
    ok("C3 selected and hover differ in the main nav (an underline, not the bar's own background)", has(/^\.primarynav button\[aria-pressed="true"\]$/, r=>/inset 0 -2px 0 var\(--accent\)/.test(r.text) && /background:\s*transparent/.test(r.text)) && has(/^\.primarynav button:hover:not\(\[aria-pressed="true"\]\)$/, r=>/var\(--hov\)/.test(r.text)));
    ok("C4 a wrapped link-style button reads left to right everywhere", decl(/^\.linkish$/, "text-align").includes("left") && !/\.lwaits \.linkish\{text-align:left\}/.test(css));

    // ---- every family answers ----
    ok("H1 buttons: hover, press (a step down, darker), primary and on have their own press", has(/^\.btn:hover:not\(:disabled\)$/, r=>/background/.test(r.text)) && has(/^\.btn:active:not\(:disabled\)$/, r=>/translateY\(1px\)/.test(r.text)) && has(/^\.btn\.primary:active/));
    const pressFam = [".seg button", ".chip", ".rchip", ".fchip", ".qchip", ".tchip", ".rn-chip", "button.lchip", ".wdbtn", ".icb", ".icon-btn", ".insbtn", ".foldb", "[role=\"tab\"]", ".hlpnav button", ".primarynav button"];
    const pressRule = rules.find(r=>/:active:not\(:disabled\)/.test(r.sel) && /scale\(0?\.97\)/.test(r.text));
    ok("H2 every chip, toggle, tab and icon button gets press feedback", !!pressRule && pressFam.every(f=>pressRule.sel.includes(f)), pressRule ? "" : "no press rule");
    const hovRule = rules.find(r=>/^:is\(\.fchip/.test(r.sel) && /:hover/.test(r.sel));
    ok("H3 the families with no hover before now have one", !!hovRule && [".fchip", ".qchip", ".rn-chip", "button.lchip", ".wdbtn", ".icb", ".icon-btn", ".hlpnav button", ".plannav [role=\"tab\"]", ".tabs [role=\"tab\"]"].every(f=>hovRule.sel.includes(f)));
    ok("H4 menus, rows and links press too", has(/\.menu button:active:not\(:disabled\)/) && has(/\.urow, \.oopt/, r=>/:active/.test(r.sel)) && has(/^\.linkish:active:not\(:disabled\)$/) && has(/^\.ltable tr\.lrow:active > td$/));
    ok("H5 inputs: hover darkens the border; focus is a soft ring in the accent", has(/select, textarea\):not\(:disabled\):not\(\[readonly\]\):hover/) && has(/select, textarea\):focus-visible$/, r=>/box-shadow:\s*var\(--ring\)/.test(r.text)));
    ok("H6 timeline bars: hover and press tint, a dragged bar lifts", has(/^:is\(\.bar, \.tbar, \.minibar/, r=>/:hover/.test(r.sel) && /brightness/.test(r.text)) && has(/^:is\(\.bar, \.tbar\):active$/) && has(/^\.bar\.dragging, \.tbar\.dragging$/, r=>/box-shadow/.test(r.text)));
    ok("H7 focus stays visible inside controls that sit edge to edge", has(/\.seg button, \.tabs \[role="tab"\], \.ltable tr\.lrow, \.bar, \.tbar\):focus-visible/, r=>/outline-offset:\s*-2px/.test(r.text)));
    ok("H8 transitions are on color, shadow and transform only, and fast", rules.some(r=>/transition:/.test(r.text) && /background-color var\(--state\)/.test(r.text) && !/(?:^|[ ,])(width|left|top|height) /.test(r.text.split("transition:")[1].split(";")[0])));
    ok("H9 the interaction block is screen only, so print is unchanged", rules.filter(r=>/:active/.test(r.sel) && /scale|translateY/.test(r.text) && !/^\.btn/.test(r.sel)).every(r=>/screen/.test(r.media)));
    ok("H10 reduced motion turns transitions, animations and the press step off", /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*, \*::before, \*::after\s*\{[^}]*transition-duration:\s*0s\s*!important/.test(css.replace(/\s+/g, " ").replace(/,(\S)/g, ", $1").replace(/\{ /g, "{").replace(/ \}/g, "}").replace(/\{/g, " { ").replace(/\s+/g, " ")) || /prefers-reduced-motion:reduce\)\{\s*\*,\*::before,\*::after\{transition-duration:0s!important/.test(css.replace(/\s+/g, "")));
    ok("H11 forced colors: the selected pill and focus use the system's Highlight", /@media\(forced-colors:active\)\{[^@]*::before[^}]*background:Highlight/.test(css.replace(/\s+/g, "")) && /:focus-visible\{outline:2pxsolidHighlight/.test(css.replace(/\s+/g, "")));

    // ---- motion that answers an action ----
    const pick = ev(`(()=>{ const x = S.bars.find(b=>!b.parent && !(b.tasks||[]).length && !b.jira && b.start + b.span + 1 < S.meta.weeks && !S.bars.some(y=>(y.dependsOn||[]).includes(b.id)) && !S.milestones.some(m=>(m.after||[]).includes(b.id))); return x && x.id; })()`);
    w.animations.length = 0; ev(`commit(s=>{ s.bars.find(b=>b.id==='${pick}').start += 1; })`); await wait(5);
    const moved = w.animations.filter(a=>a.el.dataset && a.el.dataset.key === "bar:" + pick);
    ok("M1 a bar a change moved glides from where it was", ev("glideLast") === 1 && moved.some(a=>/translate\(-?\d/.test(a.k[0].transform) && a.k[1].transform === "none" && a.o.duration <= 300), JSON.stringify(moved.map(a=>a.k[0])));
    ok("M1 …and glows once", moved.some(a=>/0 0 0 3px/.test(a.k[0].boxShadow) && a.o.duration > 500));
    ok("M1 …nothing else moved, so nothing else glides", w.animations.every(a=>!a.el.dataset || !a.el.dataset.key || a.el.dataset.key === "bar:" + pick));
    w.animations.length = 0; ev("undo()"); await wait(5);
    ok("M2 undo glides it back", ev("glideLast") === 1 && w.animations.some(a=>a.el.dataset && a.el.dataset.key === "bar:" + pick));
    w.animations.length = 0; ev("commit(s=>{ s.bars.forEach(b=>{ if (!b.parent && !(b.tasks||[]).length) b.start = Math.max(0, b.start - 0.5); }); })"); await wait(5);
    ok("M3 when most of the chart moves, it's a new view, not a few changes: no glide", ev("glideLast") === 0 && !w.animations.some(a=>a.el.dataset && a.el.dataset.key));
    ev("undo()"); w.animations.length = 0;
    ev(`(()=>{ const el = document.querySelector('[data-key="bar:${pick}"]'); el.style.left = (parseFloat(el.style.left) + 10) + '%'; })()`);   // a drag already put it where it lands
    ev(`commit(s=>{ s.bars.find(b=>b.id==='${pick}').start += 0; })`); ev("render()"); await wait(5);
    ok("M4 a bar already where it lands (a drop) doesn't glide again", !w.animations.some(a=>a.el.dataset && a.el.dataset.key === "bar:" + pick && /translate/.test((a.k[0] || {}).transform || "")) || ev("glideLast") === 0);
    w.animations.length = 0; ev("setStatus('Saved.')"); ev("setStatus('Editing plan.json', true)"); ev("setStatus('Saved.')");
    const st = w.animations.filter(a=>a.el.id === "status");
    ok("M5 the status line settles in when an operation speaks, not for the edit strip's own notes", st.length === 2 && st[0].k[0].opacity < 1);
    w.animations.length = 0; ev("setStatus('Saved.')");
    ok("M5 …and not again for the same words", !w.animations.some(a=>a.el.id === "status"));
    const segBtns = [...d.querySelectorAll("#layerSeg button")], from = segBtns.findIndex(b=>b.getAttribute("aria-pressed") === "true"), to = (from + 1) % segBtns.length;
    w.animations.length = 0;
    segBtns[to].dispatchEvent(new w.MouseEvent("pointerdown", {bubbles:true})); segBtns[to].click(); await wait(40);
    const pill = w.animations.find(a=>a.o && a.o.pseudoElement === "::before");
    ok("M6 the selected pill slides from the option that was on to the one picked", !!pill && /translateX\(-?\d+px\) scaleX\(1\)/.test(pill.k[0].transform) && pill.k[1].transform === "none", pill ? pill.k[0].transform : "no animation");
    ok("M7 no page errors", !w.errs.length, w.errs.join(" | "));

    // ---- reduced motion: nothing animates ----
    ({w, ev, d} = await page({reduce:true}));
    w.animations.length = 0; ev(`commit(s=>{ s.bars.find(b=>b.id==='${pick}').start += 1; })`); ev("setStatus('Saved.')"); await wait(5);
    const segB = [...d.querySelectorAll("#layerSeg button")]; segB[1].dispatchEvent(new w.MouseEvent("pointerdown", {bubbles:true})); segB[1].click(); await wait(40);
    ok("R1 with reduced motion, nothing glides, settles or slides", ev("glideLast") === 0 && !w.animations.length, String(w.animations.length));
    ok("R2 no page errors", !w.errs.length, w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
