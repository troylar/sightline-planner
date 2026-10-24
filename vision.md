# Sightline: vision and product charter

Sightline puts a team's official Jira work on one shared wall, next to everything the team adds to plan around it,
and makes it obvious which is which.

This document is the product charter. Every change to Sightline should fit it; a change that doesn't either changes
this document first, in its own pull request, or doesn't ship.

## The wall

Picture a whiteboard in the team room.

- **Jira issues are printed cards pinned to the wall.** They are the team's codified work in the official system. What
  is printed on them (title, status, sprint and its dates, assignee, points, labels) comes from Jira and can't be
  written on in Sightline.
- **Everything else on the wall is Sightline:** the whiteboard, the markers and the sticky notes. Anyone can add their
  own stuff, as much as they like: initiatives, tasks, milestones, gates, meetings, notes, process blocks.
- **People work with the Jira cards without changing them.** They arrange them (which workstream, which
  initiative), cover them (park an epic, switch a story off for this plan), draw marker lines between cards and
  stickies (dependencies), stick notes and tags on them, and later, pencil in a proposed change.

**The one rule: nothing on the wall changes a Jira fact.** Jira owns what the work is, when it's scheduled and
where it stands. The plan owns how the work is arranged, what matters now, how it connects, and everything the team
adds.

The rest of this document uses plain words for the two kinds of thing: **Jira items** (the cards) and **plan items**
(everything the team adds). In the app they're labeled **From Jira** and **Added here**. The whiteboard is only the
picture; its words don't appear on screen.

### Jira items, plan items, and plan items that hold Jira items

A Jira key identifies one Jira item (on one Jira server). A plan item may *place* it or *hold* it:

- An **epic put on the board** is a Jira item placed in a workstream. The initiative drawn around it is a plan item
  that holds it: it can carry a short chart label, notes, tags, dependencies and plan tasks of its own, but the epic's
  title, status and its stories' sprints come from Jira.
- A **hand-made initiative** is a plan item. Jira-linked tasks inside it are Jira items placed there.
- A **plan task that is also a Jira story** is one item: one set of Jira facts, one placement, never a second copy.
- **Plan timeboxes are not Jira sprints.** Jira's sprints (name, goal, dates, state) come from Jira. The plan may add
  its own timeboxes, for example after Jira's last sprint, and they look like plan items. A sprint drawn in whole weeks
  on the chart is a picture of Jira's dates, not the dates themselves.

## Principles

Each principle is a test a change can pass or fail.

1. **One owner per fact.** A fact shown as Jira's equals the latest successful sync. A plan fact equals the shared
   plan. No field is both.
2. **Jira facts are shown, never copied.** A Jira title, assignee, status or date is read from the Jira files
   when the page draws, not copied into the plan where it can go stale or be edited.
3. **One issue, one card.** The same Jira key never becomes two independent cards and never counts twice in one
   measure.
4. **The wall never writes on a card.** Placing, parking, switching off, notes, tags, dependencies and proposals change
   the plan only.
5. **Every Jira fact says how fresh it is.** When the Jira files are late, missing an issue, or incomplete, the page
   says so. A key the sync didn't return is "not in the last sync", not "deleted".
6. **Every count names its unit and what it covers** ("3/4 stories", "2/5 tasks"), and a partial count says it's
   partial. Switching a story off changes the plan's count, not Jira's.
7. **Everything anyone adds records who added it and when.** Unknown is shown as unknown; an edit never replaces the
   creator.
8. **Hiding is always recoverable.** A view that hides things says how many and why ("8 hidden by your view",
   "2 parked"), and a dependency on something hidden still shows, as a stub you can open.
9. **Links survive movement.** Notes, tags and dependencies attach by stable ID or Jira key, never by title, row or
   date, so they follow a card wherever Jira or the plan moves it.
10. **The page never talks to Jira.** Only the sync script on the user's own computer does, with the user's token.
    The page reads the files it writes.
11. **A shared file is shared, not secured.** Anyone who can open the plan can read and change it. Sightline records
    who did what and lets people hide things from their own view; it never claims those are access controls.
12. **Jira going missing never removes the team's work.** Everything added around a Jira item (notes, tags,
    dependencies, placement, switched off or parked) is kept by its Jira key. If a sync stops returning that issue
    (a permissions change, a search that changed, a mistake in Jira), the work stays, shown as "not in the last sync",
    and reattaches by itself when the issue comes back. Only a person, on purpose, removes plan work.
