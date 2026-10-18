# Field-poison whiteout receipt

## Authorized outcome and scope

The operator asked on 2026-10-18 to remove `blackout-readout-v1` from the fixed control and make the improved fix part of the bundle. The existing frame latch already catches the short `CB2_WhiteOut` callback and delivers a one-shot recovery explanation, including field-poison whiteouts, but native Activity History can still miss the event because it samples only `blackout_active` edges.

This change keeps the existing switch and its OFF behavior. When ON, the observation that consumes the latched whiteout also carries a typed receipt into the recorded state; native activity derives exactly one `blackout` event from that receipt, with the sampled callback edge retained only as the legacy fallback. The fixed bundle turns the switch on and the control leaves it off. No measured runs are started or approved.

## Invariants

- OFF installs no frame hook, adds no state receipt, adds no readout line and preserves the prior sampled-edge activity behavior.
- ON delivers the recovery line and receipt transactionally on the first valid field observation after `CB2_WhiteOut`; a failed observation puts the latch event back.
- One latched whiteout creates one Activity History `blackout` event even when the 120-frame callback occurs wholly between observations.
- The raw-RAM paired decoded state matches the delivered observation state.
- Concurrent route-level raw-RAM pairing cannot interleave JSONL writes.
- A receipt consumed by an internal `navigate_to` press survives the final observation, so the outer result keeps both the exact notice and the durable activity evidence.
- The timeline remains unchanged; the typed event appears in Activity History and replay/raw events only.
- The fixed control has `blackout-readout-v1=false`; the bundle has it true.

## Validation and review

- [x] RED/GREEN Python production-path tests for field-poison ordering, delivery failure and paired raw state
- [x] RED/GREEN TypeScript state-schema/activity tests for receipt priority, exactly-once behavior and legacy fallback
- [x] Fixed-definition test proving control false and bundle true
- [x] Update feature card and explainer; `just pages-check`
- [x] Focused tests, full test/lint/build/coverage/vendor gates
- [ ] Frozen three-lane cloud review before any local-main landing

## Session log

