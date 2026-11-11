Harness switch · guidance · `instruction-ledger-v1` · needs `active-field-message-buffer-v1`

# Instruction ledger

> Markdown twin of [instruction-ledger-v1.html](../instruction-ledger-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

A short block pinned before every decision: the latest dialogue the model was shown, the rooms it visited with what it heard there, and contradictions it recorded itself. Off by default.

## Why

In 11 of 24 recent runs that left home, the model walked into Birch's lab and kept treating it as the right place. In one run it called the object at 10,8 "Birch" while the readout labelled it SCIENTIST_1 and the dialogue said the professor would rather be outside than at a desk. The evidence was on screen; it just wasn't kept. The ledger keeps the last instructions in view and gives the model one place to write down "I expected X, the game showed Y" so it stops repeating the same wrong assumption.

## What it pins

![Ledger sections and their sources](instruction-ledger-v1/fig-1.svg)

***Every line has a source the model already saw.** The harness adds no goal, route or story step. Each delivered ledger is recorded as a `ledger_context` event with its text and the event numbers it cites, so the timeline, Activity History and replay show exactly what the model received.*

## Recording a contradiction

| Field | Rule |
|---|---|
| expected | 1–200 characters: what the model assumed |
| observed | 1–300 characters: what the game showed |
| evidence | 1–4 event numbers of delivered states or dialogue. Unknown numbers are rejected with a message saying to cite something it was shown. |

Only the newest 8 contradictions are kept. A contradiction is the model's own claim tied to evidence; the harness does not judge whether it is right.

## How it relates to the other memory switches

| Switch | Shape |
|---|---|
| `navigation-evidence-memory-v1` | Pinned: attempted targets and outcomes, rooms, last dialogue, an optional destination hypothesis |
| `dialogue-log-v1` | Not pinned: the full dialogue history, searched with recall_dialogue |
| `instruction-ledger-v1` | Pinned: last instructions, rooms with what was heard there, model-recorded contradictions |

Each is a separate switch so experiment arms can differ by exactly one flag. When both pinned switches are on, the ledger is appended after the navigation memory.

## Status

| Item | State |
|---|---|
| Default | OFF in v1 flag presets, v2 presets that omit it and the viewer next-run draft. Rejected in state-only mode. |
| Measured runs | none yet One step of the rival-house push |
