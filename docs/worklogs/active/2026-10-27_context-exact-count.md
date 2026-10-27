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

- [x] RED: tests for the vLLM 400 text, the 58,371/61,441 miss shape, OFF unchanged, /tokenize unavailable, whole-turn dropping, counters, recorder, provider, viewer explainer route. COMMIT: `test: RED for context-exact-count-v1 (vLLM tokenize fit, overflow wording, prompt_count)` (bb2d1d399)
- [x] Wiring red check: disabling the ON branch in `contextBudget` turned the factory test red (1 failed); restored, green.
- [x] GREEN. COMMIT: `feat(agent): context-exact-count-v1 counts each request on the serving vLLM or llama.cpp server` (6b1e41a8f); merged main (e53bcdbe9); `just schema` regenerated schemas/events.v1.json for `prompt_count`.
- [x] Gates on the merged tip: `just lint` JS clean; Python ruff/format clean, mypy clean with main's venv (worktree venv has no native mGBA binding; no Python changed). `just test`: agent 4562 passed (96.47 lines / 92.67 branches / 97.56 funcs), viewer 2073 passed (95.8 / 91.63 / 95.31), pytest 4430 passed + 1 failed (`test_view.py::test_production_main_registers_view_pcm_and_browser_module_before_vendor_main`: `ModuleNotFoundError: No module named 'mgba'` in the worktree venv; passes 1/1 with main's venv), Python TOTAL 96%.
- [x] live check against GPU0 vLLM :18020 (see Live check)
- [ ] review (Claude CLI, GPT/Codex, fallback; personas: harness engineer, data scientist, ML engineer, evaluation integrity)
- [ ] land ff-only via land board
- [x] ~~stop runner 37156, relaunch hyperqwen-control-3h~~ cancelled by the operator via coordinator (5:32 PM ET); GPU0 reassigned

## Live check (before review)

- Probe (scratchpad script, harness dist): e1f1 system prompt, game tools, 6 e1f1 frames, 6 turns, max_tokens 16 → `/tokenize` 5,373, vLLM prompt_tokens 5,373.
- Same with the fit forced to drop turns → 5 turns dropped, `/tokenize` 4,678, vLLM prompt_tokens 4,678.

## Multi-Model Review Log

