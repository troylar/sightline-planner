// drive.js <playwright> <script.js> <out.json>: run a page script (an async function of a Playwright page) in Chromium
// and write what it returns. publish.sh uses it to check that the published page runs and a changed copy is blocked.
const pw = require(process.argv[2]), fs = require("fs");
(async()=>{ const b = await pw.chromium.launch(); const page = await b.newPage();
  const fn = require(require("path").resolve(process.argv[3]));
  const r = await fn(page); fs.writeFileSync(process.argv[4], JSON.stringify(r, null, 1)); await b.close(); })().catch(e=>{ console.error(e); process.exit(1); });
