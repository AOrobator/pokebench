# Neutral YES/NO controls

> Markdown twin of [neutral-yes-no-readout-v1.html](../neutral-yes-no-readout-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

## The player chooses

The readout describes the current selection and both control paths, in the game's YES, NO order. It does not recommend an answer.

![Ready YES/NO menu to two equally presented choices](neutral-yes-no-readout-v1/fig-1.svg)

Illustration: when YES is selected, A chooses YES; DOWN then A chooses NO.

## Before and after

Actual recorded input: run 2026-10-28T04-53-02_qwen36-gpu0_88ea, seq 59140, May's Rustboro battle question, selected YES.

Original: `To answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.`

Replacement, same state: `YES/NO controls: selected YES; YES: A; NO: DOWN, A; B: NO.`

With NO selected: `YES/NO controls: selected NO; YES: UP, A; NO: A; B: NO.`

This mapping lists sequential buttons. B is reported as NO only where the handler takes that branch. In the battle forfeit box, B is described as closing the box without choosing.

## Scope and evidence

Needs yes-no-answer-readout-v1. Only changes that feature's added line, for the same ready menus with known selections. Unknown and unsupported menus remain unchanged. OFF preserves the original wording byte for byte. New switch defaults OFF when omitted. The operator approved ON in the current bundle on October 28, 2026; control remains OFF. Existing active runs keep their frozen configuration.

Source: pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; script_menu.c Task_HandleYesNoInput, menu.c Menu_ProcessInputNoWrap, battle_script_commands.c YES/NO handlers and battle_controller_player.c PlayerHandleYesNoInput. Uses existing verified readers; no new RAM addresses or controls.

Status: candidate a working branch. Automated readout tests verify both selections and B semantics. The shared current recipe enables this switch only in its bundle arm. Behavioral benefit has not been measured; review, landing and activation are separate.
