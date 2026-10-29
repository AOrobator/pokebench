# Town Center checkpoint harness wiring

## Authorization and scope

The operator: “okay yeah lets wire the winner into the harness, on in both arms”. This supersedes the earlier implementation hold. Register `town-center-checkpoint-v1`, preserve default OFF for omitted/frozen presets and ordinary NEXT RUN, and enable it in both future arms through `experiments/feature-configs/current.json` (`features` plus `onInBoth`, outside treatment `switches`). Existing runs/controllers and historical metadata remain unchanged; no gameplay restart or new inference cohort.

Implementation branch `codex/town-center-harness` starts from main `2308380fd`. Research stays on `codex/town-center-probes` (`2b8a53bfa`); its executable research scripts are not in this landing candidate. The older unmerged Claude draft `claude/heal-town-checkpoint` at `96dfc4543` is a read-only reference. Its owner is unreachable. This branch implements only the checkpoint switch; it does not import `coherent-heal-first-directive-v1` or `heal-gate-with-factual-v1`. The second lander must drop the duplicate checkpoint definition.

Evidence root: `/Users/user/dev/pokebench/runs/town-center-harness-20261028`. Full detailed session history and every failed gate receipt are retained there. No ROM was copied or committed.

## Behavior and owners

- The first eligible free-field decision of each visit gets the exact short action-first instruction as a final user message with plain-string content. Its town, current map and entrance coordinates come from verified facts.
- Native `lastHealLocation` must be known and differ from this town. The map table must identify a local Center warp, the exact target must already be listed in the delivered result, and native reachability must be `foot`.
- Battles, menus, dialogue, locked controls, unknown UI/state/party ownership, ambiguous readouts, missing reachability and unlisted entrances remain silent. Locked arrival defers until a fresh successful result shows a free field.
- A successful model reply with a tool call consumes the visit notice. Model errors and text-only replies retain it. Leaving and returning rearms the check. Native checkpoint completion suppresses it. No movement is executed and no gym action is blocked.
- `contextTools` owns final-message placement. Live wiring supplies the existing `StateWatcher` map-table reader; decision replay supplies its raw-RAM places port. Existing fitting code is unchanged.
- The existing `ledger_context` owner records exact text and source state/result references. Activity History and raw inspection expose it. No event schema or TIMELINE addition.

Game reference: clean pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. Oldale/Rustboro Center OnTransition scripts call `setrespawn`; nurse recovery is separate in `gText_WouldYouLikeToRestYourPkmn`. No new RAM offsets.

## Implementation and focused proof

- RED `4b57aaf76`: native four-case fixture and failing helper/factory tests. Initial failure was the missing implementation module.
- GREEN `43cc63aa7`: helper, production context factory/live/replay wiring, registry/defaults, shared both-arm configuration, explainer mapping and tests.
- Caller proof `442b481be`: real pinned pi HTTP tests use the actual StateWatcher HTTP places reader. ON reads the table once; OFF never reads it. Exact final strings survive existing ContextBudget trimming, and native completion suppresses the next note.
- Reachability fix `702270f28`: require native `foot` explicitly. All four original native case states confirm foot reachability; those exact fields are retained in the fixture. Registry validation also requires `exit-reachability-v1`, already ON in current.
- Checkpoint tests: 12 pass. Relevant four agent suites: 93 pass. Latest checkpoint/registry focused run: 40 pass. Changed-file ESLint and both package type checks pass.
- Factory mutation: delete the `townCenterContext` operand from `contextTools`, observe the intended production-factory assertion fail, restore it and observe PASS. Original source, unique deletion/restoration logs and hash receipt are retained.
- Materialized future control/bundle presets are checked across four protocol definitions and every phase. Ordinary NEXT RUN and omitted presets remain OFF. No tool/schema change.

The matched-encoding study remains first-decision evidence on exposed source families: healthy arrivals 6/16 → 16/16; damaged Rustboro 7/8 → 8/8; healthy already-checkpointed Rustboro 8/8 in both. It does not establish completed entry, healing, fewer blackouts or full-game gains.

## Gate receipts and environment repairs

Application source is pinned to `702270f28`; subsequent worklog updates do not change it. Completed proof is retained by the current impact policy.

