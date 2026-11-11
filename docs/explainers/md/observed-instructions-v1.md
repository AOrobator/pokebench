observed-instructions-v1 · default OFF · bundle ON

# Keep the instruction whole.

> Markdown twin of [observed-instructions-v1.html](../observed-instructions-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The model still chooses what to do. The harness preserves observed words and shows progress separately.

## The failure this targets

The Oct. 19 analysis found the full Norman instruction in supervisor history, while the prominent goal still described reaching Rustboro—even inside the Gym. This is evidence of incomplete emphasis, not proof of forgetting or a measured treatment effect.

![Whole dialogue and observed progress remain separate](observed-instructions-v1/fig-1.svg)

Arrival does not delete the quote. Challenge and victory remain different concepts.

## What the model receives

Illustrative excerpt of the exact format; actual recorded pages retain their original line breaks, attribution and references. No destination/objective is extracted.

```
observed_instruction_episodes:
  - dialogue_events: [2882]
    delivered_result: 2884
    turn: 211
    pages:
      - speaker: "DAD"
        speaker_source: "name_prefix"
        text: "There, you should challenge\nthe GYM LEADER, ROXANNE."
        map: "PETALBURG CITY GYM"
        map_id: [8,1]
        state_event: 2851
observed_progress:
  current: {"result_event":7949,"state_event":7948,"location":"RUSTBORO CITY","story":"..."}
  observed_locations: [...]
```

The episode and result IDs 2882/2884 and arrival result 7949 come from `2026-10-19T14-12-16-847Z_qwen36-gpu1_petalburg2h-r5-whole-map`. The Story line and location history are abbreviated here; the tracked regression fixture contains the original records.

## Selection, retention and limits

After a successful tool result, retain all field pages from its dialogue records if at least one page has a printed name that the existing story-character table recognizes (including DAD). Battle pages are excluded. Unknown speakers within a selected episode stay unknown. Unattributed-only calls and unrelated conversations are not selected. An episode is a delivered tool-call chunk, not a guarantee of a complete multi-call conversation. Addressees and imperative meaning are not inferred.

Exact repeated content, attribution and map deduplicate to their first source. Every unique selected episode stays for this run; none expires on arrival, newer dialogue or a context-window cut. This can grow context and cost. No clipping or cross-run memory is added. Resumed saves start with no fabricated dialogue history.

Progress copies only Location and Story lines from successful delivered game observations. Missing evidence is unknown. A location observation does not prove exploration or task completion. Each page retains its source state, and each episode retains dialogue and delivery event references. The existing ledger_context convenience evidence index holds the newest 64 unique references; full source references remain in the recorded YAML.

## Switch and recording

ON appends the YAML to context every decision after the first selected episode and records those exact bytes as ledger_context. The existing Activity History and raw-event inspector expose it; no TIMELINE lane is added. OFF keeps the previous context and tools exactly. No model call, objective tool, forced write or gameplay action is added.

The switch requires dialogue-auto-advance-v1 and conflicts with state-only decisions. It is default OFF in old presets and Next Run, explicitly included in the bundle treatment. Control remains OFF.

## Grounding and status

`PetalburgCity_Gym_Text_DadGoCollectBadges`, pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, distinguishes travel, challenge, other Gyms and a later battle with Dad. The feature repeats observed words rather than injecting that script.

Regression tests cover actual Mom and Norman dialogue, later conversations, arrival and pruned context. Review and landing receipts are in the worklog. The experiment is pending; no measured runs or benefit claim.
