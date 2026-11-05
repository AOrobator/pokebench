import { describe, expect, it } from "vitest";
import { KNOWLEDGE_SWITCHES, customLaneOfStart } from "./custom-lane.js";

describe("customLaneOfStart", () => {
  const start = { model: { id: "qwen" }, harness_features: ["ram-state-v1"] };
  it("reads the same three lanes from a run_start", () => {
    expect(customLaneOfStart(start)).toBeNull();
    expect(customLaneOfStart({ ...start, model: { id: "qwen-EDIT-e1" } })).toBe("weight-edited model");
    expect(customLaneOfStart({ ...start, evaluation: { experiment: { id: "custom-hints" } } })).toBe("custom experiment");
    expect(customLaneOfStart({ ...start, evaluation: { experiment: { id: "bundle-v-control" } } })).toBeNull();
    expect(customLaneOfStart({ ...start, evaluation: {} })).toBeNull();
    for (const id of KNOWLEDGE_SWITCHES) expect(customLaneOfStart({ ...start, harness_features: [id] })).toBe(`${id} is on`);
  });
});

it("treats the Rayquaza guide as a knowledge switch",()=>{
 expect(KNOWLEDGE_SWITCHES.has("rq-milestone-guide-v1")).toBe(true);
});
