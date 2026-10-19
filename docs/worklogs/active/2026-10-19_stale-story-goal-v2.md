# Worklog: stale-story-goal-v2

## Problem Statement

`stale-story-goal-v1` keeps PROF. BIRCH's pre-handoff invitation to visit the POKéMON LAB active until the Pokédex is received. The game completes that invitation when the starter handoff advances `VAR_BIRCH_LAB_STATE` to stage 3, then later issues a distinct return-to-the-lab instruction after the Route 103 rival encounter. Current runs therefore receive a false active destination and an away-from-goal supervisor while the correct next step is to find the rival. When v1 does retire a line, `harness-trust-v1` prints `Story goal: none`, which conflates “no active place-bearing instruction” with “no story objective” and repeats the retired destination.

The authorized outcome is a new default-OFF `stale-story-goal-v2` switch. With v1 ON and v2 OFF, bytes and behavior remain today's. With v2 ON, a Birch-lab instruction is a stage-bound episode: a line first observed before stage 3 retires at stage 3; a distinct line first observed at stage 3 or later remains active until Pokédex receipt/stage 5. Retired or absent destination goals are omitted from the trust header and destination guidance; their source dialogue remains in the conversation ledger/history. The away supervisor receives no retired goal. No route, place, character, or next-step foreknowledge is injected.

`input-cuts-v1` is already ON in the bundle arm and OFF in its control arm. It continues to omit duplicate active goals. This branch does not change the fixed bundle, approve an experiment, launch a run, or promote v2.

## Skills Loaded

- `feature-switch`: v2 is independently registered, default OFF, with exact v1 behavior when OFF.
- `feature-explainer`: tracked local HTML, Harness Config mapping, route/card tests, visual verification.
- `experiment-queue`: pending entry only; no queue position, approval, or launch.
- `pokebench-patch-evaluation`: native activation boundary and readiness evidence; no benefit claim.
- `pokebench-game-state`: stage meanings grounded in the pinned pret/pokeemerald source.
- `agent-observability`: prove model-visible output and supervisor behavior through production wiring.
- `feature-worklog`, `execute-worklog`, `close-the-loop`: RED/GREEN commits, gates, review, and delivery receipts.

## Architecture

- Extend story-line state with the Birch lab stage observed when the line becomes durable.
- Add v2 retirement policy without changing v1: pre-stage-3 Birch-lab lines expire at stage 3; stage-3-or-later Birch-lab lines retain v1's Pokédex completion boundary.
- Thread `stale-story-goal-v2` through the production `FeatureSet`; require `stale-story-goal-v1` so v2 refines, rather than silently replaces, the incumbent policy.
- Under v2, omit a trust-header goal line when no active destination exists, including a just-retired episode. Keep ordinary trust facts such as characters and exits.
- Ensure destination guidance and the walk-away supervisor receive only the active episode.
- Register the switch in the feature catalog, presets, viewer default, Harness Config explainer mapping, and a pending experiment entry.

## Invariants

- **INV-1 — Exact OFF arm:** v1 ON + v2 OFF reproduces current goal, retired-line, destination-block, and supervisor output byte for byte. Test with direct and production-factory fixtures.
- **INV-2 — Native boundary:** a Birch-lab line observed before stage 3 is not active at stage 3 or later. Test stages 2→3 and 2→5.
- **INV-3 — Later return survives:** a Birch-lab line first observed at stage 3 remains active through stage 4 and retires only at Pokédex/stage 5. Test issuance at stage 3, replay at stages 3/4/5.
- **INV-4 — No false none:** v2 emits neither `Story goal: none` nor the retired quote in active destination guidance; conversation history remains untouched. Test trust and destination blocks.
- **INV-5 — No false supervision:** walking away from a retired episode records no `story_goal_away`; walking away from a live later episode still can. Test the production recorder seam.
- **INV-6 — No foreknowledge:** v2 derives only from recorded dialogue, resolved place, and native Birch-lab stage; it names no replacement destination. Test exact output.
- **INV-7 — Switch integrity:** new treatment defaults OFF, has a valid dependency, appears last in registry order, and only the candidate arm flips it. Test registry, preset normalization, viewer defaults, and experiment parsing.
- **INV-8 — Discoverability:** the Harness Config card links to a self-contained, locally served explainer. Test card URL and exact-file route; verify desktop and phone rendering.

## Security Review

- No network, subprocess, ROM, save, or memory-write surface is added.
- Input remains schema-validated recorded events and typed `GameStateSnapshot.story`; null/unreadable story state never fabricates completion.
- Historical logs are not rewritten. Existing v1 runs remain attributable to their recorded feature vector.
- The explainer remains local, self-contained, GET-only through the existing allowlist, with zero external requests.
- No measured or live run is modified, restarted, approved, or launched.

## Milestones

**M1 — Stage-bound goal lifecycle**
- [x] Write tests for INV-1 through INV-6; direct lifecycle/trust RED is established, production wiring follows in M2
- [x] COMMIT: `test(story-goal): define stage-bound v2 lifecycle` (`5b28fe9c`, RED)
- [x] Implement stage-at-issue tracking, v2 retirement, empty-header omission, and supervisor/destination behavior
- [x] Gates: agent suite 2531 passed; `just lint` clean; `just build` clean
- [ ] COMMIT: `feat(story-goal): add stage-bound v2 lifecycle` (GREEN)
- [ ] Observability proof on production-shaped recorded events; no gameplay run
- [ ] Multi-model review loop until clean

