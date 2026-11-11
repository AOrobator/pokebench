<a id="overview"></a>

# When does the startup prompt reach Qwen?

> Markdown twin of [checkpoint-research-note-v1.html](../checkpoint-research-note-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

## Executive summary

**The implemented trigger is configured saved-game startup.** The researcher supplies a frozen note; the harness appends it to the **first user message**. It leaves the system prompt unchanged. Automatic Rusturf-entry detection and location-based context resetting remain proposed.

## Exact startup gates

| Condition | Implemented behavior |
|---|---|
| Research-note switch OFF | Original initial message; no note-file read. |
| Switch ON | Requires saved-game startup, truthful-checkpoint wording, explicit descriptor and expected checksum. |
| Validation | Checks JSON version/fields, policy ID, nonblank text, file/text checksums and byte limits. Invalid configuration stops startup. |
| Incompatible modes | Boot, restored conversation-history continuation and state-only mode are rejected. |

**The loader checks no map, badge, grunt flag or checkpoint checksum.** The experiment separately pinned and verified its save. Content checksums establish identity, not factual truth.

## When and where

\1. Read configuration → validate the supplied note

\2. Restore the game checkpoint → save note receipt before model input

\3. First model request: existing system instructions + tools; user message = normal mission + two newlines + exact note

\4. Model chooses a call → observe returns current readout/screenshot → normal conversation continues

Restoring the game creates a **fresh conversation**. The eight-badge mission and game tools stay unchanged; the note performs no automatic interaction. The first request has no delivered current observation. The note asks the model to observe; it does not force that call. Later requests can retain the note as conversation history, subject to ordinary context management. This hook adds no recurring reminder, retention guarantee, reset or task-retirement controller.

## What this experiment supplied

The frozen 3,516-byte note states Rusturf map \[24,4\], start \[4,10\], and prior Peeko/Black Belt reports; then gives local-priority, current-person/tool-binding and follow-through guidance. These are researcher-supplied facts/instructions, not facts automatically extracted from this fresh run. The coordinates are fixed to the tested save.

[Read the exact initial user message — optional source appendix](#exact-message)

CPU rehearsal captured the exact first message and its retention in the second request. Native runs retain note/message checksums and exposed responses; complete historical GPU user-message wire bodies are unavailable.

## Proposed entry trigger

Verified map transition + eligible unresolved episode from this run → current-evidence reminder → resume through interruptions → retire on observed resolution

**Design sketch, unimplemented.** A future trigger must use current location and genuinely observed task facts, handle re-entry and menus/battles, and avoid replaying these fixed coordinates/quotes indiscriminately. Context compaction must preserve unfinished tasks. Continuous Roxanne-to-grunt and new-game tests remain open.

## Status and source

Startup delivery implemented and measured; default OFF. Documentation only changes here. Source: `checkpoint-research-note.ts` (validation/receipt), `play-config.ts` (initial user message), `live.ts` (startup/order). No new gameplay or prompt behavior is enabled.

<a id="exact-message"></a>

# Exact initial user message

## Source appendix

Optional full payload; 602 words. Role: `user`. This is the complete consumer-generated initial message, captured in the CPU rehearsal. The ordinary system prompt and tool definitions accompany it separately. This is not a captured historical GPU request.

[← Back to the short explainer](#overview)

```
The game has resumed from a recorded checkpoint. Progress through Pokémon Emerald and collect all eight Gym Badges. Complete story tasks needed to advance. Discovered gyms remain unfinished until you earn their badges; you may return later when necessary.

VERIFIED CHECKPOINT START
This save resumes inside RUSTURF TUNNEL, on map [24,4] at [4,10]. These are start facts, not a route or a list of current people. First use observe to obtain current evidence. The words Route116 in the episode record identify where a prior report was heard; they do not instruct you to leave the tunnel. Keep an unnamed exit's destination unknown until the game identifies it. Do not replace current Rusturf Tunnel with an invented second tunnel, hideout, city, or recalled map identity. When prior reasoning conflicts with the latest observation, update the reasoning.

CURRENT GAMEPLAY QUESTION
Which next legal action will advance the unresolved reported incident here before unrelated travel?

OBSERVED EPISODE RECORD
The Route116 speaker said: "The scoundrel made off with my darling PEEKO!" and the BLACK_BELT said: "I was digging the tunnel without any tools when some goon ordered me out!"
These observations report an unfinished local episode; they do not record its resolution. Work on this episode before a speculative distant itinerary. This is one task, not a reason to visit every untouched person.

GET CURRENT EVIDENCE FIRST
Observe the current interface. Only people visible in the current view are listed. If none are listed at the entrance, move through reachable interior floor to obtain a new view, then observe; do not conclude that there are no local leads. Use the current map/readout to choose a reachable investigation step, including a listed coordinate trigger only when its printed condition currently matches. A blocked onward route does not show that investigation on this side is exhausted. Select a person only from the current observation, rather than treating a past actor number or location as current.

EXECUTE YOUR CHOSEN STEP
Choose the intended result: interacting with a listed person is different from travelling to a tile. If your intended step is to talk to, investigate or approach a listed person, issue navigate_to_target with the current observed map_id and listed target identity; do not issue navigate_to with that person’s coordinates. target.kind is object for a currently loaded person, or static_object only when the current tool schema supports it and the readout lists a map template target; target.local_id is the listed integer ID. A template permits approach only, not proof of contact. Use exactly the fields and value types declared by the tool you call. If its because field is a string, put the required verbatim observation quote in that string; if because is an object, put the quote in its quote string and use rationale only when that schema permits it. Do not add because to a tool that does not declare it. Never put another executable call in an explanation while issuing a different operation. The actual emitted tool and arguments must perform the operation you chose. When already adjacent and facing the person with free field control, press A; a ready native question or battle instead owns the input. After a refusal or approach, use the latest observation before choosing the next step.

FOLLOW THE RESULT
Keep the supported episode pending through travel, refusals, dialogue, menus and battles. A failed approach can change the next step without completing the task. Arrival, a taunt or your own claim is not resolution. A current native question or battle owns the immediate input. Use subsequent game observations to recognize completion; then retire this local follow-up and choose the next supported task.
```

## Identity and timing

Policy: `native-v2-checkpoint_anchor`. Note: 3,516 UTF-8 bytes. Initial message: 3774 UTF-8 bytes. SHA-256: `dee4512e9097c6bda467bc224c587e4151a0b9e8e515057521d5cde357c0fac0`.

The second CPU request retained this same user message, followed by the scripted assistant observe, tool readout, attached screenshot and ordinary discovered-gym checklist. That scripted assistant is a caller rehearsal, not measured model reasoning.

The run receipt stores the descriptor, policy ID, file/text hashes and initial-message hash before the first input. Maximum note: 8,192 bytes; descriptor file: 65,536 bytes. Exact field schema: version, policyId, text, sha256; extra fields rejected. The live configuration supplies POKEBENCH_CHECKPOINT_RESEARCH_NOTE and POKEBENCH_CHECKPOINT_RESEARCH_NOTE_SHA256. The feature is checkpoint-research-note-v1 and depends on save-state-task-truth-v1.

Consumer/source proof and native outcome grading are separate. One final candidate trial failed activation-receipt validation and remained a failure; the document does not claim perfect receipt coverage.

[← Back to the short explainer](#overview)
