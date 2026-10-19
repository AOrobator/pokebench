import { describe, expect, it } from "vitest";
import { LOOP_RULE_PRIORITY, buildLoopRules } from "./loop/rules/index.js";
import type { LoopRule } from "./loop/types.js";

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
});
