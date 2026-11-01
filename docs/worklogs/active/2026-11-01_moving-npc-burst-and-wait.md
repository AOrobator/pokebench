# Moving-NPC wait fix + free-field frame burst

**Started:** 2026-11-01
**Status:** Landing; operator approved execute+land 2026-11-01
**Branch:** `cursor/moving-npc-burst-and-wait`

## Problem Statement

DeepSeek control4h (`2026-11-01T01-01-00_deepseek-v4.1-flash_control4h`) entered Route 104 Mr. Briney's House at T413 and spent ~14 turns failing to talk. Forensics:

1. Every house `tool_result` delivered **exactly one** screenshot. Briney's table-square patrol (`(6–9)×(3–6)`) is invisible as motion; samples are 7–55s apart.
2. `moving-npc-target-v1` is already **onInBoth** (including this control run). Both `navigate_to_target` object-1 calls (T414, T422) ended with `moving target attempt limit reached` and `moving target position changed before input; 0 bounded movement actions` — the 32-attempt budget burned on replan without the player stepping.
3. Manual adjacency at T427 (`DOWN,A`) worked; then sail to Dewford. Not a model-capability wall; chase + observation gap.

Operator direction (2026-11-01): (1) continuous/burst screenshots as its **own** switch, **ON in the bundle**; (2) **update** `moving-npc-target` follow behavior and keep it active for bundle launches (already onInBoth — retain; do not demote to control-off).

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/feature-explainer/SKILL.md`
- `.claude/skills/tool-prompt-sync/SKILL.md`
- `.claude/skills/pokebench-trace-forensics/SKILL.md` (read-only evidence above)
- `.claude/skills/execute-worklog/SKILL.md` (after approval)
- `.claude/skills/close-the-loop/SKILL.md`

## Architecture

Two independent switches; both default OFF in registry; recipe places them as below.

### A — `moving-npc-target-v1` (existing; ON behavior corrected)

Keep the same id. **OFF** = pre-feature abort-when-target-moves (unchanged bytes). **ON** = follow, but stop thrashing on square patrols:

- When the player already stands on a valid approach tile for the selected object, **wait / re-face / A** as the object walks; do not spend the attempt budget solely on `position changed before input` with **zero** movement actions.
- Prefer staying on an adjacent approach over chasing every one-tile drift around furniture.
- Retain identity, map, field-ownership, sight and 32-attempt hard caps; update `MOVING_NPC_SENTENCE` + overworld prompt via tool-prompt-sync.
- Recipe: keep **onInBoth** (already true in `experiments/feature-configs/current.json`). Correctness fix for the promoted arm, not a new bundle-only treatment.

### B — new `moving-npc-frame-burst-v1` (name TBD at RED if a clearer id wins)

Own observation switch. **OFF** = one screenshot per tool result as today. **ON**:

- While free-field and a selected / nearby loaded A-object is moving (or during `moving-npc-target` follow / after its early return), deliver a short chronological burst of screenshots with the tool result (reuse cutscene-journal's "at most six images" ceiling pattern; sample on an emulated-frame cadence, not wall-clock spam).
- Does not choose routes or press buttons. No story names invented from sprites.
- Recipe: add to `switches` → control OFF, **bundle ON**.
- Needs: none required; may cooperate with `moving-npc-target-v1` when both ON but must still burst useful frames if the model only `observe`s / presses near a moving person.

Production path: attach extra `image` parts on the observe/press/navigate_to(_target) result content (recorder already saves every image part). Prefer agent-side sampling via existing observation endpoint rather than a new server feature unless idle wait needs a frame hook.

## Invariants

- **INV-1:** OFF of `moving-npc-target-v1` byte-matches today's OFF follow/abort path. Test: existing OFF fixtures + snapshot of refuse-on-drift.
- **INV-2:** ON of `moving-npc-target-v1` does not return `0 bounded movement actions` solely from repeated pre-input position changes while already on a valid approach; either waits/faces/A successfully within the bound or returns a distinct truthful status. Test: Briney-shaped square patrol fixture from T414 mechanism.
- **INV-3:** OFF of `moving-npc-frame-burst-v1` keeps single-frame tool results. Test: frame count === 1 on observe/press/navigate results.
- **INV-4:** ON burst ≤ configured max images, chronological, paired with the final state/text; no inputs added. Test: multi-image content + recorder `frames.length`.
- **INV-5:** Bundle recipe: burst in `switches`; moving-npc remains onInBoth. Test: feature-config materialization / fixed-definition expectations.
- **INV-6:** Tool/prompt text for navigate_to_target stays in sync with ON follow semantics (tool-prompt-sync).

## Security Review

No new network binds, ROM paths, or secrets. Screenshots remain run-local under `runs/<id>/frames/`. Burst increases disk/prompt image count only when ON.

## Milestones

**M1 — Correct `moving-npc-target-v1` ON follow (wait / adjacent hold)**
- [x] RED: Briney-shaped drift + stay-on-valid-approach expectations
- [x] COMMIT: `test(agent): require moving-NPC wait and drift walking` (RED) `447dd316c`
- [x] Implement: navigate checks identity only (not tile drift); prefer current tile when it remains a valid approach; update `MOVING_NPC_SENTENCE`
- [x] Focused vitest `moving-npc-target.test.ts` 26/26 PASS
- [x] COMMIT: `fix(agent): walk through moving-NPC drift; stay on valid approach` (GREEN) `f67afe190`
- Note: pure “hold forever while NPC is off-adjacency” needs emu frame advance without input; deferred. Stay-when-still-valid-approach covers the adjacent re-face case; 0-move thrash is the cottage failure mode.
- Source readiness only; no recipe change required (already onInBoth)

**M2 — Register `moving-npc-frame-burst-v1`, OFF exact, ON burst, bundle switch**
- [x] RED+GREEN combined: registry/preset/wiring/frame-count + implementation (same commit; RED-only commit skipped after M1 GREEN already on branch with operator execute+land)
- [x] Implement burst capture in `followObject` + production wiring + `current.json` `switches` + explainer README
- [x] Delete-guard once: force `capture` early-return → ON multi-image assertion failed (0 ≥ 2); restore → 28/28 PASS
- [x] Explainer + `FEATURE_EXPLAINERS` map; `just pages-theme` / `pages-check` clean
- [x] COMMIT: `feat(agent): moving-npc free-field frame burst` (GREEN) `6f8e595ef`

**M3 — Landing and activation**
- [x] Full gates PASS on `6cd0c89bb` (lint; test incl. build+coverage+trainer-cards; verify-vendor). whole-game-instructions 5s timeout flake once under load, PASS on re-run alone and in full suite.
- [x] Freeze packet R2 `14991d479..1549b9be9` sha256 `64c924e01ad2008714cd8a36e85a687fa842d944ff75ccf478b0c581a1e8f866`
- [x] Claude CLI R2 `VERDICT: LGTM` (B1 closed)
- [ ] Grok/GPT lanes unavailable (Cursor usage limit; Codex ChatGPT account rejects configured models incl. gpt-6.1-sol) — landing under operator execute+land with disclosed reduced diversity
- [ ] Land FF-only; report merge SHA
- [ ] Authorized `just viewer-main` only if operator requests Harness Config refresh; no experiment launch without separate approval

## Closing the Loop

- Tests for both switches (OFF bytes, ON behaviors, factory wiring, recipe materialization).
- No emulator smoke claimed until a rehearsal is authorized; DeepSeek cottage evidence is the motivating trace only.
- Explainer local links after pages-check 200.
- Cheap checks: agent 28/28; viewer fixed-definition/panels/server burst tests PASS after `just build` (dist FeatureSetSchema); pages-check clean.

## Session Log

- 2026-11-01: Forensics on DeepSeek control4h Briney cottage; operator approved direction (own burst switch ON in bundle; update moving-npc and keep for bundle). Worklog drafted; waiting approval before branch/implementation.
- Note: `moving-npc-target-v1` is already onInBoth in `current.json` (promoted 2026-10-27); "put in the bundle" = keep it there under the corrected ON semantics, not a demotion to switches-only.
- 2026-11-01: Operator approved worklog and “execute … and land it”. Branch opened. M1 RED `447dd316c`; GREEN `f67afe190` (26/26 then).
- 2026-11-01: M2 burst switch registered (index 318), followObject observe burst ≤6, recipe `switches`, explainer themed; focused 28/28; delete-guard red then green. GREEN `6f8e595ef`.
- 2026-11-01: Principles self-review PB1–PB13 zero FAIL (`runs/reviews/moving-npc-burst-principles.md`). CPU START requested via tell-claude (Delivered).
- 2026-11-01: Pre-land gates PASS on `0f4e986b3` (lint/test/verify-vendor) after B1 fix + Claude R2 LGTM.
- 2026-11-01: Full gates PASS (lint/test/verify-vendor) at `6cd0c89bb` after fixture sync; one load flake on whole-game-instructions timeouts, clean on re-run.
- 2026-11-01: Full `just test` FAIL once: destination-first-qwen.json.gz still had pre-stay-on-approach MOVING_NPC_SENTENCE; fixture updated (`6cd0c89bb`). Lint PASS. Re-running full gates.

## Surprises

- destination-first Qwen prompt fixture pinned the previous moving-NPC sentence; updated with the stay-on-approach wording.
- Follow already ON in control for the failing DeepSeek run — failure is ON thrash + single-frame observation, not a missing bundle flag.

## Multi-Model Review Log

- Round 1 Claude CLI (`~/.claude-review`, plan mode): `VERDICT: BLOCKING` — B1 follow finishes when navigate refuses an approach the NPC just occupied (stable no longer aborts drift; occupied goal/step is not continuable). Non-blocking: burst may drop final frame at cap; principles packet head lag; observe burst updates shown-state (speculation).
- Fix: continue follow when navigate status matches person/object occupation and identity remains (`semantic-navigation.ts`); test `replans when navigate refuses an approach the NPC just occupied`.
- Round 2 Claude CLI: `VERDICT: LGTM` (B1 closed). Grok via cursor-agent and Cursor Task: usage limit. Codex CLI: model_not_found for gpt-6.1-sol/gpt-5.4/etc on ChatGPT auth. GPT cursor-agent: usage limit.

## Boy Scout Log

- None yet.

## Archive Milestone

- ASK USER
