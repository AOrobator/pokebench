# worklogs

This folder holds worklogs: the durable, milestone-by-milestone record of each feature or piece of work in PokeBench, from the problem it set out to solve to the evidence that it landed.

PokeBench is built mostly by coding agents across many sessions. A worklog is what survives between them: an agent reads it first and continues from where the last one stopped.

## What a worklog contains

Each worklog follows the same sections: Problem Statement, Skills Loaded, Architecture, Invariants (`INV-N`, each with its rationale and test strategy), Security Review, Milestones, Closing the Loop, Session Log, Surprises, Multi-Model Review Log, Boy Scout Log and Archive Milestone.

Each milestone is a checklist. Failing tests are committed first (RED), then the implementation (GREEN), and the worklog records each commit message and SHA, test counts and gate status as it goes. It then records the review rounds and their verdicts, deferrals with their reasons, and the landing and post-merge evidence.

## Layout and naming

- `active/`: worklogs not yet archived. A work-in-progress worklog lives here while it is being written and executed.
- this folder: archived worklogs, moved here from `active/` once the operator approves archiving.

Files are named `<YYYY-MM-DD>_<slug>.md`: the date the worklog was created and a short name for it, for example [2026-10-11_pokebench-foundation.md](2026-10-11_pokebench-foundation.md). Being in `active/` does not mean work is still under way; many there have landed and await archiving.

Worklogs record what was true at the time. Older ones describe tools, workflows and review lanes the project has since retired.

## The process

Two project skills define how worklogs are written and carried out:

- [feature-worklog](../../.claude/skills/feature-worklog/SKILL.md): writing a worklog. It sets the layout, the required sections, the shape of a milestone, and how to size milestones with a separate stage each for source readiness, landing and activation. No implementation starts until the operator has approved the worklog.
- [execute-worklog](../../.claude/skills/execute-worklog/SKILL.md): carrying it out milestone by milestone: RED, GREEN, smoke evidence, then review by independent cloud models until each returns LGTM. It sets which gates run for which changes, how review findings are triaged, how evidence is reused when `main` moves, and when an agent may fast-forward its own branch into local `main`. It stops at every operator checkpoint.
