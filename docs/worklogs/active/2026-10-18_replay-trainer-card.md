# Trainer card for replays

## Problem Statement

The operator (2026-10-18): "the trainer card should show for replays, it just shouldn't mark as live."

The viewer header originally built trainer cards only from runs that are currently live. The selected replay should get a dotless `REPLAY` trainer card only when there are no live runs to show; live-run cards take precedence and must not be mixed with a replay card.

## Architecture

- Viewer UI only; no harness behavior change and no feature switch.
- Prefer current live/paused cards. Fall back to the selected ended run only when that live card set is empty.
- Add a presentation-only `replay` card state. It is selected (`aria-pressed=true`) but renders `REPLAY` with no live dot.
- Keep the existing artless fallback unchanged.

## Milestones

**M1 — selected replay card**
- [x] RED: `trainer-card-app.test.ts` adds an ended selected run and requires its selected `REPLAY` card without a live dot while both live cards remain `LIVE`. Focused result: 1 failed / 12 passed because the replay card was absent.
- [x] GREEN: the selected ended run joins the stable card row as a selected `REPLAY` card; replay and paused states have no live dot, and the phone sheet calls the mixed collection `RUNS`. Focused trainer-card/app/header tests: 47 passed.
- [x] Gates: focused 47/47; after merging current `main` (`bccae604`), `just build`; `just test` (agent 2,527, viewer 1,190, Python 2,709); `just lint`; `just coverage` (agent 97.99/94.15/98.32/99.25, viewer 95.42/91.50/93.84/97.64, Python lines 97.64 / branches 93.77 / functions 100); `just verify-vendor`.
- [x] Browser proof on owned preview 8798 over a clone-on-write scratch copy of the selected replay plus two live runs. The replay reached `REPLAY`, showed its recorded frame, was selected, said `REPLAY`, had zero live dots, and remained so through two 5-second workbench polling cycles. Pointer and keyboard activation each selected a live card, retained keyboard focus, reached `RUNNING`, showed the live screen endpoint and restored `WATCHING` plus one live dot. Screenshots at 1280, 1440 and 375 were captured and visually inspected; at 375 the open phone sheet showed the replay first under `RUNS · TAP TO WATCH`, followed by two live cards. No application console errors; browser-extension warnings only. The browser-control surface did not expose persistent screenshot paths, so the inspected captures are in the task tool record rather than `runs/`.
- [x] Subagent review and landing: the operator-authorized fresh `gpt-6-astra` reviewer returned literal `VERDICT: LGTM`; reviewed commit `caabc58f` was fast-forwarded onto local `main`; the complete post-merge suite passed; and the real 8790 viewer showed the selected ended run as a selected, dotless `REPLAY` card alongside both `LIVE` cards.

**M2 — live-card precedence correction**
- [x] RED: selecting a replay while live runs exist expected two live cards but received three cards because the replay was mixed in; the no-live fallback case was added at the same consumer seam.
- [x] GREEN: card input selection implements live-first, replay-only fallback behavior without changing replay playback. Focused app result: 14/14.
- [x] Gates: focused trainer-card/app/card-DOM/run-head tests 51/51; `just build`; `just test` (agent 2,527, viewer 1,191, Python 2,480 with 229 ROM-dependent skips); `just lint`; `just coverage` (agent 97.99/94.15/98.32/99.25, viewer 95.42/91.51/93.84/97.64, Python lines 97.47 / branches 93.37 / functions 99.43); `just verify-vendor`.
- [x] Owned-preview browser proof on candidate build `0563939`: with the real runs root and the ended replay selected, the page stayed in `REPLAY` mode through two workbench cycles while its card count was zero and the two live cards remained present, unselected, labelled `LIVE`, and dotted. On an isolated runs root containing only that ended recording, one selected `REPLAY` card appeared with zero live dots and remained stable across another poll. Both previews had no visible problems or console errors; screenshots were visually inspected in the task record.
- [ ] Fresh subagent review and landing.

## Evidence

- Baseline on the existing 8790 viewer, run `2026-10-18T22-47-51_qwen36-gpu0_849c`: the page reached `REPLAY`, but `data-ui="run-cards"` contained only the two live dry-run cards and no card for the selected replay.

## Multi-Model Review Log

### Round 1 — blocked by cloud reviewer availability

