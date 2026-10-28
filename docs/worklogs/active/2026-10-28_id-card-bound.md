# Bound other pages on person ID cards

## Problem Statement
The approved spec (e) bounds only the ID card’s “Other pages that name them” list. Keep a contiguous newest suffix of whole quoted lines within 1,500 Unicode code points, then show those lines oldest first. The newest page always stays, including an oversized page. OFF and ON without omissions preserve the previous bytes. Other card lines and the fingerprint from the full list remain unchanged.

Authority: the Claude coordinator’s delegation from chat `00000000-0000-4000-8000-f5efe0494f81` assigns `/Users/user/dev/pokebench/runs/analysis/bounded-input-20261028/specs/e-id-card-bound-v1.md`. The operator approved default OFF and bundle-only ON in a separate activation commit: “they all need to be on in the bundle.” This worklog translates that approved contract without expanding it. The branch is `codex/id-card-bound`, based on `6cffebd98`. No gameplay or inference is authorized here; GPU0 is off limits.

`people-id-cards-v1` is ON in both current arms. The new bound therefore deliberately makes the arms differ in card size. The user’s explicit ruling that switches are an unordered set supersedes the spec’s absolute-index assertion: tests check membership, uniqueness, dependency, defaults and recording, without an ordering requirement.

## Skills Loaded
Feature-switch, feature-worklog, feature-explainer, execute-worklog, agent-observability, viewer-e2e, talk-to-claude and close-the-loop. Multi-model-review applies before landing. CLAUDE.md was read.

## Architecture
PeopleIdCards remains the archive, rendering and fingerprint owner. The change bounds only the `quote(other)` projection; `other` itself remains intact. `codePoints` comes from instruction-memory-cap.ts. Optional constructor arguments are appended after `named` and `cuts`, and production wiring binds each flag explicitly. DialogueRecord remains the recall owner. There is no new cache, archive, model or utility.

## Invariants
- INV-1: OFF and no omissions preserve exact bytes; all other card lines and the full-list fingerprint stay unchanged.
- INV-2: Whole lines only. Count the two-space indent and separators in code points; keep a contiguous newest suffix and show it oldest first. Keep the newest page even if oversized. Use exact singular/plural omission headers.
- INV-3: Mention get_dialogue only when the existing tool is available; prove it retrieves omitted pages from the shared recorded source.
- INV-4: The actual playGameTools → withPeopleIdCards production path honors the switch. A performed factory deletion turns the test RED, then restores GREEN.
- INV-5: Register an observation switch requiring people-id-cards-v1, default OFF. Keep bundle activation in its own approved commit and control OFF. Do not rewrite historical headers or modify active runs.
- INV-6: Check every recorded card in GLM0d5d, a702 and88ea. OFF mismatches must be zero. Report the largest OFF→ON pair and largest ON card, distinguishing the newest-page exception from a hard cap.

## Security Review
Only already-delivered text is projected. No privileged state, new tool, game writes, network inference, credentials or ROM copies are added. Existing pageLine quotes whole pages. The approved archive and fingerprint stay intact. Full suites and full replays require a coordinator START; small targeted tests and offline preparation proceed meanwhile.

## Milestones
**M1 — RED**
- [x] Cover suffix, OFF, small lists, newest exception, astral boundaries, singular/plural headers, recall, fingerprint, production wiring and registry behavior.
- [x] Commit RED before implementation: `7857116ec`, 6 intended failures and2 passes.

**M2 — GREEN**
- [x] Add the projection to the existing owner, standard switch plumbing and explainer.
- [x] Targeted GREEN: 29 tests, including8 new and21 incumbent card tests. Commit `980d2e378`.
- [x] Eight independent deletion mutations fail by assertion, then restore29 GREEN. Two further production factory mutations fail after strengthening the fixture, then restore29 GREEN.
- [x] Prepare a separate approved activation commit: `b542c74f3` adds the switch to current.switches and sets current.features[id] to false. Review and land this commit together with the implementation; resolved arm verification remains pending build.

**M3 — Verify and review**
- [x] CPU START; synced main52a565418, then passed build, lint, full replays, arm checks, full coverage, vendor and protected-card checks serially.
- [x] Headless feature card → explainer, collapsed/expanded examples and Activity History → exact raw payload pass at1280/1440/375. All12 screenshots inspected; no horizontal overflow or JS errors; no desktop focus changes.
- [x] PB1–PB13 self-review, frozen boundary/packet and independent reviews completed. Claude, GPT, Sol and Astra return LGTM; Grok quota outage and reduced vendor diversity are recorded below.

**M4 — Land and activation**
- [x] Reviewed implementation and separate activation commit landed fast-forward through board position1 at15:32, source mainabaadae4c.
- [x] Actual served-runtime modules and current recipe resolve global OFF, bundle ON/control OFF in all3 protocols. No runs launched; active prompts and frozen recipes untouched.
- [x] Separate coordinator START; post-main build/fulltest pass, one locked clean-runtime viewer refresh, active processes and real-page proof pass. Evidence committed and board released after this record.

