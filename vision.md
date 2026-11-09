# Sightline: vision and product charter

Sightline puts a team's official Jira work on one shared wall, next to everything the team adds to plan around it,
and makes it obvious which is which. It's also where the team keeps what it hears and why it chose what comes next, so
anyone can see why a piece of work matters.

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

### What Sightline reads

Sightline reads three kinds of input, and treats each differently.

- **Trackers** are where the team officially records its work. Jira was the first, and GitHub Issues is the second
  (see "GitHub Issues, an optional tracker"). A tracker owns its facts. Sightline shows them and, today, never changes
  them (any later write-back follows "Changing Jira, later"). Each tracker connects the same way: a sync on the user's
  own computer writes files beside the plan, covering only the search its user set up. An item is identified by its
  tracker, its server and its key. A plan follows one tracker, or none.
- **Signals** are what people hear: meetings, email, chat, support tickets, bug reports, complaints. Signals become
  captured requests in the plan. They're evidence, not facts any system owns.
- **References** are documents and messages where they already live: a spec in OneDrive or SharePoint, a decision
  record, a chat thread, a recording. The plan links to them; it never copies them.

**Connectors are per user, read-only today, and offer rather than add.** A new source reaches Sightline in one of two
ways: through a person's assistant, using Sightline's proposal review like every other assistant change (principle
16), or through a sync on that person's computer.

- **Sign-ins stay with the person.** Credentials stay in the operating system's credential store, and what a connector
  reads stays in that person's own settings. Nothing in a shared file can aim someone's sign-in.
- **Findings stay private until reviewed.** A connector that reads signals or references (email, chat, documents)
  writes what it found where only its user can read it, never in the shared folder. Nothing joins the plan until a
  person reviews what will be shared and adds it.
- **Share the minimum.** Hand an assistant only what you may share with it and with everyone who reads the plan. What
  it reads is evidence, never instructions to it.
- **Each kind stays recognizable.** A tracker's facts, reported evidence and the plan's decisions are never shown as
  if they were another kind.

In this charter a **capture** is a captured request, kept in the plan as a roadmap idea, and an **outcome** is a
roadmap item: what the team intends to deliver.

Where this charter says Jira, it describes the tracker Sightline reads today. Its rules apply to every tracker.

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
9. **Annotations follow their item.** Notes, tags, dependencies and links to documents attach by stable ID or Jira
   key, never by title, row or date, so they follow a card wherever Jira or the plan moves it.
10. **The page never talks to Jira, or to any other system.** Only a sync on the user's own computer does, with the
    user's own sign-in, or a person's assistant through its own connections. The page reads the files they write, and
    it never fetches a linked document.
11. **A shared file is shared, not secured.** Anyone who can open the plan can read and change it. Sightline records
    who did what and lets people hide things from their own view; it never claims those are access controls.
12. **Jira going missing never removes the team's work.** Everything added around a Jira item (notes, tags,
    dependencies, placement, switched off or parked) is kept by its Jira key. If a sync stops returning that issue
    (a permissions change, a search that changed, a mistake in Jira), the work stays, shown as "not in the last sync",
    and reattaches by itself when the issue comes back. Only a person, on purpose, removes plan work, or an app a
    person has allowed to (principle 16), and every such removal can be undone by batch.
13. **Many views, one wall.** The timeline, standup cards, retrospective and free-form canvas are different ways of
    looking at the same Jira and plan items. A view never owns data the others can't see.
14. **A forecast is computed, never stored as dates.** Effort, capacity and skills are plan inputs; the finish dates,
    critical chain and workstream load are worked out from them each time the page draws, and each one can say why.
    Nothing moves on the plan until a person chooses to use a forecast date. A snapshot may record what the forecast
    said when it was taken, labeled with that date, as history; the current forecast is always computed.
15. **A what-if is labeled as a what-if.** A scenario is a saved set of changes on top of the plan, shown as
    "What-if: not the plan" wherever it appears. It changes the plan only when someone makes it the plan, and then
    each change goes through the same review (Apply, Edit, Skip) as an assistant's suggestions.
