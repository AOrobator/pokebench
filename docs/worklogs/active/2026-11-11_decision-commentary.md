# Decision commentary and readable agent text

Status: source reviewed, landed and activated after the operator’s restart instruction; see af33 launch receipt and boot-video worklog.

## Problem Statement
The operator requests extra observability early in the Astra run. Native Responses often returns only tools. The viewer also hides reply text when thinking exists and clears its panel at the next turn. Build brief model commentary, clearly separate from exposed reasoning, without another provider request or wrapper.

## Skills Loaded
feature-switch, agent-observability, steady-screen, viewer-e2e, feature-explainer, execute-worklog, close-the-loop, talk-to-claude, multi-model-review.

## Architecture
One optional default-OFF `decision-commentary-v1` prompt paragraph flows through existing playSystemPrompt, including screenshot and JIT variants. No new tools or persistence: existing assistant.text, deltas and raw provider capture own storage. Viewer renders both fields with labels, retains the preceding reply while waiting for new text; tool-only replies explicitly report missing text, with original turn attribution.

## Invariants
- INV-1 OFF preserves prior prompts byte-for-byte; ON requests brief observable evidence/intent/action explanation, not private reasoning. Tests on actual prompt factory, screenshot and JIT core.
- INV-2 No extra model calls, parsing protocol, forced retry, gameplay action or stop condition. Existing recording remains authoritative.
- INV-3 Displayed commentary and reasoning remain distinct and HTML escaped; older text names its originating turn; replay never looks ahead.
- INV-4 Active ef7d runtime and logs untouched. Source readiness and landing do not authorize stopping/restarting gameplay or changing its prompt.

## Security Review
No credentials, network destination or persistence changes. Escape model-provided strings at renderer.

## Milestones
M1 — Source readiness: prompt switch plus panel readability through existing recorder/RunView/panels. Tests RED/GREEN, adversarial wiring removal, cheap checks, full gates, real recorded transcript check, isolated browser proof and independent reviews. Terminator: both fields visible, empty turns honest, preceding reply retained during the next request and attributed; no active-run mutation. Split triggers: new tool/provider, live prompt injection, new capture store, history redesign.
M2 — Landing: classify upstream impact, serialize local FF, post-main tests. No feature code.
M3 — Activation: viewer refresh and gameplay prompt activation require explicit operator decision after source is reviewable. Current run remains untouched.

## Closing the Loop
Focused factory/renderer tests; raw Responses to assistant.text/thinking reconciliation; headless built-viewer Chromium/WebKit desktop+phone streaming/poll continuity and replay; explainer card link/browser screenshots. Retain receipts under runs/decision-commentary-20261111.

## Session Log
- Authorized by the operator: “we're not that far in, i think it'd be worth building in some extra observability wdyt”. Implementation scoped to prior discussed short commentary and viewer readability.
- Base 49174be8b. Active runtime stays dc5436a3a. Existing viewer screenshot confirms blank active-turn panel.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] the operator approval to archive.

- Capture reconciliation: 139 completed native replies, 19 with text, 2 with exposed summary; zero differences vs assistant.text/thinking. Raw RAM index present (1.5 MB).
- First full candidate gates PASS: 3053 agent / 1310 viewer / 3466 env / 39 gateway; lint PASS. Vendor initially absent in isolated checkout; initialized unchanged pin, PASS. Trainer-card initial proof lacked ignored art; canonical POKEBENCH_CARD_ART rerun 3/3 PASS, no baselines changed.
- Browser continuity found 56.7 px desktop / 94.5 px phone displacement in Chromium/WebKit when waiting labels were inserted above preceding text. Bounded correction within panels.ts: identical attributed markup during completion and next-request waiting. No new state/public schema or app owner. Final proof pending.
- Mutation prompt-wiring RED/GREEN preserved. First renderer mutation attempt unproven (isolated dist missing); second correctly failed on absent commentary and restored GREEN (181 tests).

- Final source gates PASS: just test (3053 agent, 1310 viewer, 3466 env, 39 gateway; floors and no-I/O guards), just lint, just verify-vendor; final exact-card proof 3/3 unchanged.
- Built-source headless matrix PASS: Chromium/WebKit ×1280/1440/375, both fields escaped, preceding turn retained, fresh text replaces it, 2+ forced polls, focus held; max tracked-row displacement 0.1875px. Kept original failed movement receipts. Initial scratch lacked ignored art and connected read-only to the original game stream; final scratch instead copies approved art and points to unused game ports, with recorded-frame fallback. The expected unavailable-stream warning is isolated fixture behavior, not an active-run claim.
- Served /app/panels.js SHA256 exactly equals final compiled module (served-source.json). Explainer card click→document passed at1280/1440/375, no overflow/page errors; no changes to shared8790.
- Source now frozen for independent Claude/GPT reviews, Grok standing all-branch waiver explicitly confirmed by relay 2026-11-12T02:08:57Z. No gameplay/compliance/speed improvement claimed. Real model sampling and activation remain held.

- M1 source readiness complete. Frozen bfb54c4c8 / base49174be8b / exact diff8e13d017cb8e56f86c7eac80723535da8a643823289390f29a7e58bba4a5a866. Claude CLI and fresh no-history GPT commentary_review both VERDICT: LGTM, clean packet independently reproduced before/after. Grok standing waiver disclosed. Synthesis and all PB1–PB13/nine test-quality checks recorded in ignored evidence packet; no accepted source fixes or scope growth. State-only (different prompt owner) support and stronger generic markup pins are follow-ups, not Astra activation claims.
- Actual recorded turn82/assistant2347 verified through current panel and clicked Agent Trace raw inspector: both fields present, no page errors. Replay fixture changes only identity and game port, preserves source prefix and recorded frames. All final screenshots at1280/1440/375 inspected. Shared viewer and ef7d untouched.
- M2 landing pending. M3 activation held for operator decision; no source changes remain.

- M2 complete: current main stayed49174be8b throughout frozen review; no upstream contract delta or evidence invalidation. Board#1 verified with exact CODEX_THREAD_ID 00000000-0000-4000-8000-f963182cab76. FF merge to adc35182d; post-main just test/build PASS3053 agent+1310 viewer+3466 env+39 gateway, floors/no-I/O PASS. CPU RELEASE sent. Final evidence-only commit contains no runtime/policy/authorization change.
- M3 remains held. Source preparation fully complete; no source work remains. Shared8790 PID61682 and active ef7d PID70357 PPID1 unchanged. Owned scratch viewer/projector stopped; originals preserved. Prepared next-run preset at runs/launch-receipts/astra-commentary-20261111/preset.json adds only decision-commentary-v1:true to existing authorized variant, all existing fields/limits unchanged; not launched. Canonical8791 explainer returns200. Operator must explicitly instruct stop/restart and viewer refresh before activation; no model compliance/latency/gameplay benefit claimed.

- Authorized activation complete2026-11-11: The operator approved restart from boot and viewer refresh, adding automatic video for boot runs. Boot-video source landed b87c50669, required post-main checks passed, viewer/projector0ac4ac689 active. Replacement2026-11-11T23-10-48_astra-commentary-rayquaza_af33 at23:16:19ET, native Astra medium, same24h/operator and20000turns/preset.45 initial completed replies all contain saved commentary and all native response hashes complete; video/audio growing and raw RAM validated. Desktop/phone actual Watch and commentary proof inspected. Source/launch details in2026-11-11_boot-video-default.md and runs/launch-receipts/astra-commentary-20261111. Old ef7d preserved; no more activation hold, no additional stop condition.
