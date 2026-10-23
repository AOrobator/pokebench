# Navigation cycle stop

## Authorized outcome and frozen scope

Human authorization relayed by coordinator on 2026-10-23: “implement the minimal cycle-stop fix and truthful feedback, put it behind a switch ON in the bundle, and finish tests, reviews, and landing. Keep current runs untouched.”

Stop a repeated internal local-navigation step within one model-selected navigate_to call. Independent `navigation-cycle-stop-v1`, default OFF, applicable bundle arms ON. OFF preserves input, status and prompt bytes. No planner redesign, automatic destination, muddy-slope repair, gameplay restart, inference or autoresearch change.

## Evidence and mechanism

GLM run `2026-10-22T20-40-54_glm53-mac_0d5d`, source `5bec91dc`, shipyard turns 1031/1032, results 117276/117886: RIGHT,LEFT four times per call, ending (15,3), followed by “call navigate_to again”. Archived raw snapshots reproduced the planner reversal at (15,3)/(16,3). Requested (6,5) is a solid tile outside the planning window. The observation window recenters on every step. Fixture preserves recorded pre-press states, raw references, native buttons, and outer result lines. Matching ROM SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7; game reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Invariants

- INV-1 OFF has byte-identical eight native attempts, result, tools and prompt.
- INV-2 ON stops before repeating an already attempted directional step at the same position/facing/local terrain/planned route/trigger state in this call, with truthful feedback and final observation.
- INV-3 Progress, turn-only input, changed geometry, map changes, locks, and later calls do not inherit stale cycle state. Full/visited navigation retains its existing convergence owner.
- INV-4 Registry/default/metadata/production wiring, bundle-only activation and explainer link agree.

## Milestone

- [x] RED recorded production-factory regressions
- [x] GREEN minimal guarded stop and switch wiring
- [x] Deletion/restoration proof, normal gates, offline recorder delivery
- [ ] Frozen principles review, Claude/Grok/GPT independent verdicts, synthesis
- [ ] Landing board, FF merge, main tests, evidence, viewer-only refresh coordinated

## Evaluation and readiness

Activates on local navigation calls, no story milestone prerequisite. The recorded cycle is a deterministic correctness regression; no gameplay benefit measured or inference launch authorized. Merged/configured bundle state is distinct from a later run_start activation receipt.

## Session log

- Own managed worktree created from main; branch codex/navigation-cycle-stop. Current runs and services untouched.

- RED: focused recorded replay 5 tests: 3 pass (OFF and pinned planner), 2 fail (ON still makes eight alternating attempts). Initial fixture conversion retained event type and was corrected before accepting RED evidence. Receipt /tmp/navigation-cycle-red-2.log.

- RED commit `30faad23c`. First GREEN attempt found moving off-route NPC changed the whole grid object list in turn1032; identity now compares terrain plus the actual planned path. NPC occupancy remains authoritative in the planner, and an occupancy change that changes the route produces a different identity.

- GREEN focused regressions: 14 pass; production factory ON stops both recorded cycles after 2 attempts, OFF preserves exact eight inputs/status. Registry subset 133 pass. Initial full agent gate now 3936 pass; viewer gate exposed four old recipe suffix assertions, mechanically updated. Build passes. First lint found owned venv lacked mGBA; linked the already built canonical Python binding into the owned venv, no service or source change. Full gates pending.
- Standard bundle recipe set: bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, gym-rustboro-torchic, gym-rustboro-torchic-healed. Base false, switches entry true only in bundle; no source-pin rewrite.

- Synced landed move-learn-offer-identity-v1 main c69ad74a5 before review; retained its independent switch, tests and bundle settings. Mechanical registry suffix assertions rebuilt from current main plus one appended navigation switch. No active run pin changed.

- Deletion proofs (all restored): factory OFF mutation and guard deletion each fail 7/15 focused tests; deleting facing, terrain, route or player-elevation identity each fails its exact no-false-cycle regression. Receipts `/tmp/navigation-cycle-delete-{factory,guard,facing,terrain,route,elevation}.log`; restored 15/15 in `/tmp/navigation-cycle-restored.log`.
- Gate attempts are retained: pre-sync lint was invalidated while merge markers existed; test-all-3 ran against stale pre-sync agent dist and correctly rejected move-learn-offer-identity-v1 in viewer recipes. Built current agent/viewer before rerunning; these invalidated attempts are not gate evidence.