16. **Apps act for a person.** An app or assistant changes the plan only through a person who connected it and chose
    how much it may do. Its changes go through the same rules and checks as that person's, are stamped with the person
    and the app, and can be undone by batch. A few changes always wait for a person, whatever the level: among them, a
    capture, a "heard again" report or a link that an app adds, and any change to what matters now (principle 21).
    When an app's change can't be applied, the app is told why, with the reason; a change never sits unapplied
    without one.
17. **Priority is a person's call, and it carries its reason.** An outcome's class and the team's work order are plan
    facts that people set. An assistant may propose them and never sets them on its own, whatever it's allowed to do.
    The classes follow the familiar picture of filling a jar: rocks are what the team has committed to, pebbles
    support them, and sand is everything else. The page can point out a gap ("a rock with no sprint or date commitment
    recorded") but never reclassifies anything. A class isn't a size: a rock can be small and a pebble large. Whether
    the page uses these words, or plainer ones, is decided when it's built.
18. **Evidence, not votes.** Hearing something again adds evidence to what's already captured (who, through which
    channel, when), never a second copy. People outside the team are counted, never named. A count of reports never
    stands in for impact, and one severe report can outweigh five mild ones. "No match in what Sightline loaded" never
    means "the tracker has no such item".
19. **Evidence ages into review.** Age asks for a review; it never deletes. A closed capture leaves triage and counts
    toward priority only through what it was handed off to. A new report about something closed shows as a
    possible recurrence for a person to judge; it never reopens anything on its own.
20. **References point, they don't copy.** A plan item or capture can link to a document or message where it lives.
    The plan keeps the link, its title and when it was added, never the document's contents. The source decides who
    can open it. A link's title and address are shared plan content (principle 11): people don't add a link that
    grants access to whoever holds it, or a title the team wouldn't say in the room. The page warns when an address
    looks like one (it carries a signature or token) but can't always tell.
21. **What matters now is written down, dated and owned.** Standing priorities ("for Q1, focus on reducing cost") are
    kept in the plan beside its planning guide: a statement, why, its scope, when it starts and ends, when to review
    it, who set it and what it replaces. Scope is the whole plan or listed workstreams; with none listed it covers the
    whole plan, and a narrower area ("infrastructure spend") is wording in the statement. People set them; an app's
    addition, edit, end or removal always waits for a person. Fixing the wording, the review date or the end date edits
    the entry in place, with the editor stamped. Changing what it asks or which workstreams it covers makes a new entry
    that replaces the old one, which ends that day. Ending is the normal path; removing is for mistakes and can be
    undone. Guidance informs judgment and never moves anything by itself. A rule the schedule must obey (wait for a
    sign-off, a date from outside) belongs in the schedule as a gate or milestone, not in guidance text.
22. **Explain, don't score.** Sightline computes facts: which guidance applies to an item, what's committed, due,
    estimated or missing, and what a different order would push back. It never computes a priority score. Assistants
    recommend with reasons a person can check, and the work order, commitments and outcome priority stay separate
    human choices. Sightline can show where guidance overlaps in scope and dates; whether the words conflict is a
    person's or an assistant's judgment, and a conflict is shown, never settled by which is newer, narrower or from a
    more senior title. An explanation separates what a decision recorded at the time from what today's guidance would
    suggest: guidance never explains a decision it wasn't part of.
