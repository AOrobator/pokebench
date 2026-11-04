import { describe, expect, it } from "vitest";
import { endedByOperator } from "./frontier.js";


describe("operator run exclusions", () => {

  it("marks runs the operator ended early without excluding them", () => {
    expect(endedByOperator("operator_abort")).toBe("Ended by operator abort (operator_abort): progress before the abort counts; later milestones are censored, not failures");
    expect(endedByOperator("operator_stop")).toBe("Ended by operator stop (operator_stop): progress before the stop counts; later milestones are censored, not failures");
    expect(endedByOperator("budget")).toBeNull();
    expect(endedByOperator(null)).toBeNull();
  });
});
