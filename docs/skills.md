# Planning skills that start where your team is

A skill is reusable instructions for an AI assistant. Sightline has one: **sightline-plan**. Paste notes,
emails, bug reports, ideas, a leader's priorities or a question, and it works out where each piece belongs,
answers what was asked, and prepares changes for you to review. Since 1.184.0 it also does the jobs of the seven
specialist skills earlier versions shipped, so every assistant on the team follows the same instructions.
[Back to the tour](../README.md#documentation).

## Start with your normal conversation

Use the source checkout's **skills/** folder. Point a file-capable assistant at it or copy the individual
`sightline-*` folders wherever it discovers skills. From a trusted source checkout, this local command copies
only the collection and refuses to overwrite different files:

```sh
node bin/sightline.js skills --to ../planning-skills
```

This works without a public npm package. Builds 1.95.0 and later also offer
[skill deployment from the HTML](bundled-skills.md); check [availability](availability.md) first.

You do not need to learn any skill names to have a useful planning conversation. Say what you need:

> Read the current context in my private assistant folder. Organize these notes against existing work,
> leave unknown owners unknown, and show the three decisions that matter most. Prepare only the changes I request.

The assistant needs access to the private folder you connected, or a manual context export. Skills do not
establish file permissions or connect a model. Use one folder per person, device and plan, with one active
Sightline tab writing its outputs. [Connect the folder and complete a session](assistant-workflow.md).

## What it does

| Ask for | Result |
| --- | --- |
| Anything you heard: notes, emails, bug reports, ideas, priorities | Each piece sorted: a new request, one more report on an existing one, a decision, a risk, or a question to settle. Evidence (who, channel, impact) and links to related work, ready for review |
| A question: what should I work on, can we take this on, why is X above Y | An answer from the plan's work order, priorities, forecast and what matters now, with what the data doesn't cover |
| A status update or a review | Read-only: a summary for the audience you name, or up to three material findings with evidence |
| A change to the plan, roadmap goals, a work order or what matters now | Small amendments with stable IDs and current values, each waiting for your review |
| Prep our grooming | A short agenda that starts with decisions, at most five topics |
| A tracker check or a Jira draft | Whether top work needs an issue, and a draft in the reply. Sightline never creates issues |
| Sort Jira work | Placements with reasons, and a list of what it couldn't place |
| Planning guide text | Copy-ready guidance for Settings, Planning guide |

### Upgrading from the seven skills

Earlier versions installed **sightline-edit-plan**, **sightline-meeting-to-plan**, **sightline-plan-roadmap**,
**sightline-planning-guide**, **sightline-review-plan**, **sightline-status** and **sightline-sort-jira**. Install
1.184.0 into a new folder, then delete those seven folders from wherever your assistant finds skills, so it doesn't
follow old instructions alongside the new one.

## What happens to your plan

The skill writes only **sightline-amendments.json**. They read fresh IDs and allowed operations from
**sightline-assistant-view.json**, and use matching **sightline-assistant-results.json** to understand this browser's
review outcomes. An existing unresolved batch must be preserved or deliberately replaced.
Results must match the plan, revision, Jira timestamp, proposal batch and original operations before an
assistant attributes review outcomes to those proposals. Pending proposals do not block read-only status,
review or Planning guide drafts. Manual exports may contain unsaved browser changes; their revision alone
does not establish that they came from a saved shared file.

Sightline checks each proposed change against the current plan before Apply. A proposal can be ready, conflicted,
invalid or already in the plan. The assistant never overwrites the shared plan, context, results or Jira output.
Unsupported edits become explicit manual steps. For the Planning guide it returns text for the editor unless you ask it to propose the guide's own actions.

## Work through a large roadmap

On builds 1.96.0 and later, ask your external coding tool to read the fresh context and its `coverage`, then use the supplied `planning`
data to organize a brain dump, reconcile it with stable existing IDs, review dependencies and decisions, or
explain the calculated capacity constraints. No in-app endpoint connection is required. For example:

> Read my assistant context and tell me what it covers. Group these notes against existing outcomes, keep
> suggestions separate from agreed changes, and identify the capacity constraints and missing estimates for
> the next known sprints. Propose a small first set of changes for review; leave unknown owners unknown.

Older exports support a narrower analysis; do not claim they contain this data. See [what the planning export contains](assistant-workflow.md#planning-data-for-your-external-assistant) and the [large-roadmap workflow](large-roadmaps.md).

## Using the in-app companion instead

The companion uses Sightline's built-in operation protocol and your saved **Planning guide**. It does not discover
or load these skill files automatically. You can use the same style of request in chat; installing skills doesn't
change the companion's capabilities. [Set up in-app conversation](assistant-workflow.md#talk-to-your-company-endpoint).

## Make the skill yours

Copy the skill into your assistant's own skills location and edit that copy. Keep the ownership, stable-ID,
precondition and human-review rules. Add team-specific language to the plan's **Planning guide** so UI and AI work
from the same context. The installer refuses to overwrite a different skill file; install updates into a new
folder and compare before carrying your edits forward.

## Check a skill after changing it

Use the [synthetic skill evaluation](skill-evaluation.md) to exercise the skills with isolated assistant
tasks. It checks proposal files and preserved inputs, with separate review criteria for the assistant's
explanations. Installation tests alone do not establish planning quality. The evaluation tooling is maintained with newer source builds; confirm it exists in your checkout before running it.