23. **Guidance ends without undoing anything.** When guidance ends, it stops shaping new recommendations and asks for
    a review of the decisions that cited it. A decision is an entry in the plan's decision list; a work order or
    outcome class that relied on guidance is recorded as a decision too. A decision cites guidance by the entry's ID,
    kept on the decision as a plan fact (an assistant's citation is recorded only through a reviewed change), and
    Sightline only computes the reverse: which decisions cited an entry. Ending never reorders work, reverses a
    decision or releases a commitment, and the entry stays readable as history.
24. **Whose input to seek, not how much a person counts.** Guidance can say whose recommendation to seek in an area and
    who decides ("for infrastructure spend, seek Casey's recommendation; the product owner decides"), with its reason
    and scope. It names people already in the plan, or a role; never someone outside the team (principle 18). It is
    reported plan context, not verified authority or access control, and never a weight on a person: their reports
    aren't multiplied and nobody else's are discounted. The page says "whose input to seek" and "who
    decides", never "trusted" or "weight".

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
| Which tracker the plan follows (Jira, GitHub or none) and its server | Plan | Sightline | Named in plan settings; facts from another tracker or server are refused |
| Whether sprints come from the tracker or the plan (`sprintSource`) | Plan | Sightline | "No tracker sprints" when the plan keeps its own |
| Which board, project, iteration field or search the sync reads, and the addresses it calls | The person who runs the sync | Their private settings, never the shared folder | Not shown in the plan |
| Plan items: initiatives, tasks, milestones, gates, meetings, notes, process blocks, plan timeboxes | Plan | Sightline | "Added here", with who added them |
| A person's own items: what they're working on, what they relate to, when and how they were closed | Plan | Sightline | Added here, with who added them; on their owner's list in Today |
| What's on a person's Today: their own items, Jira issues, tasks and initiatives, requests, decisions and risks | Computed by Sightline from the plan and Jira's facts | Inputs in Jira and Sightline | One list, each item marked as Jira's or the plan's |
| A short chart label or lead for a Jira item | Plan | Sightline | Labeled as the plan's, next to Jira's title |
| Progress counts | Computed by Sightline from Jira's facts and the plan's choices | Inputs in Jira and Sightline | Count with unit, scope and freshness |
| Effort ranges, skills, workstream shares, scenarios | Plan | Sightline | Added here, with who added them |
| Forecast finishes, critical chain, workstream load | Computed by Sightline from the plan's inputs and Jira's facts | Inputs in Jira and Sightline | Likely and high finish, with the reason for each wait and what the forecast assumed |
| Saved team views and tag colors | Plan | Sightline | Named views; tag style |
| History: snapshots, saved status updates, older item updates, the Activity log, closed own items | Plan, kept in history files beside it | Sightline | By period, with who added each entry; a period that couldn't be read is named |
| Captured requests and ideas: what was raised, its capture type, who asked, its source and meeting date, and what became of it | Plan | Sightline | Added here, with who added them and who asked |
| How long a captured item has been open, and what it was handed off to | Computed by Sightline from the plan | Inputs in Sightline | Age from when it was added; unknown shown as unknown |
| What I've hidden from my own view | The viewer | That viewer's browser | View indicator with hidden counts |
| Which apps I've connected, and how much each may do | The viewer | That viewer's browser | Settings, Apps; "via" on every change an app made |
| A connector's sign-in and what it reads | The person who set it up | Their credential store and private settings, never the shared folder | Not shown in the plan; its findings are offered for review |
| Proposed changes to Jira (later) | Plan | Sightline, applied by the sync script | Shown as pending on the Jira item until Jira has them |
| An outcome's class, why it matters, and when to reconsider it | Plan | Sightline | Added here, with who set it |
| The work order of initiatives | Plan | Sightline | Added here; what the forecast follows, apart from where items sit on the chart |
| Capture evidence: channel, impact, each later report | Plan | Sightline | Added here, with who added it and who raised it |
| Drafted tracker items | Plan | Sightline; a person creates the item in the tracker | "Draft, not in the tracker yet" until its key is recorded |
| Links to documents and messages | Plan (the link); the source (the document and who may open it) | Sightline (the link); the source (the document) | Title, host and when it was added; opens in the source |
| What a capture's evidence adds up to, and what's due for review | Computed by Sightline from the plan | Inputs in Sightline | Reports, people, channels and span; "Still true?" |
| What matters now: dated guidance, its scope, why, who set it, review date and what it replaces | Plan | Sightline | Added here, with who set it; upcoming, active or ended, and review due |
| Which guidance applies to an item, and which decisions cited it | Computed by Sightline from the plan | Inputs in Sightline | Named guidance with its dates; history kept when it ends |
| Which risks and decisions are about an outcome or request | Computed by Sightline from the plan | Inputs in Sightline | "Waiting on" and "Risk" lines with the outcome or request; never changes its stage, priority or dates |
| What a new ask would push out (the jar) | Computed by Sightline from the plan's inputs and the tracker's facts | Inputs in the tracker and Sightline | "What-if: not the plan", with what isn't estimated |

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

## Your own work, beside the team's

Sightline is also where each person runs their own work, in relation to everything else going on. The team's wall is
the context; a person's own list is where they start their day.

- **Everyone has their own list.** People put in what they're working on as fast as they can type it, one line of up
  to 500 characters, and close it out when it's done. An item needs nothing else: no initiative, date, estimate or
  Jira key. Someone can pin an item to a day, saved on the item: a reminder of when to pick it up, not a schedule,
  so it doesn't put the item on the timeline. A pinned day that has passed keeps the item at the top, marked with
  the day it was pinned to, until it's unpinned, moved or closed; it never moves on its own.
- **Own items are plan items.** They're saved in the plan, with an owner and who added them (anyone can add one to
  someone else's list, and an assistant can propose one through a reviewed change). Like every plan item, anyone who
  can open the plan can see and change them, keeping the creator and showing the last editor; Sightline makes no
  promise that they're private. "You" is the same unverified "who am I" the page already uses.
- **All of your stuff in one place.** The **Today** view shows your own items, then what is yours elsewhere, worked
  out from the plan and the Jira files and never copied:
  - your Jira issues: open issues whose Jira assignee matches your linked Jira user key, and those that closed today.
    Someone not linked to Jira is asked to link, and is never matched by display name;
  - plan tasks and initiatives you own that are started, due or late;
  - captured requests you own;
  - decisions you own or decide, and risks you own.

  What matters now is shown beside the list as context, not as one of your items. Own items appear only in Today and
  on standup cards (open ones, and those closed since the sprint started); they have no planned dates, so they aren't
  on the timeline or the roadmap.
- **Related, not filed.** An own item can point at one or more initiatives, outcomes, requests or Jira issues (a
  story too), saved by stable ID or Jira key; the related Jira item is never copied, and one the sync no longer
  returns shows as not in the last sync. A relation never closes anything, in either direction: Jira finishing an
  issue doesn't check off an item related to it. Moving an item into an initiative is a deliberate step that can be
  undone: it becomes a plan task with the same ID, creator and owner, leaves the own list (it then shows once, as a
  plan task you own), and follows the plan's rules for tasks. A Jira key it was related to becomes the task's Jira
  link only if the person chooses it, and then Jira owns its dates and status.
- **Closing out.** An item is closed as done, or as not doing (with an optional reason); neither is deleting, and a
  closed item can be reopened. Both record who closed it and when. Reopening an item that has moved to the history
  files moves it back into the plan file, following the history rules: only from a quarter that was read, and undo
  puts it back. Jira issues in Today are read-only and close in Jira; one that closes shows that day as done (or
  abandoned, as the team's status map reads it) after the next sync, then leaves the list.
- **Finishing is the point, and the plan stays small.** Items closed in the last 30 days stay in the plan file and
  show as what you got done; older ones move to the history files, filed by the quarter they were closed. Showing
  older ones reads history and follows its rules: never waiting on it, and naming a quarter that couldn't be read.
  Sharing what you got done in a standup or status update copies it into that update, which is then a dated record.
- **Show and hide.** The list is per owner; showing and hiding someone's items is a view preference like any other,
  and hidden items are counted.
- **The wall rule still holds.** Nothing on the list changes a Jira fact.
- **The format.** Own items are a new saved field: a copy that doesn't know it opens the plan read-only. Teammates'
  edits merge item by item, so two people checking off different items both keep their change. Moving closed items
  to history is a new kind of history entry, so an older copy can't read those history files and says so.

## Captured requests and ideas

Meetings raise things that belong to a workstream but aren't work yet: "the support team wants to hear when the
release process changes", "we have no way to send release notes to the teams that use them". The plan keeps them, so
they're there when the team sets priorities and shapes the roadmap, and so whoever asked hears what happened.

- **A captured item is a roadmap idea with a capture type:** idea, request, process gap or question. The capture type
  is its own field; it never changes what a roadmap item's kind (new, improved, fixed) means for release notes.
- **Who asked is a person or a group** already in the plan, recorded apart from who added the item and who owns it.
  Unknown stays unknown. Nobody becomes the requester, or the owner, because their name was mentioned.
- **Where it came from:** a short source and the meeting's date. A capture holds the request, never a transcript.
- **What became of it is separate from delivery.** Handing an item off to an initiative or a Jira issue, or declining
  it with a reason, closes it as a capture; neither marks anything done or planned. A date alone never turns a
  capture into a commitment, a Jira link alone never counts as a handoff, and a closed capture can be reopened. The
  Jira issue it became is still Jira's: the plan records the key, never a copy of the issue.
- **Unsorted is a place.** An item whose workstream isn't known yet is shown as unassigned, not hidden or guessed.
- **Triage is a view:** open captures by workstream, oldest first, with who asked and where it came from.
- **Any assistant can capture,** through Sightline's proposal review like everything else (principle 16). It
  reuses the people, groups and workstreams the plan already has, by ID. A change that adds a new person or group,
  or invents a category, always waits for a person, whatever the assistant is allowed to do on its own.
- **A request names other teams in a shared file.** Principle 11 holds: capture only what the team would say in
  the room.

### Anything heard can be captured

A meeting is one place requests come from. Email, chat, support tickets, bug reports and a hallway complaint are
others. Anyone can hand what they heard to their assistant, and one shared intake skill turns it into reviewed
captures.

- **One observation per capture:** a short statement of the problem or the ask, who raised it (a person or group
  already in the plan, or a role such as "a customer" or "support", never an outside person's name or contact
  details), when, the **channel** it came through (meeting, email, chat, support, bug report) and a one-line
  **impact**. Never a transcript or a pasted message. A link to the original is a reference (principle 20).
- **Match before adding.** The skill compares what's affected and what's wanted, not titles, against open and closed
  captures and the tracker items Sightline has loaded. It proposes one of: a new capture; "heard again" on an existing
  one; "already in the tracker" with the item's key; or one question that tells two similar things apart. An
  uncertain match stays separate, linked as a possible match, for a person to decide.
- **Evidence adds up.** A capture shows its reports, the distinct people (outside people counted, not named) and
  channels, and the span of time. A forwarded message isn't a new report.
- **Its fit with the roadmap is stated:** it supports an outcome, competes with one, or has no connection yet. A
  capture with no connection stays findable and never becomes plan work by itself.
- **Draft a tracker item.** A capture can carry a drafted item for the tracker: summary, problem, expected and actual
  behavior, steps to reproduce, acceptance criteria, its evidence and open questions. A person searches the tracker
  once more and creates it there. Recording its key links the capture to it; a person confirms the handoff, since a
  link alone never counts as one. Sightline never creates the item.
- **Still true?** An open capture past its review date is listed for review: keep it, decline it with a reason, or
  merge it into another. Its links are reviewed with it, since the page can't tell a link has gone dead. A capture
  that was handed off adds its evidence to what it became, never extra work.

## Deciding what matters

Everything above is input. Two moments turn it into a decision.

- **Your next move.** Any item can show its thread: tracker item, initiative, outcome, the documents it rests on, who
  asked, why it matters now, and what would change the team's mind. The next move can be a question to settle ("get
  this requirement answered"), not only work to start. A missing link in the thread is shown as missing.
- **The jar.** A sprint's or a quarter's capacity, worked out from people, their time, each workstream's reserve and
  the dates the tracker already holds. The team puts its rocks first in the work order, pebbles around them and sand
  where it fits. Each workstream's reserve covers interruptions and unplanned work, separately from outcome classes.
  The jar shows what the team chose; it doesn't enforce it. Dropping a new ask at a chosen place in the work order
  previews what the forecast says: it fits in the likely forecast; it fits if these wait (each named, with who asked
  for it); it doesn't fit; or Sightline can't tell. Work with no estimate is counted and named, never treated as empty
  space. The preview is computed and labeled "What-if: not the plan". It changes nothing; a person may keep it as a
  scenario, and making it the plan follows principle 15. Shapes are never packed by size: the forecast alone decides
  what fits.
- **The work order is its own thing.** It's what the forecast follows, set by people, separate from where items sit on
  the chart and from the tracker's own priority field, which stays the tracker's fact.
- **What matters now.** A team says what it's weighing this period, in plain words, with dates. Asked "why is X above
  Y?", an assistant cites the reasons the decision recorded, then, separately, what current guidance would suggest.
  Asked to "focus on cost", it proposes the guidance entry for review and, as its own reviewed change, a work order
  to compare with today's; neither applies on its own.
  The money, deadlines and confidence behind a decision are short evidence with links to their sources; contracts
  and financial models stay where they live. Sightline holds what's needed to explain the plan, and says how fresh
  each part is.
- **One set of instructions.** The team's assistants use the same shared skills (what should I work on, capture what I
  heard, triage this ask, can we promise this) and the plan's own planning guide, so their reasoning can be compared.
  Each cites the items it relied on.

## Many views

The wall is the data; views are lenses on it:

- **Timeline** (weeks and days): where work sits in time.
- **Today**: your own list and everything of yours from the plan and Jira, then what needs attention now.
- **Standup cards** (next): the current sprint's work, Jira and plan items, by person.
- **Retrospective** (later): what finished, slipped, was abandoned or switched off, and the notes around it.
- **Free-form canvas** (later): the literal whiteboard, arranged by hand, for thinking rather than scheduling.

Each view follows the same visual grammar and the same hide rules, and nothing added in one view is invisible in
another.

## GitHub Issues, an optional tracker

A plan can follow GitHub Issues instead of Jira. Everything this charter says about Jira applies to GitHub, with the
differences below.

**One tracker per plan, and both are optional.** A plan follows Jira, GitHub or no tracker at all. GitHub can be
github.com or a GitHub Enterprise Server. A plan never mixes the two trackers, and switching a plan from one tracker to
the other never reinterprets the keys, people links or sprints it already holds. Nothing is relinked without a
reviewed step.

**Read-only and narrow, as with Jira.**
- GitHub issues are facts the tracker owns. The plan shows them from the latest sync and never copies them.
- The sync never changes GitHub today. Any later write-back follows "Changing Jira, later". It makes REST GET
  requests, and only fixed, reviewed GraphQL queries. It accepts no GraphQL query text from anyone, so nothing it
  sends can change an issue. Which repositories or project it reads is still that person's own search.
- The token stays in the operating system's credential store and is tied to the tracker and the server. Each address
  the sync calls (web, REST, GraphQL) lives in that person's private settings.
- The shared plan names its tracker and server so the page can tell whose facts it's showing. It never chooses where
  a token is sent, and a sync refuses files from a different tracker or server.

**Identity.**
- An issue's key is `GH-` followed by GitHub's numeric issue id, scoped by the plan's tracker and server. It stays the
  same when an issue is renamed, moved or transferred.
- `example-org/app#12` is how an issue is shown and linked: its display reference, never its identity.
- GitHub's opaque node id is kept only to find the issue again on the next sync. It is never decoded and never
  derived.
- People link by GitHub's numeric user id (`gh-` and the number), with an explicit click. A login or display name is
  for showing only. A link is never guessed from a name or an email.

**GitHub's meanings, not Jira's.**
- An open issue is open. That alone doesn't make it in progress.
- Closed as completed is done. Closed as not planned or as a duplicate is abandoned. A reason Sightline doesn't know
  is shown as unknown, never guessed.
- Whether an issue is done or abandoned comes only from its state and the reason it was closed. For an open issue, a
  GitHub Project's status says how far along it is, but it never marks the issue done.
- A Project's status field means nothing until the team maps each option. Until then, progress shows as unknown.
  The order of the options is never read as a workflow.
- Pull requests aren't issues. They never join the plan as work items.
- When an issue has several assignees, the page shows all of them. It's on the Today of each assignee who is linked to
  a person, and it still counts once in every total.
- A milestone is shown as a milestone, never as a release or a sprint.

**Sprints come from the tracker or from the plan.** Each plan has a shared setting, `sprintSource`. It is `tracker`
(today's behavior, and the default) or `plan`, which the page labels "No tracker sprints". This applies to Jira as
well as GitHub.
- For GitHub, the tracker's sprints are a Project's iterations. Their ids are text and stay text. They're never turned
  into numbers.
- Choosing "No tracker sprints" stops the page from offering the tracker's sprints. It never erases timeboxes the plan
  already has, and it never makes dates the tracker owns editable. Moving followed rows over to plan timeboxes is its
  own reviewed step.
- Which board, project or iteration field to read stays in the private settings of the person who runs the sync.

**One sync, two trackers.**
- One sync on the user's own computer does both. Fetching is separate for each tracker. How credentials are kept,
  scheduling, limits, atomic writes and keeping the last good files are shared. Each tracker's tokens stay separate.
- The sync writes `status.json` and `issues.json` beside the plan. Each file names its tracker and server, and its
  format version goes up with that change.
- Existing Jira setups keep their folders and file names. Older copies that can't read a GitHub plan open it
  read-only.

**Words on screen.** Items from GitHub are labeled "From GitHub", and links say "Open in GitHub". Labels change by
exact string, never by pattern. A control that only makes sense for Jira is hidden for a GitHub plan.

**Your own work stays yours.** A GitHub issue assigned to you shows in Today from the latest sync, like a Jira issue.
It never becomes a second, personal copy on your own list.

**Built in this order, each a release that works on its own:**
1. this charter;
2. one sync with tracker adapters, with Jira working exactly as before;
3. GitHub issues, with the smallest page changes that make them usable (source checks, keys, links, adding and
   placing issues, status, linking people, freshness);
4. "No tracker sprints", for either tracker;
5. GitHub Projects: status and iterations;
6. sub-issues and milestones.

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

## The plan and its history

A plan in daily use piles up history: snapshots, saved status updates, the dated updates on each item, the
Activity log, and people's closed own items. After a year that history is most of the file, and the file reaches
the size limit. So the plan file holds what the team is planning now, and history lives in history files in a folder
beside the plan, one file per calendar quarter. Each entry goes in the quarter of its own date, so every copy files
it the same way. The edit lock, backups, drafts and the Jira files are not history.

- **The plan file is enough to plan.** Opening, drawing and saving the plan never wait on history. The plan keeps
  what it needs to draw today, such as each item's latest update and the newest snapshot and status update; older
  entries are in the history files. The sync script reads only the plan file.
- **Missing history is named, never shown as empty.** When a history file is missing, late or can't be read, the page
  says which quarter it couldn't read ("History for Jan to Mar wasn't found"). It never treats that history as
  deleted and never writes a quarter it couldn't read. It starts a new file for a past quarter only to move entries
  out of the plan file, and only after checking that no file for that quarter exists.
- **History follows the plan's rules.** Entries record who added them and when, merge with teammates' entries, never
  overwrite a teammate's, and are checked against the size limit before anything is written. The plan's edit lock
  covers its history files, and undo works on history like any other change. Saving as a new shared plan should copy its
  history; until it does, it's refused for a plan whose history is in files, and the page says to copy the plan's whole
  folder instead. A history file is shared like the plan file (principle 11).
- **History never blocks the plan.** If the history folder isn't available, history stays in the plan file and the
  page says so. A history file that would pass the size limit is split, never refused.
- **Moving history out never loses it.** An entry leaves the plan file only after its history file is written and read
  back; if that write fails, the entry stays in the plan and the page says why. This holds for every save. The first
  save in this format saves the old file as a backup before anything moves. Copies of Sightline from before this
  change open the plan read-only and say why.

## Not in scope (for now)

- Editing Jira from the page, or any browser connection to Jira.
- Creating tracker items from the page. Sightline drafts them; a person creates them.
- More than one tracker in one plan, or Jira and GitHub items side by side.
- Fetching, previewing or copying linked documents.
- Verified identity, permissions, or private content inside a shared plan.
- Treating plan timeboxes as Jira sprints, or plan copies as Jira facts.
- Guessing at Jira history the sync can't see.
- A server. Sightline stays one HTML file, a plan file with its history files, and a sync script. Apps reach it
  through files in a folder the person granted, never over a network.

## Decisions

**Made**

- Jira items are read-only and shown from the latest sync; the plan arranges and annotates them (the wall).
- The page never contacts Jira; tokens stay in the user's operating-system credential store.
- Everything added records its author; hiding is a personal, recoverable view preference.
- Tags on everything; Jira labels are read-only tags marked as Jira's, separate from plan tags.
- One workstream placement per epic; other workstreams refer to it rather than placing it again.
- Notes on Jira issues attach by Jira key and follow the issue.
- Write-back comes later, through proposed changes first, then the sync script.
- Meeting requests and ideas are captured as roadmap ideas with a capture type, who asked and what became of
  them, kept apart from delivery stage. Requesters are existing people and groups; there is no separate list of
  teams yet.
- History (snapshots, saved status updates, older item updates, the Activity log, closed own items) lives in history
  files beside the plan, one per period; the plan file holds what's being planned now.
- Sightline reads three kinds of input: trackers (Jira first), signals and references. The rules for Jira apply to
  any tracker.
- What matters now is dated guidance kept beside the planning guide, scoped to the whole plan or listed workstreams;
  Sightline never computes a priority score, and decisions cite the guidance they relied on by ID.
- Priority is a plan fact: a class and a reason on each outcome, plus a work order. There's no separate list of
  objectives.
- Intake from any channel is a shared assistant skill that writes reviewed captures, not a separate store.
- Tracker items are drafted in the plan and created by a person.
- Each person keeps their own list in the shared plan and sees it in Today, beside everything of theirs computed from
  the plan and Jira. Anyone can see and change it, like the rest of the plan; items closed over 30 days ago move to
  the history files.
- A risk or decision can be about an initiative, an outcome or a captured request. The outcome or request shows
  what it's waiting on and its risks; nothing about its stage, priority or dates changes because of them.
- GitHub Issues is a second tracker, on github.com or GitHub Enterprise Server. A plan follows one tracker or none.
  Issues are keyed by GitHub's numeric issue id and people by their numeric user id. The sync stays read-only, and
  each plan chooses whether its sprints come from the tracker or from the plan.

**Open**

- Can anyone edit anyone's plan items? Recommended: yes, keeping the creator and showing the last editor.
- Can anyone delete anyone's item? Recommended: yes after showing what goes with it (children, notes, links), with a
  way to bring it back.
- Is a note's text editable only by its author? Recommended: the page asks before editing someone else's words, and
  says plainly that this is a courtesy, not a lock.
- Should one person's hidden choices follow them across computers?
- Finished work in a long-lived plan: on the biggest plans that run two years, finished initiatives and tasks alone
  can reach the size limit. Should a plan roll forward, moving finished work into its history?
  Decided for own items (closed over 30 days ago); still open for initiatives and tasks.
- Who sets an outcome's class: anyone, or the product owner? Recommended: anyone, showing who set it.
- How long before an open capture asks "Still true?" Recommended: 90 days, set per plan.
- How to keep a long-lived capture's evidence small once it has many reports.
- Links on every plan item, or only on outcomes and captures at first? Recommended: every item.
- When to rename "Jira" to the tracker in the rest of this charter, the sync and the page. With GitHub coming, the
  page names the plan's own tracker wherever GitHub is supported ("From GitHub"). Recommended: rename the rest of
  this charter once GitHub issues ship, and keep the data names (`jira`, `epics`) so older copies keep working.
- Projects and platforms: tie people, groups and work to what they build on, own or use. Deferred until captured
  requests show which of those relationships a planning view needs; a plain project tag can't tell them apart.

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
- Anyone can say why the item they're on matters, and whose request it serves, from the item alone.
- The same complaint heard three times through three channels shows as one capture with three reports.
- Nothing closed six months ago counts toward priority, except through the work it became.

## Holding ourselves to it

Every pull request says which side of the wall it touches: **Jira facts** (the sync and how Jira items are shown), **the
plan** (plan items and what's added around Jira items), **a viewer's preferences**, or **something computed from both**. Changes to
the plan's format also say how old copies and merges behave. Changes to what's shown check that Jira facts stay
read-only in every view, counts have units, and hidden things can be found. Changes to the sync keep the page free of
tokens and the script's Jira access narrow. Examples and tests use made-up names only.