13. **Many views, one wall.** The timeline, standup cards, retrospective and free-form canvas are different ways of
    looking at the same Jira and plan items. A view never owns data the others can't see.
14. **A forecast is computed, never stored as dates.** Effort, capacity and skills are plan inputs; the finish dates,
    critical chain and workstream load are worked out from them each time the page draws, and each one can say why.
    Nothing moves on the plan until a person chooses to use a forecast date. A snapshot may record what the forecast
    said when it was taken, labeled with that date, as history; the current forecast is always computed.
15. **A what-if is labeled as a what-if.** A scenario is a saved set of changes on top of the plan, shown as
    "What-if: not the plan" wherever it appears. It changes the plan only when someone makes it the plan, and then
    each change goes through the same review (Apply, Edit, Skip) as an assistant's suggestions.

## Who owns what

| Thing | Owner | Changed in | Shown as |
|---|---|---|---|
| Issue key, title, status, resolution, type, assignee, points, labels | Jira | Jira | "From Jira", read-only, with "Open in Jira" and when it was synced |
| Epic membership (which stories are under which epic) | Jira | Jira | From Jira; updated on each sync |
| Jira sprints: name, goal, dates, state | Jira | Jira | Sprint headers marked as Jira's |
| Which epics are on the board, parked, or waiting to be sorted | Plan | Sightline | Added here, around the Jira item |
| Workstream and initiative a Jira item sits in; stories switched off | Plan | Sightline | Added here |
| Notes, tags and dependencies on Jira items | Plan | Sightline | Added here, attached by Jira key |
| How a Jira status shows here (the status map) | Plan | Sightline | Marked as the team's reading of Jira |
| Plan items: initiatives, tasks, milestones, gates, meetings, notes, process blocks, plan timeboxes | Plan | Sightline | "Added here", with who added them |
| A short chart label or lead for a Jira item | Plan | Sightline | Labeled as the plan's, next to Jira's title |
| Progress counts | Computed by Sightline from Jira's facts and the plan's choices | Inputs in Jira and Sightline | Count with unit, scope and freshness |
| Effort ranges, skills, workstream shares, scenarios | Plan | Sightline | Added here, with who added them |
| Forecast finishes, critical chain, workstream load | Computed by Sightline from the plan's inputs and Jira's facts | Inputs in Jira and Sightline | Likely and high finish, with the reason for each wait and what the forecast assumed |
| Saved team views and tag colors | Plan | Sightline | Named views; tag style |
| What I've hidden from my own view | The viewer | That viewer's browser | View indicator with hidden counts |
| Proposed changes to Jira (later) | Plan | Sightline, applied by the sync script | Shown as pending on the Jira item until Jira has them |

## People on the wall

**Who added what.** Every plan item, note, tag, dependency and proposal records who added it and when, and who last
edited it. On the chart this is light (initials on the item); in a card it's plain ("Added by Avery Stone, Sep 27").
It's for context and follow-up, never for scoring people.

**Show and hide.** Anyone can hide or show anyone's stuff, including their own, as a preference for their own view.
It never hides Jira items unless the Jira layer itself is hidden. Layers: Jira only, mine, everyone's, or
chosen people. A team view (for example "refinement board") saves a combination for everyone to use.

**Tags on everything.** Plan items and Jira items alike can carry plan tags, stored in the plan (by Jira key for Jira
items). Jira's own labels appear as tags marked as Jira's, read-only. A plan tag and a Jira label
with the same name stay separate; a filter can pick either or both. Tags filter, show-only and hide, together with
people, authors and layers.

## Many views

The wall is the data; views are lenses on it:

- **Timeline** (weeks and days): where work sits in time.
- **Today**: what needs attention now.
- **Standup cards** (next): the current sprint's work, Jira and plan items, by person.
- **Retrospective** (later): what finished, slipped, was abandoned or switched off, and the notes around it.
- **Free-form canvas** (later): the literal whiteboard, arranged by hand, for thinking rather than scheduling.

Each view follows the same visual grammar and the same hide rules, and nothing added in one view is invisible in
another.

## Changing Jira, later

The team wants to change Jira from Sightline, but not yet. The path, in order:

1. **Proposed changes.** A proposed change is a plan record attached to a Jira item: "proposed: move to Sprint 44, by
   Avery". It shows as pending on the item. It's useful before any write-back: proposals form a list for whoever
   maintains Jira (for example in backlog refinement), and the next sync shows which have landed.
