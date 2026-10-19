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
- [x] Pin reference/source evidence and exact failing archive/model observation.
- [x] Add failing tutorial battle decoder and production wiring tests; ordinary invalid-state controls; commit RED.
### M2 — Repair and ownership/refusal contract
- [x] Implement decoder correctness under existing switch; prove OFF parity and mutation failure.
- [x] Inspect tutorial ownership and refusal path; implement missing source-qualified feedback separately if needed, with switch/explainer/pending metadata and production delivery tests. Coordinate scope against current parallel work by reading its receipts.
- [x] Reparse real archived Wally state and verify the exact model-facing readout.
- [x] Update existing explainer and experiment notes to describe corrected coverage, without performance claims.
- [x] Run just test, just lint, just build, just coverage and just verify-vendor; commit GREEN.
### M3 — Review and close loop
- [ ] Score PB1-PB13; freeze packet and complete Claude/Grok/GPT cloud review under repository contract (maximum two rounds).
- [ ] Merge only if full required cloud approval and gates permit; otherwise retain concrete reviewed candidate and report blocker.
- [x] Qualify recorded/model-visible consumers and browser proof on isolated offline replay; no live gameplay restart authorized or required for this correctness proof.
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
- Native journal RED COMMIT04c8c502; server factory and journal propagation GREEN (22 focused tests). Full test exposed an older sparse 93eb fixture stopping at the original decoder error, so it lacked later battle fields. Extended only that fixture with complete writable regions from its exact hash-validated raw9411 archive (no ROM), preserving original windows and OFF golden text/hash; all135 original readout-fix tests pass with the newly truthful ON battle output asserted.
- Full g2 test gate GREEN:2584 agent +1242 viewer +2735 Python tests, zero skips (counts to be checked against final log). Native ROM configured. Lint TS/ESLint/ruff passed; fresh venv lacked mGBA binding needed by mypy, so linked the canonical built binding into this worktree venv and verified isolated imports; no tracked dependency or type-ignore changes.
- Browser proof on isolated 8802 scratch runs only, no queue runner: completed synthetic offline replay displays the new rejection warning, both evidence sequences, and selected raw JSON in history/trace. Harness Config search finds the card and clicking READ EXPLAINER opens the tracked page. No measured server/run/restart/launch changed. Screenshots retained under canonical runs/mockups/wally-battle-readout/shots. Native frame128062 archive886 reparses OFF error -> ON resolving, ready=false, moves TACKLE35/empty/empty/empty and game-owned tutorial controls. Proof JSON/readout under this worktree runs/wally-battle-readout.
- Main advanced with viewer-only performance landings while this isolated branch was under implementation. Sync before sealing the review packet; no unreviewed landing of this candidate.

- GREEN implementation COMMIT74756143; merged current main3c626e32 as351ef2d9 (automatic merge of serve.py and server.test.ts; main itself unchanged). Subsequent pending definitions pin351ef2d9, a runtime ancestor with the repair, and the guard activation/outcome are corrected to ROUTE_104 -> PETALBURG_WOODS because recorded refusals4070/4096 occurred on Route104 after Wally.
- Per-operand mutations:11 distinct source deletions assertion-RED, each restored; first3 receipts in mutations-first3.json and remaining8 in mutations-remaining.json. First mutation script stopped on a formatter-changed operand before editing that case; corrected it and continued without overwriting earlier receipts. Final restoration11 Python +66 agent focused tests GREEN.
- Pre-sync coverage GREEN (not final combined-tree evidence): agent/viewer/Python gates passed90 floor; Python95.81 lines/91.37 branches/98.01 functions. Merged viewer/frame-pacing code requires fresh final combined-tree checks. Final gate receipts use g3-* so earlier failures remain separate.
- Explainer pages checked at1280/1440/375; final refusal mechanism uses wrapping boxes/arrows so phone labels stay readable. Actual card click opened the correct tracked page at scratch8802. Offline replay intentionally has no live emulator/frame; it proves warning/history/raw JSON rendering, not gameplay or runtime speed.
- Combined-tree g3 build/test/lint GREEN (2584 agent +1263 viewer +2761 Python, zero skips). g3 coverage FAILED on the pre-existing unchanged serpentine navigation body at its5000ms timeout while focused tests/source qualification were running; retain g3-coverage.log as failure, never as passing. The only candidate diff in that file is registry suffix offsets. No timeout, retry, concurrency, exclude or coverage threshold changed.
- Additional self-audit tightened OFF runtime parity: native battle serialization is now done only with the new guard ON, exactly once per completed call, reusing the existing native fingerprint. Removed its redundant copy in the rejection key because qualified native changes already clear the semantic refusal counts. Added opponent-side, uninitialized and diagnostic-state controls; nine per-operand invariant deletions assertion-RED and restored, followed by fresh final wiring mutation receipts. Added test-owned sys.argv restoration via pytest monkeypatch; archive regression requires the actual external ROM and does not skip when absent.

