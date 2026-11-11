POKEBENCH · GUIDANCE SWITCH · DEFAULT OFF

# Tell a restored run that it resumed.

> Markdown twin of [save-state-task-truth-v1.html](../save-state-task-truth-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Verified save state input is not a fresh boot. This switch changes only the first user task for that start kind, so the model receives a truthful description of the state it is about to inspect.

## The decision

**Run start**

`start.kind` is either `boot` or `save_state`.

→

**Task text**

Boot stays “The game has just booted.” A save says “The game has resumed from a recorded checkpoint.” The declared native target follows either prefix unchanged.

## OFF versus ON

**OFF · previous behavior**

Every run gets boot wording, including a run whose verified state was loaded from disk.

→

**ON · truthful continuation**

Only `save_state` changes. Fresh boot text is byte-identical.

## Boundaries

The switch does not load the state, change the game, grant progress, select a goal, or alter grading. The existing preset SHA-1 check proves which state file was loaded. Milestones already in that state remain `present_at_start` and earn no new-run credit.

Status: implementation branch. Unit and production-call tests required. No model runs, experiment approval, landing, or live proof in this lane.
