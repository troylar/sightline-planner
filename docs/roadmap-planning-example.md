# A planning session when everything seems to be a priority

Imagine you coordinate Integrations, Search, and Platform. A launch is approaching, new requests keep arriving,
and the same specialist is needed in several places. The Jira backlog tells you about individual issues. Your
planning problem also includes commitments, rough ideas, dependencies, and decisions spread across conversations.

This is an **illustrative planning exercise**, not a captured model response, customer result, or the plan shown
in the Northstar screenshots. Its sample numbers and names are invented. Use it to understand the workflow;
[open the smaller prepared example](getting-started.md) to try the actual review controls.

## Start with what people actually said

Keep the original notes and give each source a reference. They do not need to be a clean backlog.

| Source | Rough input |
| --- | --- |
| N01 | We agreed that customer-context lookup belongs in the launch. |
| N02 | Sales also wants a customer history panel. Is that the same thing? |
| N03 | Search relevance has to improve, but nobody agreed what “better” means. |
| N04 | Search needs Platform's index migration before its new retrieval work can finish. |
| N05 | The migration has no confirmed completion date. |
| N06 | Offline search came up as an idea. Nobody committed to building it. |
| N07 | Search and Integrations both asked for the same Platform specialist in the launch period. |
| N08 | Platform's next sprint has 6 points of configured capacity and 8 points already scheduled, on its own estimation scale. |
| N09 | Five requested Platform issues have no estimates. Support demand is not represented in those capacity numbers. |
| N10 | Leadership wants a launch update explaining what is committed, what is uncertain, and what needs a decision. |

Connect your plan's [private assistant folder](assistant-workflow.md), then give your external tool these notes
and the relevant planning evidence. Ask it to read the current context before interpreting them. On public
1.94.0, the automatic context is narrower than the 1.96.0 planning export; additional evidence must be supplied
deliberately. [Check availability](availability.md).

> Reconcile every source against the current plan. Reuse existing IDs where there is a match. Separate agreed
> scope, possible duplicates, ideas, constraints, and decisions. Do not invent owners, estimates, or dates.
> First give me a decision brief, not a rewritten plan.

## Turn the input into a few decisions without losing the details

A useful reconciliation could look like this. These are suggested interpretations of the invented notes,
not automatic actions:

| Source | Interpretation | What happens next |
| --- | --- | --- |
| N01 | Agreed launch scope | Match the customer-context outcome in the plan; retain its ID. |
| N02 | Possible overlap with N01 | Ask whether the history panel is part of lookup or additional scope; keep both sources until resolved. |
| N03 | Outcome needs definition | Decide what improvement will count before treating it as a clear commitment. |
| N04 | Dependency | Verify the migration link in the plan and which work it blocks. |
| N05 | Missing delivery input | Ask for the migration forecast and its assumptions; do not make up a date. |
| N06 | Uncommitted idea | Retain offline search without assigning an owner or target. |
| N07 | Shared resource constraint | Ask the team to resolve the competing demand and confirm actual allocation. |
| N08 | Known scheduled load exceeds configured capacity | Review the 8 scheduled points against 6 configured points for that sprint. |
| N09 | Additional demand is unknown | Obtain estimates and account for support before calling the load complete. |
| N10 | Communication request | Draft an update after separating confirmed scope, uncertainty, and decisions. |

Every source remains accounted for. Matching a request to an outcome does not mean its scope was accepted;
a similar title does not prove a duplicate.

## Make the capacity discussion specific

Within Platform's one sprint and estimation scale, the supplied numbers show **2 more scheduled points than
configured capacity**. They do not tell you the full shortfall: five issues are unestimated and support is absent.
They also do not establish that the launch is feasible or predict a finish date.

Before relying on that comparison, confirm that the input is current, the sprint periods match, the specialist's
allocation is correct, and the scheduled issues are in scope. Do not combine overlapping sprint capacities or
add points from different teams as if they were interchangeable.

The next decisions are concrete:

1. **Resolve launch scope.** Is N02 part of N01? What would count as success for N03? Until answered, the launch demand is unclear.
2. **Resolve the shared bottleneck.** Which work gets the specialist's time, and what does that mean for N04's migration dependency?
3. **Choose a tradeoff using complete enough evidence.** Clarify N09, then discuss reducing scope, sequencing work later, or changing the target. Record what remains uncertain.

Ask the assistant to explain alternatives in the conversation. Sightline does not provide an automatic scenario
simulator. A confident answer without the missing inputs is still an assumption.

## Turn the chosen direction into reviewed changes

Once the team decides, ask for the supported edits as proposals. For example, retain N06 as an unscheduled idea
and refine an existing outcome's wording after its scope is agreed. Review the actual before/after values in
Sightline. Edit, skip, or apply each proposal, then follow the visible save state.

Dependency, allocation, risk, or decision changes may need normal UI edits. The assistant's operation guide defines
what it can propose; a read-only export does not grant it additional editing powers. Writing proposals never
authorizes it to overwrite the shared plan or Jira files.

Finally, have the assistant reread fresh context and matching results and draft the update requested in N10:
confirmed scope, changes actually applied, unresolved questions, and the next decision. Check it before sharing.
The next meeting starts from that record rather than rebuilding the conversation.

[Work through your own large roadmap](large-roadmaps.md) · [Connect your assistant](assistant-workflow.md) ·
[Try proposal review with Northstar](getting-started.md#review-two-changes) · [Back to Sightline](../README.md)