- 2026-10-18: Created isolated worktree from clean main `2b2dec5d`. Confirmed the contradiction: the feature registry and explainer say bundle-only, while `bundle-v-control.json` sets the base true and lists it in `onInBoth`. Confirmed the durable gap: `StateActivities` sees only sampled `blackout_active` false-to-true edges, so a complete callback between observations leaves no `activity(kind=blackout)` event.
- RED: the new production observation tests failed because no `blackout_receipt` existed; the activity and recorder tests produced no event; the actual fixed-definition test found the switch absent from `switches`.
- GREEN: the delivered observation adds `{frame,money_before,notice}` after successful render, pairs that exact state with raw RAM, and returns the event to the latch on any delivery failure. The typed state schema accepts the optional receipt; `StateActivities` records each receipt frame once and retains the sampled false-to-true edge as the old-server fallback. The fixed base is false, control is false and bundle is true.
- Focused proof: Python blackout + observation 32 passed; agent activity + recorder 42 passed; viewer fixed definition + Activity History 137 passed.
- Mutation receipts: deleting the server receipt assignment failed three production-route assertions (one-shot ON delivery, failed-render retry, raw-state pairing). Short-circuiting the TypeScript receipt consumer failed both the activity unit and recorder persistence tests. Both mutations were restored.
- Pre-review edge audit found a same-whiteout double count when an observation saw `blackout_active` and the later field observation carried its receipt. A new RED test reproduced two activities. `StateActivities` now counts unmatched sampled-edge fallbacks and consumes one when the corresponding new receipt arrives; a later receipt with no sampled edge still emits. Focused activity + recorder tests: 43 passed.
- Full pre-review gates after the deduplication repair: `just test` passed (agent 2,457; viewer 1,171; Python 2,708), `just lint`, `just build`, `just verify-vendor`, `just schema`, and the explainer `just pages-check` passed. Coverage passed: agent 98.00% statements / 94.26% branches / 98.32% functions / 99.23% lines; viewer 95.42% / 91.45% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.
- Canonical `main` advanced to `33f9ff8a` before review. Merged it without conflict, then reran the complete proof on the integrated candidate: `just test` passed (agent 2,457; viewer 1,171; Python 2,708), and `just lint`, `just build`, `just verify-vendor`, `just schema`, `just pages-check`, and `just coverage` all passed. Integrated coverage: agent 98.00% statements / 94.27% branches / 98.32% functions / 99.23% lines; viewer 95.42% / 91.46% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.
- Review round 1 packet `cc4de63e` / diff SHA-256 `fee91f11…13031`: GPT returned LGTM. The standalone Claude login was expired; the authenticated Claude fallback exhausted its Opus allowance before verdict but exposed a valid blocker: moving `RawRamArchive.pair()` after render also moved the switch-OFF/control path outside the existing frame lock, weakening archive serialization. Grok was stopped before verdict after independently converging on the same issue. Accepted and reproduced RED by asserting OFF-path pairing holds the frame lock. Repair keeps legacy OFF pairing inside `capture()` under that lock, while only the switch-ON path pairs after receipt insertion under the latch's delivery lock. Focused Python observation/blackout tests: 32 passed. A new frozen packet and the complete three-family roster are required.
- Post-repair complete proof: `just test` passed (agent 2,457; viewer 1,171; Python 2,708), and `just lint`, `just build`, `just verify-vendor`, `just schema`, `just pages-check`, and `just coverage` passed. Coverage: agent 98.00% statements / 94.26% branches / 98.32% functions / 99.23% lines; viewer 95.42% / 91.46% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.
- Canonical `main` advanced again to `ab5091ca`; merged without conflict. Final integrated pre-round-2 proof passed: `just test` (agent 2,459; viewer 1,171; Python 2,708), `just lint`, `just build`, `just verify-vendor`, `just schema`, `just pages-check`, and `just coverage`. Coverage: agent 98.01% statements / 94.27% branches / 98.32% functions / 99.23% lines; viewer 95.42% / 91.46% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.
- Review round 2 packet `6e493ec4` / diff SHA-256 `d2dcf95c…a59a6b`: GPT and the first distinct-model Claude-availability fallback returned LGTM. Claude CLI authentication was expired and Cursor's Claude allowance was exhausted. Grok blocked on concurrent ON-path observation pairing versus `/state`/battle-wait pairing against the same archive. The second distinct-model fallback independently blocked on an end-to-end delivery gap: production `navigate_to` consumed the one-shot receipt in its internal press, replaced that observation with a final observe result, and therefore exposed neither the notice nor an activity to the recorder. Both findings were accepted.
- Round-2 repairs: `RawRamArchive` now serializes every paired JSONL append internally, independent of route locks. The receipt now carries its exact rendered notice; `navigate_to` retains a receipt seen on an internal press, adds it to the outer state when the final observation has none, and returns the notice to the model once. A concurrent archive-write regression and a production `gameTools` + `withNavigation` + `RunRecorder` regression prove the two failures. Focused proof: Python raw/archive/blackout/observation 50 passed; agent activity/recorder/navigation 56 passed. Per review policy, no round 3 or landing begins without operator scope confirmation.
- Complete post-repair gates passed: `just test` (agent 2,460; viewer 1,171; Python 2,709), `just lint`, `just build`, `just verify-vendor`, `just schema`, explainer `just pages-check`, and `just coverage`. Coverage: agent 98.01% statements / 94.29% branches / 98.32% functions / 99.23% lines; viewer 95.42% / 91.46% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.
- Operator confirmed unchanged scope for review round 3. GPT and Grok returned LGTM. Both distinct-model Claude-availability fallbacks independently reproduced a blocker in the production `gameTools` → `playGameTools` → `RunRecorder` path: dialogue auto-advance could consume the receipt in an internal press, replace it with a later observation, and return no notice, receipt or activity. One reproduction used `press [RIGHT,A]`; the other used the actual fixed-bundle settings and `press [B,B]`. Accepted as the same observation-replacement failure class.
- Round-3 repair centralizes one-shot preservation in `BlackoutCarry` and applies it to navigation, dialogue/battle auto-advance, and `battle_action`. The outer result retains the first internal receipt in its typed state and adds its exact notice only when later result text does not already contain it. Production `playGameTools` + `RunRecorder` and battle-action regressions cover the newly found paths; focused lint and 218 tests pass. A new cumulative review packet is required.
- Complete post-round-3-repair gates passed: `just test` (agent 2,462; viewer 1,171; Python 2,709), `just lint`, `just build`, `just verify-vendor`, `just schema`, explainer `just pages-check`, and `just coverage`. Coverage: agent 98.00% statements / 94.28% branches / 98.28% functions / 99.23% lines; viewer 95.42% / 91.46% / 93.87% / 97.65%; Python 97.66% lines / 93.82% branches / 100% functions.

## Archive milestone

- [ ] ASK USER: archive after reviewed landing and live verification
