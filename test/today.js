// "Today" for tests. The sample plan runs 2026-09-21 to 2026-12-13, so a check that reads today against it has to say which day.
// pinDate(w, "2026-10-28") moves a jsdom window's clock to that day at local noon; time keeps running from there.
// As a preload it finds the checks that forgot to: NODE_OPTIONS="--require ./today.js" SIGHTLINE_TODAY=2026-12-20 ./run.sh moves
// "now" for every test, jsdom window and Playwright page, and a check pinned with pinDate or page.clock.install still wins.
const shift = (RD, iso) => { const off = new RD(iso + "T12:00:00").getTime() - RD.now();
  class D extends RD { constructor(...a){ if (a.length) super(...a); else super(RD.now() + off); } static now(){ return RD.now() + off; } }
  return new Proxy(D, {apply:() => new D().toString()}); };
const pinDate = (w, iso) => { w.Date = shift(w.Date, iso); };
module.exports = {pinDate};

const T = process.env.SIGHTLINE_TODAY;
if (T && require.main !== module && !global.__sightlineToday){
  global.__sightlineToday = true; global.Date = shift(Date, T);
  const Module = require("module"), load = Module._load;
  const onPage = p => p.clock.install({time:new Date()}).then(() => p);
  Module._load = function(req){
    const m = load.apply(this, arguments);
    if (req === "jsdom" && m.JSDOM && !m.JSDOM.__today){
      class J extends m.JSDOM { constructor(html, o = {}){ const bp = o.beforeParse; super(html, {...o, beforeParse(w){ pinDate(w, T); if (bp) bp(w); }}); } }
      J.__today = true; return {...m, JSDOM:J};
    }
    if (/playwright/.test(req) && m && m.chromium && !m.chromium.__today){
      const launch = m.chromium.launch.bind(m.chromium);
      m.chromium.launch = async (...a) => { const b = await launch(...a), np = b.newPage.bind(b), nc = b.newContext.bind(b);
        b.newPage = async (...x) => onPage(await np(...x));
        b.newContext = async (...x) => { const c = await nc(...x), cp = c.newPage.bind(c); c.newPage = async (...y) => onPage(await cp(...y)); return c; };
        return b; };
      m.chromium.__today = true;
    }
    return m;
  };
}
