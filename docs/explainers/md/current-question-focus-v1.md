# Current question focus

> Markdown twin of [current-question-focus-v1.html](../current-question-focus-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`current-question-focus-v1` · default OFF · ON only in the future bundle · control unchanged. Existing runs retain their recorded configuration.

## Answer this question before continuing the plan

Qwen can remember the right task and still answer a different question. This treatment repeats the current whole dialogue page beside the verified YES/NO selection and existing controls, immediately before the next decision. It then asks the model to compare both answer meanings with its intention and avoid inventing later consequences.

Existing delivered pages<br>
**Keep the final whole page**

→

Current state and result<br>
**Verify the same ready choice**

→

Temporary final cue<br>
**Compare meanings; model chooses**

## Recorded example: Briney in Dewford

In Qwen run `a702`, turn 893, the ordinary Dialog line contains two questions. The existing page records distinguish which came last.

### Existing result stays intact

```
Have you delivered your LETTER?
Or were you meaning to sail back to PETALBURG?
Interface: field_yes_no; input ready; selected YES
```

The full conversation, task history, screenshots and controls remain available.

### Additional current cue

```
CURRENT QUESTION
Or were you meaning to sail back to
PETALBURG?
Interface: field_yes_no; input ready; selected YES; Directions select; A chooses; B cancels
To answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.

Decision check: Interpret YES and NO against the CURRENT QUESTION separately. Compare those two meanings with your current intention, then choose the corresponding displayed input. Distinguish what the question actually asks from what an earlier page asked. If the game's later consequence is unknown, do not invent it to justify the answer.
```

This recorded example uses the legacy control line. The current bundle uses the existing neutral YES/NO control line; the cue copies that line instead. Both formats retain the frozen decision-check wording. No answer or hidden travel consequence is supplied.

## Keep old information out of the cue

| Required | Otherwise |
|---|---|
| Successful delivered result with a matching native state; ready field YES/NO; known selection and no coverage error. | No cue. |
| The existing page owner delivered the final whole page at the same map. Its text matches the end of the current visible Dialog buffer. | No guessed question. |
| The matching result still contains the current question, interface and copied answer controls in the model's actual context. | No revival of compacted-away or mismatched evidence. |
| The same question remains open after a selection change. | Refresh controls from the new delivered state. A new state expires a pending cue until a matching result is delivered. |

Only one question is retained. It is neither an objective ledger nor a dialogue archive. The cue is transient; it is not added to persistent conversation history. Existing ledger-context receipts record its exact text and source event references.

## OFF and scope

OFF retains the previous request, tools and execution. ON changes only this presentation. The model can accept, decline, gather information or change its plan. No automatic input, branch oracle, extra game fact or mandatory reasoning form is introduced. Clock confirmation, the naming keyboard, battle choices and other interface kinds are outside this first field-dialogue treatment.

## Measured wording and approved activation

The search compared facts-only placement, a generic reminder, an assumption correction, branch comparison, balanced examples and menu-first guidance. The selected branch wording is reproduced exactly above.

The fixed larger comparison used eight histories and four paired draws each: candidate32/32 versus baseline24/32 on current-question understanding plus an intent-matched committed first answer. Known cases scored16/16 versus9/16; fresh contrasts16/16 versus15/16. Family-level p=0.125 limits generalization. Three candidate replies still invented reward details, and no game tool was executed.

The operator approved this cue ON only in the current bundle, with omitted/global defaults OFF and control unchanged. No runs are started by this change. The existing page owner, state/source checks and expiry behavior are reused; the neutral-control interaction is covered by production-factory tests.

<details>
<summary>Source and verification</summary>

Game reference `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, `data/maps/DewfordTown/scripts.inc`, `DewfordTown_Text_SetSailBackToPetalburg` and `DewfordTown_EventScript_ReturnToPetalburgPrompt`. Recorded page event 44775, current native state 44776 and delivered result 44777 identify the example. Existing `dialogue-auto-advance-v1` owns the whole pages; existing interface readouts own controls. No address or decoder is added.

Candidate tests cover OFF, source qualification, expiry, selection changes, restored receipts and actual pinned-provider HTTP delivery after both trimming paths. Original guard-removal evidence is retained. Updated tests additionally pin the exact frozen wording, both neutral selections, stale/ambiguous controls and factory delivery. Full gates and independent review are recorded in the matching worklog; gameplay benefit remains untested.

Prompt research: [official Qwen3.6 model card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B) and [Qwen tool-calling guide](https://qwen.readthedocs.io/en/latest/framework/function_call.html). Research does not establish a winning game prompt; sampling, native tool protocol and historical thinking are held consistent across variants.

</details>

## Read the full result

The full search retains156calls; the final comparison is32newcalls per arm. Problem statement, grading, results and limitations.
