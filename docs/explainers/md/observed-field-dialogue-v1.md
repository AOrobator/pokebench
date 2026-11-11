POKÉBENCH · DEFAULT OFF · BUNDLE TREATMENT

# Keep the upstairs instruction

> Markdown twin of [observed-field-dialogue-v1.html](../observed-field-dialogue-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`observed-field-dialogue-v1`

All delivered field-dialogue episodes enter the existing instruction memory, including WOMAN_4 or null speaker attribution. Text and attribution are copied exactly. Battle pages and failed delivery stay excluded. Exact repeat episodes share their first source; unique episodes are retained without an eviction limit. Nothing interprets a task, retires an instruction or invents a speaker name. More retained dialogue can increase context cost.

![ON: the observed result returns before the next model decision.](observed-field-dialogue-v1/fig-1.svg)

*ON: the observed result returns before the next model decision.*

## OFF and ON

OFF: only episodes containing a recognized story character’s printed name enter instruction memory.

ON: every delivered field-dialogue episode remains available with its original uncertainty.

## Recorded 9f27 example

```
speaker: "WOMAN_4"
speaker_source: "faced_sprite"
text: "Our daughter is upstairs, I think."
delivered_result: 1129
```

Source: run 2026-10-21T11-08-02_qwen36-gpu0_9f27. Conversation delivered at turn 62, result seq 1129. Game text: RivalsHouse_1F_Text_OhYoureTheNewNeighbor in pret/pokeemerald data/maps/LittlerootTown_MaysHouse_1F/scripts.inc, reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

Prerequisite: `observed-instructions-v1`. Global and control defaults remain OFF. Each repair has an independent pending experiment; no trial is approved or launched here.

Regression tests verify this mechanism. Review and landing are recorded in the worklog; measured benefit requires separate comparison runs.
