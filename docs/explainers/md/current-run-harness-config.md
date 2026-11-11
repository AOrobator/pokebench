# This run’s settings, without editing them

> Markdown twin of [current-run-harness-config.html](../current-run-harness-config.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

PokéNav → **HARNESS CONFIG** shows the selected live or replayed run’s recorded configuration as themed summary and feature cards. It is separate from ★ NEXT RUN and has no editing controls.

![Opening the configuration page preserves the current stream and replay position.](current-run-harness-config/fig-1.svg)

*Opening the configuration page preserves the current stream and replay position.*

## What is displayed

Run ID, model/context/vision, thinking and output-token cap, time/turn/failure limits, preset, milestone stop, source and dirty status, start type, vendor/pi versions, tools, recorded switches and enabled feature IDs. Expand the recorded prompt or raw run header for exact details.

## Available tools

Each tool recorded in the selected run has a read-only card with its purpose, inputs, outputs and an expandable illustrative input. Reference text is source-checked against the viewer build; older run headers record names, not historical schemas. Unknown tools say documentation is unavailable. The cards never execute tools.

## Find a feature

Type in FIND A FEATURE to filter cards by literal name or ID text, ignoring capitalization. Descriptions are excluded. Empty groups disappear; clear the search to restore all cards. The search changes only what you see and stays in place during live updates.

## A real recorded example

Selected fields from run `2026-10-14T15-15-35_think-fast_00aa`. The page reads these values from that run, not from today’s next-run defaults. The excerpt omits other run-header fields.

```
{
  "model": {
    "id": "think-fast"
  },
  "harness": {
    "commit": "2c46415dea95f8bad62df51208afc98a02f5603f",
    "dirty": false
  },
  "evaluation": {
    "preset_id": "navigation-memory-n4-on",
    "target": null,
    "failure_limit": 3,
    "flags": {
      "loopGuard": true,
      "activeUi": true,
      "interfaceDocs": true,
      "objectives": false
    }
  },
  "budgets": {
    "max_turns": 1500,
    "max_wall_ms": 1800000
  }
}
```

## ON, OFF and unknown are different

The four explicit evaluation flags show their recorded ON/OFF values. Feature cards show descriptions, exact IDs and ON/OFF/NOT RECORDED badges, grouped by observation, guidance, guard and measurement. Available explainers open through allowlisted local viewer links. The feature catalog supplies descriptions, never historical settings. The enabled-feature cards show exact IDs present in the header. An absent ID alone does not prove OFF or support in an older build; missing metadata says “not recorded.” A null recorded milestone target means play to budget. Endpoint, weight digest, temperature and unspecified serving defaults are not reconstructed from the current service.

Status: viewer-only change on a working branch; focused mounted tests, viewer coverage/lint/build and independent review qualify delivery separately from landing. No game/harness configuration changes, no model context changes, no benchmark restart.