## Closing the Loop
Use exact model-facing lines and full recorded-card parity, then verify the card and explainer on the merged viewer. Keep implementation, recipe activation and live inference distinct. A shorter card is context-size evidence, not gameplay-benefit evidence.

## Session Log
- Accepted the delegation; read the spec, skills, card owner and DialogueRecord. The latter collects the same dialogue_auto_advance pages used by the card archive.
- Created the managed worktree from6cffebd98. Offline package installation, submodule setup and uv sync pass. The worktree reuses the canonical native mGBA binding; actual imports of mgba.core and mgba.image pass.
- RED: eight tests ran, with six intended failures and two passes. No fixture/schema errors. The OFF/small-list and full-fingerprint cases already passed on the incumbent.
- GREEN: 29 targeted tests pass. Production behavior changes by19 lines in the existing owner, with standard registration and documentation. There is no new runtime owner.
- Mutation receipts are in runs/id-card-bound/mutations-r0: factory flag, bound branch, newline count, UTF-16 versus code-point count, newest exception, full fingerprint, recall wording and whole lines each fail by assertion; restored29 GREEN.
- Strengthened the production fixture to the valid people-ledger and auto-advance tool chain. An initial simple fake press was rejected by the existing ordinary-tool guard; its failure log is preserved. The replacement uses the normal checked-press adapter with a rejecting network port that is never called. The attached get_dialogue retrieves an omitted page. Fresh bound-flag and recall-flag factory mutations each fail, then restore29 GREEN; receipts are in mutations-r1-valid-factory.
- Activation authority is recorded above. Only current.switches and current.features[id] change in the separate config commit, alongside this worklog. Global defaults remain OFF. No canonical recipe or active run has changed yet.
- Full replay helper is prepared but has not run. It streams each complete source once, retains at most16 full snapshots, calls the same card owner before each eligible result delivery, and compares raw people_id_card bytes against both regenerated OFF cards and their actual tool-result text. It also checks ON/OFF emission identity and records source hashes, card counts, largest cards and oversized-newest occurrences.
- CPU queue acknowledged by the coordinator: snapshots, story checkpoints, then the next ready owner among this task, screenshot baseline and YAML. Waiting for explicit START.

## Surprises
The production recall proof needs the ordinary checked-press adapter even when only observe executes; the existing auto-advance factory correctly rejects an incomplete fake tool chain. No production workaround was added.

## Multi-Model Review Log
Round1 BASE52a5654187e0697eaf0c658bdeab6b5a22f74443, HEADabaadae4c16ab5a2f6d5c2ea68b7f4c954973e17. Exact canonical binary diff SHA256:6d8a9d7f301c13b73f4e36bd676edfc65afbe7763cd0734ecef7aeef282b11a5. Every selected reviewer and the implementer reproduced the digest and verified clean HEAD/status before and after.

- Claude standaloneCLI ~/.claude-review, plan mode/user settings: VERDICT: LGTM.
- Independent GPT app lane /root/id_card_bound_gpt_review, fork_turns=none: VERDICT: LGTM.
- Grok Cursor cursor-grok-4.5-high (discovered model): exit1 ActionRequiredError, exhausted usage. Outage is not approval. Spec(e) expressly permits Grok-or-fallback; standing distinct-model fallback applied, with reduced vendor diversity.
- Fresh Sol gpt-6.1-sol /root/id_card_bound_fallback_sol, fork_turns=none: VERDICT: LGTM.
- Fresh Astra gpt-6-astra /root/id_card_bound_fallback_astra, fork_turns=none: VERDICT: LGTM.

No blockers or accepted fixes. Claude’s temp-directory cleanup, import-order style and hypothetical future recall-retention concerns are adjacent follow-ups/speculation; no expansion accepted. Full-card/archive/fingerprint bounds remain non-goals. Review includes the separately approved activation commitb542c74f3. Originals are in the native session; copies and synthesis are in runs/id-card-bound/review.

## Boy Scout Log
No adjacent refactor. A separate follow-up proposal was relayed to the coordinator: the GLM full card remains5,434 characters because unchanged battle history includes repeated MAY encounters (the source example includes turns705,707,710,723,727,730). Rematch/loss history can accumulate despite the spec’s assumption that battle text is game-bounded. This switch intentionally bounds only the approved mention list. The coordinator acknowledged a separate worklog proposal only; no battle-history change was built.

## Archive Milestone
Archiving is not authorized.

CPU START received after story checkpoints released at14:46; main remains6cffebd98 and sync is current. First gate on5e1bc6869: build PASS21.62s, lint stopped on an exact-optional-property test type (`contains` from a possibly undefined array element). Added an explicit non-empty fixture guard and reused that known string; no production change. Failure log preserved in gates-5e1bc6869-1793213205747868000. Full replay/test/vendor had not started.

