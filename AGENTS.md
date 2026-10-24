# Sightline repository instructions

## Start here

- Read `vision.md` before changing behavior. It is the product charter. Read
  `CLAUDE.md` for the detailed project conventions and `.github/pull_request_template.md`
  before preparing a PR.
- Confirm the checkout, branch, and working tree before editing. Work stays in the
  checkout the user named; another worktree's features or test results do not describe
  this one. Preserve unrelated local changes.
- For more than a small fix, explain the intended change and how it will be checked.
  Keep unrelated refactors out of the change.
- Treat historical roadmap status, source line counts, and example output paths as
  context. Verify current behavior in the code and CLI arguments.

## Product and ownership

Sightline is a delivery planner distributed as one self-contained HTML file, with
no server or installation. Plans are separate JSON/YAML files. The browser uses
the File System Access API for linked shared files and has a browser-local mode.
The optional Python helper reads Jira Data Center and writes files the page reads.

- Jira owns issue facts: titles, status, resolution, assignees, points, labels,
  hierarchy, and Jira sprint dates. The page never contacts Jira or changes Jira facts.
- Sightline owns plan items, placement, dependencies, notes, tags, proposals, and
  team views. Viewer preferences belong to the viewer's browser.
- State which area a change touches: Jira facts, the plan, viewer preferences, or
  values computed from both. A change outside the charter requires a separate
  charter change first.
- Keep one placement per Jira issue and prevent double counting within a measure.
  Retain annotations by stable ID or Jira key when an issue moves or disappears
  from a sync.
- Show freshness, partial coverage, count units, and recoverable hidden work.
  A missing issue means "not in the last sync," not "deleted."
- A shared file, author stamp, edit lock, or approval is not an access control or
  verified identity. Never imply otherwise.
- Use **From Jira**, **Added here**, and **workstream** in the interface. Keep
  `lanes`/`lane` in the data and code. Make label changes by exact string, never a
  broad replacement that can rename identifiers.

## Source map

| Path | Purpose and editing rule |
| --- | --- |
| `src/sightline.template.html` | Application HTML, CSS, and plain JavaScript; edit this source. |
| `src/js-yaml.min.js` | Vendored js-yaml; embedded by the build; do not hand-edit. |
| `src/releases.json` | Release history and application version source. |
| `build.sh` | Validates releases, embeds assets, computes CSP hashes, and checks JavaScript syntax. |
| `dist/sightline.html`, `dist/app.js` | Generated build outputs; never hand-edit or add to Git. |
| `CHANGELOG.md` | Generated from releases; update through `build.sh`. |
| `test/harness*.js` | Node/jsdom regression checks using synthetic data. |
| `test/fixtures/sample-plan.json` | Synthetic shared plan fixture. |
| `test/test_build.py` | Build validation and safe release embedding checks. |
| `test/test_jira_sync.py` | Offline checks for the sync helper and amendment checker. |
| `tools/sightline-jira-sync.py` | Standard-library Python Jira helper and offline amendment checker. |
| `tools/check-private.sh` | Private-term scan; see privacy rules below. |
| `tools/make-demo.py` | Synthetic demo generator; `demo/` is ignored. |
| `docs/workspaces.md` | Audience-oriented navigation and view/filter scope. |
| `docs/assistant-workflow.md` | Private assistant folder, snapshots, ownership, and proposal review. |
| `docs/onedrive.md` | Local freshness, shared-file recovery, and manual two-device validation. |
| `docs/performance-workspaces.md` | Synthetic benchmark procedure and limits. |
| `docs/usability-test.md` | Human usability validation procedure. |

## Commands and verification

Run from the repository root. Use Node.js, Python 3, Bash, and a `timeout` command
on PATH. Tests require jsdom from the checked-in npm lockfile; if dependencies
are absent, install with `npm ci`. `npm run build`, `npm test`, and `npm run check` wrap the commands below.

```bash
./build.sh
./test/run.sh

# Focused diagnostics after building; replace N with the relevant harness number.
node test/harnessN.js
python3 test/test_build.py
python3 test/test_jira_sync.py

# Regression proof where the harness supports SIGHTLINE_HTML.
SIGHTLINE_HTML=/path/to/old.html node test/harnessN.js

# Privacy before a commit, after staging the intended changes.
./tools/check-private.sh
```

- Build before testing: harnesses execute `dist/sightline.html`. Testing an old
  generated file does not validate source changes.
- Before calling a change done, run the full build and `./test/run.sh`. Use focused
  checks during iteration; they do not replace the full suite.
- Inspect the explicit harness list in `test/run.sh`; it does not discover files
  automatically. Register a new harness there. Each harness must print its counts
  and exit explicitly with a nonzero code on failure so jsdom timers cannot hang it.