## Principles Adherence (before independent review)

Read local PB1–PB13 and the inherited Local stack principles referenced by the local draft. The project explicitly overrides remote pushes, Python/Rust ownership, archive approval and coverage floor. No principles file is edited. Scope: one bounded local navigation stop, truthful result, independently switchable configuration and discoverability.

| ID | Score | Evidence or applicability |
|---|---|---|
| SI-P1 | PASS | Navigation executor owns detection; factory, prompt and result share its contract. |
| SI-P1b | N/A | No Rust or Python authority introduced; PokeBench owns this TypeScript executor. |
| SI-P1c | PASS | Source gates require no GPU or inference target. |
| SI-P2 | PASS | Both recorded turns and semantic caller reuse the one executor; full/visited convergence remains owned there. |
| SI-P2b | PASS | Recorded bad source5bec91dc replay is the regression oracle; OFF retains it exactly. |
| SI-P3 | PASS | Cycle is visible in the returned result and recorder; no hidden retry or alternate route. |
| SI-P4 | PASS | Changes are tracked on owned branch; no runtime patch. |
| SI-P5 | PASS | Production-factory native-sequence regression and deletion proofs encode the defect. |
| SI-P6 | PASS | Explicit minimal scope, current run boundary and main coordination retained in worklog. |
| SI-P7 | N/A | No Rust source or new catch-all module; small guard stays in navigation owner. |
| SI-P8 | PASS | Completing normal gates, reviews and local board landing; project prohibits pushes. |
| SI-P9 | PASS | Local gates and independent frozen reviews; no PR workflow. |
| SI-P10 | PASS | Recorded native geometry and actual executor/recorder/browser used; no cross-host behavior added. |
| SI-P11 | PASS | Terminator is OFF exactness, ON pre-repeat stop, no-false-cycle tests and delivered result, not counts alone. |
| SI-P12 | N/A | No daemon retirement or env migration; only owned test environment configured. |
| SI-P13 | N/A | No canary suite or production monitor changes. |
| SI-P14 | PASS | Deterministic correctness only; no gameplay benefit claimed or inference launched. |
| SI-P15 | N/A | No model runtime/parser integration. |
| SI-P17 | PASS | Cycle uses native state/path, never model reasoning or supervisor prose. |
| SI-P18 | PASS | Recorder delivery and headless card click evidenced separately from recipe configuration and later activation. |
| SI-P19 | PASS | Existing pinned pi/types and recorder signatures read from source; no new dependency API. |
| SI-P20 | N/A | No incident-severity rating in change. |
| SI-P21 | PASS | Operator explicitly selected minimal cycle stop; no navigation redesign. |
| SI-P22 | PASS | RED30faad23c, GREENb24205f1c, sync6bdef2b70 committed; retained native fixture tracked. |
| SI-P23 | N/A | No physical host/topology operation. |
| SI-P24 | PASS | P29 redirect: no implicit waiver; review outage provenance verified separately. |
| SI-P25 | PASS | Final cumulative patch frozen and independently reviewed after fixes. |
| SI-P26 | PASS | Guard and factory deletion each fail7focused tests; no bypass introduced. |
| SI-P27 | PASS | Durable worklog maintained while completing authorized landing. |
| SI-P28 | N/A | No topology retirement. |
| SI-P29 | PASS | No quality weakening; ROM/mGBA prerequisites repaired; inherited90percent project floor explicit. |
| SI-P30 | PASS | Switch registry and navigation executor own behavior; explainer maps to existing feature-card owner. |
| SI-P31 | PASS | No new subsystem; single per-call set inside existing navigation loop. |
| SI-P32 | PASS | Own worktree, hooks intact, board gates every main mutation. |
| SI-P33 | PASS | Fixture preserves both real turns and invokes production planner/factory; failures not averaged. |
| SI-P34 | PASS | One bounded status sentence; no raw RAM introduced into live model context. |
| SI-P35 | N/A | No scheduled side-effect job. |
| SI-P36 | PASS | ROM outside protected paths; headless browser preserves desktop focus. |
| SI-P37 | N/A | No dependent service startup change. |
| SI-P38 | PASS | Scope checks tracked; no worklog archive without explicit operator approval. |
| SI-P39 | PASS | No new compatibility layer; OFF arm is the required benchmark contract. |
| SI-P40 | PASS | Existing gameplay remains pinned and serving; no forced freshness restart. |
| SI-P41 | PASS | P29 redirect; retained production defect evidence, no speculative fallback. |
| SI-P42 | N/A | No monitor retired. |
| SI-P43 | PASS | Explicit human authorization and defined repeat identity; unrelated slope fix excluded. |
| SI-P44 | PASS | Native button/state evidence and deterministic tests establish correctness, not model self-report. |
| SI-P45 | PASS | Useful movement, changed states and interruption cases complement cycle hits; no skipped final gate accepted. |
| SI-P46 | PASS | Coordinated active guard/campaign editors; mechanical registry/recipe assertions reconciled. |
| SI-P47 | N/A | No healed resource stopped or altered. |
| SI-P48 | PASS | Explainer and diagnostics remain Mac-local; no GPU dependency. |
| SI-P49 | PASS | Landing qualification does not invoke accelerator targets. |
| SI-P50 | N/A | No production package/runtime updater touched. |
| SI-P51 | PASS | Model-visible result and durable recorder text checked against the same returned payload. |
| SI-P52 | PASS | The cycle stop performs the action boundary once and returns evidence; no gate/retry deadlock. |
| PB1 | PASS | Native geometry and game records are evidence; no milestone regrading. |
| PB2 | PASS | Both failing calls and zero-progress result retained. |
| PB3 | PASS | No stochastic benefit claim. |
| PB4 | PASS | Independent switch recorded; no memory writes or live inputs. |
| PB5 | PASS | One behavior changed; recipes control it independently. |
| PB6 | PASS | History is bounded to at most eight local attempts in one call. |
| PB7 | PASS | Recorded fixture and recorder delivery proof retained. |
| PB8 | PASS | Repeated executor steps stop visibly without ending run. |
| PB9 | PASS | Human selected scope; no unapproved destination policy. |
| PB10 | PASS | Normal gates and90percent floor unchanged; no final skipped tests. |
| PB11 | PASS | Pinned source and pi executor signatures used. |
| PB12 | PASS | ROM outside TCC; no foreground app operation. |
| PB13 | PASS | Tests, worklog, review, landing and lateractivation distinguished. |

