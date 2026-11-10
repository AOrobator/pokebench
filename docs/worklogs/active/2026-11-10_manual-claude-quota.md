# Operator-controlled Claude quota retry

Build and rehearse the opt-in quota hold without launching gameplay. A confirmed
Claude quota rejection holds the current model request, freezes game input and the
single active-play clock, and waits for viewer Resume. Retry the same request once
per fresh Resume. Keep the original provider backoff when the new policy is off.
Preserve existing runs and the served viewer.

The gateway opts in via `--manual-quota-resume` and validates the bound run's
recorded `provider-wait-pause-v1`. The Opus boot preset on this branch enables the
existing in-flight pause feature. A separate gateway journal owns hold/release;
viewer commands keep their existing journal. The viewer displays the hold via
the durable control event, current snapshot, and Activity History. Stop/abort
takes precedence over a concurrent gateway release.

Focused RED reproduced missing quota-command handling and the missing in-flight
quota hold. Focused GREEN covers the agent's timer/control/schema, the viewer's
durable snapshot and extension behavior, and the gateway's existing no-I/O suite.
The real browser rehearsal used an isolated viewer/projector, the production
gateway HTTP handler and the repository fake Claude executable. Two 429s were
returned on one held turn. No retry fired during a wait longer than the entire
four-second active budget. Two Resume clicks yielded two retries with identical
prompts and Claude session IDs. The clock stayed frozen through both and resumed
only after delivery. The freeze mock observed one freeze and one release. There
was no game server, emulator input, real Claude request or shared viewer change.
Evidence is in `runs/proofs/manual-claude-quota/passed.json` and the linked
rehearsal directory. Desktop and phone captures were checked. Full prelanding
gates and review are separate from this isolated build-and-test candidate.