- Frozen code packet: base `5e2701f3cae372983e8314c2ffd18eea209a7b0f`, head `cad7fd38a404224db4f223aa4f608163768343d5`, binary-diff SHA-256 `b4de3fc10681beafad2ea7588dc6f9770923a4259511eaa9a08fa34b929e8085`.
- Principles Adherence covered PB1–PB13: 6 PASS, 7 N/A, 0 FAIL.
- Claude-family: unavailable. The standalone Claude reviewer profile reported `loggedIn: false`; Cursor Opus, Sonnet, Haiku and Fable each returned the account usage-limit error before producing reviewer output.
- GPT-family: unavailable. Cursor `gpt-5.6-sol-xhigh` returned the same account usage-limit error before producing reviewer output.
- Grok-family: incomplete. Cursor `cursor-grok-4.5-high` remained active without stdout or stderr for more than eight minutes; it was stopped once the two other unavailable mandatory cloud lanes had already made self-landing impossible. No verdict was inferred from silence.
- Frozen-packet post-check: candidate remained clean at `cad7fd38`; diff digest remained byte-identical.

### Review Synthesis

- Contract being proved: a selected ended replay remains visible as a selected, dotless `REPLAY` trainer card alongside current live cards.
- Frozen boundary: viewer card-input and presentation owners only; no discovery, persistence, playback, lifecycle, harness or API changes.
- Test quality: the new app integration test reaches the real card consumer seam, uses exact fixture-owned run IDs and exact card counts, and was observed RED before the production change; it adds no globals, concurrency, suppression, loops, I/O or production-sized bounds.
- Findings: none were returned because no reviewer completed. This is not a green review.
- Missing evidence: literal `VERDICT: LGTM` from Claude-, Grok- and GPT-family cloud lanes on one frozen packet.
- Disposition: implementation and deterministic/browser evidence are complete, but review and local-main landing remain blocked by reviewer availability under the PokeBench landing contract.

### Round 2 — operator-authorized subagent review and landing

- Operator amendment (2026-10-19): "get it reviewd with a subagent then land on main". This directly authorizes one fresh read-only subagent review to replace the unavailable cloud roster for this candidate and authorizes landing after its LGTM.
- Synced current `main` (`bccae604`) into the candidate and reran every deterministic gate successfully before freezing the new packet.
- Frozen code packet: base `bccae6040af6173f5b15dc77cc39f77aa15a79b2`, head `caabc58f873e52b0d1c16f45a9340fb8172d3439`, binary-diff SHA-256 `3ee76c71c8ce03d145f6fe04cb74ad5253be4d737f4f124557b9df351ccc64fd`. The candidate head and digest were unchanged before and after review.
- Fresh read-only subagent `/root/review_replay_card` used `gpt-6-astra` at `xhigh`, inspected the exact frozen packet and principles boundary, independently ran the focused viewer tests (47/47), and found no blocking correctness, security, scope or principles issue. Final result: `VERDICT: LGTM`.
- Adversarial mutation evidence on a disposable checkout of the exact reviewed head proved each new presentation operand independently: changing `REPLAY` to `LIVE` failed the new assertion at line 151; adding a replay live dot failed line 152; and clearing replay selection failed line 150. Restoring the packet returned the focused app test to 13/13.
- Landing receipt: local `main` fast-forwarded to reviewed commit `caabc58f873e52b0d1c16f45a9340fb8172d3439`. Required post-merge `just test` passed: agent 2,527, viewer 1,190, Python 2,709.
- Live receipt (2026-10-19 00:17 EDT): after a concurrent owner completed its own 8790 restart, the served newer build `e9a46a43` was verified to contain reviewed commit `caabc58f`. On the real viewer, selecting ended run `2026-10-18T22-47-51_qwen36-gpu0_849c` produced its trainer card with `aria-pressed="true"`, one `REPLAY` label and zero `.tc-dot` elements; both current live cards remained present, unselected, and labelled `LIVE`. The viewer had one listener on 8790, `/api/workbench` was healthy apart from its normal loading-progress notice, and both live gameplay agents plus both game servers remained running. Another task subsequently advanced local `main`; ancestry checks confirm the reviewed replay-card commit remains landed.

### Round 3 — live-card precedence correction

- Operator clarification (2026-10-19): "the replay card shouldn't be visible when there are live runs". The corrected contract is live cards only whenever any live cards exist, otherwise the selected ended run appears as the sole dotless `REPLAY` card.
- First frozen packet: base `24232e63b025be83dde539d812345dc5f7580e89`, head `01383dd4095ca41de1fc0e2e5d5e797f4684014b`, binary-diff SHA-256 `6912a850533f9013cc4fbd2de3d6dd5b13ab56b7dc8e43cc8515efbc494b549f`.
- Fresh read-only subagent review returned `VERDICT: CHANGES REQUESTED`: `/api/runs` and the retained workbench snapshot can temporarily disagree, allowing a stale-live workbench record to mark replay fallback `WATCHING`, or an ended workbench record to enter a stale live row.
- Fix: run discovery now selects the mode, but workbench records must match it. The live branch admits only `live`/`paused` workbench records; the ended-run fallback always presents as `REPLAY`. Two disagreement tests cover stale workbench-live fallback and stale run-list-live exclusion. Focused app result: 16/16.