### Test-quality review

1. Seam: production withNavigation factory and RunRecorder consume exact returned result.
2. Deletions: performed factory, guard, facing, terrain, path, elevation mutations; every case red then restored green.
3. No process-global mutations; state and cycle set are instance/call local.
4. Recorder proof owns a unique temp directory and exact payload; no shared collector.
5. No new concurrency; ordinary full gates ran alongside other owners without sleeps/retries added.
6. No skips, timeout increases, serialization or retry suppression introduced.
7. Exact input arrays, command counts, statuses and result payloads appear in failing assertions.
8. Fixture has18 recorded states and16 native attempts total; tests replay at most8 per call, memory only. One gzip read; no per-row network, process or filesystem write. Recorder test uses its real bounded temp log.
9. Eight attempts are the actual retained native regression, not a seeded large cap. No new numeric threshold or persistence owner.

### Review scope control

Production owners: navigation.ts, features.ts, play-preset.ts, play-config.ts; viewer defaults/explainer map and seven evolving recipe entries are required configuration. Other test diffs only shift registry/recipe suffix positions or retain historical switches OFF. No new dependency, event type, timeline lane, server state field, solver or recovery subsystem. Stop before repeating the same local step; no goal reachability assertion. New domains or muddy-slope changes require separate authorization. Terminator: required independent frozen verdicts, normal gates, board FF landing and source/UI receipts. A later run_start and controlled gameplay evidence are needed for activation/benefit.

