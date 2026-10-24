<div align="center">

# Sightline

### Big roadmap. Clear next move.

**Turn scattered ideas, Jira work, and team conversations into a plan you can explain.**

[Try the example](docs/getting-started.md) · [Bring your AI](docs/assistant-workflow.md) · [Tackle a large roadmap](docs/large-roadmaps.md)

</div>

Your next year is spread across tickets, meeting notes, and people's heads. Sightline gives it a shared shape:
what matters, how the work connects, and what needs a decision next. Your AI assistant helps you organize it;
you review the changes before they become the plan.

- **Start with the messy version.** Bring goals, questions, and rough notes. Keep ideas distinct from commitments.
- **Connect direction to delivery.** Move between customer outcomes, a timeline, daily attention, and updates for the team.
- **Keep the final say.** Inspect each proposed change, edit it, apply it, or leave it. Undo remains available.

The app is one HTML file. Your plan stays in a separate JSON or YAML file. Core planning needs no server or
account; linked files work best in desktop Chrome or Edge. Jira and AI are optional.

## From brain dump to reviewed plan

An invented team starts with this:

> Bring customer context forward to Q1 2027. Explore offline search too, but keep it as an idea with no
> owner or date. Leave the rest of the roadmap as it is.

<picture>
  <source media="(max-width: 640px) and (prefers-color-scheme: dark)" srcset="docs/images/planning-story-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="docs/images/planning-story-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/planning-story-dark.svg">
  <img src="docs/images/planning-story-light.svg" alt="Prepared example: separate an agreed Q1 timing change from an unscheduled offline-search idea, review two proposals, then see the updated roadmap. Existing IDs and other outcomes stay intact." width="1320">
</picture>