Round 1 (packet 1: base 5940bc2fb, head ebfe4cfa6, diff sha256 07db679f…e929; Grok absent from `cursor-agent --list-models`, so the third lane is a fresh read-only Sonnet subagent):
- Claude CLI (~/.claude-review, plan mode): LGTM. Follow-ups: turn_start.context is pre-fit; calibrate after a fallback (same as GPT #2); compaction from exact to estimate after a mid-fit failure; PB7 row misnamed prompt_sha256 (it hashes the system prompt).
- GPT (Codex CLI gpt-5.6-sol, read-only): BLOCKING. #1 state-only requests bypass the exact fit (live.ts builds a fresh playLoopBase for runStateMode) → Fix. #2 llama.cpp calibration after a mid-fit count failure uses the last unsent candidate's text/image counts → Fix. Follow-up: component_chars is pre-fit.
- Fallback (Sonnet subagent): LGTM. Follow-ups: walk-up from cut 0 costs one /tokenize per dropped turn; no abort signal/timeout on /tokenize; stale `last` (same as GPT #2); a /tokenize blip over-trims one turn; other vLLM overflow wordings; ON with no key and budget OFF has no guard; reserve not in continuation snapshot.
- RED for #1/#2: state-runtime-wire exact-count case and llama late-failure calibration case fail (2 failed).
- GREEN for #1/#2: `runStateMode` takes the run's ExactContext (fit after base.onPayload, observe on message_end) and live.ts passes it; llamaCppCounter clears `last` per count and ExactContext calibrates only after a counted, sent request. Wiring red check: forcing the state base back to `options.base` turned the exact-count state case red (1 failed); restored.
- Gates on the fix: agent 4564 passed (96.47/92.67/97.56), viewer 2073 passed (95.8/91.63/95.31), pytest 4430 passed + the same 1 worktree-venv mGBA failure, Python 96%; lint JS clean, mypy clean with main's venv.
- Coordinator 2026-10-27 5:32 PM ET: step 8 (stop 37156, relaunch HyperQwen) cancelled; GPU0 goes to a 24h Qwen 3.6 bundle run. No further live vLLM calls.

Round 2 (packet 2: head 5a6178d3e, diff sha256 0fe315f1…1f66):
- Fallback (Sonnet subagent): LGTM. Follow-ups: no abort signal in the state-mode fit; mixed exact/estimate compaction after a mid-fit failure.
- Claude CLI: BLOCKING. With just-in-time-prompt-v2 ON, the exact fit runs after JIT v2 projects its guide onto a history turn, so dropping that turn drops current guidance (current recipe has JIT v2 offInBoth) → Fix: `exactCountProblems` refuses the pair at launch (live.ts, beside stateOnlyProblems). A first attempt in dependencyProblems broke three ALL_ON registry tests in other switches' files, so it moved to the launch check.
- GPT (Codex): BLOCKING on test fixture cost (a third full state-runtime server row; a standalone viewer explainer fixture) → Fix: the state wire table keeps two rows (non-malformed with exact ON, malformed with exact OFF), and the explainer joins the existing shared explainer table.
- Gates: agent 4564 passed (96.47/92.67/97.56), viewer 2072 passed (95.8/91.64/95.31), pytest 4430 + the known worktree-venv mGBA failure, Python 96%; lint JS clean.

Round 3 (packet 3: head f31ebbab6, diff sha256 13ce3356…aff46):
- Fallback (Sonnet subagent): LGTM. Follow-up: the JIT v2 refusal is launch-only, not in preset validation.
- Claude CLI: LGTM. Follow-up: play-preset/next-run do not call exactCountProblems.
- GPT (Codex): BLOCKING. #1 the feature text and explainer promised prompt_count on every turn, but estimator-only lanes (gateway, LM Studio, no key) record none → Fix: wording now says prompt_count is recorded on vLLM and llama.cpp lanes and those lanes carry none (behavior unchanged). #2 the shared gate never passed whole at the head (worktree venv lacked mGBA) → Fix: worktree venv given the mGBA binding as fixed-tree.ts does; trainer-card check pointed at main's card art with POKEBENCH_CARD_ART.
- Gates at the round-4 tip: `just lint` exit 0; `POKEBENCH_CARD_ART=~/dev/pokebench/runs/sprites/trainer-card-v1 just test` exit 0: agent 4564 (96.47/92.67/97.56), viewer 2072 (95.79/91.63/95.31), pytest 4431 passed (96%), claude-gateway 60 passed (99%), trainer cards 3 passed.

Round 4 (packet 4: head 6b6343212, diff sha256 3ca2f78e…43aa; notes below not committed, so the reviewed diff stays frozen):
- Fallback (Sonnet subagent): LGTM.
- Claude CLI: LGTM. Follow-ups: pass an AbortSignal/timeout into fit; fields like reasoning_effort not sent to /tokenize (bounded by the usage reserve); PB8 row should say the estimate fallback has no run log yet and is approved by design.
- GPT (Codex): BLOCKING, only on fixture shape: the new explainer row in the shared explainer-route table adds 2 reads, 1 write, 1 GET. Proposed rebut: that table is the repo's existing pattern for every explainer, the feature-explainer skill requires the route test, and the double read is pre-existing code. Non-blocking: mixed exact/estimate compaction, walk-up cost, launch-only JIT v2 refusal.
- STOP: a cloud lane is still blocking after round 4, so no self-merge. Asked the operator (via coordinator): land as is over GPT's fixture-shape block, or change the test and run round 5.
- The operator chose "Land it now" over GPT's round-4 fixture-cost block (relayed by the coordinator, 2026-10-27 6:24 PM ET). Final verdicts on packet 4: Claude LGTM, fallback LGTM, GPT BLOCKING (fixture shape only).
