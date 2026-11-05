# Effort truth and custom-lane frontier filter

**Started:** 2026-11-04 (New York)
**Status:** Gates pass; review next
**Operator:** The operator. "correctness fixes need to be on by default" (2026-11-04)
**Branch:** `claude/effort-truth-frontier-lanes`

## Problem

1. Runs recorded thinking level medium, but requests carried only enable_thinking, so templates used their own default. Proven for Qwen3.8-27B: vLLM /tokenize on f604's first request gave 9,181, equal to the recorded prompt; medium 9,143, low 9,169.
2. Nothing kept weight-edited or knowledge-on runs off the benchmark frontier.

## Decisions

- `reasoning-effort-request-v1` ships ON by default. Effort goes in chat_template_kwargs; top-level reasoning_effort did not change vLLM's /tokenize count.
- Legacy version-1 flag presets keep it off, as they keep every later switch; only v2 presets that omit it default on.
- `sampling.reasoning_effort_sent` is recorded on every new run. Recording only, never model-facing.
- Old recordings are never edited. No field means no effort sent; `served-effort.ts` names what each lane ran at.
- Custom lane markers must work on pinned builds, so they read the model id, the experiment id and recorded switches.
- Knowledge switches: story-route-plan-v1, objective-graph-supervisor-v1, next-milestone-hint-v1. Two historical think-fast runs (2026-10-15) had the hint on and leave the frontier plot; neither was the frontier.

## Open

- [ ] Follow-up: the header pill shortens qwen3.8-27b-edit-e1-x to Qwen3.8, so an edited model looks unedited except on hover.

- [ ] the operator: GLM-5.3 accepts only low and high. Keep sending the configured level, or map it?
- [ ] DeepSeek: chat_template_kwargs is forwarded through OrcaRouter; whether the provider reads it is unknown.
- [ ] Trainer page still shows thinking_level; changing it needs a design look.

## Milestones

- [x] M1 RED/GREEN, focused checks
- [x] M2 full gates, regenerate schema
- [x] M2b trainer-card check, real-browser frontier proof
- [ ] M3 Claude, Grok and GPT review; land on main
- [ ] M4 just viewer-main, then launch-check before any new run

## Commits

COMMIT: `test: effort reaches the request and custom lanes stay off the frontier` (a18f90f4e)

## Gates

Final, on 2026-11-04 night NY: just lint pass, just test pass (agent 2,458, viewer 855, env 2,901, gateway 38, floors and no-io-proof pass), just verify-vendor pass, trainer-card check 3/3. A served-module unit test was deleted because importing server.ts trips the no-I/O guard; the trainer-card check covers that failure.

Trainer-card check first failed: custom-lane and served-effort were not in BROWSER_MODULES, and panels imported the server-only run-config. Vitest could not see it; the browser would have failed to load. Fixed; check passes 3/3 with main's card art.
Headless proof on a two-run fake root, desktop and phone, no JS errors: /comparisons draws only the plain run, lists the edit twin as "Custom lane, kept off the benchmark frontier: weight-edited model", and its link opens the run.

Full, 2026-11-04 11:2x PM NY, on main f3aa249fb: just lint pass; just test pass (agent 2,458, viewer 855, env 2,901, gateway 38, coverage floors and no-io-proof pass); just verify-vendor pass. The clone's venv links main's mgba binding for mypy.

Focused, 2026-11-04 11:04 PM NY, on main f3aa249fb: tsc agent and viewer clean. Agent reasoning-effort, presence-penalty, play-preset, features, gateway, provider, events: 133 pass. Viewer frontier, panels, next-run: pass. Changed-file eslint clean. schemas/events.v1.json regenerated.
Wiring check: removing sentEffort from playLoopBase turned reasoning-effort.test.ts red (1 failed), restored green (5 pass).
Real data, built viewer on the served 801 runs: best stays 274b, runner-up astra 429f; only two 2026-10-15 think-fast hint runs become custom; a fake edit twin of 274b does not rank.

## Multi-Model Review Log

Round 2, packet ..7c3fcea2a sha cbcc810c. Fallback subagent: LGTM. Claude: BLOCKING on test gaps only. GPT (gpt-5.6-sol): BLOCKING on a loose edit matcher, a record that could claim an unsent effort on a body without template kwargs, and an unvalidated effortSent. All fixed: matcher is now -edit-, effort is added to every body, validator checks it, tests run run_start through configuration to Run Details and Harness Config.
Follow-ups, not in this branch: tail.ts prints thinking_level; frontier-v1.json can answer stale until the first re-rank; history.ts ignores effortSent; just test cannot see a missing BROWSER_MODULES entry; stored Roxanne runtime baselines lack the key (they already failed on two older keys).

Round 1, packet f3aa249fb..3bbcc38ab sha 777f6d9c. Claude: BLOCKING on one real bug (Run Details still showed medium); fixed by carrying effortSent on WorkbenchConfig. Thinking-off wording in the EFFORT SENT row also fixed. Other notes are follow-ups. Grok: Cursor usage limit until 11/17. GPT: config default model refused; rerun with gpt-5.6-sol.
