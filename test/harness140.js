// List columns (docs/workspaces.md, "List"): every column can be resized, by dragging its heading's edge or with the
// arrow keys, and set to wrap or keep one line (cut short, with the full text on hover). These are the viewer's own, kept
// in this browser, never in the plan. Synthetic plan: fixtures/sample-plan.json.
const {JSDOM} = require("jsdom"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(process.env.SIGHTLINE_HTML || path.join(__dirname, "..", "dist", "sightline.html"), "utf8").replace(/<link[^>]+fonts[^>]+>/, "");
const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-plan.json"), "utf8");
const R = []; const ok = (n, c, x = "") => R.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  (" + x + ")" : ""}`);
setTimeout(()=>{ console.log(R.join("\n")); console.log("TIMEOUT"); process.exit(1); }, 50000).unref();
const wait = ms => new Promise(r=>setTimeout(r, ms));
const boot = (ui) => new JSDOM(html, {runScripts:"dangerously", pretendToBeVisual:true, url:"https://local.test/", beforeParse(w){
  const RealDate = w.Date, now = new RealDate("2026-10-07T14:00:00Z").getTime();
  w.Date = class extends RealDate {constructor(...a){ a.length ? super(...a) : super(now); } static now(){ return now; }};
  w.HTMLDialogElement.prototype.showModal = function(){ this.open = true; }; w.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  w.indexedDB = undefined; w.confirm = ()=>true; w.alert = ()=>{}; w.prompt = ()=>"T"; w.Element.prototype.scrollIntoView = ()=>{};
  w.HTMLCanvasElement.prototype.getContext = ()=>({measureText:t=>({width:String(t).length * 7})});
  if (ui) w.localStorage.setItem("timeline-planner-ui", JSON.stringify(ui));
  w.CSS = w.CSS || {}; w.CSS.escape = s=>s; w.errs = []; w.addEventListener("error", e=>w.errs.push(e.message)); }});
const open = async (ui) => { const dom = boot(ui), w = dom.window, d = w.document, ev = s=>w.eval(s);
  await wait(150); ev("askWhoOnStart = ()=>{}; reschedule = ()=>({moved:0})"); ev(`loadExternal(${JSON.stringify(sample)}, "sample")`); await wait(40); ev("setListLayoutQuiet('initiative')");   // the column checks read every column
  d.querySelector("#tab-list").click(); await wait(20); return {w, d, ev, J:s=>JSON.parse(ev(`JSON.stringify(${s})`))}; };
(async()=>{
  try {
    const {w, d, ev, J} = await open();
    const tbl = () => d.querySelector("#listTable"), rz = k => d.querySelector(`#listTable .lrz[data-col="${k}"]`), colW = k => (d.querySelector(`#listTable col[data-col="${k}"]`) || {style:{width:"none"}}).style.width;
    const cells = k => [...d.querySelectorAll(`#listTable tbody [data-col="${k}"]`)], saved = () => JSON.parse(w.localStorage.getItem("timeline-planner-ui") || "{}").listCols;
    const key = (k, key, shift) => rz(k).dispatchEvent(new w.KeyboardEvent("keydown", {key, shiftKey:!!shift, bubbles:true, cancelable:true}));
    const plan0 = ev("JSON.stringify(planOfRecord(S))");
    ok("D1 out of the box: the table fits its text, with no fixed widths", !!tbl() && !tbl().classList.contains("lfixed") && !tbl().style.width && colW("item") === "");
    ok("D2 …only the dates stay on one line, every other column wraps", cells("start").every(c=>c.classList.contains("nw")) && cells("end").every(c=>c.classList.contains("nw")) && cells("item").length > 3 && !cells("item").some(c=>c.classList.contains("nw")));
    const nameCell = d.querySelector("#listTable tbody td.lname"), lt = nameCell && nameCell.querySelector(".lt");
    ok("F1 an Item cell is a table cell, not the Timeline's flex name box, and its name is full size", !!lt && w.getComputedStyle(nameCell).display === "table-cell" && w.getComputedStyle(lt).fontSize !== "11px", nameCell && w.getComputedStyle(nameCell).display + " " + (lt && w.getComputedStyle(lt).fontSize));
    const seps = [...d.querySelectorAll("#listTable thead th[scope=col] .lrz")];
    ok("A1 every column heading has a resize edge: a focusable separator with a name and its limits", seps.length === 7 && seps.every(s=>s.getAttribute("role") === "separator" && s.tabIndex === 0 && /^Resize the .+ column$/.test(s.getAttribute("aria-label")) && s.getAttribute("aria-valuemin") === "48" && s.getAttribute("aria-valuemax") === "900" && s.getAttribute("aria-orientation") === "vertical"), seps.map(s=>s.getAttribute("aria-label")).join(", "));
    ok("A2 …and says it fits its text until a width is set", rz("item").getAttribute("aria-valuetext") === "fits its text" && !rz("item").hasAttribute("aria-valuenow"));
    key("item", "ArrowRight");
    ok("K1 an arrow key on Item's edge widens it by 16 pixels and fixes every column at a width, so nothing else jumps", tbl().classList.contains("lfixed") && colW("item") === "336px" && ["start", "end", "lane", "owner", "waits", "status"].every(k=>/^\d+px$/.test(colW(k))), ["start", "end", "item", "lane", "owner", "waits", "status"].map(colW).join(" "));
    ok("K1 …the table is as wide as its columns (it scrolls sideways when wider than the page)", tbl().style.width === (96 + 96 + 336 + 150 + 180 + 220 + 170) + "px", tbl().style.width);
    ok("K1 …and the edge reports its width", rz("item").getAttribute("aria-valuenow") === "336" && rz("item").getAttribute("aria-valuetext") === "336 pixels");
    key("item", "ArrowRight", true); key("owner", "ArrowLeft");
    ok("K2 Shift takes bigger steps; Left narrows", colW("item") === "400px" && colW("owner") === "164px");
    for (let i = 0; i < 20; i++) key("start", "ArrowLeft");
    ok("K3 a column can't go below 48 pixels", colW("start") === "48px");
    ok("K4 the keys stay on the edge: focus isn't moved, no row is selected", !ev("sel"));
    ok("P1 the widths are saved as this viewer's own, in this browser", JSON.stringify(saved().w) === JSON.stringify({start:48, end:96, item:400, lane:150, owner:164, waits:220, status:170}), JSON.stringify(saved()));
    ok("P1 …and never in the plan", ev("JSON.stringify(planOfRecord(S))") === plan0 && !/listCols/.test(ev("JSON.stringify(S)")));
    ev("render()");
    ok("P2 they survive a redraw", colW("item") === "400px" && tbl().classList.contains("lfixed"));
    const down = (x, type = "pointerdown") => rz("waits").dispatchEvent(new w.MouseEvent(type, {clientX:x, button:0, bubbles:true, cancelable:true}));
    down(500); down(540, "pointermove");
    ok("G1 dragging a heading's edge resizes the column as the pointer moves", colW("waits") === "260px" && rz("waits").classList.contains("drag") && d.body.classList.contains("lresizing"));
    down(560, "pointermove"); down(560, "pointerup");
    ok("G1 …and saves the width when let go", colW("waits") === "280px" && saved().w.waits === 280 && !d.body.classList.contains("lresizing") && !rz("waits").classList.contains("drag"));
    rz("waits").dispatchEvent(new w.MouseEvent("dblclick", {bubbles:true, cancelable:true}));
    ok("G2 double-clicking an edge puts that column back to its default width", colW("waits") === "220px" && saved().w.waits === 220);
    rz("item").click();
    ok("G3 clicking an edge doesn't select a row", !ev("sel"));
    d.querySelector("#listColsToggle").click();
    const box = d.querySelector("#listColsBox");
    ok("W1 Columns opens a panel: a Wrap text box per column, its width, and Reset", !!box && d.querySelector("#listColsToggle").getAttribute("aria-expanded") === "true" && box.querySelectorAll("input[type=checkbox]").length === 7 && /400 px/.test(box.textContent) && !d.querySelector("#listColsReset").disabled);
    ok("W1 …dates start unchecked, the rest checked", !d.querySelector("#lcw-start").checked && !d.querySelector("#lcw-end").checked && d.querySelector("#lcw-item").checked && d.querySelector("#lcw-status").checked);
    const longName = ev(`(()=>{ const b = S.bars.find(b=>!b.parked); return b ? chartLabel(b) : ""; })()`);
    const item = d.querySelector("#lcw-item"); item.checked = false; item.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("W2 turning off wrap for Item keeps each name on one line", cells("item").every(c=>c.classList.contains("nw")) && saved().nw.includes("item") && d.activeElement && d.activeElement.id === "lcw-item");
    ok("W2 …cut short with the full text on hover", cells("item").every(c=>c.title && c.title === c.textContent.replace(/\s+/g, " ").trim()) && cells("item").some(c=>c.title.includes(longName)), cells("item")[0].title);
    const st = d.querySelector("#lcw-start"); st.checked = true; st.dispatchEvent(new w.Event("change", {bubbles:true}));
    ok("W3 any column can wrap, the dates too", !cells("start").some(c=>c.classList.contains("nw")) && !saved().nw.includes("start"));
    ok("W4 the CSS keeps a one-line column on one line, and cuts it short only when widths are fixed", /\.ltable \.nw,\.ltable \.nw \*\{white-space:nowrap\}/.test(html) && /\.ltable\.lfixed \.nw,\.ltable\.lfixed \.nw>\*\{overflow:hidden;text-overflow:ellipsis\}/.test(html) && /\.ltable\.lfixed\{table-layout:fixed\}/.test(html));
    ok("W5 printing shows every column in full: no fixed widths, wrapping, no resize edges", /body\.on-list \.ltable\.lfixed\{table-layout:auto;width:100%!important\}/.test(html) && /body\.on-list \.lrz\{display:none\}/.test(html));
    ok("M1 Copy as table is unchanged", ev("listMarkdown(listGroups(listModel(), listLayout()), listLayout())").startsWith("| Start | End | Item | Workstream | Owner | Waits for | Status |\n"));
    ev("setListLayout('lane')"); const sum = J("listColsShown().reduce((n, [k, , d0])=>n + (listCols().w[k] || d0), 0)");
    ok("L1 By workstream has no Workstream column, and its fixed width leaves that column out", !rz("lane") && !cells("lane").length && tbl().style.width === sum + "px" && !J("listColsShown().some(c=>c[0] === 'lane')"), tbl().style.width + " / " + sum);
    ev("setListLayout('initiative')");
    d.querySelector("#listColsReset").click();
    ok("R1 Reset columns: back to fitting the text, only the dates on one line, nothing saved", !tbl().classList.contains("lfixed") && colW("item") === "" && !saved() && cells("start").every(c=>c.classList.contains("nw")) && !cells("item").some(c=>c.classList.contains("nw")) && d.querySelector("#listColsReset").disabled);
    const row = d.querySelector("#listTable tr[data-lk]"); row.click();
    ok("R2 rows still open their details", !!ev("sel"));
    ok("Z no page errors", !w.errs.length, w.errs.join(" | "));
    const h2 = await open({listCols:{w:{item:"1e9", start:-3, junk:5, constructor:7}, nw:"item"}});
    ok("S1 a hand-edited setting is cleaned up: widths capped at 900, unknown and bad ones dropped", h2.J("listCols()").w.item === 900 && !("start" in h2.J("listCols()").w) && !("junk" in h2.J("listCols()").w) && h2.d.querySelector('#listTable col[data-col="item"]').style.width === "900px", JSON.stringify(h2.J("listCols()")));
    ok("S1 …a wrap setting that isn't a list means the default", JSON.stringify(h2.J("listCols().nw")) === '["start","end"]');
    ok("S2 no page errors", !h2.w.errs.length, h2.w.errs.join(" | "));
  } catch(e){ ok("harness ran without throwing", false, e.stack); }
  console.log(R.join("\n")); const f = R.filter(x=>x.startsWith("FAIL")).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
