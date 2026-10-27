# Whole-map control promotion (2026-10-21)

Operator decision, the operator, 2026-10-21 10:03 AM New York: "Let's make bundle plus whole map the new control. And hold out story battle heal gate." Confirmed in thread 10:20 AM ("yes").

Evidence: overnight run analysis, runs/reports/run-analysis/2026-10-21_overnight-holistic/index.html. Scored rounds went bundle 3, control 1. Rustboro by 120 min: 5/5 bundle against 1/5 control. The heal gate cost about 38 min across three runs and prevented no loss.

## Change

- **New control base** `experiments/fixed/control-bases/whole-map-bundle-fd95.json` (id `whole-map-bundle-fd95`).
  - It is the exact `evaluation.features` recorded at run_start in 2026-10-21T04-27-11_qwen36-gpu1_fd95. 2026-10-21T06-28-18_qwen36-gpu0_1331 recorded the identical list.
  - Those are the 2h bundle arm at 6fbce332: 66 bundle switches plus full-map-navigation-v1.
  - `story-battle-heal-gate-v1` is set false. Switches registered after fd95 are false.
- **`experiments/fixed/whole-map-pair-2h.json`:**
  - Base features are the new control base.
  - `story-battle-heal-gate-v1` is added to offInBoth.
  - Bundle-only switches are now the fixes registered since fd95: `menu-refusal-recovery-v1` (inert at 6fbce332), `gym-door-label-v1`, `mart-stock-readout-v1` and `caught-dex-input-v1`.
  - Seed and plan are unchanged. The loop picks this up at the first round that starts after the merge.

## Checks

- [x] Definition and control-base check (fixed-design `definitionProblems` + `controlBaseProblems`) on this branch: none
- [x] Control arm equals fd95's recorded features except the heal gate
- [x] `just test`, `just lint`: TS 3292 + 1609 passed, Python 3647 passed, lint clean (after syncing main d00cded5)
- [x] `just fixed-run check whole-map-pair-2h` on main after the merge: definition sha256 1f30902b…, control base whole-map-bundle-fd95 (c66c2eb4…) matches
- [x] Claude (subagent), Grok (cursor-grok-4.5-high) and Codex (gpt-5.6-sol) each VERDICT: LGTM on frozen packet d00cded5b..607954b29 (diff sha256 2ee1c85c…)
- [x] Landed fast-forward: main = 607954b29 (11:12 AM New York). Loop round 3 launched at 11:07 AM on d00cded5b (old definition) and runs two pairs to about 3:08 PM; round 4, about 3:08 PM, is the first on the new control.

## Rename to bundle-v-control-2h (the operator 2026-10-21 11:36 AM NY)
Whole-map is now in control, so the loop's experiment is plain bundle vs control. experiments/fixed/bundle-v-control-2h.json = main's whole-map-pair-2h.json with only id and title changed (title 'Bundle vs control (2 hour pair)'); whole-map-pair-2h.json stays as is, so past runs and labels keep their names. The viewer invariant tests now cover bundle-v-control-2h too. Launcher default (scripts/whole-map-loop.sh and Codex's latest_main_loop.py) is left to the Codex launcher hand-over on codex/latest-main-before-run, so the two branches do not collide.
- Gates: fixed-run check OK; agent 3322, viewer 1612 and pytest pass. Reviews: Claude subagent LGTM; Grok (cursor-grok-4.5-high) found no bugs in the definition, ids or dropdown labels; its one finding was a stale-base packet artifact (the diff vs a moved main showed another worklog's lines), and after rebasing the branch touches only this worklog, the new JSON and the two test lists.
- Resynced on main af70fa34 (progress-aware-cycles-v1 in the bundle): bundle-v-control-2h re-copied from whole-map-pair-2h (only id/title differ); the new progress-aware-cycles test list covers it too.
- Round 3 on 8b290e4b (packet runs/reviews/bundle-v-control-2h/r3): Claude subagent LGTM, Grok cursor-grok-4.5-high LGTM. Gates: fixed-run check OK, agent 3337, viewer 1615, pytest 3702 pass.
- LANDED on main (ff-only, landing-board turn 12:12 PM NY) after a docs-only resync onto 8e279f85.

## Track hyperqwen-control-3h (2026-10-27, branch claude/hyperqwen-control-def)
experiments/fixed/hyperqwen-control-3h.json was untracked in the main checkout while live run 2026-10-27T15-23-07_hyperqwen-gpu0_e1f1 read it. The branch adds a byte-identical copy (sha1 1fe61d40…, the main-checkout original left untouched) and names it with the other current-recipe protocols: citation-evidence.test.ts `current`, fixed-definition.test.ts maintained protocols, and experiments/feature-configs/README.md.
- [x] RED: with the file in experiments/fixed/ and the base test, citation-evidence fails `hyperqwen-control-3h.json: expected true to be false` (featureRecipe current turns citation-evidence-v1 on in both arms). GREEN after listing it: 6/6. fixed-definition.test.ts 13/13 with the new id.
- [x] COMMIT: `chore: track the hyperqwen-control-3h fixed-run definition` (24360b7e3)
- [x] Gates on 24360b7e3: verify-vendor, lint, build OK; vitest agent 4545, viewer 2038 pass.
- Review round 1 (packet 72257830d..24360b7e3, diff sha256 08e43175…): fallback Sonnet subagent LGTM; Codex gpt-5.6-sol BLOCKING on (1) repeated recipe I/O in shared test helpers (rebutted: helpers not changed by this diff, a perf rewrite is out of scope) and (2) no worklog evidence (fixed by this entry); its follow-up about the hard-coded protocol lists is taken here for fixed-definition.test.ts and the README. Claude CLI run failed to start (argv bug in my invocation, `--add-dir` swallowed the prompt); rerun in round 2.
- Review round 2 (packet sha256 474670bd…): Claude (read-only subagent; claude CLI OAuth expired) LGTM; Codex gpt-5.6-sol BLOCKING on the repeated test I/O finding again and on incomplete gates. The operator 2026-10-27 accepted the rebuttal of the I/O finding for this branch only.
- Rebased onto main 7e5933213 (no conflicts). Gates on the rebased head: verify-vendor, build, lint, TS tests and coverage pass (agent 4546, viewer 2060). `just test` (pytest, Python coverage gate, trainer-card check) runs with POKEBENCH_ROM inline per the operator.
- [ ] FOLLOW-UP: a test-side cache for the tests that enumerate experiments/fixed/*.json (recipe-text.ts and its callers), so each definition and the shared current recipe are read and validated once per run, with feature-only checks deduplicated by resolved feature vector. Codex round 1/2 finding; not in this branch.
- Synced main 85a371c94 into the branch (da749057f, no conflicts; branch diff unchanged: 5 files, +78/−3). The untracked main-checkout copy is byte-identical to the tracked file (diff empty), so landing leaves its bytes as they are.
- Full gates on the synced tree (2026-10-27 ~6:20 PM NY): `just lint` exit 0; `POKEBENCH_CARD_ART=~/dev/pokebench/runs/sprites/trainer-card-v1 just test` (POKEBENCH_ROM from .env) exit 0: agent 4546 (96.44/92.64/97.54), viewer 2083 (95.81/91.68/95.32), pytest 4431 (96%), claude-gateway 60 (99%), trainer cards 3.
