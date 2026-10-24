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
