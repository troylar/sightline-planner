# Roadmap: building vision.md

This is the historical implementation sequence, not the current feature status or a delivery commitment.
For today's product, start with [the visual guide](../README.md) and [release history](../CHANGELOG.md).

The plan for building [vision.md](../vision.md), release by release. Each release is one PR with its own tests.
Function names are given instead of line numbers, because lines move.

## What the code tells us first

- **The plan file cap is 2 MB** (`MAX_BYTES`, checked in `parseText` and `readFile`). The 5 MB cap is for the Jira
  status file. Everything added to the plan (who added what, tags, the change log) has to fit.
- **Older copies of the page delete fields they don't know.** `normalize` rebuilds every item from a list of known
  fields, so an older page that saves drops everything new. The foundation release (below) has to come before any new
  saved field.
- **Notes already have `created` as a string**, so "who added it" can't use that name. It's `added: {by, at}`.
- **`commit` runs on every keystroke** (text fields commit as you type, grouped by `coalesce`). Anything it does each
  time must be cheap.
- **A merge treats a field changed on both sides as a clash.** An "edited by" stamp would clash on every shared item,
  so it must be exempt.
- **`applyJira` writes Jira's status and dates into the plan on every draw.** This goes against "shown, not copied",
  and those writes must never be counted as someone's edit.

## Releases

