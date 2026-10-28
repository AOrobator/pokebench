# instruction-memory-yaml-v1 (OBSERVED INSTRUCTION MEMORY as YAML)

Operator request, relayed: The operator 2026-10-28 8:00 AM NY, "can we make the instructions delivered yaml? its so hard to read". Coordinator brief: a separate switch, default OFF, guidance category, on its own branch, same gates and review. It changes the format only; content and selection stay the same. If YAML costs more tokens, the cap budget must be measured in the delivered form. Do not land; do not edit experiments/feature-configs/current.json.

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
- [ ] Stop: report. No landing.

## Synced with claude/bounded-model-input (which carries main 56a54f7ab: instruction-memory-dedup-v1 and the cap's round-1 fixes)

- Conflicts took the cap side; the YAML wiring was re-applied after instruction-memory-cap-v1. `CAPPED_SELECTION` moved into instruction-memory-cap.ts so YAML can use it without a cycle.
- The YAML renderer follows dedup's payload. Its two source-map columns join the carried fields (written when they change). `current` is written only when the payload has it, and `observed_locations` is a YAML list. The left-out header matches the JSON form's. The Python reference (`yaml_form.to_yaml_compact`) was updated the same way.
- Replays are byte-identical between built code and reference. Control: a702 T450 13,454, T700 18,905, T1301 18,762 (19 of 112 kept). Bundle (dedup on): T450 14,456, T700 18,813, T1301 18,823 (22 of 112 kept). The JSON path is unchanged (T1301 15,965). 58 uncapped recorded blocks plus the 3 dedup blocks round-trip through PyYAML to identical text.
- Focused: 149 agent tests (yaml 7 with dedup × cap × yaml combinations, cap, checkpoints, dedup, observed-instructions, features, presets, type-gap, semantic-navigation-v2, gym-evidence) and 400 viewer tests.
