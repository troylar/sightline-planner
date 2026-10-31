# Sightline — Claude Code Instructions

**Sightline** — "Your team's work, in plain sight." A delivery planner that ships as **one
self-contained HTML file**. No server, no install, works offline. The plan itself lives in a
separate JSON/YAML file the user opens and saves through the browser's File System Access API.

**Read [`vision.md`](vision.md) before changing anything.** It's the product charter. Jira items are read-only,
always shown from the latest sync and never copied into the plan. Plan items are everything the team adds around
them: anyone adds anything, with who added it, tags, and hide/show. In the app they're labeled **From Jira** and
**Added here**. The whiteboard in vision.md is an explanation, not vocabulary: never put "printed" or "sticky" in
the UI. Every PR states
which side of the wall it touches: Jira facts, the plan, a viewer's preferences, or something computed from both. A
change that doesn't fit the charter changes `vision.md` first, in its own PR.

## Layout

| Path | What it is |
|------|-----------|
| `src/sightline.template.html` | **The source.** All HTML, CSS and JS (~5,500 lines). Edit this. |
| `src/js-yaml.min.js` | Vendored js-yaml 4.1.0 (MIT). Embedded at build time. Do not edit. |
| `src/fonts/` | Vendored Instrument Sans (SIL OFL 1.1), pinned in `fonts.json`, embedded as data URIs. Do not edit. |
| `dist/sightline.html` | Build output. Generated — **never edit by hand**, it is overwritten. |
| `test/harness*.js` | jsdom test harnesses. |
| `test/fixtures/sample-plan.json` | Synthetic plan the tests load. |
| `tools/sightline-jira-sync.py` | Optional read-only Jira Data Center sync (stdlib only). |

## Commands

```bash
./build.sh                                  # src -> dist/sightline.html, then node --check
PUBLISH_TO=/path/to/plan.html ./build.sh    # also copy the build somewhere
./test/run.sh                               # every harness + build and Jira tool checks; non-zero exit on any failure
```

**Always build, then run the full suite, before calling a change done.** A focused run of one
harness is not evidence. Report the per-harness counts (e.g. `harness4 402/402 passed`).

## The data rule — read before every commit

This repo must never contain a real plan, real people, or anything that identifies an
employer or client.

- Tests load **only** `test/fixtures/sample-plan.json`. Its names (Avery, Blake, Casey,
  Morgan…) and projects (Integrations, Search, API v2…) are invented.
- Never point a harness at a real plan file, and never add a real plan as a fixture.
- Never use real Jira names in examples, tests or release notes: not the board, project key, server, sprint names or
  team name. Use synthetic ones (Team board, ABC-123, jira.example.com). Before every commit, run
  `./tools/check-private.sh` (it fails on the private terms listed in `~/.config/Sightline/private-terms`, which is
  kept outside the repo so the terms themselves never get committed).
- Never hard-code a real name in an assertion. Assert on the fixture's names.
- Placeholder URLs stay placeholders (`https://yourcompany.atlassian.net/browse/`).
- `.gitignore` blocks common plan/status filenames as a backstop. It is not the control.

Before any push: `grep -riE` the diff for real names, company names, internal hostnames and
absolute home paths. A pushed commit stays reachable by SHA even after a branch is deleted —
prevention is the only real control.

## Release notes — every user-visible change gets one

`src/releases.json` is the source of the What's new panel and of `CHANGELOG.md`. Newest release first.

- **Add an entry in the same change that ships the behavior.** If a user can see it, it goes in. Pure
  refactors and test-only changes don't.
- **Bump the version:** a fix is a patch (1.1.0 → 1.1.1), anything new or improved is a minor (→ 1.2.0).
  A major is only for a change older copies couldn't open at all, even read-only. A new saved field or a
  `SCHEMA` bump isn't one on its own: older copies open those plans read-only, and the release note says so.
  `APP_VERSION` is always the newest release; there is no other version to update.
- **Each change:** `kind` (new / improved / fixed), `area`, `title`, `now`, and where it helps `before`
  and `where`. Write for the people using the planner, not for engineers: what they'll notice and where
  to find it. US English, plain words, no people's names, no employer or client names.
