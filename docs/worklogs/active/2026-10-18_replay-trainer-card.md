# Trainer card for replays

## Problem Statement

The operator (2026-10-18): "the trainer card should show for replays, it just shouldn't mark as live."

The viewer header builds trainer cards only from runs that are currently live. When the operator selects an ended recording, the replay itself disappears from the card row while unrelated live runs remain. The selected replay should keep its trainer card and identify itself as `REPLAY`, without a live dot.

## Architecture

- Viewer UI only; no harness behavior change and no feature switch.
- Keep the selected ended run in the shared trainer-card inputs alongside current live/paused runs.
- Add a presentation-only `replay` card state. It is selected (`aria-pressed=true`) but renders `REPLAY` with no live dot.
- Keep the existing artless fallback unchanged.

## Milestones

**M1 — selected replay card**
- [x] RED: `trainer-card-app.test.ts` adds an ended selected run and requires its selected `REPLAY` card without a live dot while both live cards remain `LIVE`. Focused result: 1 failed / 12 passed because the replay card was absent.
- [x] GREEN: the selected ended run joins the stable card row as a selected `REPLAY` card; replay and paused states have no live dot, and the phone sheet calls the mixed collection `RUNS`. Focused trainer-card/app/header tests: 47 passed.
- [x] Gates: focused 47/47; after merging current `main` (`bccae604`), `just build`; `just test` (agent 2,527, viewer 1,190, Python 2,709); `just lint`; `just coverage` (agent 97.99/94.15/98.32/99.25, viewer 95.42/91.50/93.84/97.64, Python lines 97.64 / branches 93.77 / functions 100); `just verify-vendor`.
- [x] Browser proof on owned preview 8798 over a clone-on-write scratch copy of the selected replay plus two live runs. The replay reached `REPLAY`, showed its recorded frame, was selected, said `REPLAY`, had zero live dots, and remained so through two 5-second workbench polling cycles. Pointer and keyboard activation each selected a live card, retained keyboard focus, reached `RUNNING`, showed the live screen endpoint and restored `WATCHING` plus one live dot. Screenshots at 1280, 1440 and 375 were captured and visually inspected; at 375 the open phone sheet showed the replay first under `RUNS · TAP TO WATCH`, followed by two live cards. No application console errors; browser-extension warnings only. The browser-control surface did not expose persistent screenshot paths, so the inspected captures are in the task tool record rather than `runs/`.
- [ ] Multi-model review and landing.

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
