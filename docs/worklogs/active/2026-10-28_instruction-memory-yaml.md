# instruction-memory-yaml-v1 (OBSERVED INSTRUCTION MEMORY as YAML)

Operator request, relayed: The operator 2026-10-28 8:00 AM NY, "can we make the instructions delivered yaml? its so hard to read". Coordinator brief: a separate switch, default OFF, guidance category, on its own branch, same gates and review. It changes the format only; content and selection stay the same. If YAML costs more tokens, the cap budget must be measured in the delivered form. Initial hold (superseded by the 13:14 handoff below): do not land or edit the current recipe.

Branch `claude/instruction-memory-yaml`, cut from `claude/bounded-model-input` (instruction-memory-cap-v1), because both change the same renderer.

## Measured choice (a702 T1301, Qwen3.6 /tokenize, report `2026-10-28_instruction-memory-rule-a`)

| Form | Capped T1301 chars | Tokens |
|---|---|---|
| JSON (today) | 15,923 | 6,088 |
| YAML, every field on every page | 29,994 (A′ before checkpoints) | 9,924 |
| YAML, speaker/speaker_source/map/map_id only when they change (built) | 20,744 | 6,687 |

The built form costs about 5–10% more tokens than JSON for the same episodes. With instruction-memory-cap-v1 ON, the cap is measured on the delivered YAML at 19,000 chars (3.1 chars per token, about 6,100 tokens, the same token budget as JSON's 16,000 chars).

## Format

- Header: the selected-form header, with "pages follow the columns below" reworded to "each page gives its speaker, map, state event and exact text". Then the left-out line (only when the cap leaves something out), then one line explaining carried-over fields.
- Each episode: `turn`, `delivered_result`, `dialogue_events`, `pages`. A page writes `speaker`, `speaker_source`, `map`, `map_id` only when they differ from the page before, then always `state_event` and `text`.
- Text uses a `|-` block scalar, which keeps quotes, colons, `#` and POKéNAV as they are. It falls back to a JSON string (valid YAML) for empty text, a leading space or newline, trailing spaces on any line, a blank line, a final newline, or any control, C1, U+2028/2029 or BOM character.
- Other scalars are plain only if they start with a letter, use letters, digits, `_ .,'()/&-`, do not end in a space or `.`, and are not a YAML 1.1 bool/null word. Otherwise they are JSON strings.
- `current` is a small mapping, or `current: null`.
- Applies to the selected form (milestone-instruction-memory-v1 ON). The older form is already YAML-like and stays unchanged.

## Checklist

- [x] RED: `instruction-memory-yaml.test.ts` (scalar rules, exact rendering including every block-scalar fallback, factory ON/OFF, cap measured on YAML, registry).
- [x] GREEN: `instruction-memory-yaml.ts`, a constructor flag in `ObservedInstructions`, and wiring in `observedInstructions`. The cap uses `INSTRUCTION_MEMORY_YAML_CAP_CHARS` when YAML is on. 18 focused passed (yaml + cap); viewer panels, server and next-run 396 passed (after `pnpm -r build` in the new worktree).
- [x] Registry (guidance, `needs: null`, after instruction-memory-cap-v1), presets, defaults; current.json untouched.
- [x] Wiring removal check: without the flag in `observedInstructions`, 2 failed; restored, 5/5.
- [x] Round trip: 56 recorded selected blocks (every 40th in a702 and 88ea, `yaml-sample.mjs`). The built YAML equals `yaml_form.to_yaml_compact` byte for byte, and PyYAML reads it back to identical fields and text. Capped YAML (`replay-cap.mjs`, `rule_a2.py` YAML mode): a702 T700 15,915 and T1301 18,991 (27 kept); 88ea T400 17,164 and T800 18,986, byte-identical. The JSON path is unchanged (a702 T1301 still 15,923).
- [x] Explainer `docs/explainers/instruction-memory-yaml-v1.html` (real a702 excerpt in both forms, token table, quoting rules), README, FEATURE_EXPLAINERS, panels/server tests; pages-check clean; headless 1280/375 with no overflow.
- [ ] Gates: `just lint`, full `just test`. Waiting for a coordinator heavy-CPU window; focused tsc and eslint are clean.
- [ ] Review: personas across the Claude CLI, Codex CLI and fallback lanes.
- [ ] Final sync, full gates, required review and board-controlled landing; bundle ON/control OFF under the superseding operator instruction.

## Synced with claude/bounded-model-input (which carries main 56a54f7ab: instruction-memory-dedup-v1 and the cap's round-1 fixes)

- Conflicts took the cap side; the YAML wiring was re-applied after instruction-memory-cap-v1. `CAPPED_SELECTION` moved into instruction-memory-cap.ts so YAML can use it without a cycle.
- The YAML renderer follows dedup's payload. Its two source-map columns join the carried fields (written when they change). `current` is written only when the payload has it, and `observed_locations` is a YAML list. The left-out header matches the JSON form's. The Python reference (`yaml_form.to_yaml_compact`) was updated the same way.
- Replays are byte-identical between built code and reference. Control: a702 T450 13,454, T700 18,905, T1301 18,762 (19 of 112 kept). Bundle (dedup on): T450 14,456, T700 18,813, T1301 18,823 (22 of 112 kept). The JSON path is unchanged (T1301 15,965). 58 uncapped recorded blocks plus the 3 dedup blocks round-trip through PyYAML to identical text.
- Focused: 149 agent tests (yaml 7 with dedup × cap × yaml combinations, cap, checkpoints, dedup, observed-instructions, features, presets, type-gap, semantic-navigation-v2, gym-evidence) and 400 viewer tests.

## Codex finish handoff, 2026-10-28

New human instruction relayed13:14EDT: “let's switch on the yaml, it'll make things more observable for me and we can figure out how to trim irrelevant context from it as we go”. Assigned by Codex coordinator to chat 00000000-0000-4000-8000-813dbe13e931. This supersedes earlier do-not-land/current.json/activation hold: finish reviewed switch, bundleON/controlOFF, leave livebundle andGPU0 untouched. HeavyCPU queue: Dewford, threeClaude boundbranch gates, junkfilter, YAML; wait explicitSTART before fullgates.

Syncing current main1f340093e. Landed cap semantics remain main-owned: whole-episode hardselection, boundedlocations, current_left_out/earlier_locations_left_out metadata. Main-first registry order with YAML last298, defaultOFF. Intermediate merge keeps existing YAML integration while new tests must expose missing bound/omission-metadata support before finishing it. No fullgates or modelcalls started.

Integration RED: current main restored first; focused58tests:8FAIL/50PASS. New small-bound tests expose YAML current_left_out/earlier_locations_left_out omission, JSON-vs-YAML current-budget mismatch, empty arrays rendered null and legacy selector budget injection. Actual PythonYAML reader rejects rawDEL emitted by JSON.stringify fallback; new Unicode-control escaping test isRED. Keeping scope format/cap/exactfieldsemantics, no new memoryselection policy. Production budgets separately pinned; bound fixtures use1200/1800/180 and atmost5inmemoryepisodes, no cap-sizedfixture. JSONOFF implementation retains mainfixed()/locations()/over()/select semantics pending exactbyte replay proof.

## GREEN checkpoint before the next shared-main integration

Current main cap selection retained without changing its policy. YAML uses the real delivered form for the19,000-code-point budget and for deciding whether current progress fits. Legacy stays byte-identical with its existing16,000 cap. current_left_out and earlier_locations_left_out survive YAML projection; empty lists stay lists. CAPPED_SELECTION moved into the cap module with a re-export preserving the previous import seam and exact OFF wording. JSON stringify leaves C1/Unicode separators raw, so the YAML quoted-scalar owner now explicitly escapes them; literal text never loses bytes. Removed redundant literal-block predicates while retaining all declared whitespace fallbacks.

Integration RED8FAIL/50PASS→GREEN74focused; restored broader141agent and374viewer tests PASS. Four current recipes and every phase materialize bundleON/controlOFF, with the existing observed-memory/cap owners active. Activation test was4FAIL before current.json change, then4PASS. Default presets remainOFF. Agent-only compilation, focused tsc and eslint PASS; no full workspace gates have run without grant. Native mGBA binding import preflight succeeds in this worktree.

33 independent guard-removal/change mutations each yield AssertionError at the selected consumer/format/bound test, then source is restored byte-identically. Covers factory wiring, measured budget, both current-budget paths, location bounds, both hasBase metadata guards, omission markers, empty collections, episode carry reset, source-map columns, shared quoting and both callers, all whitespace/control branches and plain-scalar ambiguity guards. All original-source hashes match after restoration. Receipts: runs/reviews/instruction-memory-yaml/mutation-receipts.json and named-red.log files. Tests use small injected1200/1800/180 bounds and at most6episodes rather than filling production caps; production defaults are pinned separately.

Offline baseline: compiled main format owner frozen in baseline-main-dist with source/dist hashes. Source pin98ab50598, compiled stamp92b6b8fb8; only later agent changes were feature/preset registration and compact-grid tests, not the format owner or its runtime data. 80/80 OFF comparisons match frozen main over both recorded runs and all field/retention/cap/dedup combinations. Input-prefix byte counts and SHA256s recorded. Ten native YAML blocks plus3edge vectors decode with PyYAML6.0.3 to exact fields, carried provenance and game text, including controls, Unicode separators, empty arrays and omission markers. No inference or gameplay operation.

All8 required cap/dedup cuts equal the independent Python reference byte-for-byte. Reference copies pin checkpoint/rule data from main rather than a mutable other worktree; shared canonical helpers and snapshots are untouched. Regenerated YAML expectations, with old copies retained. Every changed result identity/reason is in reference-differences.json. Normal a702 T45013454→13458 (14kept, wording only), T70018905→18793 (17→15), T130118762→18930 (19→22); 88ea T40017164→18874 (21→19), T80018986→18989 (25→25). Dedup a702 T45014456→14460 (14→14), T70018813→18933 (14→13), T130118823→18981 (22→22). The T700 refill now includes listed Rusturf-nearby episodes29450/29541/29713 and recent27503, replacing older recency entries; T1301 adds nearby42826, held-key-item29713 and newer recency66500/64399 while dropping older named11650. 88ea changes favor named8598 and current-map29352/29555 over older recency. Dedup T1301 swaps recent62961 for nearby42826. These are current-main/reference selection outcomes, not a new YAML retirement rule.

Explainer replaced stale prototype counts with current receipts, a labeled recorded two-episode excerpt and selection/render diagram. Declares format-dependent whole-episode fit, legacy behavior, omission metadata, exact escaping, future bundle activation and no gameplay-benefit claim. Theme/zero-network check PASS; headless1280/1440/375 no page overflow or external resources; desktop/phone screenshots inspected. Full viewer card click awaits the granted build/gates and landing workflow.

Coordinator seam ruling: story owns ObservedInstructions parameter5 (wholeGame) and the cap wholeGame argument. This checkpoint still has YAML in the unlanded old-base position; it must be moved after all main-owned parameters during the next integration, with every positional boolean explicit in tests/factory/private replay helpers. No options-object refactor. Re-sync and rerun parity after each intervening landing. Heavy CPU remains junk filter→story→YAML, explicit START required. Current newer main contains the four other bound switches; no live bundle/GPU0 touch.