Gate1d310b91a: build and TypeScript passed; ESLint found three test-only issues (possibly undefined array operand, matcher object typed any by the test library, and redundant post-filter type check). Corrected those directly without lint exceptions or production changes. Original logs preserved; targeted lint and unit checks precede the next full gate.

Build and lint pass on4eaf21f41. Initial replay helper filtered notifications it thought irrelevant, but PeopleIdCards observes every event to update its turn. That helper caused151 “seen on” turn mismatches in a702 after matching all247 GLM cards. The corrected helper feeds every original event, with no production change. Both attempts and source-bound receipts are preserved in unique replay directories.

Corrected complete replay: GLM247 + a702165 +88ea154 =566 cards; zero OFF mismatches and identical ON/OFF card emission. Largest OFF→ON pairs: GLM5,646→5,434; a7022,929→2,929;88ea2,904→2,904. Largest ON cards equal those ON values. No oversized-newest mention-list occurrences were needed in these recordings. Resolved current recipes for bundle-v-control, bundle-v-control-2h and glm53-flash-4h verify bound ON in bundle/OFF in control, with people-id-cards ON in both. Canonical receipt saved to the spec’s requested analysis/replays/id-card-bound-v1.receipt.jsonl; source hashes, raw examples and measurements are retained.

Main advanced to9f82e68fa with snapshots while the full suite was running. Stopped only the owned gate/test process tree and released CPU for its priority post-merge check. Partial test log plus explicit aborted receipt retained; no full-suite pass claimed. Synced the new main offline; its viewer changes do not modify PeopleIdCards or our production patch. Await a new START for merged build/lint/replay/fulltest/vendor/card gates before review. No GPU or active gameplay process touched.

Added source-bound offline replay metrics and one complete real GLM OFF/ON card example to the explainer, labelled as full-card measurements rather than the list budget. Source example includes its turn/result sequence; no game quote was invented. Merged-main gates and browser proof still pending.

Merged gates PASS on0004a1aac679fdb95f2c5637c3d8b613199f372f, based onmain52a565418. Receipts: runs/id-card-bound/gates-0004a1aac-1793215127422974000. Build20.92s, lint89.01s, replay28.92s, resolved-arm check0.60s, fulltest155.53s, vendor0.10s. Agent4,882; viewer2,284; Python4,869; gateway116; every coverage metric is above90%, and all3 protected trainer-card widths pass. Corrected full replay repeats the same566 distinct cards, zero mismatches, identical emission and the same measured card sizes. Canonical JSONL preserves both successful code-pin batches by appending; do not sum them as distinct cards. CPU RELEASE delivered; story checkpoints is next.

Owned browser proof uses a clearly labelled offline fixture containing an actual bounded GLM card, not gameplay. Card status ON and exact explainer link, normal and expanded source examples, and raw people_id_card payload with the omitted-page clause all pass on1280/1440/375. Browser receipts/shots are under runs/id-card-bound; no focus, game action, GPU request or timeline changes. The approved art tree is linked read-only into the owned scratch root.

## Final landing and live proof
Landed source abaadae4c16ab5a2f6d5c2ea68b7f4c954973e17 fast-forward on clean main52a565418, with board position1 bound to actual chat 00000000-0000-4000-8000-1ca07025f752. Global defaults OFF; separate approved bundle-only activation included in reviewed history. No live run was relaunched or reconfigured.

Coordinator START at15:34 authorized post-main verification. One verify.py held fcntlLOCK_EX on /private/tmp/pokebench-latest-main-prepare.lock across build21.92s, fulltest151.02s and one viewer-main refresh. All suites/coverage floors and all3 protected-card widths pass on built main. Clean runtime ~/.cache/pokebench-viewer-id-card-bound-abaadae4 serves sourceabaadae4c; actual build stamp is clean. Six protected PIDs34450/60162/60767/96582/98262/98398 survived; none lost. Viewer restart itself confirmed2 live gameplay processes retained.

Read-only actual /api/next-run reports id-card-bound-v1=false. Actual served-runtime fixed-definition modules resolve all3 current protocols with bound=true in bundle, false in control, and people-id-cards=true in both. Real merged viewer card→explainer passes at1280/1440/375 with no JS errors; all3 screenshots opened. The active9c88 header correctly remains NOT RECORDED for the new switch. API showed GPU0 bundle9c88 atT874 and GPU1 baselinee845 atT780; screenshots show9c88T881, proving ongoing progress. There is no older-viewer-build problem; initial API problem only reports archive loading. This task launched neither game and no probes.

Final proof under runs/id-card-bound/post-main. Canonical explainer: http://127.0.0.1:8791/explainers/id-card-bound-v1.html. Source replay JSONL preserves pin-specific batches at the spec’s requested analysis/replays path;566 distinct cards per batch, never summed as separate trials. This is context-size and exact-byte evidence, not gameplay benefit. This single post-landing evidence commit changes only docs/worklogs, under the approved exception. Archive remains unauthorized.

Final evidence timestamp: 2026-10-28T15:43:53.071572-04:00
