POKEBENCH · GUARD SWITCH · DEFAULT OFF

# Recognize a repeated map trigger before five minutes pass.

> Markdown twin of [trigger-script-loop-v1.html](../trigger-script-loop-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

A coordinate trigger can run the same story script through several row wrappers. This switch groups executions by map, live variable condition, and displayed dialogue—not by wrapper address—then warns on the second recurrence.

## Detection

**Recorded evidence**

A tool call steps onto a condition-matching trigger while the script owns field controls; readable dialogue and the final tool-result sequence are retained.

→

**Second recurrence**

The typed `trigger_script` warning quotes the repeated dialogue and immediately delivers the existing supervisor briefing.

## OFF versus ON

**OFF · previous behavior**

No trigger-specific count exists; only later generic loop or milestone-drought checks can intervene.

→

**ON · evidence-bound warning**

One execution, a different variable condition or dialogue, and repeats separated by native story progress stay silent.

## Boundaries

The guard does not press buttons or choose a route. It emits the ordinary recorded loop event, visible in Activity History and raw event inspection.