| Check | Result |
|---|---|
| Build prerequisite | PASS |
| Agent coverage | 357 files; 5,019 tests; 96.45% lines / 92.41% branches / 97.42% functions |
| Viewer coverage | 180 files; 2,325 tests; 94.62% / 90.80% / 94.92% |
| Python coverage | 4,913 tests; 0 skips; 97.50% / 93.60% / 99.90%; floor PASS |
| Gateway coverage | 116 tests; 99.12% / 96.22% / 100.00%; floor PASS |
| Full trainer-card check, lint and vendor | PASS: 3 original-baseline sizes, full lint, clean vendor; `final-gates.json` |

All coverage floors remain 90%. No skips, assertions, baselines, timeouts, concurrency or input-clipping rules were weakened.

Preserved failed attempts:

1. Direct panels run hit Node’s 4 GiB heap limit. Repeating with the repository’s existing 8 GiB coverage setting passed all 224 panel tests. No test change.
2. First full Python attempt lacked the worktree `.env` and initialized vendor: 281 failures, 16 errors, 4,092 passes, 524 skips. Link the existing canonical `.env` and initialize vendor at pinned `bbab97ad73e460b7cd7c08527d10ced30cc03fbe`; focused ROM/type-gap checks then passed 12 tests.
3. Next Python attempt passed 4,912 tests but the server-entrypoint test lacked `mgba._pylib`. Reuse the existing pinned mGBA 0.10.5/Python 3.11.16 binding in the owned venv; both binary hashes match canonical, with source pin `26b7884bc25a5933960f3cdcd98bac1ae14d42e2`. Canonical is untouched. An initial copy encountered canonical’s recursive `mgba` alias; remove only the new partial local copy and exclude that non-runtime alias. Isolated import and both view tests passed, then full Python passed 4,913 tests.
4. Trainer-card verification lacked ignored approved art in the new worktree. Approved assets were copied unchanged with all 419 hashes verified. The retry also explicitly uses canonical `POKEBENCH_CARD_ART`, as the coordinator directed. No protected source, assertions or baselines changed.

Every heavy attempt received explicit CPU START and RELEASE on failure. Full agent/viewer coverage was retained while only affected Python/setup checks were retried. No GPU calls or active player changes occurred.

## Operator-surface proof

An owned viewer at port 51806 served only `scratch/runs`, never canonical recordings. It is now stopped. Schema-valid native-state replay fixtures generated their note through production `contextTools`: ON records the exact note and references; OFF records none. Fixture-only, with no model or game calls.

- Harness Config shows the ON card and its READ EXPLAINER link opens the tracked page. An omitted setting remains NOT RECORDED; it is not inferred OFF.
- Activity row selection and expanded raw JSON show the whole message and state/result references.
- The native SVG frame href and fetched hash match the original d548 frame.
- Served main.js, app.js and style.css hashes match the built artifacts; the helper module hash is recorded.
- Headless 1280/1440/375 screenshots were opened and inspected. No page overflow, external resource fetches or page errors. The scratch viewer’s missing trainer-art warning is a fixture asset gap, separate from native-frame proof.
- The initial browser locator matched rendered and raw text; the corrected locator passed. Both receipts are retained.

Tracked explainer: `docs/explainers/town-center-checkpoint-v1.html`, themed and pages-check clean. Prelanding local copy: http://127.0.0.1:8791/town-center-checkpoint-v1/town-center-checkpoint-v1.html (HTTP 200). Final canonical serving and any viewer refresh remain separate from this preview.

## Remaining steps

- [x] RED/GREEN, exact wording/encoding, native eligibility, suppression and OFF/factory checks.
- [x] Both future arms configured; explainer and preview click-through.
- [x] Complete remaining deterministic gates and release CPU.
- [ ] Principles self-review and three independent cloud reviews on one frozen packet.
- [ ] Landing board, fast-forward merge, required combined post-merge tests and coordinated viewer refresh. No active gameplay restart.
- [ ] Final source/config/served receipt. Do not claim gameplay benefit.
- [ ] Ask the operator before archiving this worklog.

No main hold is requested. If main advances, audit changed contracts and retain or rerun proof by impact under the current landing policy.

Final gate receipts are complete. CPU RELEASE sent; no heavy job remains. One additional test-only case exercises the existing ExactContext provider path (enabled in current) alongside estimated fitting: checkpoint file now 13/13 PASS, changed-file lint and agent type check PASS. Application source is unchanged from `702270f28`; retained global agent coverage had 5,019 tests before this additional case. Full combined post-merge testing will include it. No new clipping behavior was introduced.
