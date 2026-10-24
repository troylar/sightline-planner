# Planning skills that start where your team is

A skill is reusable instructions for an AI assistant. Sightline ships six: turn rough notes into a roadmap,
make a precise edit, review the gaps, summarize the plan and teach the assistant your team's vocabulary.
[Back to the tour](../README.md#six-skills-for-your-ai-assistant).

## Install once, use in ordinary language

```sh
npx @troylar/sightline skills --to ./planning-skills
```

Point a file-capable assistant at that folder, or install the individual self-contained skill folders wherever
it discovers skills. Invocation syntax depends on the assistant. You can ask it to read the relevant `SKILL.md`
directly; you don't need a slash-command system.

For example:

> Use sightline-plan-roadmap. My private assistant folder is the folder I've provided. Read its current context,
> then organize these agreed goals across Q1 through Q4 2027. Reuse existing outcomes and leave unknown owners unknown.

The assistant needs access to the connected private folder, or a manual context export. Skills don't establish
file permissions or connect a model. Use one private folder per person, device and plan, with one active Sightline
tab writing its outputs. Follow [the assistant connection guide](assistant-workflow.md).

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

Sightline checks each proposed change against the current plan before Apply. A proposal can be ready, conflicted,
invalid or already in the plan. The assistant never overwrites the shared plan, context, results or Jira output.
Unsupported edits become explicit manual steps. In particular, the planning-guide skill returns text for the
editor; it does not fabricate an amendment operation for guide fields.

## Using the in-app companion instead

The companion uses Sightline's built-in operation protocol and your saved **Planning guide**. It does not discover
or load these skill files automatically. You can use the same style of request in chat; installing skills doesn't
change the companion's capabilities. [Set up in-app conversation](assistant-workflow.md#talk-to-your-company-endpoint).

## Make a skill yours

Copy a skill into your assistant's own skills location and edit that copy. Keep the ownership, stable-ID,
precondition and human-review rules. Add team-specific language to the plan's **Planning guide** so UI and AI work
from the same context. The installer refuses to overwrite a different skill file; install updates into a new
folder and compare before carrying your edits forward.
