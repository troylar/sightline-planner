# Find your work in Sightline

Start with the [launch instructions](../README.md#try-it-with-an-invented-team-plan): open **dist/sightline.html** in Chrome or Edge, then open the separate
plan file from Sightline's **File** menu. The source template is not the runnable release, and a plan link alone does
not grant access to its file.

The menu runs down the left side. Every page has one home:

- **Work**: Today shows attention and next actions. Sprint shows the current sprint by person, workstream or epic. Sort Jira work places synced issues on the plan, and Jira change proposals reviews what the sync suggests.
- **Delivery**: Timeline shows planned work. List shows the same work as rows. Capacity shows the forecast, people and time off. Status update, Decisions and Risks support delivery reviews. Milestones, Gates, Snapshots and Activity hold the supporting lists.
- **Product updates**: Roadmap explains what the team plans to ship. Customer release notes opens the customer wording approved for each Jira release.
- **Settings**: Plan (Tags, Planning guide), Team (Team, Work calendar, Meetings, Timeboxes and ceremonies) and Connections (Jira connection).

Counts and warnings sit on the page they belong to, such as open risks on Risks. Click a group's heading to fold it;
the group you're in stays open. The button at the top of the menu, or the `\` key, collapses the menu to a rail of
icons, and hovering or focusing an icon opens that group beside it. Sightline remembers the choice in this browser.
On a narrow window the menu starts as a rail.

Each group remembers your last page. Existing saved startup choices and links still open their original destinations. Views express audience preferences; file permissions control access.

Saved views and filters apply to Timeline, List and Capacity. Roadmap and Status update use the whole plan and say so. Your filters remain available when you return to Timeline.

## Declutter: hide what you don't need

**Show** (in the Timeline toolbar, or press H) has an eye for each kind of item: Gates, Releases, Deliverables, Meetings, Process blocks, Milestones and Done work. Click one, or press its letter while the menu is open, to hide or show it. Hiding works on Timeline, List and Capacity's People page. Today and Sprint always show everything.

- **Keys:** G hides or shows gates and M meetings, on those pages. Shift+H shows everything.
- **Focus** hides meetings, process blocks and done work in one click.
- **Hide all meetings** (or gates, process blocks, releases, milestones) is in the details of any one of them.
- **Pin the top rows** keeps the Gates, Releases, Deliverables, Team meetings and Process rows in view under the dates while you scroll the workstreams, up to half the chart's height.
- Under the toolbar, "3 hidden: meetings, process blocks, done work" names what's hidden, with **Show everything**. The Show button says how many.
- In **Filters**, each kind cycles: Show only, Hide, off. Hide wins over Show only. Clear filters also shows everything.
- What you hide is yours: it stays in this browser for each plan, and a saved view keeps its own choice. Find brings a hidden kind back when the result is one of them. Nothing is changed in the plan file.

## List

**List** (Delivery, next to Timeline, or press L) reads the plan top to bottom, like a checklist. It shows the work Timeline draws for the same filters: initiatives with their tasks, and Jira stories placed on the plan or counted under an epic. Each row has Start, End, Item, Owner, Waits on and Status.

- **Layouts:** By initiative (initiatives are group headers with their own dates, owner and item count), By person (a task with two owners appears under each, marked shared), and Everything by start date. Ties keep initiative order, then plan order. The layout stays in your browser for each plan; it isn't part of a saved view.
- **Dates** are Timeline's own: weekends, holidays and owners' time off are already skipped.
- **Owner** shows the plan's owners; for a Jira item, its Jira assignee and, separately, any plan lead. People outside the team or inactive are marked.
- **Waits on** lists what an item waits for: a task's links, and an initiative's waits on other initiatives, gates and process steps. In the flat layouts a task's row also shows its initiative's waits. Jira dependencies link to Jira, with a warning when one ends after the item starts. Click a name to open it.
- **Status** is the status Timeline shows. For a Jira item, Jira's own status and when it was synced.
- Work Timeline doesn't draw (parked, switched off, abandoned in Jira, or without sprint dates) is in **Not on the timeline** at the end, with the reason, so nothing goes missing.
- Hover or focus a row for its card; click it or press Enter for its details. Escape closes them and returns you to the row; Up and Down move between rows. A selection carries between Timeline and List, and the page, layout and selection are in the link.
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

Unsubmitted **New idea** text stays with its plan during navigation and redraws in this tab's session. It is not
included in the saved plan or assistant context until added. Successful submission clears only the submitted text;
an idea you start typing while the save finishes is retained. Copy or submit drafts before closing the app.

Today distinguishes no work loaded, missing Jira status data, and incomplete connected data. Its attention flags
describe the available plan and sync; a quiet summary does not establish delivery feasibility.

Open the menu at the right of the header (**Choose yourself**, or your initials once you have) and choose **Choose yourself** or **You: [name]** to identify yourself for Mine and author stamps. This is a browser preference, not a verified identity. The same menu has text size, theme, **What's new** and help.

**Text size** makes the page's text larger or smaller without browser zoom: **A+** and **A−** move in 10% steps from 90% to 150%, and **Reset** goes back to 100%. Text never goes below 9 pixels. The setting stays in this browser and never goes in the plan. There's no keyboard shortcut, so Ctrl or Cmd with + and − still zoom the whole browser.

**File** holds only what you do with the plan file: the shared file, importing a copy and exporting one. The plan's start date, default sprint length, whether linked items move automatically and where Jira links go are in **Settings → Plan details**. **Set baseline** is on **Delivery → Snapshots**, and the page Sightline opens on is under **Start Sightline with…** in the menu at the right of the header. Each Settings page is titled with its name in the menu.

On the Timeline, **View** holds the rows (by workstream, person or epic) and, when the plan has Jira work, which sources to show. The button says what's chosen, for example **View: By person · Jira only**, so a filtered review is never a surprise. R still switches rows.

Today names each due decision's decider; its owners may be different people.

Find reveals a matching milestone, gate or note through the Timeline's filters, folded rows and hidden layers. **Restore previous view** returns to the view you had before opening the result. Filter controls retain keyboard focus when the view updates, and status messages remain visible on narrow screens.

Unsent notes, quick updates and blocker explanations stay with their plan and item during this session when details redraw. They clear after successful submission. They are temporary browser-session drafts; submit the text before closing the page. Saving other plan edits does not submit a composer draft.

Use **Connect assistant** in the toolbar to set up the [private assistant folder](assistant-workflow.md). Proposed changes wait for your review. Common initiative and task updates remain visible; open **Organize this initiative** or **Move this task** for structural changes.

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