- For behavior changes, add a relevant regression check in the existing area.
  Prove a bug fix's check fails on the old build. If that cannot run, report the
  concrete blocker rather than claiming the fix is fully validated.
- Make date-sensitive tests deterministic by controlling the browser clock and
  choosing explicit working days. Fixed fixture dates plus the real clock drift.
- Useful starting points: harness4 covers broad behavior; 5 the change engine; 8
  security/CSP; 28 storage compatibility; 37–40 shared-file concurrency; 84–87
  amendments; 91–94 onboarding/navigation; 96–98 timeline grouping; and 99–103
  workspaces, assistant integration, and shared-file refresh/recovery. Harness104
  covers interrupted editing; 105 composer drafts, Find, focus and header geometry;
  106 on-demand rendering; and 107 atomic limits and amendment idempotency. Read
  the harness before choosing where a new check belongs.
- The runner requires a successful child exit and an exact matching passed count.
  Failures and timeouts retain their full diagnostics. Keep these guarantees when
  extending it; `test/test_runner.py` exercises crash, timeout and summary failures.
- Report per-suite counts, failures, and checks not run. Never reuse another
  checkout's results or silently treat skipped validation as passing.
- jsdom does not enforce CSP or prove real file-picker, OS file-provider, cloud
  synchronization, cross-device conflict, or human usability behavior. Validate
  those separately in the browser or the relevant environment and state limits.
- Workspace tables and Timeline DOM render on demand. Tests must navigate to the
  workspace they inspect rather than assume hidden screens have been populated.
- Offline Jira tests start temporary localhost HTTP servers. If sandbox rules
  block socket binding, report that environment limitation and use the normal
  approval mechanism to rerun the tests outside the sandbox.
- For script or CSP changes, check the built app in a real browser and verify that
  altering a script in a copy causes CSP to block it.
- `PUBLISH_TO=/path/to/plan.html ./build.sh` also copies the app and writes a
  checksum. Use it only when publishing to that destination is part of the task.

## State, storage, and compatibility

- Parse and normalize external data through the existing validation paths. Keep
  unique stable IDs, nesting limits, and serialized byte limits intact.
- Route plan changes through `commit` or the appropriate `quickSave` path. Preserve
  undo/redo, author stamping, change history, read-only checks, and Jira field locks.
  Let `stampAuthors` maintain `added`/`edited`; do not set those stamps manually.
- A mutator returning `NOCHANGE` must leave its input unchanged: `commit` does not
  roll back that return path. Validate prospective changes before mutating state.
- Persist through `planOfRecord` so Jira display overlays from `applyJira` never
  become saved plan facts.
- Route plan persistence through `FileStore`/`LocalStore`. Keep file operations
  serialized and preserve content-based conflict checks, revision checks, recovery
  drafts, and backups before an edit can be lost.
- Preserve pure merge behavior in `mergePlans` and the change engine. Set-valued
  shared fields need the corresponding `SETF`/`SET_FIELDS` treatment; test concurrent
  additions, deliberate removals, and deleted parent/task cases.
- Edit locks are advisory with expiry and clock-skew handling. Browser writes and
  cloud sync are not a transactional compare-and-swap.
- A successful save or refresh confirms the local file only. Automatic shared-file
  checks default on, retain the user's opt-out, and defer while a field is being
  edited. Never claim a refresh forces OneDrive to download or confirms cloud sync.
- Copy recovery must preserve both originals, show missing current-only work, and
  require a deliberate choice plus normal Save before replacing shared contents.
  Previewing a copy must not change either file. See `docs/onedrive.md` for limits.
- Check serialized UTF-8 byte size before every plan write. Current constants
  allow 2 MiB writes and 5 MiB reads; do not confuse character length with bytes.
- Register new optional persisted features in `featuresIn` and `KNOWN_FEATURES` so
  older copies open unsupported plans read-only rather than discard fields.
- An incompatible plan-format change must update `SCHEMA`, add a `MIGRATIONS` step,
  update Python's `PLAN_SCHEMA` and plan reader, and retain the original-format
  backup. Explain older-copy and merge behavior in the change.
- Update Jira output versions together: Python's `STATUS_FORMAT`/`ISSUES_FORMAT`
  and the browser's `JIRA_FORMATS`.
- Read Jira stories from the sync at draw time; never insert derived stories into
  `S`, `bar.tasks`, history, or the shared plan. Use `epicOwner`, `epicCounts`,
  `jiraState`, and `staleSprint` rather than inventing parallel interpretations.
