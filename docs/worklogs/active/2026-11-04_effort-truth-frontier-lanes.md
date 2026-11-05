# Effort truth and custom-lane frontier filter

**Started:** 2026-11-04 (New York)
**Status:** Focused checks pass; full gates waiting for a heavy-CPU window
**Operator:** The operator. "correctness fixes need to be on by default" (2026-11-04)
**Branch:** `claude/effort-truth-frontier-lanes`

## Problem

1. Runs recorded thinking level medium, but requests carried only enable_thinking, so templates used their own default. Proven for Qwen3.8-27B: vLLM /tokenize on f604's first request gave 9,181, equal to the recorded prompt; medium 9,143, low 9,169.
2. Nothing kept weight-edited or knowledge-on runs off the benchmark frontier.

## Decisions

- `reasoning-effort-request-v1` ships ON by default. Effort goes in chat_template_kwargs; top-level reasoning_effort did not change vLLM's /tokenize count.
- `sampling.reasoning_effort_sent` is recorded on every new run. Recording only, never model-facing.
- Old recordings are never edited. No field means no effort sent; `served-effort.ts` names what each lane ran at.
- Custom lane markers must work on pinned builds, so they read the model id, the experiment id and recorded switches.
- Knowledge switches: story-route-plan-v1, objective-graph-supervisor-v1, next-milestone-hint-v1. Two historical think-fast runs (2026-10-15) had the hint on and leave the frontier plot; neither was the frontier.

## Open

- [ ] the operator: GLM-5.3 accepts only low and high. Keep sending the configured level, or map it?
- [ ] DeepSeek: chat_template_kwargs is forwarded through OrcaRouter; whether the provider reads it is unknown.
- [ ] Trainer page still shows thinking_level; changing it needs a design look.

## Milestones

- [x] M1 RED/GREEN, focused checks
- [ ] M2 full gates, regenerate schema, real-browser frontier proof (needs window)
- [ ] M3 Claude, Grok and GPT review; land on main
- [ ] M4 just viewer-main, then launch-check before any new run

## Commits

COMMIT: `test: effort reaches the request and custom lanes stay off the frontier` (a18f90f4e)

## Gates

Focused, 2026-11-04 11:04 PM NY, on main f3aa249fb: tsc agent and viewer clean. Agent reasoning-effort, presence-penalty, play-preset, features, gateway, provider, events: 133 pass. Viewer frontier, panels, next-run: pass. Changed-file eslint clean. schemas/events.v1.json regenerated.
Wiring check: removing sentEffort from playLoopBase turned reasoning-effort.test.ts red (1 failed), restored green (5 pass).
Real data, built viewer on the served 801 runs: best stays 274b, runner-up astra 429f; only two 2026-10-15 think-fast hint runs become custom; a fake edit twin of 274b does not rank.

## Multi-Model Review Log
