# Exact context count (`context-exact-count-v1`)

Requested by the operator via the coordinator (2026-10-27 ~4:59 PM ET) after the HyperQwen 3h control run `2026-10-27T15-23-07_hyperqwen-gpu0_e1f1` ended at turn 178 (4:38 PM ET, `model_error`): context-token-budget-v1 predicted 58,371 prompt tokens, vLLM counted 61,441 (+4,096 reply = 65,537 > 65,536), and the estimate did not read vLLM's 400 wording, so the identical request was sent three times.

Approved scope (coordinator relay of the operator's approval): build the switch, land it, stop runner 37156, relaunch hyperqwen-control-3h on the new pin. Stop and report if a review blocker or a launch re-approval needs the operator.

## Design

- New guard switch `context-exact-count-v1` (needs: null, default OFF; ON in both arms via `experiments/feature-configs/current.json` onInBoth, which changes the recipe hash).
- ON + vLLM lane: `ExactContext.fit` runs in `onPayload` on the final body (after transformContext, dialect and sampling fields; includes system prompt, tools, images, chat template kwargs), counts it with `POST /tokenize`, drops the oldest whole turns until count + max_tokens + reserve ≤ max_model_len.
- ON + llama.cpp lane: `/apply-template` + `/tokenize` for text (media markers stripped) + images × per-image count calibrated from the server's prompt_tokens (IMAGE_WEIGHT until measured).
- ON + gateway/LM Studio/no key: today's estimator, which with ON also reads vLLM's overflow wording.
- Backstop: server usage above our count, or any overflow 400, raises a reserve kept back from later requests, so a retry is never the identical request.
- Count failure: one request falls back to a high estimate with BUDGET_MARGIN (`source: "estimate"`).
- Recorded: `prompt_count` on the assistant event beside `usage`; trims as `compaction`. Bodies are not saved. No timeline change.
- OFF: identical to before (contextBudget, playLoopBase and overflowTokens default paths unchanged).

## Pre-work findings (read-only, 2026-10-27)

- vLLM 0.31.0 `/tokenize` accepts the chat body with tools, images and chat_template_kwargs; 5–25 ms per call.
- Qwen3.8 (Qwen2VLImageProcessor, patch 16, merge 2, min pixels 65,536) upsizes 240×160 to 320×224: 70 vision tokens + start/end = 72 per frame. Estimate charges 1,000.
- llama.cpp `/tokenize` is text-only; `/apply-template` leaves `<__media_…__>` markers.

## M1: switch, exact fit, backstop, recording

- [ ] RED: tests for the vLLM 400 text, the 58,371/61,441 miss shape, OFF unchanged, /tokenize unavailable, whole-turn dropping, counters, recorder, provider, viewer explainer route
- [ ] GREEN + gates (just lint, just test)
- [ ] live check against GPU0 vLLM :18020 (read-only probe)
- [ ] review (Claude CLI, GPT/Codex, fallback; personas: harness engineer, data scientist, ML engineer, evaluation integrity)
- [ ] land ff-only via land board
- [ ] stop runner 37156, relaunch hyperqwen-control-3h, first-turns health

## Live check (before review)

- Probe (scratchpad script, harness dist): e1f1 system prompt, game tools, 6 e1f1 frames, 6 turns, max_tokens 16 → `/tokenize` 5,373, vLLM prompt_tokens 5,373.
- Same with the fit forced to drop turns → 5 turns dropped, `/tokenize` 4,678, vLLM prompt_tokens 4,678.

## Multi-Model Review Log
