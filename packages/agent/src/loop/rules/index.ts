import type { CompletedCall, LoopHit, LoopRule, LoopRuleFeatures, RuleContext } from "../types.js";
import { basicRule } from "./basic.js";
import { fieldRule } from "./field.js";
import { interfaceRule } from "./interfaces.js";

export const LOOP_RULE_PRIORITY = [
  "planning",
  "observation",
  "interaction-message",
  "restarted-dialogue",
  "clock-view",
  "closed-dialogue",
  "ineffective-action",
  "state-cycle",
  "pushback",
  "revisit",
  "transition",
  "battle-menu",
  "trigger-script",
  "rejection",
] as const;

export function buildLoopRules(features: LoopRuleFeatures): readonly LoopRule[] {
  return [
    basicRule("planning", "planning"),
    basicRule("observation", "observation"),
    basicRule("interaction-message", "cycle", features.interactions ?? false),
    basicRule("restarted-dialogue", "cycle", features.interactions ?? false),
    interfaceRule("clock-view", "cycle", features.clockViews ?? false),
    interfaceRule("closed-dialogue", "cycle", features.closedDialogue ?? false),
    basicRule("ineffective-action", "ineffective"),
    basicRule("state-cycle", "cycle"),
    fieldRule("pushback", "cycle", features.pushback ?? false),
    fieldRule("revisit", "cycle", features.ineffectiveLoops ?? false),
    fieldRule("transition", "cycle", features.transitions ?? false),
    interfaceRule("battle-menu", "cycle", features.menuLoop ?? false),
    fieldRule("trigger-script", "trigger_script", features.triggerScriptLoops ?? false),
    basicRule("rejection", "rejection"),
  ];
}

export function firstLoopHit(
  rules: readonly LoopRule[],
  call: CompletedCall,
  context: RuleContext,
): { readonly rule: LoopRule; readonly hit: LoopHit } | null {
  for (const rule of rules) {
    const hit = rule.check(call, context);
    if (hit !== null) return { rule, hit };
  }
  return null;
}
