# Wally battle readout and action ownership

## Problem Statement
The operator authorized the preceding Wally recommendations, explicitly requesting a worklog first and then execution. Valid tutorial empty move slots retain PP, but the battle decoder rejects them even with tutorial-party-owner-v1 ON. Observation loss coexists with severe runtime starvation; a decoder fix alone cannot establish pace recovery.

## Skills Loaded
feature-worklog, execute-worklog, close-the-loop, pokebench-game-state, feature-switch, agent-observability, feature-explainer. Experiment-queue/design will apply if a new behavioral switch is required. Repository overrides global coverage to 90%.

## Architecture
Use existing native read-only state owners and existing tutorial-party-owner-v1 for correctness coverage. Trace game_state and ui_state consumers; no second decoder or RAM writes. Distinct ownership/refusal feedback must be separately switchable if it introduces behavior. Inspect concurrent work before duplicating semantic-refusal repairs. Preserve raw historical logs.

## Invariants
- INV-1: OFF reproduces the prior decoder result exactly; test through production state/UI factories.
- INV-2: Only source-qualified tutorial empty slots tolerate retained PP; ordinary invalid data remains rejected. Test both sides and adversarial tutorial states.
- INV-3: No invented selectable moves or player-owned tutorial actions. Ground ownership in native flags/controllers and source; retain true raw PP as appropriate.
- INV-4: No gameplay intervention, measured-run launch/restart, vendor edits, source-reference edits, ROM copying, or hidden runtime claim.
- INV-5: Diagnostic feedback is bounded, recorded and delivered through existing owners; no new timeline marks.

## Security Review
Read local archives through production hash/layout validation and matching external ROM. No external delivery, credentials, new listeners, arbitrary file serving, or game-memory writes. Source paths and subprocess arguments remain explicit.

## Milestones
### M1 — Source and RED coverage
- [ ] Pin reference/source evidence and exact failing archive/model observation.
- [ ] Add failing tutorial battle decoder and production wiring tests; ordinary invalid-state controls; commit RED.
### M2 — Repair and ownership/refusal contract
- [ ] Implement decoder correctness under existing switch; prove OFF parity and mutation failure.
- [ ] Inspect tutorial ownership and refusal path; implement missing source-qualified feedback separately if needed, with switch/explainer/pending metadata and production delivery tests. Coordinate scope against current parallel work by reading its receipts.
- [ ] Reparse real archived Wally state and verify the exact model-facing readout.
- [ ] Update existing explainer and experiment notes to describe corrected coverage, without performance claims.
- [ ] Run just test, just lint, just build, just coverage and just verify-vendor; commit GREEN.
### M3 — Review and close loop
- [ ] Score PB1-PB13; freeze packet and complete Claude/Grok/GPT cloud review under repository contract (maximum two rounds).
- [ ] Merge only if full required cloud approval and gates permit; otherwise retain concrete reviewed candidate and report blocker.
- [ ] Qualify recorded/model-visible consumers and live proof appropriate to changed surfaces, coordinate viewer restart only after a permitted merge.
- [ ] Report implementation, gates, review, landing, runtime exposure separately. No experiment launch.

## Closing the Loop
Native archive replay must move the real Wally error to truthful decoded battle/readout with the switch ON and retain the original diagnostic OFF. Non-tutorial malformed data remains loud. Any new ownership/refusal behavior requires production delivery and replay/history proof. Runtime qualification uses native frames/wall time; it is separate from decoder correctness and does not authorize process changes.

## Session Log
- 2026-10-19: Created worklog before implementation in isolated codex/wally-battle-readout worktree from main. User explicitly authorized creation followed by execution. Current active measured sessions remain untouched. Read repo rules and relevant skills.

## Surprises
- None yet.

## Multi-Model Review Log
- Pending; unavailable lanes do not count as approval.

## Boy Scout Log
- No adjacent cleanup planned.

## Archive Milestone
- [ ] ASK USER: approve archiving after completion.

- Worklog COMMIT: `docs: plan Wally battle readout repair` (3c5741d1). Reference pret/pokeemerald731ad5bf clean. Source LoadWallyZigzagoon clears MOVE2-4 only; failing archive r1 whole-map seq971/T47/raw886 has type0x204 and TACKLE/empty/empty/empty PP35/40/30/0. Preserved full writable archive and provenance as regression fixture, no ROM.
- Initial RED run confirms missing switch arguments on both production readers. First native test invocation lacked ROM configuration (not counted as repair evidence); configured-ROM run also exposed uninitialized vendor dependency, now initializing normally. No test/gate weakening.

- RED COMMIT `test: reproduce Wally battle decoder coverage gap` (1ccdaece); all five regression cases failed as intended, including production archive readback. Vendor top-level initialized at pinned bbab97ad; recursive init reports an upstream pokered entry lacking URL, unrelated to the Emerald tree.
- Decoder focused GREEN: 5 tests pass including real archive with configured ROM. Added separate semantic-refusal RED tests for a new default-OFF battle-refusal-loop-v1; no automatic text/button action. Reuses rejection episode lifecycle and existing event type. An initial test import typo was corrected before counting the RED receipt.
- Semantic RED COMMIT7d2e3935 originally used a UTC timestamp rejected by repository schema. Corrected timestamp to New York; refusal-red-schema-valid.log is authoritative RED: four intended failures (warning, volatile tail, diagnostic mode, registry), two negative controls pass. Earlier invalid-schema receipt retained, not counted as behavior evidence.
- Refusal RED schema correction COMMIT1197238a. New switch appended to registry; default OFF in presets/flags/viewer. Historical registry suffix fixtures updated only for append-only growth; no registry reordering. Existing tutorial-owner switch fixes both battle read paths and source-qualified ownership wording.
- Production delivery GREEN:64 focused agent tests, including real pinned pi loop -> RunRecorder -> loop_guard -> next model request. Warning carries A/B status, no button events. Tutorial suite8 tests passes against full hash-validated raw archive with matching external ROM.
- Additional native-journal consumer found during coverage trace: it calls both readers separately each frame. journal-red.log proves the same switch is not threaded there (1 failing,8 passing). Include this existing consumer so Activity History does not keep emitting the repaired decoder diagnostic. Semantic refusal fixture now includes two actual wrapped r2 results (4070/4096) and their exact paired states, showing wrapper text precedes the Battle action status. Detection must scan the canonical status line, require a qualified identical native battle, and recover when that native state changes; unknown decoding cannot prove repetition or recovery.
