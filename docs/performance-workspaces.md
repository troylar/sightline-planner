# Workspace performance checks

The standalone benchmark compares an archived build with the current build using jsdom and synthetic data derived
from `test/fixtures/sample-plan.json`. It installs no additional dependencies and is informational, outside `test/run.sh`.

Build the current page, then run:

```bash
./build.sh
node test/performance-workspaces.js /path/to/original/sightline.html dist/sightline.html 5 > /tmp/workspace-performance.json
```

The final argument is the number of samples per workspace (default 5, minimum 3). The script warms each workspace
twice, measures synchronous navigation/render work, and reports median/minimum/maximum milliseconds, DOM node counts,
and mean time in selected rendering functions. Function timings include nested work; do not add them together.

The scenario has 120 epic initiatives, 600 Jira stories, 120 plan tasks and 60 deliverables, using the fixture's people
and workstreams. Dates are fixed around September 30, 2026. It visits Timeline, Today, Sprint, People, Roadmap and
Status update in order, retaining hidden workspace DOM as normal navigation does. The assistant is disconnected.

During the workspace navigation change, profiling identified document-wide navigation selectors as unnecessary work.
Caching the fixed navigation buttons and elements reduced `renderMainNav` from roughly 25–95 ms to about 0.1 ms
per render across this scenario. Navigation regression checks cover the cached elements' behavior.

These are jsdom JavaScript/DOM measurements, not browser layout, paint or interaction latency. The recorded comparison
ran alongside other checks, so whole-page timings are noisy and are not release thresholds or a promised speedup.
For repeatable comparisons, stop other heavy work and repeat with build order reversed. Use real-browser profiling
before making claims about perceived responsiveness.

Hidden Timeline and setup-table rendering is deferred until the relevant workspace is visible. Timeline visibility
is restored before measuring its geometry; returning to it draws current data. Shared model refresh, Jira facts,
freshness and assistant context remain independent of chart visibility. `harness106` checks hidden-render call counts,
return-to-Timeline behavior, filters, selection/deep links, Days/Weeks and live Jira facts.

Text inputs update the model, history and dirty state synchronously, then combine derived rendering while typing.
The deferred update is cancelled when a full render supersedes it. Regression checks cover immediate model changes,
undo, cursor retention and the deferred screen update without depending on a machine-specific time threshold.

The connected-assistant regression harness (`harness100`) counts payload builds and file writes. View changes and unchanged foreground checks must add neither; real saved-source, Jira, proposal and receipt changes must still refresh outputs. A Chrome Incognito smoke test also verified that ordinary navigation left context/results modification times unchanged after a proposal was reviewed and applied.

## Browser harness

`test/perf/` measures the built page in Chromium on synthetic plans. It's the harness to use before claiming a change is
faster or slower. It needs Playwright (a dev dependency) and its Chromium:

```bash
npm ci && npx playwright install chromium
./build.sh
npm run perf -- --sizes S,M --cpu 1,4                          # results.json and report.html in test/perf/
npm run perf -- --sizes L --cpu 4 --compare test/perf/baseline.json
node test/perf/profile.js M tl.two 4                           # where one scenario's time goes, by function
```

**Plans.** `test/perf/gen.js` makes a plan file and a Jira status file from a fixed seed, in four sizes. The names, keys
and text are invented.

| Size | Workstreams | Initiatives | Plan tasks | Jira stories | Time span |
|---|---|---|---|---|---|
| S | 5 | 30 | 150 | 300 | 6 months |
| M | 12 | 120 | 800 | 2,000 | 1 year |
| L | 25 | 400 | 3,000 | 8,000 | 2 years |
| XL | 40 | 1,000 | 8,000 | 25,000 | 3 years asked, 2 drawn |

Each plan mixes in the hard shapes:
- long labels and overlapping bars;
- eight milestones on one day;
- dependency chains 20 deep;
- epics across several sprints, stories not estimated, with no sprint or abandoned;
- a stale future sprint, parked initiatives and stories turned off;
- notes, decisions and risks.

A plan covers at most 104 weeks, so XL is drawn over two years. XL's Jira file is past the page's read limits (5 MB and
9,000 issues), so the harness loads it in memory to measure the drawing only. The report says so.

**Scenarios.** Plans are built around today's date, so the page runs on its real clock: a stand-in `Date` costs
measurable time in every draw. The same size, seed and day give the same plan (`PERF_TODAY` rebuilds another day's).
Each run opens a fresh page at 1440 by 900 and opens the plan
the way a person does: a file handle through `adopt`, then the Jira folder through `readJiraDir`. Then it runs:

- **Load:** opening the plan and Jira folder, to the first drawn Timeline.
- **Jira:** a new sync arriving.
- **Timeline:**
  - Weeks at Fit, This sprint, This + next and Next 3;
  - zooming in and out;
  - scrolling sideways and down;
  - turning sprint shelves off and on, where the version has them.
- **Days:** switching to it, and scrolling across a quarter.
- **Interactions:**
  - opening and closing a panel;
  - dragging a bar and dropping it;
  - typing in Find;
  - a filter;
  - switching views;
  - Undo;
  - saving.
- **Pages:** Today, Sprint, Cards (where present), List, Roadmap and Capacity.

**Measures.**
- **Responses:** from the change to the next painted frame, as the median and 95th percentile over the runs (5 at S
  and M, 3 at L and XL). For real clicks and keys, it is the time from the input event's own time stamp to the second
  frame after it, plus any long task the drop sets off.
- **Long tasks:** count, and the longest over 50 ms.
- **Layouts and style recalcs:** from the DevTools protocol.
- **Page state:** DOM nodes and JS heap after each scenario.
- **Motion:** frames per second, dropped frames (over 25 ms) and the worst frame. Scrolling sets the scroll position once per frame, so scroll handlers run on the
  main thread: this is the worst case, not compositor-only scrolling.

`--cpu 4` throttles the CPU four times, as a stand-in for a slower work machine.

**Budgets and the baseline.**
- `budgets.json` holds the proposed budgets at M and L with 4x throttling.
- A scenario already over budget is listed under `known` with today's measured value, so the check still fails if it
  gets worse, and the entry is removed when a fix brings it under budget.
- `--compare baseline.json` flags any scenario more than 20% slower than the baseline. Compare only runs from the same
  machine.
- CI runs S and M on every change against `budgets-ci.json`, which is calibrated for the CI runner. L and XL run by hand.
