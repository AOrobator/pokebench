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
- [ ] Obtain CPU START; sync main, then build, lint, three full recorded-card replays, resolved arm checks, full coverage, vendor and protected-card checks, serially.
- [ ] Verify the feature card, explainer and exact recorded payload in headless desktop and phone contexts; inspect screenshots without taking focus.
- [ ] Complete PB1–PB13 self-review, seal the boundary and packet, obtain Claude/Grok-or-approved-fallback/GPT reviews, and write synthesis.

**M4 — Land and activation**
- [ ] Land the reviewed implementation and separate activation commit fast-forward through the board.
- [ ] Verify default OFF and resolved bundle ON/control OFF. Launch no runs and leave active prompts and frozen recipes untouched.
- [ ] Obtain a separate post-merge CPU window, pass full tests on built main, refresh the viewer once under its shared lock, preserve active processes, record evidence and release the board.

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
Pending.

## Boy Scout Log
None. No adjacent refactor.

## Archive Milestone
Archiving is not authorized.

CPU START received after story checkpoints released at14:46; main remains6cffebd98 and sync is current. First gate on5e1bc6869: build PASS21.62s, lint stopped on an exact-optional-property test type (`contains` from a possibly undefined array element). Added an explicit non-empty fixture guard and reused that known string; no production change. Failure log preserved in gates-5e1bc6869-1793213205747868000. Full replay/test/vendor had not started.

Gate1d310b91a: build and TypeScript passed; ESLint found three test-only issues (possibly undefined array operand, matcher object typed any by the test library, and redundant post-filter type check). Corrected those directly without lint exceptions or production changes. Original logs preserved; targeted lint and unit checks precede the next full gate.
