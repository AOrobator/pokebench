import { describe, expect, it } from "vitest";
import { LOOP_RULE_PRIORITY, buildLoopRules, firstLoopHit } from "./loop/rules/index.js";
import { LOOP_POLICY, type CompletedCall, type LoopHit, type LoopRule, type LoopRuleId } from "./loop/types.js";

describe("loop rule architecture", () => {
  it("keeps detector priority explicit and stable", () => {
    expect(LOOP_RULE_PRIORITY).toEqual([
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
    ]);
  });

  it("builds one ordered rule for every priority entry", () => {
    const rules: readonly LoopRule[] = buildLoopRules({});
    expect(rules.map((rule) => rule.id)).toEqual(LOOP_RULE_PRIORITY);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
  });

  it("selects the first candidate in registry order", () => {
    const rules = buildLoopRules({});
    const call: CompletedCall = { name: "observe", args: {}, isError: false, text: "ok", seq: 41 };
    const hit = (kind: LoopHit["kind"]): LoopHit => ({
      kind,
      message: kind,
      evidenceSeqs: [41],
      recovery: "novel-state",
    });
    const candidates = new Map<LoopRuleId, LoopHit>([
      ["rejection", hit("rejection")],
      ["observation", hit("observation")],
      ["planning", hit("planning")],
    ]);
    expect(firstLoopHit(rules, call, { seq: 41, policy: LOOP_POLICY, candidates })?.rule.id).toBe("planning");
  });
});