**M2 — Switch registration, explainer, and pending experiment**
- [ ] Write tests for INV-7 and INV-8
- [ ] COMMIT: `test(story-goal): require v2 registration and explainer` (RED)
- [ ] Register switch/presets/defaults, explainer mapping/page, pending experiment, and readiness row
- [ ] Gates: viewer/agent targeted tests, `just experiments-check`, `just pages-check docs/explainers/stale-story-goal-v2.html`
- [ ] COMMIT: `docs(story-goal): register v2 experiment and explainer` (GREEN)
- [ ] Browser proof at 1280×900, 1440×900, and 375×812; Harness Config click on isolated viewer
- [ ] Multi-model review loop until clean

**M3 — Repository gates, frozen review, and landing**
- [ ] Sync current `main` into the branch
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage`, `just verify-vendor`, `just experiments-check`, `just experiments-audit`
- [ ] Principles self-review PB1–PB13 with zero FAIL
- [ ] Freeze packet and obtain Claude, Grok, and GPT/Codex `VERDICT: LGTM`
- [ ] Fast-forward merge reviewed tree into local `main` if every landing condition remains satisfied
- [ ] Post-land `just test`; coordinate one viewer restart and verify the live build/card/link
- [ ] Evidence-only worklog commit recording review and merge SHA

## Closing the Loop

- **Logic:** RED tests demonstrate the old implementation keeps the pre-handoff line and prints the retired/empty header; GREEN tests cover the factory path and delete/restore guard.
- **Game grounding:** record pret/pokeemerald revision and the scripts that set Birch lab stages 3 and 5 and issue the later return line.
- **Model-visible delivery:** production-shaped result contains no retired/empty goal under v2, contains the later valid goal, and produces no stale away event.
- **Viewer/docs:** page checker, local HTTP 200, opened desktop/phone screenshots, and real Harness Config explainer click on an isolated viewer.
- **Experiment:** pending only, readiness recorded, no queue position or approval, no measured runs.
- **Delivery:** distinguish branch implementation, reviewed/landed source, viewer restart, and live card proof.

## Session Log

- 2026-10-19 ET: Operator approved making the goal behavior v2 and asked whether `input-cuts-v1` is on in the bundle. Confirmed `experiments/fixed/bundle-v-control.json` lists `input-cuts-v1` among bundle switches; it is ON in bundle and OFF in control. Created isolated worktree `codex/stale-story-goal-v2` from clean `main` at `02abda0c`.
- 2026-10-19 ET: Read repository rules and required feature-switch, explainer, experiment, patch-evaluation, game-state, observability, worklog, execution, and close-the-loop skills. No implementation edits made before this worklog approval gate.
- 2026-10-19 ET: Operator approved this worklog. Implementation may begin. M1 keeps the new policy behind direct options; M2 registers and wires the public feature switch so the RED/GREEN commits stay buildable in milestone order.
- 2026-10-19 ET: Initial test command could not start because the fresh worktree had no dependencies. `just setup` installed the pinned workspace dependencies without downloads. Actual M1 RED: agent suite 2528 passed, 3 failed. Failures prove the old code keeps the pre-stage-3 invitation, renders a completed later return line instead of omitting it, and prints the empty `Story goal` header.
- 2026-10-19 ET: M1 RED committed as `5b28fe9c` (`test(story-goal): define stage-bound v2 lifecycle`). The managed worktree was initially detached; attached that commit to new branch `codex/stale-story-goal-v2` before further edits.
- 2026-10-19 ET: M1 GREEN records the native Birch stage attached to each dialogue page's recorded `state_seq`, retires only a pre-stage-3 all-lab episode at stage 3, preserves unknown stages, and lets the v2 presentation omit absent/completed destination goals. Pinned pret/pokeemerald reference is clean at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; `LittlerootTown_ProfessorBirchsLab_EventScript_AgreeToSeeRival` sets stage 3 after the rival-teaching line, Route 103 supplies the later return-to-LAB line, and `LittlerootTown_ProfessorBirchsLab_EventScript_GivePokedex` sets stage 5.
- 2026-10-19 ET: Delete/restore receipt `m1-destination-block-operand`: removing the completed-v2 block suppression produced 2529 passed / 2 failed, exposing both pre-handoff and post-rival retired lines; restoring it returned 2531/2531 green. Fresh-worktree lint initially lacked `mgba._pylib`; `just build-mgba` installed the pinned local binding, after which lint passed. Build passed with dirty stamp `5b28fe9`.

## Surprises

- `input-cuts-v1` intentionally excludes `goal.done===true` from duplicate suppression, and a dedicated regression test preserves `Story goal: none…`. V2 must change that behavior explicitly rather than assuming input cuts already does it.

## Multi-Model Review Log

- Not started.

## Boy Scout Log

- None. Scope excludes unrelated cleanup.

## Archive Milestone

- [ ] ASK USER: approve archiving only after landing and live proof.