- `build.sh` validates the file and fails the build on a bad entry (out-of-order versions, unknown kind,
  a missing field, a typo'd field name). It regenerates `CHANGELOG.md` — **never edit that by hand.**
- The data is embedded in the page with every `<` escaped as `\u003c`, so release text can't break out
  of the script (`</script>`, `<!--<script>`). `test/test_build.py` proves both.

## Design principles (keep these true)

- **The file is the source of truth.** The page never silently overwrites it: file operations
  are serialized, conflicts are detected by content and backed up, and a soft edit lock
  (Start / Save / Done, 30-minute TTL, clock-skew tolerant) prevents two editors clobbering
  each other. There is no true compare-and-swap; last-writer-wins is still possible, and
  OneDrive conflict copies are the backstop.
- **No remote code, and only our own scripts.** js-yaml and the font are embedded. CSP is `default-src 'none'`, `font-src data:`,
  `connect-src 'none'`, `object-src 'none'`, `base-uri 'none'`, and `script-src` lists the two inline
  scripts **by SHA-256 hash**, computed by `build.sh`. The source template keeps `'unsafe-inline'` as the
  placeholder the build replaces. Any script that isn't byte-for-byte one of those two will not run.
  - Never add inline `on…=` attributes, `javascript:` URLs, `eval` or `new Function` — the policy blocks them.
  - Adding a third `<script>` block means updating the count `build.sh` asserts.
  - jsdom does not enforce CSP, so harness8 F11 checks the policy text. A change to the policy or the
    scripts must also be opened in a real browser: the app must run, and a copy with one character
    changed in a script must be blocked.
- **Build the DOM with the `h(tag, attrs, ...kids)` helper**, not `innerHTML`. There is one
  `innerHTML` use today; do not add more. Anything from a plan file or Jira is untrusted and
  is rendered as text.
- **Read-only Jira.** The sync script only calls `GET /rest/api/2/search`, keeps the PAT in the
  OS credential store (Windows Credential Manager / macOS keychain), and writes
  `jira-status.json` atomically. The browser never sees a token.
- **The Jira search belongs to whoever runs the sync.** `--jql` / `--filter` come from that person's command
  line, never from the shared plan: the search runs with their token and its results land in a file the
  team can read (`jira-issues.json`, separate from `jira-status.json`), so a plan editor must not be able
  to aim someone else's token. Issues from the search are
  only offered in the page; nothing joins the plan until someone editing clicks Add. Skips are shared in
  `meta.jiraSkip`.
- **Epics are counted, not copied.** `bar.epics` lists epic keys; the script counts their children (by Epic Link,
  Parent Link, and `parent`, whichever the server has) into `rollups` in `jira-status.json`. An initiative linked
  to epics is compared with its stories, never the epic's own status, which sits at In Progress for months.
- **Who added what is stamped in one place**, `stampAuthors` in `commit` (after the edit, before automatic moves), as
  `added {by, at}` / `edited {by, at}` on every `STAMPED` collection and tasks. Never set them by hand. `added` never
  changes in a merge, and `edited` never counts as a clash. Each quick update and save appends one `S.changes`
  record (`changeRecord`, pruned by `pruneChanges`), which never logs Jira's own values.
- **Storage goes through `FileStore` / `LocalStore`** (the seam for a later database): read, write-if-unchanged, serialize,
  drafts, watching. Never touch the file handle or localStorage for the plan directly. Merging is `mergePlans(base, mine,
  theirs)`, a pure function.
- **Adding a saved field that older copies don't know:** name it in `featuresIn(plan)` and `KNOWN_FEATURES`, so a copy
  that doesn't know it opens the plan read-only instead of dropping it. Bump `SCHEMA` only for a change older copies
  can't read, and then, in the same pull request: add a `MIGRATIONS` step `{to: SCHEMA, run}` (tests fail without one),
  set `PLAN_SCHEMA` in `tools/sightline-jira-sync.py` to match (tests check), teach the sync's plan reading the new
  shape, and say in the release note that older copies will open the plan read-only. The first save in the new format
  downloads the old file as a backup. The Jira files carry their own `version`: bump `STATUS_FORMAT` / `ISSUES_FORMAT`
  in the sync and `JIRA_FORMATS` in the page together. Writes stay under 2 MB (`MAX_BYTES`); reads accept up to 5 MB.
- **Count epics through `epicCounts(key, offSet)`**, which is cached per draw: never build a stand-in bar to call
  `epicRollup`. Every draw-time cache (stories, counts, the epic list) is dropped by `dropJiraMemos()` in `render` and
  `commit`, and checks which `JIRA` object it was built from. Add new caches there. Stale future sprints are decided
  only by `staleSprint(j)`.
- **Stories are drawn, never stored.** An epic's stories come from `JIRA.rollups[k].children` at draw time
  (`storyIndex`/`storiesOf`, rebuilt on each render and commit). Only `bar.storiesOff` (a set) is saved. Never push
  stories into `S` or `b.tasks`: that would put them in history, the diff and the shared file, and flip `hasTasks`.
  A story that's a task (or a leaf initiative) in the plan is shown as that item.
- **One initiative per epic.** An epic is on an initiative through `bar.epics` or the bar's own `jira` key; always
  find it with `epicOwner(k, bars)`, never `bar.epics` alone, and change both forms together (park, link, back on).
  Jira-dated items are fixed inputs to `reschedule` (`jiraFixed`); a dependency clash is a warning, not a move.
- **Jira owns what it's linked to.** A leaf initiative or task with a Jira key takes its dates from the issue's
  sprint (`sprintStart`/`sprintEnd`, in the plan's range) and its status from Jira; `applyJira` runs at the start of
  every `render()`, so undo, merges and new syncs can't leave it out of place. Drag and the date/status fields refuse
  (`jiraLockOf`). At risk and Blocked stay Sightline's. Epic initiatives: status from stories, dates only suggested.
- **"Workstream" in the interface, `lanes` in the data.** Rows are called workstreams everywhere a person reads them;
  the plan file, code and CSS keep `lanes` / `lane` so older copies and the sync keep working. Rename labels by exact
  string, never by pattern: a regex over string literals once rewrote code (`S.lanes` -> `S.workstreams`).
- **The sync is per user, per server, per plan.** Local config (`%APPDATA%/Sightline/jira.json`, never in the
  shared folder) holds `servers` {host: base, fields} and `plans` {normcased plan path: jira, board, jql, folder,
  every}. Tokens are per host in the credential store. Nothing that aims a token lives in the shared folder, and a
  copied project folder has no settings until its owner runs `sync --save`. Jira files go in `jira/` beside the plan.
- **Never run the token from the shared folder.** `install` copies the script to `%APPDATA%/Sightline/bin` and puts
  a launcher in the user's Startup folder; `warn_if_shared()` warns otherwise. No .bat/.cmd in the shared folder.
- **What a Jira status means comes from `jiraState()`, in this order:** the team's `meta.jiraStatusMap` /
  `meta.jiraResMap`, abandoned resolutions (`ABANDON_RES`), abandoned statuses (`ABANDON_ST`), the board's columns
  (last = done, to-do category = not started, else in progress), then Jira's category. Jira's categories alone are
  wrong on real servers (Completed = in progress, Abandoned = done). Abandoned = status done + `abandoned: true`,
  left out of `rollupOf` and epic counts. Epic counts arrive `byState` so the map applies without a re-sync.
- A `future` sprint whose end has passed is a parking lot: it never schedules an issue or shapes the plan's sprints.
- **Sprints follow the Jira board.** `sprintProposal()` rebuilds `S.sprints` from `JIRA.sprints` in whole weeks from
  the plan's start (never moving the start), with "No sprint" gaps, then keeps the plan's own sprints past Jira's last.
- **Lists of Jira keys merge as sets.** `meta.jiraSkip` and `bar.epics` are merged item by item in `rebaseOnto`
  (both sides' additions kept, a deliberate removal stays removed). Any new shared list of keys belongs in `SETF`.
- **People link to Jira by user key, never by name or email.** `person.jira = {key, user, name}`; matching uses
  `key` (immutable on Data Center). The script never writes an email: an email-like key becomes a one-way
  `h-` hash and an email-like user name is dropped. Name similarity only *suggests*; a link needs a click,
  and an unlinked assignee is never guessed from their display name.
- **Never write what you can't read back.** Every write path (Save, quick update, new shared plan) checks the
  serialized size in bytes against `MAX_BYTES` *before* writing. The read limit is enforced on open, so an
  oversize write would leave a file nobody can open.
- **Never drop a user's edit without a copy.** Where a teammate's newer value wins (rebase), back up the local
  version first — the same rule `refresh(discard)` and the conflict banner already follow.
- **One status line, two speakers.** Operations call `setStatus(text)`. The edit strip announces its own state with
  `setStatus(text, true)` and stays quiet if an operation spoke in the last second — otherwise it overwrites the
  reason a save was refused.
- **Plain language in the UI.** Labels say what happens ("Save as a new shared plan"), not how.
- **US English everywhere** — UI strings, help, docs, commits: color, gray, canceled, neighbor,
  behavior, organize. Grep for UK spellings before shipping user-facing text. Keep loaders
  accepting old keys when a data key is renamed.

## Known security gaps

- Decision and risk text have no length cap (notes are capped at 500), so one long paste can push a
  plan toward the 2 MB limit. The write-size check now refuses it with a clear message.

## Working style

- Plan, then change. For anything beyond a small fix, say what you will change and which
  checks prove it before editing.
- Add a harness check for every behavior you add or fix. New checks go in the harness that
  covers that area; `harness4` is the broad one.
- **A fix's check must fail on the code before the fix.** Run it against the old build to prove it
  (`SIGHTLINE_HTML=/path/to/old.html node test/harness8.js`). A check that passes either way tests nothing.
- Every harness ends with `process.exit(f ? 1 : 0)`. Without it, jsdom's timers keep the process alive
  until `run.sh`'s timeout kills it — which is how the suite once took 15 minutes instead of 40 seconds.
- Keep changes scoped. Do not refactor unrelated code in the same change.
- Commit format: `type(scope): description` — e.g. `fix(days): stop standup rows zig-zagging`.
