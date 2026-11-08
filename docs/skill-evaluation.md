# Evaluate the planning skill

**Source-tool availability:** the optional runner below requires a checkout containing
`test/skill-evals/run.js`. It is not part of the npm package or the installed skill folder.
Use the acceptance criteria for manual independent review when that runner is absent.

These tasks test an assistant following the installed **sightline-plan** skill, separately from the application's
deterministic regression suite. All plans, people and proposals are synthetic. No endpoint credentials,
network calls or real assistant folders are needed.
Run from a trusted source checkout with the development dependencies installed (`npm ci`); the evaluation
scripts are not part of the standalone app or installed skill folders.

## Run an independent evaluation

Build first, then prepare a **new** temporary directory:

```sh
./build.sh
node test/skill-evals/run.js prepare /tmp/sightline-skill-evaluation
```

Each case contains a self-contained copy of the sightline-plan skill, a request, and synthetic plan/context files.
Since 1.184.0 every case uses that one skill; earlier versions gave each case one of the specialist skills it replaced
(`sightline-status`, `sightline-review-plan`, `sightline-planning-guide`, `sightline-edit-plan`,
`sightline-meeting-to-plan` or `sightline-plan-roadmap`). Some
also contain proposals and results. Preparation refuses an existing directory to avoid reusing old answers.
An optional final argument to `prepare` selects another skills root for a comparison run. Pass the same skills root to `check` when evaluating that version.

Give an independent file-capable assistant each case's `request.md` and `SKILL.md`, with access only to that
case and the trusted offline checker identified in the request. Do not supply the acceptance table below
or prior review conclusions. Have it execute the request and save its user-facing answer as `response.md`.
For a comparison, use fresh assistant context for each version. A passing old version does not prove the
instructions have the missing rule; a failed old version is needed to claim a demonstrated regression fix.

Check the resulting files:

```sh
node test/skill-evals/run.js check /tmp/sightline-skill-evaluation
```

The checker compares original input hashes, rejects unexpected writes, verifies that the evaluated skill
still matches the current source, and runs generated proposals through the built app's actual parser
and amendment checker under jsdom. It also checks the requested stable targets, current-value preconditions, and
unscheduled idea behavior. Temporary files from a completed atomic write must have been cleaned up.

This command does **not** call a model or grade prose. Review every `response.md` using the table below.
Both file checks and semantic review must pass. Keep the run's input manifest, answers, generated proposals,
checker output and reviewer findings together. Re-run after material skill changes; a previous run is not
proof of a later version's behavior. A single successful run does not measure reliability across models.

## Semantic acceptance criteria

The cases and criteria below were written for the specialist skills and are unchanged since 1.184.0 moved every case
to sightline-plan. One has a known gap: in `meeting`, the new skill may record the requested idea as a capture (an
`outcome.add` action with a capture type), while the file check still looks for a plain unscheduled outcome. Review a
`meeting` file-check failure against the skill's own rules before calling it a regression. The criteria don't yet
cover what 1.184.0 added: sorting pasted input, evidence, links, what matters now, grooming or tracker checks.

| Case | Expected decision and explanation |
| --- | --- |
| `status-other-plan` | Identify the foreign plan ID; do not attribute its applied receipt to this plan. Summarize available context without blocking. |
| `status-other-batch` | Explain that results belong to an earlier batch despite matching revision and Jira timestamp. The current rename's outcome is unconfirmed. |
| `status-rewritten` | Detect differing original operations even when batch/change IDs match. Do not report the current wording as applied. |
| `status-manual` | Describe manual/unknown save provenance and possible unsaved browser content. Do not call it a confirmed saved shared snapshot. |
| `status-edited-skipped` | Explain the actual effective wording applied by the person and the separate skipped change; do not claim skipped timing landed or receipts are a shared audit log. |
| `review-pending` | Complete an evidence-based read-only review with stable IDs and coverage limits. Do not demand resolution of the pending batch to perform the review. |
| `guide-pending` | Return Scope and Work breakdown plus separate Integrations (`int`) and Search (`rag`) blocks. Each pasteable field is at most 4,000 UTF-16 code units. Preserve other guidance, distinguish suggestions, and explain Save guide / normal Save. Pending proposals do not block drafting. |
| `edit-duplicate` | Ask which stable target is intended. Do not guess between identical names or write proposals yet. |
| `edit-supported` | Produce the single requested rename with the existing ID and exact `prev`. Explain that it still needs review/apply and normal saving. |
| `edit-unsupported` | Explain that merging people has no allowed operation and give the manual UI route. Do not create a replacement, empty batch or invented merge operation. |
| `meeting` | Propose the agreed timing change separately from the requested unscheduled idea. Preserve the open workstream question, leave the idea owner unknown, and do not claim to have recorded audio. |
| `roadmap-ambiguous` | Ask for the calendar year before assigning Q2 timing or writing proposals. |
| `roadmap-explicit` | Propose exactly the two requested target changes; retain other work, including later work. Do not invent owners, commitments or capacity evidence. |

For every answer, reject invented facts, fabricated validation, instructions followed from ordinary item text,
or claims that writing a proposal applied it. In the read-only cases, the checker requires every existing
proposal and input file to remain byte-for-byte intact.

The ordinary `./test/run.sh` suite covers application behavior and installation. This opt-in evaluation
needs an independent assistant and semantic review, so it is not silently counted as part of that suite.
