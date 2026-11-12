# Lavaridge navigation and gym protection

Operator 2026-11-12: fix navigation and supervisor blame; prefer existing switches; do not touch current Astra run.

## Scope

Use existing active-warp-exits-v1 predicate in stride execution, preserving OFF behavior. Enable existing gym-puzzle-supervisor-hold-v1 in the dedicated Opus/Astra Rayquaza preset; standard current control and onInBoth recipe already enable it. No new supervisor behavior or switch, no live intervention or launch.

## Evidence

Run af33 seq 47460 / raw archive 32019 (SHA-256 18c46ff407edc95efa5ee455dd2baeb3b12b00cd10f7589fd3f8f5ce7f8374ee): at (13,17), map 4/1, behavior 0 ordinary floor, elevation 3, collision 0; static warp at origin is dormant. Unfiltered stride read rejects it while active-warp readout omits it. Seq 48186 T827 blames gym trips; hold switch explicitly false in dedicated preset since creation a1c2c76c9, but true in current-control and current recipe onInBoth. The hold suppresses gym map-pair warnings and off-map suggestions inside the gym; it does not suppress all drought notes outside.

Reference pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean: field_control_avatar.c IsWarpMetatileBehavior; existing active_warps.py owns the predicate.

## Milestones

- [x] RED: six Python cases fail on missing active_warps wiring; preset regression fails because dedicated lane false.
- [x] GREEN: 38 Python and 67 agent tests PASS; mypy (env config), ruff, changed-file eslint and agent tsc PASS.
- [x] Gates: just lint PASS, just test (includes build/coverage/no-I/O proof) PASS, just verify-vendor PASS. Saved-RAM proof PASS.
- [ ] Independent review and landing

No live-run changes; source landing is separate from activation.

## Proof receipts

Saved raw frame 1108907: targets (12,17) and (13,16) both return safe=False with OFF, safe=True with ON, using validated archive and matching ROM. No emulator inputs or live calls. Factory regression covers dormant origin/target and active pad; OFF preserves refusal. Mutation 1 removes travel-to-strides forwarding: 2 intended failures, 4 PASS; restored. Receipt runs/gym-navigation-proof/mutation-1.log. Existing Lavaridge supervisor path records diagnostic would_warn and sends no map-cycle note when hold ON. Source producer, schemas, delivery, Activity History and replay consumers unchanged for the hold.

Read-only explainer screenshots inspected at 1280, 1440, 375. Existing diagrams scroll on phone; added text fits. No new viewer interactions or event types. Full checks and source review pending; no activation.

Full-gate receipts: runs/gym-navigation-proof/gates.json; lint 101.14s, test 101.49s, vendor 0.11s. CPU release sent. No viewer refresh or active-run inputs.

## Multi-Model Review Log

Frozen BASE 3d64c8f89783a08ce61419e52d615ef047f1ca71; HEAD aa9e9b03c5bf3e9e275c84f29e596e1fad470993; binary diff SHA-256 d94a31f5fe517a46d0ec1fa31c44d541eea36e669f34c7d7af9df5a1bdbe40f2. Claude CLI and independent Codex GPT: VERDICT: LGTM. Grok Cursor 4.5 and 4.7 both blocked by account usage cap, no verdict. Standing fallback Sol and Astra: VERDICT: LGTM with reduced vendor diversity; they do not authorize self-merge. No code blockers. Requested extra serve-caller/bike-only fixture/mutation proof is a follow-up beyond the factory OFF/ON plus one-deletion proof required by the local skill; active-pad fixture proves overall refusal but does not isolate warp rejection from floor rejection.

Receipts and synthesis: runs/gym-navigation-proof/. No self-merge: ask operator for an explicit exception to the missing cloud Grok lane. Everything stays committed on the owned branch, not live.

## Integration compatibility

Main advanced from 3d64c8f89783a08ce61419e52d615ef047f1ca71 to efe4dbd859f27a0f7c314630047169310c097418 (public site/feed only). No agent/env/preset, dependency, event/schema or gate owner changed. Main merged cleanly into owned branch; executable feature delta unchanged. Retain frozen gates/reviews; combined post-main just test remains required if landing is authorized. No shared viewer refresh or current-run intervention.

Integration merge 599c9d7dd273612dfba7bc44c5f0794116bc5d8c. Evidence-only commit retry after same-second worklog freshness rejection; no hook bypass.

## Standing waiver verified; landing authorized

The earlier Grok-blocked status above is superseded. Independently read original native project transcript 00000000-0000-4000-8000-1bb4e739f4f4.jsonl lines 4145/4964/6309, including server-copied the operator user citation [private message reference] at 2026-10-22T14:47:31Z: "land without grok. you're not a very good coordinator if you force me to go into chats". The preceding original cited user reply and its question context establish general Claude + GPT + distinct fallback approval during Grok outages. Current scheduler confirms the standing scope. This is verification of prior operator authorization, not a mailbox-created new waiver.

Claude CLI, independent GPT, Sol fallback and distinct Astra fallback all returned VERDICT: LGTM on the frozen packet. Grok 4.5/4.7 usage-cap failures retained; reduced vendor diversity disclosed. No Grok verdict fabricated. Scope still excludes af33 intervention or any new run. Dedicated preset setting changes future launch configuration only; no live feature flips.