- Final runtime COMMIT212bb116, clean before gates. g4 combined-tree gates ALL GREEN: build10.74s, test52.38s, lint47.32s, coverage79.93s, vendor0.13s. Tests2584 agent +1263 viewer +2762 Python =6609, zero skips. Coverage lines/branches/functions: agent99.25/94.11/98.27%; viewer97.60/90.93/93.72%; Python97.09/92.73/100.00%. No source changes during final g4 gate run. Prior timeout remains a failed receipt; no suppressed tests or lowered floors.
- Final proof rerun at runtime212bb116: native archive validation, exact readout/state JSON and journal; pinned pi model delivery and new guard; completed synthetic replay-v3 on isolated8802 built viewer with history and raw JSON expanded. Verified actual viewport1280/1440/375 (earlier requests on a background tab did not resize it; final verified-replay-* images use measured DOM dimensions). No live frame is fabricated. Five served files match built/tracked SHA256 bytes (served-bytes.json). Explainer/card click passes; local previewsHTTP200 and pages-check pass.
- Final pending definitions pin runtime212bb116, not the earlier ancestor. Production parser accepts122 experiments; production experimentArms proves only battle-refusal-loop-v1 flips, unqueued. No launch/approval/bundle/control mutation. Self-review PB1-PB13 and frozen boundary under runs/wally-battle-readout/review-round1. Independent review follows; main and active gameplay unchanged.

- Round 1 synthesis on frozen361c2246: Fix both concrete in-contract lifecycle defects independently identified by Sol/Astra: initialized=false diagnostic-free battle readout falsely recovers/clears refusal counts; unchanged observe with battle-observation enabled falsely recovers through legacy novelty. Add post-warning production-seam regressions before fixing. No rebuttals or scope additions. Claude CLI unauthenticated, both Cursor Claude variants and Cursor GPT usage-limited; Cursor Grok timeout180s. Two distinct-model read-only fallback reviews BLOCKING; frozen hash reproduced and clean. Fallback cannot authorize landing.

- Review RED b941cc06: both independent recovery regressions fail on original frozen code. GREEN now qualifies initialized native state before count clearing/recovery and prevents legacy novelty from recovering an active refusal episode. Qualified native change/known field escape remain the single recovery contract. 68 focused tests GREEN; both operand deletions produce assertion-RED and are restored (mutations-review-recovery.json).

- Recovery fix COMMITa5d83397. Pending source pins now point to this runtime. g5 final combined-tree gates ALL GREEN: build9.42s, test50.38s, lint42.61s, coverage76.09s, vendor pass. Tests2586 agent +1263 viewer +2762 Python =6611, zero skips. Coverage remains agent99.25/94.11/98.27%, viewer97.60/90.93/93.72%, Python97.09/92.73/100.00% (lines/branches/functions). Only pending JSON pins were dirty during gates; no runtime source changed. A bookkeeping commit initially rejected by worklog hook was corrected by updating this worklog, without bypass. Main remains3c626e32. Round2 cumulative freeze follows; prior native/model/viewer proof remains applicable, regression-only recovery changes have additional RED/GREEN and mutation proof.

- Main advanced to38feef65 during the final commit/freeze window (targeted viewer snapshots). The initial round2 packet was not dispatched and is INVALID; merged main normally at5055c033. Required gates now rerun as g6 on combined tree before round2. g5 is passing pre-sync evidence only. Pending source pins updated to merged runtime. No conflict or main edit by this agent.
