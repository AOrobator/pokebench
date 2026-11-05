# Live card always shows

Requested by the operator 2026-11-04: "if there is a live run, it should always show as a card."

Single milestone. Viewer-only, no harness behavior, so no feature switch. Card appearance and identity are unchanged: the same live card is added beside the replay card.

## Incident context

The feed (current-state projector) was still at 23bd43908 and stopped on run 5f0f at seq 693: `invalid state event at /topology/connections/0: unexpected property water_edges`. `just current-main` restarted it on 1cfe0b6b7. The fixed-run skill now names that step.

## M1

- [x] RED: `card-row.test.ts`, module missing
- [x] GREEN: `cardRow` used by both replay paths in `App.cardInputs`
- [x] Gates: `just lint`, `just build`, `just test`, `just verify-vendor` passed at c0afe1feb under the coordinator's CPU window
- [x] Review of c0afe1feb: Claude CLI LGTM, Codex GPT LGTM, fallback subagent LGTM; Grok unavailable (Cursor usage limit until 11/17)
- [ ] Land, `just viewer-main`, headless proof on an older run

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display-only change that records nothing and changes no run. PB9 PASS: behaviour asked for directly by the operator. PB10 PASS: no gate weakened. PB13 PENDING until the post-merge browser proof.
