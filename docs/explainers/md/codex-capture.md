# Codex capture

> Markdown twin of [codex-capture.html](../codex-capture.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Keep the player’s native transcript, exposed reasoning summaries, observations and actions together. This adapter is selected explicitly for a new run. It never changes an existing player or bridge.

## Two evidence paths

### Native Codex log

Every original byte is copied, including tool output, compaction and opaque encrypted records.

### Durable capture

Explicit begin/respond tool calls identify the decision. The native observation result must exist between them.

### Game recording

Exposed summaries travel through pi’s reasoning field. A unique tool-call ID binds the assistant, action and result to the actual recorded game turn.

Source → capture → recorded turn

The index uses source byte ranges and IDs. It does not associate thoughts with actions by nearby timestamps. A missing or mismatched link is incomplete evidence.

## What “thinking” means here

| Evidence | Meaning |
|---|---|
| Provider reasoning summary | The exposed summary text from native `response_item.reasoning.summary`. Recorded separately from action explanations. |
| `none_emitted` | Summary output was enabled in effective turn context, but this decision emitted no readable summary. It does not mean the model did no internal work. |
| Action explanation | The player’s ordinary reply text. It cannot supply the reasoning field. |
| Encrypted reasoning | Preserved verbatim as opaque source bytes. No decryption, retrospective reconstruction or claim of raw chain of thought. |

The existing thinking pane receives any exposed summary through the normal assistant event. The capture index labels its provenance as `provider_reasoning_summary`. Summary text is not game-owned evidence of success.

## Prepare one new player

1. Complete the run-coordination skill and obtain launch authorization separately. This page does not authorize gameplay.
2. Start a fresh Codex player with supported summary output, for example the per-session CLI override `-c 'model_reasoning_summary="detailed"'`. Retain its actual session ID and native JSONL path. Model IDs and limits come from discovery, not this page.
3. Check effective native turn context. This installed CLI requested `detailed` but resolved to `auto` in the isolated rehearsal. The bridge checks the effective source settings; `none`, an unknown summary setting, or a different model is rejected.
4. Build once, select a fresh control-file path outside the future run directory, and assign the same run ID to the bridge and PokeBench launcher. Let the launcher create its own run directory. Capture is initialized only after validating its `run_start`.

```
just build
just codex-capture --capture-phase=serve \
  --control=/absolute/owned-test-dir/control.json \
  --source=/absolute/native-session.jsonl --session=ACTUAL_SESSION_ID \
  --events=/absolute/runs/ASSIGNED_RUN_ID/events.jsonl --run=ASSIGNED_RUN_ID \
  --model=DISCOVERED_MODEL --context=DISCOVERED_CONTEXT --tokens=DISCOVERED_OUTPUT_LIMIT \
  --port=0
```

The command prints a loopback URL and writes a private control file. Its `/v1/models` route supports discovery. For a separately approved new launch, use that URL plus `/v1` as `POKEBENCH_GATEWAY_URL`, the same model as `POKEBENCH_MODEL`, and the assigned `POKEBENCH_RUN_ID`. Keep endpoint-file overrides unset so they cannot select another endpoint. Do not point a new capture at Astra’s live bridge.

## Player decision protocol

```
just codex-capture --capture-phase=pending --control=/absolute/control.json

# In a separate native tool call, paste the returned key literally:
just codex-capture --capture-phase=begin --capture-key=RETURNED_32_HEX_KEY \
  --control=/absolute/control.json

# Read the complete text/tools and view the image_file paths as needed.
# Write reply.json with name, arguments, and optional text only.
# In another separate native tool call, with the same literal key:
just codex-capture --capture-phase=respond --capture-key=RETURNED_32_HEX_KEY \
  --control=/absolute/control.json --reply=/absolute/reply.json
```

The key must appear literally in the native tool input. Shell variables or a combined begin/respond tool call do not establish the required source anchors. The observation tool result must also be present. Missing, reused or ambiguous anchors fail closed. The reply file cannot inject thinking.

All text and tool definitions are retained. Inline images become durable image-file handles in the player export; the exact original HTTP request, including base64 image payloads, is archived separately. Image assets are deduplicated by content hash. This transformation is declared in the request receipt, and native tool outputs record what Codex actually received.

## Artifacts under the run

| Path under attached-harness/codex | Contents |
|---|---|
| `native.jsonl` | Incremental byte-for-byte copy of the supplied native session, independent of model context pruning. |
| `requests/KEY.json` | Original request bytes, with a SHA-256 receipt. |
| `images/HASH.ext` | Original decoded inline image bytes and stable file handles. |
| `index.jsonl` | Archive ranges/hashes, effective settings, explicit source anchors, exposed summaries, response receipts, actual turn/sequence/tool-result links, and final status. |

Find a recorded turn in `game_turn` rows, follow its `key` to the request and native-decision rows, then use the native byte ranges to inspect the original transcript. Assistant, tool-call and tool-result records must agree on identity, action and game turn. Error results remain error results.

Native source and response receipts are flushed before an action is forwarded. A final `sealed` record verifies the archived source prefix and carries the bridge’s complete/incomplete status. A partial native line, abandoned request, unresolved result, capture failure or missing seal must remain visible as incomplete evidence.

## Limits and proof

This version captures one Codex player session. Spawned player child sessions are refused until their sources can also be captured. Source rotation/truncation, changed source boundaries, malformed records, disk failures and mismatched run identity stop forwarding; they do not restart or stop a game process. The default native-record and HTTP-body bounds are 64 MiB each. Oversized input is rejected, never silently truncated.

The deterministic two-decision rehearsal forwards a nonempty native-format summary through the pinned pi parser and real recorder, then verifies exact game-turn links and a legitimate empty-summary decision. The isolated cloud Codex rehearsal completed two fake decisions and six links, with effective `auto` summaries; it emitted zero readable reasoning records/tokens. That proves live CLI/anchor/archive plumbing, not live nonempty-summary availability. A readable-summary preflight remains inconclusive until the selected provider emits one or Operator grants the documented exception.

A separate read-only audit archived Astra’s 53.7 MB native source and verified the source prefix and protected process identities. Its existing summaries remain disabled, and its historical turns are not retroactively qualified. No existing player, bridge, prompt, setting or original event file was changed.

Training and external exports are separate work. Preserve the distinctions between summaries, ordinary explanations, coordinator guidance and opaque records.