2. **Applied by the sync script.** Later, the script (never the page) applies approved proposals with the user's own
   token: it refetches each issue, applies the change only if Jira still has the value the proposal saw, asks for
   confirmation per change, then refetches to check. Conflicts, missing permissions and ambiguity are skipped and
   reported.

So it isn't painted into a corner, a proposal records from the start: the Jira server and key, the field, the new
value by ID (a sprint's ID, a user's key, a label to add or remove), the value it saw and when, who proposed it and
why, its review state, and what happened when it was applied. An approval recorded in a shared file is advice, not
authorization; the token holder decides.

## Not in scope (for now)

- Editing Jira from the page, or any browser connection to Jira.
- Verified identity, permissions, or private content inside a shared plan.
- Treating plan timeboxes as Jira sprints, or plan copies as Jira facts.
- Guessing at Jira history the sync can't see.
- A server. Sightline stays one HTML file, a plan file, and a sync script.

## Decisions

**Made**

- Jira items are read-only and shown from the latest sync; the plan arranges and annotates them (the wall).
- The page never contacts Jira; tokens stay in the user's operating-system credential store.
- Everything added records its author; hiding is a personal, recoverable view preference.
- Tags on everything; Jira labels are read-only tags marked as Jira's, separate from plan tags.
- One workstream placement per epic; other workstreams refer to it rather than placing it again.
- Notes on Jira issues attach by Jira key and follow the issue.
- Write-back comes later, through proposed changes first, then the sync script.

**Open**

- Can anyone edit anyone's plan items? Recommended: yes, keeping the creator and showing the last editor.
- Can anyone delete anyone's item? Recommended: yes after showing what goes with it (children, notes, links), with a
  way to bring it back.
- Is a note's text editable only by its author? Recommended: the page asks before editing someone else's words, and
  says plainly that this is a courtesy, not a lock.
- Should one person's hidden choices follow them across computers?

## Original implementation gap list

This list records the starting point for the original implementation roadmap. It is historical context, not a
current defect list. Read [the user guide](README.md) for today's workflows and [the release history](CHANGELOG.md)
for shipped changes. The ownership rules and principles above remain the product charter.

The original gaps, in implementation order:

1. Jira titles and assignees are copied into the plan when an epic or issue is added, and stay editable (they can
   go stale).
2. Jira items don't look different: epic initiatives and Jira-linked tasks look like plan items; progress shows an
   unlabeled count or a weighted percentage.
3. Most items don't record who added them; a note's author can be changed.
4. Hidden things can disappear without a count (filtered notes, parked initiatives).
5. There are no plan tags, and the sync doesn't fetch Jira labels.
6. Notes can't attach to a Jira story.
7. Jira sprints, once followed, become editable plan rows.
8. Jira dates and status for linked items are written into the plan file, where they can look like Jira's own.

## Roadmap

In order, each depending on the one before:

1. **From Jira vs added here, at a glance.** One look for Jira items and one for plan items, a legend, and layers (Jira only, mine,
   everyone's). Progress counts with units.
2. **Jira facts shown, not copied.** Titles and assignees follow Jira; chart labels and leads are plan fields.
3. **Who added what, and hide by person,** with hidden counts and dependency stubs.
4. **Tags:** plan tags on everything, Jira labels as Jira's tags, filters and team views.
5. **Cards in two parts:** From Jira (read-only), then Added here.
6. **Notes and dependencies on Jira items,** attached by Jira key.
7. **Proposed changes** to Jira items, and their list.
8. **Views:** standup cards, then retrospective, then the canvas.
9. **Write-back** through the sync script.

## How we know it's working

- Every Jira fact on screen matches the latest sync; late or incomplete syncs are always visible.
- No Jira key is placed twice or counted twice.
- No note, tag or dependency is orphaned when Jira moves or drops an issue.
- In a review, anyone can answer: what came from Jira, what did we add, who added it, and what's hidden from me?

## Holding ourselves to it

Every pull request says which side of the wall it touches: **Jira facts** (the sync and how Jira items are shown), **the
plan** (plan items and what's added around Jira items), **a viewer's preferences**, or **something computed from both**. Changes to
the plan's format also say how old copies and merges behave. Changes to what's shown check that Jira facts stay
read-only in every view, counts have units, and hidden things can be found. Changes to the sync keep the page free of
tokens and the script's Jira access narrow. Examples and tests use made-up names only.
