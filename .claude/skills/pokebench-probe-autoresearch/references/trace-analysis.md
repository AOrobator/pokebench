# Trace analysis before adaptation

Use after every completed exploratory batch and before choosing its successor. The core [decision-probe skill](../../pokebench-decision-probes/SKILL.md) owns the frozen primary endpoint, blinding and raw evidence. Do not inspect outcomes during a running batch or rewrite its protocol to favor an interesting trace.

## Separate the stages

Read the delivered observations, complete available response and actual request for every arm, including nulls, errors and malformed planner outputs. Give each logical trial and planner/executor stage an identity. Assess these separately:

| Stage | Question |
|---|---|
| Evidence | What was actually delivered? Was it recognized, missed, contradicted or explicitly overridden? |
| Task and assumptions | What immediate task did the model state, and which observed facts or unsupported beliefs justified it? |
| Actor and operation | Which person or operation did it choose? Is this a local investigation, an asserted identity, or an invented prerequisite? |
| Request | What tool and arguments did it actually emit, rather than merely describe or quote? |
| Execution | Is that request legal in the current state, and what native transition occurred if it was executed? |
| Continuity | Did the task survive an interruption, resume at the right stage and retire only after observed resolution? |

A useful task can produce an occupied-coordinate call, malformed argument, duplicate call or incompatible battle action. Conversely, a correct call can coexist with false geography or invented opponent levels. Keep those findings separate. A frozen target-step score may reject a potentially useful alternate approach; name that endpoint and report alternate intent/request diagnostics separately rather than silently changing the score.

A planner's useful intent remains analyzable when its visible JSON fails, but the failed handoff remains in the end-to-end denominator. An absent executor is unavailable, not evidence that execution would have succeeded. Structural validation does not establish evidence truth, sound task choice or role compliance. Task-only plans can choose actors through operative task text, coordinates or tool instructions even without an actor field. Quoted historical evidence naming a person is not automatically actor selection. Actor-null plans that direct a particular next person also need semantic inspection. Use one fresh independent plan per logical trial; repeated executions of one plan do not replicate planning.

## Grade and record honestly

Use a compact codebook with explicit uncertain/unavailable labels and case evidence. Freeze it before confirmation; lock blinded grades/adjudications before joining arm identities. Separate a posthoc explanatory analysis from those locked grades. Thinking text reports stated beliefs, not proof of hidden causal cognition; do not infer unavailable reasoning from fluent visible explanations.

Record per-case, per-arm and per-stage denominators, errors and disagreement. Describe common, occasional and rare patterns only within the actual reviewed corpus. Preserve full raw thinking/text/actions, source hashes, IDs, coverage and any unreviewed or truncated material. Read missing chunks before claiming full coverage. Inspect controls as well as apparent improvements: task retirement, native menu/battle ownership and unnecessary preparation can expose indiscriminate action bias.

The adaptation record should identify the first evidenced boundary that failed and the test that could distinguish explanations. Examples: recognized-but-overrode evidence suggests a priority hypothesis; right task/wrong request suggests binding; a correct initial handoff followed by abandonment suggests continuity. These are hypotheses, not automatic prescriptions or proof that a particular phrase caused the behavior.

## Measure persistence as temporal behavior

A standing-task sentence in one frozen response tests an initial handoff, not sparse replanning or persistence. Trace the policy through adoption, suspension during travel/healing/battles or tool refusal, resumption after new evidence, native completion and retirement. Check whether a moving actor or failed approach changes the approach while retaining a still-supported task. Also check that genuine contradiction or completion can change the task.

Use multi-decision evidence and the qualified continuation path in [checkpoint validation](checkpoint-validation.md) for temporal claims. Do not substitute more draws of the same initial prompt for this evidence, or treat arrival/taunt as proof of victory. Attribute automatic/human recovery separately. The next experiment should target the evidenced boundary while retaining the components that actually helped.
