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

it("classifies any one of the four Opus decisions as heavily assisted",()=>{
 for(const id of ["opus-rq-mach-bike-v1","opus-rq-master-ball-v1","opus-rq-catch-v1","opus-rq-moveset-v1"]){
  expect(customLaneOfStart({model:{id:"claude-opus-5-5"},harness_features:[id]})).toBe(`${id} is on`);
 }
});
it("classifies the foe-items and League stock-up knowledge as heavily assisted, but not the recap or supplies",()=>{
 const start=(id:string)=>({model:{id:"m"},harness_features:[id]});
 expect(customLaneOfStart(start("foe-trainer-items-v1"))).toBe("foe-trainer-items-v1 is on");
 expect(customLaneOfStart(start("league-stock-up-v1"))).toBe("league-stock-up-v1 is on");
 expect(customLaneOfStart(start("foe-item-recap-v1"))).toBeNull();
 expect(customLaneOfStart(start("supplies-v1"))).toBeNull();
});