- Invalidate Jira caches through `dropJiraMemos` and verify the input object. Keep
  work done on every render or keystroke cheap; unchanged inputs should not cause
  unnecessary redraws or output writes.

## Security and privacy

- Treat plan text, Jira responses, release text, and assistant proposals as
  untrusted data. Construct DOM with `h` and text nodes; do not add `innerHTML`,
  inline event attributes, `javascript:` URLs, `eval`, or `new Function`.
- Preserve the built CSP's hashed inline scripts and `connect-src 'none'`. The
  template's `script-src 'unsafe-inline'` is a build placeholder, not the shipped
  policy. The build expects two script blocks; update its validation and tests if
  that structure changes.
- Do not add remote scripts or a backend. Google Fonts are currently external;
  do not describe the existing app as making zero network requests.
- Jira requests remain read-only GETs over verified HTTPS. Keep redirects refused
  and authorization headers protected. The helper reads more endpoints than search
  alone; preserve the security boundary for every request.
- Tokens stay in the OS credential store. Keep server/search configuration local
  to the token holder; never take token destinations or JQL from a shared plan.
  Do not install or run a helper from a shared folder using someone's token.
- Link people by stable Jira user key, never guessed display name or email. Preserve
  email filtering and hashed email-like keys in shared sync outputs.
- Write sync outputs atomically using a sibling temporary file and `os.replace`.
- Tests and examples use invented people, keys, hosts, and projects. Never read a
  real plan in a harness or commit real plans, Jira output, tokens, internal names,
  screenshots containing private data, or absolute personal home paths.
- The staged private-term scan skips if its external terms file is absent; that
  is not evidence that data is safe. Review the intended diff before every commit
  or push. `--all` scans tracked files and does not cover a new untracked file;
  its current whitespace-delimited path handling also misses filenames with spaces.

## Assistant amendments

- Read `docs/assistant-workflow.md` before changing integrations. Prefer one private
  assistant folder per person, device, and plan, with one active Sightline tab
  writing its outputs. Browser folder access does not establish privacy.
- Sightline owns `sightline-assistant-view.json` and
  `sightline-assistant-results.json`; the assistant owns
  `sightline-amendments.json`. Sightline must never create or overwrite the
  assistant's proposal file. Refuse unrelated outputs or outputs for another plan.
- For automatic folder exports of shared plans, use the last confirmed local
  read/save through `assistantSavedSnapshot`, excluding unsaved edits. Preserve
  `snapshot.source`, `snapshot.shared`, and `snapshot.unsavedChangesInBrowser`. Include the plan
  revision and Jira sync timestamp; these do not prove cloud freshness.
- Context and results are separate writes, not a transaction. Match both revision
  and Jira timestamp before combining them. Results and receipts describe this
  browser's review outcomes, not a shared or tamper-proof audit log.
- Do not rebuild snapshots or rewrite outputs for unchanged navigation or polls.
  Real saved-plan, Jira, proposal, and review-outcome changes must still refresh
  outputs. Keep exported free text untrusted and notes excluded from context.
- Preserve individual-file connection and manual context export as alternatives.
  Manual context export uses the current browser state and may include unsaved
  edits; do not attribute automatic folder snapshot guarantees to that path.
  The Python `check-amendments` command validates JSON plans offline; browser
  validation also supports YAML. Writing a proposal does not apply it to the plan.
- Preserve plan identity, stable target IDs, field/type allowlists, preconditions,
  Jira locks, duplicate detection, and rechecking against the current plan when a
  person applies a proposal. An offline "ready" result does not bypass review.
- Each proposal must apply completely or leave state unchanged. Rechecking an
  already-applied proposal must distinguish completion from a conflicting item.
- Do not instruct an assistant to overwrite the shared plan or Jira outputs.
  Replace complete proposal files atomically where the writer supports it.

## Releases and user-facing changes

- A user-visible change needs an entry in `src/releases.json` in the same change:
  `kind` (`new`, `improved`, `fixed`), `area`, `title`, `now`, and helpful `before`/
  `where` details. Keep releases newest first and let the build validate them.
- Bump patch for a fix, minor for new or improved behavior, and major for an
  incompatible plan format. `APP_VERSION` derives from the newest release; do not
  invent another version source. Documentation-only and test-only changes do not
  need an application release.
- Use plain US English and clear next actions. Keep freshness and hidden-work
  information understandable across views. Preserve keyboard focus, accessible
  labels, and status announcements when a panel redraws.
- Preserve the Work, Delivery, Product updates, and Settings navigation and saved
  startup/deep-link behavior. Roadmap and Status update use the whole plan and say
  so; Timeline and Capacity retain their saved views and filters.
- Use the existing commit convention: `type(scope): description`.