Status (2026-09-27): 1.17–1.24 built as PRs #21–#28, the safety release as 1.25 (#29), and proposed changes (step 7)
as 1.26 (#30). Step 8 started with the standup board as 1.27. The retrospective and canvas views, and write-back
(step 9), need decisions first.

| Release | What | Needs |
|---|---|---|
| 1.17.0 | **From Jira vs Added here at a glance:** two looks, legend, sprint headers, counts with units, layers (Everyone / Jira only), hidden counts | none |
| 1.18.0 | **Jira facts shown, not copied:** titles and assignees follow Jira; chart label and lead are the plan's; Jira sprint names read-only | 1.17 |
| 1.19.0 | **Foundation:** one storage interface, schema migrations, protection against older pages dropping new fields, read cap raised to 5 MB | none; must come before 1.20 |
| 1.20.0 | **Who added what, and the change log:** stamps on everything, Activity list, note author locked, Mine layer | 1.19, 1.17 |
| 1.21.0 | **Hide by person:** Added-by filter, hide someone's items, hidden counts by reason, links to hidden items, undo one change | 1.20 |
| 1.22.0 | **Tags:** plan tags on everything (Jira items too, by key); Jira labels from the sync, read-only | 1.20, 1.17 |
| 1.23.0 | **Cards in two parts:** From Jira (read-only), then Added here | 1.18, 1.20, 1.22 |
| 1.24.0 | **Notes and dependencies on Jira items**, attached by Jira key | 1.18, 1.23 |

1.17 and 1.19 can ship in either order; 1.18 can follow 1.17 directly. "Mine" comes with 1.20, once there's a record of
who added what.

## 1.17.0: From Jira vs Added here

- **Which side:** `sideOf(item)` returns "jira" for stories, Jira-linked tasks, Jira-linked leaf initiatives and epic
  initiatives, and "plan" for everything else.
- **Look:**
  - Jira items: surface fill, 2px workstream-color outline, a mono key chip (the first epic key, "+n" for more).
  - Plan items: filled, as today, with a slot for the author's initials (drawn from 1.20).
  - Stories switch from dashed to the Jira look. Dashed stays only for "outside the plan's dates".
- **Sprint headers:** Jira sprints get a "Jira" chip, with Jira's exact dates in the hover ("drawn in whole weeks").
  The plan's own timeboxes look like plan items.
- **Legend:** From Jira, Added here, Jira sprint, plan timebox.
- **Counts:** `5/9 stories`, `2/5 tasks`, `3/4 items`, with "(partial)" when counting stopped early. The weighted %
  moves to the hover card, and the progress fill follows the count.
- **Layers:**
  - Everyone or Jira only, saved per viewer and per plan in localStorage; team views can save a layer too.
  - Applied in every visibility function: bars, tasks, milestones, gates, notes, meetings, blocks.
- **Hidden counts:** a slim line under the view bar, not a warning. For example: "12 plan items hidden by your layer
  · Show everyone", "2 parked", "Notes hidden (N)".
- **Tests (each fails on 1.16.1):** Jira vs plan classes and key chips in Weeks and Days; sprint header classes; the
  legend; no bare `%` tags; the Jira-only layer hides a hand-made bar and counts it; the layer is per plan; parked
  items are counted.

## 1.18.0: Jira facts shown, not copied

- **Title:** `titleOf(item)` gives Jira's summary when the Jira files have it. Otherwise it gives the stored label or
  key, marked stale ("Jira files not loaded"). `chartLabel` becomes the chart label, else `titleOf`. Every place the
  page draws a label switches to it: chart, card, hover, Find, Today, warnings.
- **Adding from Jira stops copying.** `epicOnNew`, `batchOn` and `addFromJira` store the key as the label and no
  owners or status.
- **Assignee and lead, worked out when the page draws (no file change):**
  - The assignee comes from Jira.
  - The `owners` field stays in the file but is labeled **Lead (plan)** on Jira items. An owners list equal to the
    assignee counts as the old copy, so no lead.
  - The people filter, people rows, Today and load use assignee plus lead.
- **Titles that differ from Jira:** there's no automatic rewrite, since a teammate's rename can't be told apart from a
  Jira rename. Plan, then Epics lists them with two choices: **Keep ours as the chart label**, or **Use Jira's**. The
  chart label cap goes to 60 characters.
- **Sprints:** the name and goal of a Jira sprint come from Jira and are read-only; its weeks stay the plan's.
- **Tests:** a stale stored title appears nowhere once Jira has the real one; the stale mark shows without Jira;
  nothing is copied on add; the assignee counts for the people filter; the Jira sprint name is read-only; "keep ours"
  sets the chart label.

## 1.19.0: Foundation

- **Storage interface:**
  - `store.load()`, `store.apply(change)`, `store.save(plan)`, `store.lock()`, `store.subscribe(cb)`, `store.draft`.
  - Backends: `FileStore` (the shared file) and `LocalStore` (this browser only).
  - Moves in: reading and writing the file, the quick-update read–apply–write–retry core, verify-later, polling for
    changes, the local draft.
  - Merging becomes a pure `mergePlans(base, mine, theirs)`; the page keeps backups and messages.
  - Save stays a whole-file write in this release.
  - A later database backend implements the same interface.
- **Schema:** `meta.schema` with an ordered list of migrations, run before `normalize`. Only a change older pages can't
  read bumps it. New optional fields go in `meta.features` instead.
- **Protection against older pages:**
  - `meta.features` and `meta.savedWith` mark what's in the file.
  - A page that finds a feature it doesn't know, or a newer schema, opens the plan read-only, with no quick updates:
    "Saved by a newer Sightline. Update this copy to edit."
  - A save by a page older than 1.19 is detected (it drops `savedWith`), with an offer to put back what it removed.
- **Size:** the read cap goes to 5 MB; the write cap stays at 2 MB until older copies are gone. Undo history is capped
  by size (it holds whole-plan snapshots).
- **Proof:** a pure refactor, so every existing test passes unchanged. New tests cover a file changing mid-save,
  subscribe firing once per change, the merge matching the old one, and the read-only and put-back paths.

## 1.20.0: Who added what, and the change log

- **Stamps:** `added: {by, at}` and `edited: {by, at}` on every plan item, stamped in one place in `commit`:
  - New ids get `added`; changed items get `edited`.
  - Stamping happens after the edit, before `reschedule` and `applyJira`, so an item moved automatically isn't counted
    as your edit.
  - `added` never changes in a merge; `edited` takes the later one and never counts as a clash.
  - Old items show "not recorded". Notes take theirs from the existing author.
- **Change log:**
  - `S.changes`, entries `{id, by, at, what, ops}`: one per quick update, one per Save. The log never includes itself,
    or Jira's own values that `applyJira` wrote.
  - Kept to the smaller of 1,000 entries, 30 days and 256 KB; entries over 16 KB keep a summary only.
  - Entries are only ever added, so they merge safely. It's advice, not an audit: a shared file can't prove who did
    what.
- **Screens:**
  - "Added by Avery Stone, Sep 27 · edited by Blake, Sep 28" in cards and hover.
  - The note author is no longer editable, and editing someone else's note asks first.
  - A new Plan, then Activity page.
  - The Mine layer: Jira items plus what I added, with older items counted.
  - Author initials on plan items.
- **Size check:** the 100-epic demo plan with stamps must grow by less than 35% and stay under 2 MB.

## 1.21.0: Hide by person

- An "Added by" filter; a per-viewer, per-plan hide list. It never hides Jira items, only what people added on them.
- Hidden counts by reason ("8 hidden by your view (Avery 5, Blake 3) · Show all").
- **Links to hidden items:** an item whose dependency is hidden gets a "⇠ 1 hidden" tag that opens it.
- **Undo one change** from Activity: reverse only the fields that still hold that change's value, and report the rest.

## 1.22.0: Tags

- **Tag definitions:** `S.tags` (id, name, color, stamps).
- **Tags on plan items:** `tags: [id]`.
- **Tags on Jira items:** `S.jiraItems`, one entry per key, which is also where later plan notes on Jira items go.
  Tag lists merge as sets everywhere.
- **Jira labels:** the sync fetches `labels`. They're shown read-only, marked as Jira's, and kept separate from a plan
  tag with the same name.
- **Filters and views:** show only or hide by tag or by label; a tag index is built once per draw.
- **Screens:** tag chips on bars; a Plan, then Tags page to create, rename, recolor and delete; adding a tag is a quick
  update anyone can make.

## 1.23.0: Cards in two parts

- **From Jira (read-only):** key, title, status as the team reads it, assignee, sprint and exact dates, points, type,
  labels, when it was synced, Open in Jira.
- **Added here:** chart label, lead, placement, at risk and blocked, tags, notes, dependencies, stories switched off,
  added and edited by.
- Plan items show only Added here. No inputs inside From Jira.

## 1.24.0: Notes and dependencies on Jira items

- **Notes:**
  - Notes attach by `jira:KEY` and follow the issue.
  - A note whose issue isn't in the last sync keeps its place, marked "not in the last sync", and is listed in Epics.
  - New notes on Jira items attach by key.
- **Dependencies:**
  - `dependsOn` accepts `jira:KEY`. Warnings are worked out from Jira's end date (the sprint end, then the due date,
    else "has no sprint").
  - Dependencies on Jira items never reschedule anything.
