# Get your arms around a large roadmap

If you are new to Sightline, read the [worked planning session](roadmap-planning-example.md) first. It shows how
a set of overlapping requests becomes a source reconciliation, a capacity question, and three decisions.

Start with the mess you actually have: goals, commitments, meeting notes, questions, Jira work, and more ideas
than the team can tackle at once. Use your external AI tool to turn that into a sequence of decisions, with
reviewable changes attached. [Connect your assistant first](assistant-workflow.md).

You do not need a perfect backlog before starting. You do need to know which evidence the assistant can see.

## Check the planning evidence first

Ask:

> Read the current context. Tell me which plan and snapshot it represents, what it includes, what is omitted,
> and which parts of this planning question the evidence cannot answer.

Public-source 1.94.0 supports roadmap editing context. **Richer automatic capacity, dependency, risk and decision
exports require 1.96.0 or later**. Check for `planning.version: 1` and read `coverage`; do not assume a newer
export because the guide describes one. [Build availability](availability.md).

On an older build, provide any additional evidence deliberately, as separate read-only input to your tool.
Do not tell it to search personal folders or overwrite your shared plan. Without the relevant evidence,
organization is possible but a capacity-backed delivery forecast is not established.

## 1. Empty your head without committing the team

Give the tool a notes file or paste a substantial section into its conversation. Keep a copy of the source.

> Separate these notes into agreed changes, ideas, constraints, and open questions. Match them to existing
> work by stable ID where possible. Flag possible duplicates; do not merge them just because their names are
> similar. Keep every source item accounted for. Ask only the questions needed to avoid a consequential guess.

For a long source, work in sections. At the end ask for a reconciliation: incorporated, matched to existing work,
left as an idea, or awaiting a decision. A summary alone does not establish that nothing was dropped.

## 2. Reorganize around outcomes

> Suggest a clearer arrangement of this work. Explain the user or business result for each outcome, what
> belongs together, and what should stay separate. Reuse existing IDs. Show the proposed moves before writing them.

Workstream membership is context, not evidence that everyone in a group has interchangeable skills. Keep work
outside the selected quarters visible in the discussion. A move is not a reason to recreate the item and lose its links.

Start with one representative area, review it, then continue. Changes that depend on one another belong in one
atomic proposal; unrelated changes should be independently reviewable. The current protocol limits a change to
25 operations, a batch to 100 changes, and one Apply action to 25 changes. Do not hide a partial reorganization
behind a claim that the whole roadmap was updated.

## 3. Ask what actually constrains delivery

For a 1.96.0+ planning export, ask:

> Use the supplied capacity calculations and issue facts. Show which people or periods are constrained,
> where load or capacity is unknown, and which dependencies or decisions could stop the work. Separate
> calculated facts from assumptions. Give me the next three decisions, with the evidence behind them.

The export's capacity rows compare known scheduled Jira points with configured availability. They do not
include all remaining effort, plan-only work, support reserves, meetings, or unestimated demand. Do not convert
initiative weeks or task duration into per-person effort without an explicit assumption. Unknown is not zero.
Do not add overlapping sprint capacities as if they were separate time, or compare different teams' points
without a shared estimation basis.

A useful answer might say:

> This person has work scheduled against zero configured allocation. These issues are unestimated. The
> available sprints do not cover the roadmap's target year. We need those gaps resolved before calling the plan feasible.

That is an illustrative answer, not a customer result or a measured promise about your team. The
[context reference](assistant-workflow.md#planning-data-for-your-external-assistant) explains the calculations.

## 4. Compare choices before changing the plan

> Compare protecting the launch date, protecting the team's workload, and reducing scope. For each choice,
> list what would move or be deferred, the assumptions, and the evidence still missing. Do not apply anything.

Keep hypothetical scenarios in the conversation or a separate working document. Sightline does not currently
provide an automatic scenario simulator or a saved scenario workspace. Recalculate when inputs change; a
persuasive explanation is not validation of the numbers.

Choose one option, then ask for the supported changes as a proposal batch. Dependencies, people, capacity
settings, risks and decisions may need manual UI updates; a richer read-only export does not create new edit operations.

## 5. Close the loop

Review the before/after values, apply the selected changes, follow the visible save state, and let the assistant
read fresh context and matching results. Ask what remains unresolved. Receipts describe this browser's review;
they are not a shared audit log or proof of cloud delivery.

For a recurring meeting rhythm, use [team planning](team-planning.md). For a quick first win, use the
[prepared Northstar session](getting-started.md).
