---
name: pokebench-run-coordination
description: Coordinate shared PokeBench compute with Claude, Codex, and current run owners before starting or resuming gameplay runs, decision probes, inference batches, or workers that wait to claim an endpoint. Use even when a GPU looks idle; not for offline analysis or fake-data rehearsals.
---

# Coordinate before runs

Operator decision, 2026-10-22: coordinate with everyone affected before starting runs. A free slot or released lease proves availability at one instant, not agreement with another owner's upcoming schedule.

## Before starting or scheduling inference

1. Read the user's current instructions and repository `CLAUDE.md`. Preserve the scope and wording of temporary commands. “Don't touch the GPUs” is a temporary stop instruction unless the user says otherwise; do not rewrite it as a permanent ban. A later request to finish work must be interpreted in context, not silently treated as permission to bypass coordination.
2. Identify the affected endpoints, active runs, scheduler reservations, and owner sessions from local process/lease/runner records. Include owners whose next run could be delayed, not just whoever holds a live lease. Do not query or change hardware against an active instruction not to touch it.
3. Tell Claude through the repository's `just tell-claude` command using its talk-to-Claude skill. Notify the relevant Codex/coordinator sessions through the approved repo messaging workflow. Ask the relay to reach every affected run/scheduler/compute owner if ownership is distributed. Messages are authorized as part of this explicitly invoked coordination workflow; remain within this operational scope.
4. Give a concrete reservation proposal: study/run ID, source/model/build, endpoints, fixed N, estimated and maximum compute time, desired start window, lease behavior, and which existing runs must remain untouched. State separately whether the user authorized the launch and whether other owners have agreed to the compute window.
5. Obtain explicit clearance for that window from affected owners or their designated coordinator. A sent message, mailbox receipt, silence, an idle slot, or an expiring lease is not clearance. If nobody is listening, report the message as queued and keep the launch pending. Continue offline preparation. Do not start a detached worker that can later seize an endpoint before coordination finishes.
6. Once authorization and coordination are established, recheck current reservations and acquire the normal exclusive lease immediately before inference. If ownership, endpoint, window or resource scope changed, coordinate again. Never stop another run, remove its lease, reconfigure its server, or reserve an extra endpoint to make the plan fit.

Use the existing decision-probes or fixed-run-launch skill for frozen inputs, fake rehearsal, registration, sampling and proof. This skill does not approve experiments or replace those requirements.

## During and after the run

- Notify affected owners when sampling actually starts, finishes, fails or is stopped; include the endpoint, counts, and lease disposition. Do not promise a reservation has ended while an owned worker can still send requests.
- On a user stop, stop only the owned worker and release only its verified lease. Preserve partial evidence and the fixed-N analysis boundary. Tell collaborators the user's exact command and the action taken.
- Distinguish a temporary pause, a permanent restriction, a pending coordination request and a cancelled experiment. Correct a misstatement promptly in both user conversation and collaborator messages.
- An interrupted frozen batch is incomplete. Do not silently resume or replace its missing draws; freeze the continuation/replacement plan and coordinate its compute window before launching it.

## Minimum receipt

Record user authorization, recipients, exact reservation proposal, acknowledgments, endpoint/owner snapshot, planned and actual counts, and release/stop status under the study's ignored `runs/` artifacts. Report messages as **queued** versus **delivered** versus **acknowledged** according to evidence. No acknowledgment means coordination remains pending.