This is a prepared, inspectable example, not a claimed live model response. You can try the two changes
**without an AI account**: [open Northstar, connect the prepared proposals, and review them](docs/getting-started.md#review-two-changes).

## Your first plan in five minutes

**Get a working copy from source.** You need Git, Node.js 18+, Python 3.10+, and Bash for this build step.

```sh
git clone https://github.com/troylar/sightline-planner.git sightline
cd sightline
npm ci
./build.sh
```

Open **dist/sightline.html** in Chrome or Edge. Then choose **File → Open shared plan…** and select
**examples/northstar/plan.json** from the checkout. The HTML is the app; the JSON is the invented team's plan.

**Prefer to ask your coding assistant?** Give it the repository link and say:

> Clone Sightline into a new folder, read its project instructions, install its development dependencies,
> and build the HTML. Tell me where to open it and the Northstar example. Preserve any existing checkout.

There is currently no public npm package or GitHub release download. The source build above is the available
route; it does not require an AI endpoint. See [version and download availability](docs/availability.md).

[Follow the first-session walkthrough](docs/getting-started.md) to review the example, save your own plan,
and reopen it. Once built, everyday planning happens in the browser.

## An assistant that helps you change the plan

Use the file-capable AI coding tool you already work with. You do not need to configure chat inside Sightline.

1. Open your plan and connect a **private assistant folder** through **Connect assistant → Connect your assistant**.
2. Choose **Copy instructions for your assistant** and paste them into your tool with that folder's location.
3. Ask for an analysis or a change. Sightline supplies the current context; the tool writes proposals.
4. Review those proposals in Sightline. **Edit**, **Skip**, or **Apply**, then follow the visible save state.

Start with a request like:

> Read the current context and tell me what it covers. Group these notes against existing work, identify
> possible duplicates, and separate agreed changes from suggestions. Show the three decisions I need to
> make first. Prepare only the changes I request.

Use the same conversation to refine one outcome or work through a larger planning session. Ask about
capacity when the required evidence is available; a target quarter or count of outcomes is not an effort estimate.
The [large-roadmap guide](docs/large-roadmaps.md) shows how to make that distinction.

Sightline does not include a model or subscription. Your external tool controls its model connection.
The optional [local companion](docs/assistant-workflow.md#talk-to-your-company-endpoint) supports in-app chat
as a separate advanced route.

[Connect your assistant and complete a first session](docs/assistant-workflow.md).

## One plan, four conversations

| The question | Where to start | What it helps you do |
| --- | --- | --- |
| What are we trying to ship? | **Product updates → Roadmap** | Shape outcomes across calendar quarters and workstreams. |
| How does the work fit together? | **Delivery → Timeline** | Inspect initiatives, tasks, milestones, and dependencies. |
| What needs attention today? | **Work → Today**, then **Sprint** | Find blockers, upcoming work, and decisions needing an owner. |
| What should we tell everyone else? | **Delivery → Status update**, **Product updates → Release notes** | Explain progress and prepare customer wording. |

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/roadmap-dark.png"><img src="docs/images/roadmap-light.png" alt="Actual Northstar roadmap: customer outcomes across Q4 2026 through Q3 2027, grouped by workstream, with later work still recoverable." width="1440"></picture>

*Actual app, invented work. The view starts the conversation; a target is planning intent, not a delivery guarantee.*

<details>
<summary><b>See the delivery timeline and daily attention views</b></summary>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/timeline-dark.png"><img src="docs/images/timeline-light.png" alt="Actual Northstar delivery timeline with Jira epics and plan work in separate workstreams." width="1440"></picture>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/today-dark.png"><img src="docs/images/today-light.png" alt="Actual Today view, including attention, upcoming work, and Jira freshness." width="1440"></picture>

Jira supplies the issue facts; Sightline supplies the plan around them. Freshness and incomplete coverage
remain visible. [Find the right workspace](docs/workspaces.md).

</details>

## Six skills for your AI assistant

The six self-contained skills give your tool reusable instructions for planning, meeting notes, precise edits,
review, status, and team vocabulary. You can speak normally; skill names are there when you want to choose a workflow.

Use the **skills/** folder in the source checkout. Point your tool at it or copy its individual `sightline-*`
folders to the location where your tool discovers skills. No npm publication is required.

[Choose a planning workflow](docs/skills.md). Builds 1.95.0 and later also include
[skill deployment inside the HTML](docs/bundled-skills.md); check your app's version first.

## Add Jira when you're ready

The optional helper supports **Jira Data Center** through read-only HTTPS. It writes local JSON files that
Sightline reads. The page never contacts Jira, and Jira Cloud support is not claimed.

Jira owns titles, status, assignees, points, hierarchy, and sprint dates. Sightline owns placement, plan items,
annotations, and proposals. Missing from the last sync does not mean deleted; the team's surrounding work stays.

[Connect Jira step by step](docs/jira.md). Credentials stay in the OS credential store; helper code and
configuration belong on a trusted local computer.

## Keep the team moving

Share the app and separate plan through your usual file service. Teammates open that plan from Sightline's
**File** menu. Use **Start editing → Save → Done editing** for deliberate editing sessions; some quick updates
save immediately, so inspect the visible save state.

The [team-planning guide](docs/team-planning.md) gives a meeting rhythm, prompts, and clear handoffs.
For file conflicts and device setup, use [shared files and recovery](docs/onedrive.md).

<details>
<summary><b>What should I know before relying on the files?</b></summary>

- Browser-only work belongs to that browser. Save a shared plan or keep a JSON download before closing.
- Unsubmitted composer drafts are separate from saved plan edits; submit or copy them before closing the tab.
- A local save does not establish cloud delivery. Locks are advisory, and choosing a name is not a login.
- Use OS and file-service permissions for access. Shared files and review receipts do not verify identity.
- The HTML embeds its scripts and YAML library. It requests Google Fonts when available and falls back to
  system fonts, so it is not a zero-network app. Jira sync and AI tools have their own network needs.
- When updating, preserve the current plan and drafts, open the new app separately, then reopen the existing plan.

[Read the recovery guide](docs/onedrive.md) before a team rollout.

</details>

## Go deeper

| Start here | Leave with |
| --- | --- |
| [First session](docs/getting-started.md) | Two reviewed example changes and a plan you can reopen. |
| [Your own AI](docs/assistant-workflow.md) | A connected private folder and a repeatable review loop. |
| [Large roadmaps](docs/large-roadmaps.md) | A way to reconcile messy input, examine capacity, and make tradeoffs. |
| [Team planning](docs/team-planning.md) | A useful meeting rhythm and audience-specific updates. |
| [Workspaces](docs/workspaces.md) | The right view, with filters and hidden work understood. |
| [Version availability](docs/availability.md) | A clear distinction between public source and newer builds. |
| [Contributing](CONTRIBUTING.md) | Build, validation, and release instructions. |
| [What's changed](CHANGELOG.md) | The version history. |

Sightline is [MIT licensed](LICENSE). [Third-party notices](THIRD-PARTY-NOTICES.md).
