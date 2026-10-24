# Planning skills that start where your team is

A skill is reusable instructions for an AI assistant. Sightline ships six: turn rough notes into a roadmap,
make a precise edit, review the gaps, summarize the plan and teach the assistant your team's vocabulary.
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

You do not need to learn six command names to have a useful planning conversation. Say what you need:

> Read the current context in my private assistant folder. Organize these notes against existing work,
> leave unknown owners unknown, and show the three decisions that matter most. Prepare only the changes I request.

The assistant needs access to the private folder you connected, or a manual context export. Skills do not
establish file permissions or connect a model. Use one folder per person, device and plan, with one active
Sightline tab writing its outputs. [Connect the folder and complete a session](assistant-workflow.md).

## Choose the job

| Skill | Input | Result |
| --- | --- | --- |
| [sightline-plan-roadmap](../skills/sightline-plan-roadmap/SKILL.md) | Goals, notes and an explicit horizon | Proposed outcomes, placement and timing; unknowns remain unknown |
| [sightline-meeting-to-plan](../skills/sightline-meeting-to-plan/SKILL.md) | Notes you supply | Agreed changes, ideas and open decisions kept distinguishable |
| [sightline-edit-plan](../skills/sightline-edit-plan/SKILL.md) | A targeted change | Small amendments with stable IDs and current-value preconditions |
| [sightline-review-plan](../skills/sightline-review-plan/SKILL.md) | A snapshot and review scope | Read-only findings with evidence and coverage limits |
| [sightline-status](../skills/sightline-status/SKILL.md) | Current context; optional matching results | Read-only update for the audience you name |
| [sightline-planning-guide](../skills/sightline-planning-guide/SKILL.md) | Team scope and workstream distinctions | Copy-ready guidance for Settings → Planning guide |

## What happens to your plan

Editing skills write only **sightline-amendments.json**. They read fresh IDs and allowed operations from
**sightline-assistant-view.json**, and use matching **sightline-assistant-results.json** to understand this browser's
review outcomes. An existing unresolved batch must be preserved or deliberately replaced.
Results must match the plan, revision, Jira timestamp, proposal batch and original operations before an
assistant attributes review outcomes to those proposals. Pending proposals do not block read-only status,
review or Planning guide drafts. Manual exports may contain unsaved browser changes; their revision alone
does not establish that they came from a saved shared file.

Sightline checks each proposed change against the current plan before Apply. A proposal can be ready, conflicted,
invalid or already in the plan. The assistant never overwrites the shared plan, context, results or Jira output.
Unsupported edits become explicit manual steps. In particular, the planning-guide skill returns text for the
editor; it does not fabricate an amendment operation for guide fields.

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

## Make a skill yours

Copy a skill into your assistant's own skills location and edit that copy. Keep the ownership, stable-ID,
precondition and human-review rules. Add team-specific language to the plan's **Planning guide** so UI and AI work
from the same context. The installer refuses to overwrite a different skill file; install updates into a new
folder and compare before carrying your edits forward.

## Check a skill after changing it

Use the [synthetic skill evaluation](skill-evaluation.md) to exercise all six skills with isolated assistant
tasks. It checks proposal files and preserved inputs, with separate review criteria for the assistant's
explanations. Installation tests alone do not establish planning quality. The evaluation tooling is maintained with newer source builds; confirm it exists in your checkout before running it.
