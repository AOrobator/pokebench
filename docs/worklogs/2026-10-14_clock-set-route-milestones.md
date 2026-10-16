# Clock set save: leave home and rival house

Operator approved landing 2026-10-14. A Clock set save starts after the clock is set, so the pre-clock home witness never exists and leave-home / rival-house never record. Fresh boot stays on that witness. Do not restart the in-progress run.

## Problem Statement

`PLAYER_HOUSE_EXITED_AFTER_CLOCK` and `RIVAL_HOUSE_ENTERED` require a home identity taken while the clock is still unset. A run loaded from `CLOCK_SET.state` has `clock_set` already true and intro stage 6 or 7, so both milestones stay missing even after the run leaves home and enters the other house.

## Skills Loaded

- `.claude/skills/pokebench-story-milestones/SKILL.md`
- `.claude/skills/feature-worklog/SKILL.md`

## Architecture

Home for a resumed run is the first stable Littleroot house before the run has been seen on any other map. Route proof accepts that house as the anchor when the clock is already set. A save that starts outside does not adopt a later house as home. The native target stop uses the same anchor.

## Invariants

- INV-1: A fresh boot still records leave-home only from the pre-clock witness, the post-clock 1F, and Littleroot Town. Test: existing post-clock route test.
- INV-2: A Clock set save that starts inside the player's house records leave-home and rival house after those transitions, and does not count the player's own 1F as the rival house. Test: checkpoint-start case.
- INV-3: A save that starts already outside does not receive either milestone for a later house visit. Test: checkpoint-start case.

## Security Review

Recording only. No new process, port, or path. The model-visible hint stays behind its existing switch.

## Milestones

**M1 — Checkpoint-start proof**
- [x] COMMIT: `test(agent): RED for leave-home and rival house after a Clock set save` (2e92c34). Failed on `expected undefined` for leave-home before the proof change.
- [x] Implement home from the starting house, and the same anchor in the native target stop
- [x] Skill requires the checkpoint-start case
- [x] Gates: agent 1028 tests; statements 97.43, branches 93.87, functions 98, lines 98.85. `tsc --noEmit` and eslint clean on the touched files.
- [x] COMMIT: `feat(agent): record leave-home and rival house from the house a Clock set save starts in` (4e4fa06)

## Closing the Loop

The live run `26e0` is not restarted. Original `events.jsonl` rows stay as recorded. The viewer derives a missing leave-home or rival-house observation when it reads the log, and labels that time as a first-observation upper bound.

## Session Log

- 2026-10-14: Checkpoint-start test written. It failed before the proof change because home stayed unset. RED `2e92c34`.
- 2026-10-14: Home for a resumed run is the first stable house before any other map. Fresh boot still uses the pre-clock witness. Agent coverage stays above 90. GREEN `4e4fa06`.
- 2026-10-14: Viewer read path recovers `PLAYER_HOUSE_EXITED_AFTER_CLOCK`, `RIVAL_HOUSE_ENTERED`, `CLOCK_SET`, and `PLAYER_BEDROOM` from recorded RAM when the log omitted them, including the bedroom a transition frame could not grade. Derived rows are first-observation upper bounds. `events.jsonl` is not rewritten. Comparisons validation accepts `config.resume` omitted, null, or a string; a non-string still fails. Screenshot audit found no milestone that images proved beyond RAM, so no screenshot receipt was added. The earlier uncommitted Clock-set chart (dashed, not from zero) and the 64 MiB log-bound edit stay out of this commit. Proved checkpoints already connect on the existing plot, and a real miss still breaks the line; the new chart test stays with that uncommitted chart because it does not pass without it.
  COMMIT: `fix(viewer): recover Clock set route splits from recorded state` (9a1c7f5). Focused viewer tests 74 passed (`model.test.ts`, `frontier-recording.test.ts`, `workbench-store.test.ts`). `tsc --noEmit` and eslint on the touched files were clean. Deletion proof on that commit: dropping `PLAYER_HOUSE_EXITED_AFTER_CLOCK` from the resumed-split allowlist made the Clock set recovery test receive `undefined` instead of `{derived:true, seq:4, elapsedMs:3000}`; forcing the bedroom push false made the bedroom test receive `[]` instead of the derived room split; removing the resume type check made `resume: false` stop throwing. Each guard was restored and the same 74 tests passed.

## Surprises

None yet.

## Multi-Model Review Log

- 2026-10-14: Landing review of `b17a67a..87e0af1`, diff SHA-256 `4713ce3e8cdf2c2d4665d41de35d041a791bcaabd911da96dab4fec878ad7785`. Not merged. Claude CLI review config `~/.claude-review` reported `loggedIn: false`. Cursor Claude Opus, Sonnet, and Fable each returned a usage-limit error (cycle ends 2026-10-17). Cursor GPT Sol and GPT-5.5 returned the same usage-limit error. Codex `exec` rejected `gpt-6.1-sol`, `gpt-5.4`, and `gpt-5.3-codex` with HTTP 400, not supported on the ChatGPT account. `think_fast` was left idle so the live Think Fast cohort was not given a review completion; model id `/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf` answered `/v1/models` only. `think_swarm` (`think-swarm`) returned a 7-token `VERDICT: LGTM` with `finish_reason: stop` and no findings. Cursor Grok 4.7 high and high-fast produced no stdout and sat at 0% CPU; both were stopped. No lane is being treated as a full roster LGTM. Main was not updated.
- 2026-10-14: Landing review of `b17a67a..e790cbd`, diff SHA-256 `530eed61ad16bf72e5061c6c07a36177ff4a5fbed396ab589420d8d64baf1bf9`. Main had already moved to `1495501` at packet freeze and to `d27ef50` before the merge. Reduced roster, not a normal four-lane pass. Claude CLI stayed logged out. Cursor Claude Opus, Sonnet, and Fable, and Cursor GPT Sol and Luna, hit the usage limit that resets 2026-10-17. Codex `exec` again rejected `gpt-6.1-sol` with HTTP 400. `think_fast` was not called because the live cohort holds `runs/.naming-gameplay.lock`. `think_swarm` returned a contradictory blocker-then-LGTM and was not counted. Gemini and Kimi subagents hit the Other Models limit; Muse hit the usage limit. Counted `VERDICT: LGTM` with no blocking finding: Cursor Grok 4.7 high-fast (exit 0, empty stderr; ask mode could not run `shasum`), Composer 2.5 fast (`d7d9b466`), and Grok 4.6 high-fast (`d2e3ec81`). The last two reproduced the diff digest. Residuals left unfixed: `resume: null` is accepted and untested; own-2F equality and a qualified native bedroom supersede are not separately falsified. Merged locally as `135d8ca`. The unstaged Clock-set chart stayed out of the merge.

## Boy Scout Log

None.

## Archive Milestone

- [ ] ASK USER: archive this worklog

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
