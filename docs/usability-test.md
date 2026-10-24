# Sightline usability check and short role pilot

Use this protocol with 2 or 3 people who have not used Sightline much: a developer, a delivery lead, and an internal
customer or product stakeholder. Allow about 20–25 minutes each. Test reading the real plan separately from editing
invented work. These are planned checks; no completed sessions or pilot results are recorded here.

This small sample can show wrong turns and unclear language. Record timings for comparison within the session,
not as reliable performance or usability statistics.

## Four-quarter AI planning pilot

Use an isolated synthetic plan and approved synthetic requests for the AI writing exercise. Follow the
[first-session workflow](assistant-workflow.md#first-four-quarter-planning-session). Record the configured endpoint
and model in the team's private test notes, along with Sightline version, browser and plan size; omit credentials.
Measure assistant waiting time separately from time spent navigating, reviewing and applying.

- First launch: the welcome choices appear without another navigation click. Empty Today explains that there is
  no work to assess. Jira-linked work without status data offers a connection action.
- Choose four exact quarters, including a year boundary. Find an outcome outside the range and recover it through
  Long range. Confirm that changing the range did not change the plan file.
- Keep a question draft, run Test reply, and confirm the draft remains. Simulate an unavailable companion and
  check that the person can find recovery instructions without losing the draft.
- Type an unsubmitted roadmap idea, open Plan with AI, visit another workspace, and return. Confirm the idea
  remains. Switch to another plan, then back, and check that drafts stay with their own plan.
- Open Ask assistant about this for two outcomes without typing. Working on must follow the second outcome.
  Type a question, then choose another outcome. The existing text and context must stay until Switch context is
  chosen. Confirm that a single Send carries the actual notes or change request with the intended selection.
- Organize one small roadmap excerpt, review item matches and unresolved fields, apply an agreed change, confirm
  the local save, then Undo. Repeat the request and inspect for duplicate proposals before applying anything.
- During another request, change the plan, then inspect the stale reply. The user must understand why a new request
  is needed; this pilot does not validate automatic rebasing or scenario branching.

Proposed targets are a useful first roadmap slice within 30 minutes and a common multi-item revision within one
minute including review. Record actual times and failure reasons. These are adoption targets, not measured
performance claims. Human AI sessions and live endpoint timing have not been run here. The normal build, regression,
real-browser CSP, and two-device checks remain separate.

## Before each session

1. Follow the [launch instructions](../README.md) to check the prepared build before the participant arrives:
   **dist/sightline.html**, not **src/sightline.template.html**. Confirm the version beside **What's new** and its
   release entries. Give the participant the normal **index.html** start page or distributed app and synthetic plan
   file for Task 0; do not open the app for them or explain the source/build folders. Record the expected version,
   browser, operating system, window size, and entry point.
2. Use a separate browser profile for the session. Do not clear a person's existing site data or recovery drafts.
   After Task 0, have the facilitator load the real plan with **File → Open a copy…** for the reading tasks. Confirm
   the file chip says **This browser only**, with no linked shared filename. This reads the original without granting Sightline a
   write handle to it. Do not edit or submit anything in this phase; the browser copy itself remains editable.
3. For the reading phase after Task 0, if needed, connect the approved, existing Jira output folder through
   **Settings → Jira connection**. Reading the files does not run a sync or contact Jira. Check their timestamp and
   record stale or partial data rather than
   treating it as current. Do not run the helper or change its search for this session.
4. Choose the reading answers in advance: an open decision with its decider and due date, a person with current
   sprint stories, and a story with a **Serves** line. If the plan lacks one, record that task as unavailable; do not
   invent an answer or add real-plan data to make the test pass.
5. Prepare a separate synthetic plan for each participant. Copy **test/fixtures/sample-plan.json** to an isolated
   local test folder, or generate current synthetic demo files with the README instructions. Keep an untouched
   baseline. Do not make a copy of the real plan for editing exercises. Pick an unfinished **Added here** task or
   leaf initiative with no Jira key and no existing blocker; write down its name and workstream for the prompt.
6. Have a timer and the observation table below ready. Keep real-plan observations in the team's approved location;
   do not put real plan contents or screenshots in repository fixtures or example results.

Not taking an edit lock does **not** make a linked real plan safe for this test: quick updates can save immediately.
The detached reading phase and synthetic writing phase are intentional boundaries. Views, author stamps and the
edit lock are not access controls.

## What to say at the start

> "We're testing Sightline, not you. Please think out loud: what you're looking for and what you expect to happen.
> I won't help until you're stuck. First you'll open an invented plan, then we'll look at a reading copy of the
> team plan. We'll use invented work for anything that saves. Tell me if you aren't sure which file you're looking
> at or whether something is saved."

Read one task at a time and start the timer after the prompt. Observe without naming the next button. After about
90 seconds without progress, ask what they expected; give one hint only if needed and record it. A task completed
with a hint is useful evidence, but is not an unassisted success. Stop any attempt to submit real-plan changes.

## Task 0: launch and identify the app and plan

> "Open Sightline and this invented plan for reading, without linking changes back to its file. Which app version
> are you using, and how can you tell you opened the intended plan?"

- **Unassisted success:** from the supplied start page or distributed app, they open the built application, read
  the expected version beside **What's new**, use **File → Open a copy…** for the supplied synthetic file, and
  identify its plan title and **This browser only** state. They finish in the built app, with no linked write handle
  or submitted edit. Normal supplied instructions are allowed; a facilitator pointing to a file or control counts as a hint.
- **Observe:** entry point chosen, help used, source-template confusion, version discoverability, wrong-file choices,
  and whether the participant can distinguish the app from the plan. Record launch time and assistance separately
  from the reading tasks. Only after recording this outcome should the facilitator prepare the real-plan reading copy.

## Reading tasks: detached real plan

### Task 1: what needs a decision

> "Something needs a decision soon. What is it, who makes the call, and by when?"

- **Done when:** they identify an open decision, its decider and needed-by date. If no decider is recorded, they
  explicitly identify that gap rather than name an owner as the decider.
- **Where the answer is:** Work → Today, **Decisions due**; or Delivery → Decisions.
- **Watch for:** whether they distinguish **Decider** from **Owners**, and where they look first.

### Task 2: one person's sprint work, and what it's for

> "What is [person] working on this sprint, and which customer-facing deliverable does that work serve?"

- **Done when:** they list that person's current stories and explain at least one **Serves** line. Record missing
  links as a data gap, not as participant failure.
- **Where the answer is:** Work → Sprint, with cards by person and **Serves …**. Today → Mine is another route for
  the selected person; **Choose yourself** or **You: [name]** identifies the viewer in this browser.
- **Watch for:** whether they find Sprint, understand the deliverable relationship, or assume author identity is verified.

### Task 3: how current and complete is this

> "How up to date is this? When did it last hear from Jira, and what might be left out of this view?"

- **Done when:** they identify the Jira sync time, describe any partial coverage, and find at least one applicable
  hidden-work indicator or establish that none is active. They distinguish Jira freshness from the plan's recorded
  save time, and do not claim that either proves another computer has received the file.
- **Where the answer is:** **Data checked** on Today and Sprint; Timeline's hidden-work information and filters.
  A linked file's edit strip shows its locally confirmed save/revision; that strip is absent from this detached copy.
- **Watch for:** trust without checking, confusion between a sync and a save, and mistaking hidden work for deletion.

## Writing tasks: synthetic shared file only

Close the real-plan reading tab before this phase. In the session profile, open the built app and choose
**File → Open shared plan…** for the participant's synthetic file. Confirm its test filename in the chip. Choose an
invented person with **Choose yourself**; do not add real people. Keep **Save as you go** off so the explicit
Start editing / Save / Done editing path can be observed. Explain that Jira facts remain read-only, including in
these exercises. If synthetic Jira files are used, connect only their matching demo folder.

### Task 4: draft, navigate, then submit a blocker

> "On [invented item], explain that you're blocked waiting for a test environment and who you're waiting on.
> Before submitting it, visit another work item, then return and finish the update. How do you know it was saved?"

- **Done when:** the participant opens **Mark blocked**, enters a reason and waiting-on value, visits another item,
  and returns to the original item with both draft values intact. They submit once with **Mark blocked**, see the
  saved blocker on that item, and confirm the test file's save/revision feedback. A second independent reader must
  see one blocker and its corresponding update after opening or refreshing that same local test file.
- **Observe:** navigation route, lost text or focus, duplicate submissions, mistaken edits to another item, and
  whether they distinguish an unsent browser-session draft from a saved plan change. Drafts survive navigation in
  this session; this task does not establish survival after closing the page.
- **Facilitator check:** leaving an unsent draft must not change the file. Submitting a quick update can save
  immediately without **Start editing**. If saving is refused, retained text and a clear next action are required;
  do not count a visible draft alone as a saved result.

### Task 5: edit, save, and hand off

> "Change [invented item's] plan label to include 'handoff check', save it, and finish editing so the next person
> can continue. Ask the next person to show you the label and blocker. What have you actually verified?"

- **Done when:** the participant uses **Start editing**, makes the label change on the **Added here** item, uses
  **Save**, then **Done editing**, and recognizes the local save and released editing state. No unsaved changes
  remain. In a second independent browser profile on the same computer, the facilitator opens the same synthetic
  file, verifies the exact label and blocker, and can start and finish an edit session without taking over a lock.
- **Observe:** whether Save is mistaken for releasing the lock, whether the file identity and revision are checked,
  and whether the participant understands which changes were submitted immediately versus held in an edit session.
- **Limit:** this is a local-file handoff. It does not prove OneDrive upload, delivery to a teammate's device, or
  concurrent editing safety. The [two-device check](onedrive.md#two-device-check-before-a-team-rollout) remains a
  separate, **not-run** rollout requirement until someone records those results on the actual sync environment.

### Optional task 6: sorting, for the plan maintainer

> "Some invented stories aren't on this plan yet. Put one epic's work on the right workstream."

Use the synthetic demo plan and its matching Jira files for this task.

- **Done when:** the epic's work has one intended placement, without recreating its Jira facts as manual plan tasks.
- **Where the answer is:** Work → **Sort Jira work** → **Sort them in bulk**. The Settings route also works.
- **Watch for:** story-by-story duplication, confusion about **Not ours**, and attempts to change Jira-owned fields.

## Record each session

Use one row per task. Keep participant labels anonymous in any shared summary.

| Task | Time | Unassisted / hint / not completed / unavailable | First routes tried | Wrong turns or lost work | How they checked correctness and saving | Confidence 1–5 |
|---|---|---|---|---|---|---|
| Launch 0, reading 1–3 and writing 4–5, separately | | | | | | |

Record brief quotes, hints given, and the exact build and test filename. Afterward ask what was hardest to find,
what felt unsafe or confusing, and what they would open each morning. Separate product problems from missing plan
relationships or stale sync data; both can affect whether the workflow is useful.

## Short role pilot: 3–5 working days

After the sessions, invite the same three roles to try their normal reading questions each day. Read the real plan
through the detached route above; keep any practice writes in the synthetic plan. Observe existing Jira and plan
maintenance without changing it for this test. This can reveal reading value and likely maintenance costs; it does
not establish the cost of sustained live collaborative editing.

| Role | Daily question or action | Evidence to record |
|---|---|---|
| Developer | Find current work, its purpose, and a blocker or next action | Whether Sightline answers a question faster or requires another search; where status or notes would need entering twice |
| Delivery lead | Explain attention, ownership, and the next handoff | Minutes spent checking freshness, sorting work, maintaining plan-only relationships, or correcting duplication |
| Internal customer / product stakeholder | Understand deliverables, dates, and approved wording | Whether the answer is understandable without a guide, useful for a decision, and traceable to the relevant work |

Keep one small daily log: role, question, answer found, help needed, time spent reading, time spent maintaining the
plan, and any duplicated entry. Name the fields involved and their intended owner: Jira facts stay in Jira; plan
placement, dependencies and notes stay in Sightline. Record repeated requests to copy a Jira title, status, assignee
or date into a manual item as a workflow problem, not as a recommended workaround. Count one-off setup separately
from recurring maintenance; count time spent by the maintainer as well as time saved by readers. Mark estimates or
practice observations as such rather than presenting them as live-use measurements.

At the end, review these concrete criteria together:

- Each role can answer its daily question without a facilitator on the final two days; unavailable data is recorded.
- Every attempted synthetic draft and save remains on its intended item, with no lost text or duplicate submission.
- The local handoff ends with the intended file values and a released lock; cloud validation is still reported separately.
- Before the pilot, agree an acceptable recurring maintenance budget in minutes per day; report actual or estimated
  time against it and identify who would own that work. No hidden setup effort is counted as zero maintenance.
- Identify each recurring duplicated entry, its frequency and cause. Do not expand rollout until the team accepts
  the remaining burden or removes the duplicated step.

Report **proceed**, **revise**, or **insufficient evidence**, with task results, pilot notes and unrun checks. A small
pilot is a decision aid, not a claim that the product or OneDrive behavior has been broadly validated.
