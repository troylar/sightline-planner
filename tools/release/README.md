# Release scripts

How a merged pull request becomes a published release. They're kept here, not on one machine, so the checks they
make can't quietly disappear. Nothing here ships in the npm package (`tools/` isn't in `files`).

| Script | What it does |
|---|---|
| `gate.sh <pr> [sha]` | Waits for CI on the pull request's head commit and exits 0 only if both workflows ran there, every run passed, and the head is still that commit. After a push, pass the pushed sha so the gate waits for GitHub to move the head. Reruns a cancelled run once. |
| `publish.sh <version>` | In a clean release worktree: checks out main, refuses unless main's own CI on that commit passed, builds, runs the full suite and every browser suite, publishes the page and helpers to the docs folder, runs `npm pack` (never `npm publish`) and checks the tarball. Writes a report. |
| `withlock.sh <command>` | Runs one test suite at a time on a machine, so parallel suites don't starve each other's timers. |
| `browser-count.sh` | The publish gate's browser count: every suite listed in `test/run.sh` must report N/N passed. `test-browser-count.sh` tests it; `test/run.sh` runs that test. |
| `test-gate.sh` | Runs `gate.sh` against a stand-in `gh` that scripts what GitHub reports: the head arriving late, never arriving, or moving while the gate waits, and a failed run. `test/run.sh` runs it. |
| `drive.js` | Runs a page script in Chromium; `publish.sh` uses it to check that the published page runs and a changed copy is blocked. |

The order: merge with `gh pr merge <pr> --squash --match-head-commit <sha>` only after `gate.sh <pr> <sha>` passes, wait for main's CI on the merge
commit, then `withlock.sh publish.sh <version>`. `publish.sh` reads its settings from the environment (see the top of the
file): no path, name or term that identifies a machine, a person or an employer belongs in these files.
