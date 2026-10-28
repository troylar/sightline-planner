# Find your work in Sightline

Start with the [launch instructions](../README.md#try-it-with-an-invented-team-plan): open **dist/sightline.html** in Chrome or Edge, then open the separate
plan file from Sightline's **File** menu. The source template is not the runnable release, and a plan link alone does
not grant access to its file.

The menu runs down the left side. At the top are your pinned pages: Today, Sprint, Timeline and Capacity until you
change them. Below them, every page has one home in a group:

- **Work**: Today shows attention and next actions. Sprint shows the current sprint by person, workstream or epic. Sort Jira work places synced issues on the plan. Cards shows the plan's Jira work as cards by workstream. Jira change proposals reviews what the sync suggests.
- **Delivery**, in three parts. Plan: Timeline shows planned work. List shows the same work as rows. Capacity shows the forecast, people and time off. Review: Status update, Milestones, Gates, Decisions and Risks support delivery reviews. History: Snapshots and Activity.
- **Product updates**: Roadmap explains what the team plans to ship. Customer release notes opens the customer wording approved for each Jira release.
- **Settings**: Plan (Tags, Cards, Planning guide), Team (Team, Work calendar, Meetings, Timeboxes and ceremonies) and Connections (Jira connection).

Groups start closed. Click a group's heading to open or fold it; the group you're in opens unless its page is pinned.
A number shows only when something needs you, such as high risks on Risks or what needs attention on Today, and a
closed group shows a dot when something inside it does. To pin a page, point at it in its group and click the pin, or
focus it in the menu and press P (the arrow keys move through the menu). A filled pin means it's pinned. Unpin it the
same way, from its group or from the top. You can pin up to five pages; pins stay in this browser and
never change the plan. The button at the top of the menu, or the `\` key, collapses the menu to a rail of
icons, and hovering or focusing an icon opens that group beside it. Sightline remembers the choice in this browser.
On a narrow window the menu starts as a rail.

Each group remembers your last page. Existing saved startup choices and links still open their original destinations. The browser's Back and Forward buttons step through the pages and items you opened, and bring each back as you left it: the same item open, and the page, chart and details panel scrolled where they were. Where you'd scrolled stays in this browser's history, so a copied link opens clean. Views express audience preferences; file permissions control access.

Saved views and filters apply to Timeline, List and Capacity. To look at one initiative or one person's work, select it and click **Show only this initiative** or **Show Avery's work** on its card, or press **Z** (double-clicking an initiative does the same). It shows as a chip above the chart, such as **Initiative: Search** or **Person: Avery**; show an initiative and a person together to see that person's work in it. Click a chip to take it off, or **Show all work** to clear every filter. The browser's Back button undoes each of these. A person's work is the tasks and Jira stories assigned to them, plus initiatives they lead. Showing a person takes the place of any people you picked in Filters, and showing an initiative takes the place of any initiatives you picked; your other filters still apply, and the zoom stays as it was. If none of what's shown is in the dates on screen, a line under the chips says when it is, and **Go to it** scrolls there; if nothing matches at all, it says so. Chips are your own view in this browser and never go in the plan; links carry them. To look at several initiatives at once, pick them under **Filters > Initiatives**. Each shows with everything inside it and the initiatives that hold it, plus the milestones done when a shown initiative is. Gates are hidden while you're picking. Roadmap and Status update use the whole plan and say so. Your filters remain available when you return to Timeline.

To see one item with everything tied to it, select an initiative, task, milestone or gate and click **Show linked work** on its card, or choose **Show only what's linked to the selection** in Find. It shows the item, everything it waits for all the way back and everything that waits on it all the way on, but not work that only shares a prerequisite with it. An initiative brings what's inside it, and a task brings the initiatives that hold it. The Timeline switches to **Fit** so all of it is on screen, and the late count says it covers the whole plan. A **Linked to** chip above the chart says what it's linked to; take it off, or press Back, to see everything again at the zoom you had. It changes nothing in the plan, and the List shows the same work. While linked work is shown, select another item and click **Add to linked work** (or use Find) to see what's linked to it too, up to 5 picks; each has its own chip, and **Remove from linked work** on a pick's card takes just that one off. To keep everything on screen instead, click **Highlight instead** next to the chips: what isn't linked is dimmed, and still works when you hover, click or tab to it. **Hide the rest** switches back, Back undoes either, and taking the last chip off ends it. With an item selected, a dashed outline marks what it's directly linked to; the Key says so. On a narrow window with the details panel open, a long span can be wider than the chart even at **Fit**, because weeks keep a minimum width; scroll sideways, or close the panel, to see the rest.

To see what a milestone is waiting on, select it: **What leads here** on its card lists the work it waits for, all the way back, but nothing that waits on it. It names what finishes last and when, then the rest, latest finish first, with each item's date, status and owner. Work finishing after the milestone's date is marked, and so are dates that come from Jira's sprints. A milestone that's done when its initiatives finish takes its date from them, and the card says so. Click an item to open it; nothing in the list changes the plan. To see all of it on the Timeline, click **Show linked work**.

## Cards

**Work > Cards** shows every Jira story, Jira task and one-issue initiative on the plan as a card. Rows are workstreams in
plan order. Inside a workstream, cards sit under their initiative, and the ones that aren't on an initiative come last.
Rows can also be people or epics. Columns are status (to do, in progress, done, and canceled when you tick it) or sprint
(earlier sprints, the active one, the next ones, no sprint). Filter by sprint, person, status, epic or text, or click
**Mine**. Each total says what it leaves out: cards not estimated, cards you hid, and cards the filters hide, each counted
on its own.

- **Drag a card to another workstream or onto an initiative** to place it there. It's the same change Sort Jira work
  makes: a story leaves its epic's initiative (switched off there), and a Jira task leaves its initiative. One save, with
  Undo. A one-issue initiative moves between workstreams; to put it inside another initiative, change its parent in its panel.
- **Drag a card to another status or sprint** to propose that change for Jira. Jira doesn't change. When a status column
  covers several of your workflow's statuses, Sightline asks which one and remembers your choice in this browser.
- **Without a mouse**: focus a card and press **M**, choose a place with the arrow keys, then press **Enter** (or **Esc** to cancel).
- **Hide** keeps a Jira item off the plan's views (cards, the timeline and List), with an optional reason, using the plan's
  own ways: a story is switched off in its initiative, an epic is parked, and an issue the plan doesn't show is marked not
  ours. **Hidden** lists each one, how it's hidden and why, with **Bring back**. Work that's on the plan as its own task or
  initiative can't be hidden; take it off the plan instead.

**Settings > Cards** sets what a card shows: the fields and their order, the density (compact, normal or detailed) and
whether cards get wider for more points. The plan holds the team's layout (change it while editing). **Mine** is your own
layout in this browser, with **Reset to the team's layout**. A plan with a team layout or hide reasons opens read-only in
an older copy of Sightline.

## Declutter: hide what you don't need

**Show** (in the Timeline toolbar, or press H) has an eye for each kind of item: Gates, Releases, Deliverables, Meetings, Process blocks, Milestones and Done work. Click one, or press its letter while the menu is open, to hide or show it. Hiding works on Timeline, List and Capacity's People page. Today and Sprint always show everything.

- **Keys:** G hides or shows gates and M meetings, on those pages. Shift+H shows everything.
- **Focus** hides meetings, process blocks and done work in one click.
- **Hide all meetings** (or gates, process blocks, releases, milestones) is in the details of any one of them.
- **Pin the top rows** keeps the Gates, Releases, Deliverables, Team meetings and Process rows in view under the dates while you scroll the workstreams, up to half the chart's height.
- Under the toolbar, "3 hidden: meetings, process blocks, done work" names what's hidden, with **Show everything**. The Show button says how many.
- In **Filters**, each kind cycles: Show only, Hide, off. Hide wins over Show only. Clear filters also shows everything.
- **Crowded labels:** on Weeks, labels are spaced by their real width at the current zoom, window width and text size. A workstream's milestones (and their stretch dates) use three rows at most; past that a label is cut short where the next one starts, keeping its date, and shows in full on hover or when you tab to it. Gates whose markers would touch share one flag with a count.
- What you hide is yours: it stays in this browser for each plan, and a saved view keeps its own choice. Find brings a hidden kind back when the result is one of them. Nothing is changed in the plan file.

## List

**List** (Delivery, next to Timeline, or press L) reads the plan top to bottom, like a checklist. It shows the work Timeline draws for the same filters: initiatives with their tasks, and Jira stories placed on the plan or counted under an epic. Each row has Start, End, Item, Workstream, Owner, Waits on and Status.

- **Layouts:** By workstream, the default (each workstream in its order, with its color, its initiatives and their tasks under it; the Workstream column is left out, since each group names it), By initiative (initiatives are group headers with their own dates, owner and item count), By person (a task with two owners appears under each, marked shared), By start date (everything in one list), and By connection (each chain of linked work as its own group, named for where it starts (every starting point, when it has more than one), in the order it has to happen: what a row waits for comes before it; chains go by when they start, a chain holding linked work you picked comes first, a chain with a loop says so, and work with no links is last; filters hide rows but never move one to another group), By order (steps from what waits for what: step 1 waits for nothing, each later step waits only on earlier ones, waiting for an initiative means waiting for everything in it, and work in a loop is set apart; filters hide rows but never change a step; waiting and unstaffed rows are listed apart, last). Steps show order, not what's ready: a done item still counts, so a step 2 item whose step 1 work is done can start now. Ties keep initiative order, then plan order. The layout stays in your browser for each plan; it isn't part of a saved view.
- **Dates** are Timeline's own: weekends, holidays and owners' time off are already skipped.
- **Owner** shows the plan's owners; for a Jira item, its Jira assignee and, separately, any plan lead. People outside the team or inactive are marked.
- **Waits for** lists what an item waits for: a task's links, and an initiative's waits on other initiatives, gates and process steps. In the flat layouts a task's row also shows its initiative's waits. Jira dependencies link to Jira, with a warning when one ends after the item starts. Click a name to open it.
- **Status** is the status Timeline shows. For a Jira item, Jira's own status and when it was synced.
- Work Timeline doesn't draw (parked, switched off, abandoned in Jira, or without sprint dates) is in **Not on the timeline** at the end, with the reason, so nothing goes missing.
- Hover or focus a row for its card; click it or press Enter for its details. Escape closes them and returns you to the row; Up and Down move between rows. A selection carries between Timeline and List, and the page, layout and selection are in the link.
- **Columns:** drag the edge of a column's heading to make it wider or narrower, or focus the edge (Tab) and use Left and Right (Shift for bigger steps). Double-click an edge for that column's default width. The first resize sets every column to the width it shows, so nothing else moves, and a wide table scrolls sideways. **Columns** in the toolbar sets each column to wrap or keep one line; a one-line column is cut short with the full text on hover. Out of the box only the dates keep one line. **Reset columns** goes back to that. These settings are yours, kept in this browser for every plan; they aren't in the plan or a saved view, and printing always shows every column in full.
- **Copy as table** copies the rows as shown as a markdown table. If the browser doesn't allow copying, the table appears selected so you can copy it yourself. **Print** prints every row, with the header repeated on each page.

Edits stay in the details panel; List has no editable cells.

Roadmap starts with **Four quarters**. Choose the starting calendar quarter (including its year); this is a target
window, not a commitment. The choice stays in your browser. **Long range** restores the broader quarters, halves,
years, and Later view. Work outside the four-quarter window is counted; **Show in long range** reveals it without
moving or deleting it. Done and dropped counts still have their own show controls. Broad targets span the quarters
they overlap. Fiscal calendars are not configured by this view.

Choose **Plan with AI** to select the displayed quarters, or open an outcome and choose **Ask assistant about this**.
The **Planning assistant** shows **Working on** above the composer. Paste notes or describe a change, then **Send**
once. These actions do not send or apply anything on their own. An untouched generated starter follows a new
selection. A question you have written keeps its original selection; **Switch context** deliberately changes that
selection while keeping your text. **Test reply** checks for a response, and **Connection and setup**, under **Setup and files** at the end of the panel, holds detailed
instructions. Read the [first planning session](assistant-workflow.md#first-four-quarter-planning-session)
for the in-app route. External tools use the [private-folder session](assistant-workflow.md#your-first-external-planning-session) and their own conversation.

Unsubmitted **New roadmap idea** text stays with its plan during navigation and redraws in this tab's session. It is not
included in the saved plan or assistant context until added. Successful submission clears only the submitted text;
an idea you start typing while the save finishes is retained. Copy or submit drafts before closing the app.

Today distinguishes no work loaded, missing Jira status data, and incomplete connected data. Its attention flags
describe the available plan and sync; a quiet summary does not establish delivery feasibility.
In the Team view it also lists captures that have waited in To triage for over 30 days.

Open the menu at the right of the header (**Choose yourself**, or your initials once you have) and choose **Choose yourself** or **You: [name]** to identify yourself for Mine and author stamps. This is a browser preference, not a verified identity. The same menu has text size, theme, **What's new** and help.

**Text size** makes the page's text larger or smaller without browser zoom: **A+** and **A−** move in 10% steps from 90% to 150%, and **Reset** goes back to 100%. Text never goes below 9 pixels. The setting stays in this browser and never goes in the plan. There's no keyboard shortcut, so Ctrl or Cmd with + and − still zoom the whole browser.

**File** holds only what you do with the plan file: the shared file, importing a copy and exporting one. The plan's start date, default sprint length, whether linked items move automatically and where Jira links go are in **Settings → Plan details**. **Set baseline** is on **Delivery → Snapshots**, and the page Sightline opens on is under **Start Sightline with…** in the menu at the right of the header. Each Settings page is titled with its name in the menu.

**The Time button.** On the Timeline, the time controls (Weeks and Days, the sprint picker, **‹** **›**, the presets and **+** **−**) sit behind one **Time** button that says what's on screen, for example **Time: Weeks · S2 (Oct 19 – Oct 30)**. It starts closed; click it to open the controls in place, where the button shrinks to its arrow so the toolbar stays one row, and this browser remembers whether you left it open. The shortcuts and Find work either way, and the button keeps up with them. Warnings about the plan, like the late count, never go inside it.

**What's hidden.** When the Timeline leaves things out, a line under the toolbar says why: kinds you hid, the Added by filter, parked initiatives, workstreams outside the dates on screen. With two or more reasons it folds into one line that counts each, with what you chose to hide first, and **Details** opens the full notes and their buttons (**Show everything**, **Review parked**, **Clear it**). It starts closed, and this browser remembers whether you left it open. One reason shows in full. Warnings, like the late count, are never folded into it.

**One sprint, edge to edge.** Open **Time**, then beside Weeks and Days pick a sprint (its tooltip shows the dates on screen). The view fits it exactly, its first day at the left edge and its last at the right, in Weeks and Days, whatever its length and the window's width. **‹** and **›** (or **[** and **]**) step to the previous and next sprint; **.** goes to the sprint we're in, or the next one between sprints. With **+** and **−** you can show two or more sprints from the chosen one. **Fit** lets the view scroll freely again. The choice stays in this browser, and a link to the Timeline carries it. Beside the picker, **1** (This sprint), **2** (This + next), **3** (Next 3) and **Fit** get there in one click, always from the sprint we're in (or the next one, between sprints); Shift+1, Shift+2, Shift+3 and Shift+0 do the same. A plan with sprints opens on This + next the first time, and after that on your last choice, moved along to the current sprint. A link with a sprint wins over both.

**Sprint shelves.** In Weeks, with rows by workstream, each workstream's Jira stories sit on a shelf per sprint instead of a bar each. Tiles are grouped under their initiative, with stories not on one last. A tile's width follows its points, one scale for the whole chart (a minimum so small stories stay readable; past 13 points the width stops growing and the tile is marked ▸). Each tile shows its points, a status symbol (○ not started, ◐ in progress, ● done) and the assignee's initials; hover or focus a tile for the full facts, and click it, or press Enter, to open its panel. A red corner and ⛔ mean blocked in the plan. Stories with no estimate sit in a Not estimated strip, and stories with no sprint in this plan are counted as Unscheduled, beside the shelves. Canceled stories are left out. Where a tile sits inside a sprint says nothing about when. The summaries count estimated points and done points, next to the story counts; they aren't effort or a forecast, and capacity isn't compared yet. At Fit or several sprints the shelves show summaries only; pick one or two sprints for the tiles, or use Show the stories beside a workstream's shelves. Tab reaches each shelf once; the arrow keys, Home and End move along it. Spotlight lights up one person's tiles. Show, then On sprint shelves, turns them off. Shelves are display only: a one-story initiative is still in the plan, and List shows every story as a row.

**Where we are.** The sprint we're in is a soft band behind the bars, and its header reads, for example, **Sprint 42 · now**. Today is a red line with a **Today** tab in the time header; in Weeks it sits at today inside the week. Between sprints there's no band, and the next sprint's header says when it starts. Before or after the plan's dates the tab waits at that edge with the date. Capacity's load grid marks the sprint's weeks and this week, and Roadmap marks the quarter we're in. Press **.** to jump to today in either zoom. All of it prints.

On the Timeline, **View** holds the rows (by workstream, person or epic) and, when the plan has Jira work, which sources to show. The button says what's chosen, for example **View: By person · Jira only**, so a filtered review is never a surprise. R still switches rows.

The sources are **All sources**, **Jira only**, **Jira + mine** and **Added here**. **Added here** shows only work that nothing in Jira tracks: tasks and initiatives with no Jira key, and any initiative that holds such work. Jira-linked items and Jira's stories are hidden; milestones, gates and notes stay. It works on the Timeline and the List. Sprint shows Jira's sprint, so it isn't offered there. While it's on, a banner above the chart says so, in Present too, with **Show everything** to turn it off, and the late count says it covers the whole plan. It's your own choice for this plan in this browser, and saved views never record it.

Today names each due decision's decider; its owners may be different people.

**Find** (/ or Ctrl+K) also runs actions by name: type "days", "start editing", "rows by person" or "show only" and press Enter. Each action shows its shortcut, and only actions that apply right now are offered, so what's selected and whether you're editing decide what you see. Press **?** for every shortcut. Find reveals a matching milestone, gate or note through the Timeline's filters, folded rows and hidden layers. **Restore previous view** returns to the view you had before opening the result. Filter controls retain keyboard focus when the view updates, and status messages remain visible on narrow screens.

**J** and **K** move to the next or previous item in the view you're in. On the Timeline and the List they select it, so its details open beside it; on Today, Sprint, Capacity and the Roadmap they move keyboard focus, and **Enter** opens it. Once you're on a row there, the **Up** and **Down** arrows do the same. In People load, **Enter** on a person opens their card. On the Plan pages with a table (Milestones, Gates, Decisions and Risks) they step through its rows, and **Enter** puts the cursor in the row's first field; on Cards they step through the cards (press **M** on one to move it). At either end they stay put and say so. On a Mac, the keyboard help, Find and the toolbar's tooltips show ⌘, ⇧ and ⌥ where other computers show Ctrl, Shift and Alt.

With a task or initiative selected on the Timeline or the List, **O** puts the cursor in its owner picker: type a name and press **Enter** to add them, or **Backspace** to take off the last one. It's a plan edit, so it works while you're editing. On a Jira item it sets the plan's lead, never Jira's assignee. An initiative whose owners come from its tasks says so instead. Find also moves the selection while you're editing: type "week later", "week earlier" or "next sprint". Each move is one Undo (Ctrl+Z, or ⌘Z on a Mac), the status line says where it now starts and what moved with it, and focus stays on the item so J, K and another move carry on. To link a Jira epic to the selected initiative, type "link epic": the cursor lands in its epic box. An epic counts on one initiative, so a key that's already on another one is refused with its name. Work whose dates come from Jira isn't offered a move.

Unsent notes, quick updates and blocker explanations stay with their plan and item during this session when details redraw. They clear after successful submission. They are temporary browser-session drafts; submit the text before closing the page. Saving other plan edits does not submit a composer draft.

Use **Connect assistant**, in the menu under your name, to set up the [private assistant folder](assistant-workflow.md). Once an assistant is connected, the toolbar shows its state, and proposed changes wait there for your review. Common initiative and task updates remain visible; open **Organize this initiative** or **Move this task** for structural changes.

The details panel shows what you need first: warnings, quick status, updates, notes, the title, status, owner,
dates and an initiative's first three tasks (**Show all** lists the rest). The rest folds into **Story** (when none is
written yet), **Schedule**, **Waits for**, **Organize** and **More**, and each fold's line says what's inside, such as
"2 weeks" or "1 item". Warnings never fold. Sightline remembers which folds you open for initiatives and for tasks,
in this browser only.

**Settings → Planning guide** describes project scope, workstream purposes, work breakdown, vocabulary, rules,
and examples for your assistant. Save the guide, then save the shared plan to include it in automatic assistant
context. Unsaved editor drafts stay in this tab's session and are excluded from exports. See the
[planning guide instructions](assistant-workflow.md#give-the-assistant-project-context) for source and compatibility details.

Use the [usability check and 3–5 day role pilot](usability-test.md) with a developer, a delivery lead and an internal
customer before treating the navigation as validated for your team. Read a detached copy of the real plan; use only
invented data for draft, save and handoff exercises. Record the maintainer's recurring effort and any duplicated
entry as well as whether readers find answers. The protocol and pilot have not been run here.

Quick updates can save immediately without **Start editing**. For reading-only evaluation of a real plan, use
**File → Open a copy…**, confirm **This browser only**, and do not edit or submit changes. The browser copy remains
editable, but this route does not link writes to the original file. Use **Open shared plan…** for the separate
synthetic save/handoff exercise. A local save or handoff does not verify cloud delivery; the
[OneDrive two-device check](onedrive.md#two-device-check-before-a-team-rollout) remains separate and not run.

For the meeting workflow, use [team planning](team-planning.md). To work through a large backlog with your external assistant, use [large roadmaps](large-roadmaps.md).