- Final configured normal tests: agent3943, viewer1740, native4042, all pass and zero skips. Build/lint/vendor pass. Coverage: agent lines99.21%, branches93.40%, functions97.79%; viewer lines98.01%, branches91.53%, functions95.09%; native lines97.38%, branches93.34%, functions100%. Retained receipts /tmp/navigation-cycle-test-configured.log, /tmp/navigation-cycle-build-final.log, /tmp/navigation-cycle-lint-final.log, /tmp/navigation-cycle-coverage-configured.log.
- Headless UI proof: owned viewer with an explicitly labelled offline simulated replay, no queue or game connection. Clicked HARNESS CONFIG, filtered navigation-cycle-stop-v1, clicked its exact READ EXPLAINER link in a popup. Opened desktop and375px screenshots, fixed long hash wrapping and made the diagram scrollable on phone. Both body-overflow checks false; no page errors. Evidence runs/reviews/navigation-cycle-stop/browser-proof.json and card-desktop/explainer-desktop/explainer-phone.png. This is discoverability and deterministic delivery proof, not a new gameplay run or activation receipt.
- Review outage provenance independently verified in Claude history 00000000-0000-4000-8000-1bb4e739f4f4.jsonl4145/4964: human message [private message reference] at2026-10-21T20:35:35Z says “yes dont wait for grok”; coordinator separately records general/every-branch scope until Cursor returns. Will attempt actual discovered Grok lane and retain failure; no invented Grok verdict.


### Frozen review round 1 and evidence repair

Frozen HEAD3fac12cbbc9a0fbfab945905e28c118414b4eaa1 / BASEc69ad74a50b03ef10302ec3d79e99da6e5bfb9ae / diff34602a60858beb652ce64456e7c85d8daecb83c7e61ca52cc9368f063293e435 received Claude LGTM, normal GPT5.6-Sol BLOCKING and fallback GPT6.1-Sol/Astra BLOCKING. Actual Grok attempt failed account usage, not a verdict; standing human outage waiver above applies with reduced vendor diversity. All reviewers checked nine test-quality dimensions and67 principles; no runtime defect found. Required-evidence consensus: isolate warp/trigger identity operands, position operand (normal GPT), full/visited local-only boundary (Astra), and bind served UI bytes to immutable frozen source (normal GPT). Accepted as in-contract evidence gaps, no production expansion. Nonblocking exact planned-route inputs strengthened; recipe title unicode-only rewrite removed with upcoming main sync. No deferred runtime blocker or scope expansion.

Added five bounded proof cases (20focused tests total): off-route warp change, matching trigger change through enabled real coordinate-script feature, isolated position change between native reads with unchanged facing/terrain/route, full and visited with maxCommands3. The latter use three valid presses, not the large production cap. Position case models independent native movement between reads; immediate press results still match the planned direction. Performed single-operand deletions: warps1failure, triggers1failure, position1failure, local predicate2failures, each exactly its new targeted case(s). Restored source:20/20pass. Retained /tmp/navigation-cycle-delete-{warps,triggers,position,local}.log and /tmp/navigation-cycle-r2-restored.log, copied into durable review directory before final review. No production source bytes changed by the repair. Browser receipt will be regenerated after immutable commit/build with served asset and explainer hashes before final review.

### Separate Qwen Devon conditional audit

Human conditional request checked against run2026-10-23T11-15-17_qwen36-gpu0_4637. T307 result13310/state13309 says Location RUSTBORO CITY(map0/3), X18Y17, arrived at requested coordinate after1 bounded input. Its frame frames/013310_0.png shows the outdoor street. T308 assistant13317 references state13309 yet states inside Devon and a Dewdrop Ticket goal. Delivered system already prioritizes location/game evidence and checks destination map after transitions. No false map or frame established behind that belief; classify spatial/prior-over-evidence, no repair manufactured under conditional authorization. Separately the primary trace ownerredacted-id received direct human authorization for a factual map-unchanged arrival clarification and owns that separate flag/packet. T270 generic semantic refusal during native field-control lock is distinct and did deliver all4 Devon employee dialogue pages; no causal claim linking it to inside belief. Existing runs untouched throughout.