- **Sync:** the sync also fetches keys named in notes, tags and dependencies, capped.

## Safety: when Jira items go missing

vision.md principle 12. Plan work around a Jira item is never deleted because a sync stopped returning it:
- **Today:** it already holds. Switched-off stories, parked epics, Jira-linked initiatives and tasks, and epic
  links are all kept by key in the plan, and nothing prunes them when a key is missing.
- **1.24:** notes and tags on Jira items attach by key and are listed under "not in the last sync" rather than
  dropped. They reattach by themselves when the issue returns. Tests: remove a story from the status file, then
  bring it back, and check its notes and tags are back on it.
- **A guard against a bad sync:** when a sync returns far fewer of the plan's Jira items than the last one (for
  example, more than a third missing, or none at all), the script keeps the previous files and reports the problem
  instead of replacing them. The page shows "The last sync is missing 40 of this plan's Jira items; showing the
  earlier sync. Nothing was removed." Built in 1.25 (with `--accept-drop` for a real drop).
- **Readable while missing:** the page remembers, in the browser only, the last title it saw for each key, so a
  missing item shows "ABC-12 · Faceted search (not in the last sync)" rather than just its key.

## Later, in outline

- **Proposed changes:**
  - `S.proposals`, entries `{id, server, key, field, value (by ID), seen {value, at}, why, added, review, applied}`.
  - Shown as pending on the item, with a list to review. "Landed" when Jira has the value.
- **Views:**
  - Standup cards (the current sprint by person) and a retrospective (fed by the change log).
  - A free-form canvas, storing only positions in `S.canvas`.
  - All views share `sideOf`, the layers and the hidden counts.
- **Write-back:**
  - An `apply` command in the sync script, never the page, using a separate write token.
  - Per change: refetch, apply only if Jira still has the value the proposal saw, confirm, refetch to check. Results go
    to a file the page reads.
  - Only allowed fields can be written. Conflicts, permission errors and ambiguity are skipped and reported.
- **Flattening tasks out of initiatives:**
  - Not now. The change engine already treats tasks as flat, and new collections are flat.
  - A database backend can map to flat tables without changing the file.
  - If the file must flatten, do it in a 2.0 migration that writes both forms for a release.

## Decisions (recommended)

| | Decision | Recommendation |
|---|---|---|
| D1 | How epic initiatives look | The Jira way (outlined, epic key); their plan fields show under Added here |
| D2 | What Mine means | Jira items plus what I added; ship it with 1.20, not before |
| D3 | Titles that differ from Jira | No automatic rewrite; show Jira's, offer a review list; chart label up to 60 characters |
| D4 | Owners on Jira items | Keep `owners` as the plan's lead; the assignee comes from Jira |
| D5 | Jira files not loaded | Show the stored title or key, marked stale |
| D6 | Progress fill | By count, matching the label; weighted % in the hover |
| D7 | Hidden counts | An info line under the view bar, not a warning |
| D8 | Authors who leave the team | Keep their ids; show "Former teammate" |
| D9 | Change log size | 1,000 entries, 30 days or 256 KB; advice, not an audit |
| D10 | File size | Read up to 5 MB from 1.19; write up to 2 MB until older copies are gone |
| D11 | Who can tag | Anyone, as a quick update; managing tag definitions needs Start editing |
| D12 | Dependencies on Jira items | Warn only; never reschedule |
| D13 | Older pages and new features | Open read-only, no quick updates |

## Known conflicts, and when they're fixed

1. **`applyJira` writes Jira's status and dates into the plan** (vision gap 8). From 1.20 those writes are kept out of
   the change log and never stamped as an edit. They're replaced with draw-time values after 1.24; that's a wide
   change, because rollups, rescheduling, warnings and Today all read the stored dates.
2. **Following Jira's sprints copies them into the plan** (gap 7). Names and goals become read-only in 1.18. The copy
   stays, since the plan's sprints are its time grid.
3. **Adding from Jira copies status.** Stopped in 1.18.
4. **Older pages drop unknown fields.** Handled by the 1.19 foundation.
5. **The note author can be changed.** Locked in 1.20.
6. **Some view settings are global rather than per plan.** New ones are keyed by plan.
7. **Undo keeps up to 200 whole-plan snapshots.** Capped by size in 1.19.
