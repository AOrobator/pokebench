# Offline decision-probe plan: party-menu-message-v1

Status: PREPARED OFFLINE, no model discovery, requests, leases or workers authorized. Implementation fixtures are not a gameplay or decision-benefit result.

## Question and source
Does truthful native party message/readiness/cursor information change GLM's next decision at turn390 of 2026-10-22T20-40-54_glm53-mac_0d5d? Source event39808/paired frame039808_0.png/raw8361; loop39618–40935. Current-code replay differs from historical context: label and preserve any shared differences, and isolate only party-menu-message-v1 between arms. Readouts must be re-rendered for both arms with the same source RAM, system prompt/tools must match.

## Turn boundary (native trace checked)
Turn390 starts at39776, before event39808. Its prior result39774/state39773/raw8356 is the SEND OUT action menu on fainted MUDKIP. Turn390 presses A at39800; result39808/state39807/raw8361 shows the missing message. Turn391 starts39809 and is the first next decision exposed to that message. Prepare the requested turn390 cursor case and turn391 acknowledgement case separately; never describe a turn390 draw as a decision on the later event39808. Raw8360 has the same wait but is not the raw ref attached to event39808.

## Proposed first development batch (requires explicit approval)
Two arms: recorded feature set/current renderer with party-menu-message-v1 OFF vs same with ON. Two sequential samples per arm per turn390/391 case (8 total), recorded sampling settings and discovered actual source model only. One inspected run family with two adjacent development contexts, exploratory only. Budget is not authorized; estimate from a comparable model's measured latency/tokens and obtain window/owner clearance before launch. Do not substitute models without recording a separate lane.

Freeze exact HEAD/packet digest, source events prefix hashes through each turn390/391 boundary, all retained RAM refs, source model identity, prompt/tool hashes, source context hashes, sample count/order and scoring before any call. No resampling or input execution. Both arms use the same retained frames and histories. Keep reasoning and raw first tool call. Do not label departure from the recorded action as recovery.

## Scoring fixed before sampling
Score separately: (1) recognizes fainted MUDKIP and cursor index0/slot1; (2) recognizes the currently active A/B acknowledgement wait; (3) first proposed action respects this interface. An A/B acknowledgement is a valid next input; directions alone do not dismiss this text. Do not award a claim of a successful switch/return battle without native execution evidence (this probe performs none). Once the text is gone, a different live cursor is a distinct decision. Never coach move/route/party choice.

Contrast source fixtures: printing/not-ready and post-A chooser8367. These verify rendering eligibility offline, not transfer. Hold-out confirmation requires separately frozen untouched source-run families with genuine message/selection contrasts; no held-out family has been chosen or inspected for this work.

## Offline artifact and later launch boundary
Build with the owned branch and use the production decisionContext/probe with sampler=null/contextOnly. Preserve full contexts and diff hashes in owned ignored runs/party-menu-offline/. Do not use the CLI without --context-only. A context-only result has decisions=[] and is not a sampled study. Later real sampling must use the decision-probes skill's runs/probes manifest/status/provenance and viewer registration; pending authorization is never displayed as running. No current run, endpoint, GPU lease, scheduler or viewer mutation is part of preparation.
