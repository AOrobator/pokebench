import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUN_START, SAMPLES } from "../test-support/events.js";
import { EventError, eventEnvelope, eventProblem, eventsJsonSchema, parseEvent, renderEventsJsonSchema, startIdentity } from "./events.js";

const ENVELOPE = { v: 1, run: "2026-10-11T21-40-05_think-swarm_a1b2", seq: 0, t: "2026-10-11T21:40:05.123-04:00" };

describe("event schema", () => {
  it.each(SAMPLES.map((body) => [body.type, body] as const))("accepts a %s event", (_type, body) => {
    const line = JSON.stringify({ ...ENVELOPE, ...body });
    expect(parseEvent(line)).toEqual({ ...ENVELOPE, ...body });
  });

  it("covers every event type with a sample", () => {
    const types = new Set(SAMPLES.map((body) => body.type));
    expect([...types].sort()).toEqual(
      [
        "objective_update",
        "objective_attempt",
        "assistant",
        "assistant_delta",
        "button_press",
        "compaction",
        "disk_usage",
        "frames_evicted",
        "milestone",
        "retry",
        "run_end",
        "run_start",
        "state",
        "telemetry_error",
        "tool_call",
        "tool_result",
        "turn_start",
      ].sort(),
    );
  });

  it.each([
    ["an unknown type", { ...ENVELOPE, type: "telemetry", turn: 0 }],
    ["a missing envelope field", { run: ENVELOPE.run, seq: 0, t: ENVELOPE.t, ...RUN_START }],
    ["an extra property", { ...ENVELOPE, ...RUN_START, surprise: true }],
    ["a negative seq", { ...ENVELOPE, ...RUN_START, seq: -1 }],
    ["a UTC timestamp", { ...ENVELOPE, ...RUN_START, t: "2026-10-12T01:40:05.123Z" }],
    ["an unknown stop reason", { ...ENVELOPE, ...SAMPLES[10], reason: "bored" }],
    ["an unknown button", { ...ENVELOPE, ...SAMPLES[4], buttons: ["NOPE"] }],
    ["a disk percent off the 10% grid", { ...ENVELOPE, ...SAMPLES[8], percent: 15 }],
    ["a path-escaping run id", { ...ENVELOPE, ...RUN_START, run: "../x" }],
    ["a state with an inline screenshot", { ...ENVELOPE, ...SAMPLES[11], screenshot_base64: "iVBORw0KGgo" }],
    ["a state party member without hp", { ...ENVELOPE, ...SAMPLES[11], party: [{ species: "TORCHIC", level: 5, max_hp: 20 }] }],
    ["a state with negative money", { ...ENVELOPE, ...SAMPLES[11], money: -1 }],
    ["a zero-frame hold", { ...ENVELOPE, ...SAMPLES[13], hold_frames: 0 }],
    ["a telemetry error from an unknown source", { ...ENVELOPE, ...SAMPLES[14], source: "map" }],
    ["a compaction with a negative size", { ...ENVELOPE, ...SAMPLES[12], to_tokens: -5 }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseEvent(JSON.stringify(value))).toThrow(EventError);
  });

  it("accepts completed as a run_end reason", () => {
    const line = JSON.stringify({ ...ENVELOPE, ...SAMPLES[10], reason: "completed" });
    expect(parseEvent(line)).toMatchObject({ type: "run_end", reason: "completed" });
  });

  it("still accepts an M4 (v1.0) button_press without hold/release frames", () => {
    expect(parseEvent(JSON.stringify({ ...ENVELOPE, ...SAMPLES[4] }))).not.toHaveProperty("hold_frames");
  });

  it("titles the exported schema v1.1", () => {
    expect(eventsJsonSchema().title).toBe("PokeBench run event (v1.1)");
  });

  it("rejects a line that is not JSON", () => {
    expect(() => parseEvent("{not json")).toThrow(EventError);
  });

  it("checked-in schemas/events.v1.json matches the TypeBox source", () => {
    const path = fileURLToPath(new URL("../../../schemas/events.v1.json", import.meta.url));
    expect(readFileSync(path, "utf8")).toBe(renderEventsJsonSchema());
    expect(JSON.parse(renderEventsJsonSchema())).toEqual(eventsJsonSchema());
  });
});

it("preserves old vendor state events for historical replay", () => {
  const legacy = { ...ENVELOPE, type: "state", turn: 2, location: "LITTLEROOT TOWN", position: { x: 2, y: 3 }, facing: "down", mode: "overworld", in_battle: false, party: [], money: 3000, badges: [], play_time_s: 10 };
  expect(parseEvent(JSON.stringify(legacy))).toEqual(legacy);
});

it("validates naming editor state without requiring it in old logs", () => {
  const body = { ...ENVELOPE, ...SAMPLES[11], naming: { text: "AB", page: "uppercase", column: 1, row: 0, key: "B", ready: true } };
  expect(parseEvent(JSON.stringify(body))).toMatchObject({ naming: { key: "B" } });
  for (const change of [{ column: 9 }, { row: -1 }, { page: "unknown" }, { ready: "yes" }]) {
    expect(() => parseEvent(JSON.stringify({ ...body, naming: { ...body.naming, ...change } }))).toThrow(EventError);
  }
});

it("carries typed field context and rejects malformed trigger conditions", () => {
  const body = { ...ENVELOPE, ...SAMPLES[11], world_context: { objects: [], triggers: [{x:10,y:1,elevation:3,variable:0x4050,required_value:0,current_value:0,condition_met:true,script_pointer:0x08100000}], dialogue:null } };
  expect(parseEvent(JSON.stringify(body))).toMatchObject({world_context:{triggers:[{condition_met:true}]}});
  expect(() => parseEvent(JSON.stringify({...body,world_context:{...body.world_context,dialogue:1}}))).toThrow(EventError);
});

describe("event problems name the event's own type", () => {
  const sample = (type: string): Record<string, unknown> => {
    const body = SAMPLES.find((s) => s.type === type);
    if (body === undefined) throw new Error(`no ${type} sample`);
    return { ...ENVELOPE, seq: 5, ...body };
  };
  it("reports an unexpected nested property of a state event at its path", () => {
    const state = sample("state");
    expect(eventProblem({ ...state, position: { x: 5, y: 8, battler_0_ready: true } })).toBe("invalid state event at /position: unexpected property battler_0_ready");
  });
  it("reports an unexpected top-level property with the root path", () => {
    expect(eventProblem({ ...sample("compaction"), surprise: 1 })).toBe("invalid compaction event at /: unexpected property surprise");
  });
  it("reports a missing field of the event's own type, not another member's", () => {
    const rest = sample("compaction"); delete rest.to_tokens;
    const problem = eventProblem(rest);
    expect(problem).toMatch(/^invalid compaction event at \/: .*to_tokens/);
    expect(problem).not.toContain("action, status, request");
  });
  it("reports a bad value inside a type with several schema members (tool_call)", () => {
    expect(eventProblem({ ...sample("tool_call"), name: 7 })).toMatch(/^invalid tool_call event at \/name: /);
  });
  it("names an unknown type and a value without a type", () => {
    expect(eventProblem({ ...ENVELOPE, type: "telemetry", turn: 0 })).toBe('unknown event type "telemetry": this build of the schema does not know it');
    expect(eventProblem({ ...ENVELOPE, turn: 0 })).toBe("invalid event: no string type field");
    expect(eventProblem([1])).toBe("invalid event: not a JSON object");
    expect(eventProblem(null)).toBe("invalid event: not a JSON object");
  });
  it("decodes JSON pointer escapes in property names", () => {
    expect(eventProblem({ ...sample("compaction"), "a/b~c": 1 })).toBe("invalid compaction event at /: unexpected property a/b~c");
  });
  it("returns null for a valid event and keeps the message on parseEvent", () => {
    expect(eventProblem(sample("state"))).toBeNull();
    expect(() => parseEvent(JSON.stringify({ ...sample("compaction"), surprise: 1 }))).toThrow("invalid compaction event at /: unexpected property surprise");
  });
});

describe("event envelope", () => {
  it("reads the envelope of an event the schema rejects", () => {
    expect(eventEnvelope({ ...ENVELOPE, seq: 4, turn: 2, type: "state", battle: { message: {} } })).toEqual({ run: ENVELOPE.run, seq: 4, t: ENVELOPE.t, turn: 2, type: "state" });
  });
  it.each([
    ["a non-object", 3],
    ["a missing seq", { ...ENVELOPE, seq: undefined, turn: 0, type: "state" }],
    ["a UTC timestamp", { ...ENVELOPE, t: "2026-10-12T01:40:05.123Z", turn: 0, type: "state" }],
    ["a missing type", { ...ENVELOPE, turn: 0 }],
    ["another schema version", { ...ENVELOPE, v: 2, turn: 0, type: "state" }],
  ])("refuses %s", (_label, value) => {
    expect(eventEnvelope(value)).toBeNull();
  });
});

describe("run_start identity read loosely", () => {
  const start = { ...ENVELOPE, ...RUN_START, turn: 0 } as Record<string, unknown>;
  const commit = "0123456789abcdef0123456789abcdef01234567";
  it("reads a newer harness's run_start that the schema rejects", () => {
    const newer = { ...start, harness: { commit, dirty: true }, surprise: 1 };
    expect(eventProblem(newer)).toContain("unexpected property surprise");
    expect(startIdentity(newer)).toEqual({ run: ENVELOPE.run, t: ENVELOPE.t, commit, dirty: true, model: "think-swarm", port: 8000 });
    expect(startIdentity({ ...start, harness: { commit, dirty: false, branch: "main" } })).toMatchObject({ commit, dirty: false });
  });
  it("reads a valid run_start the same way", () => {
    expect(eventProblem(start)).toBeNull();
    expect(startIdentity(start)).toEqual({ run: ENVELOPE.run, t: ENVELOPE.t, commit, dirty: false, model: "think-swarm", port: 8000 });
  });
  it("leaves the model and port null when they cannot be read", () => {
    expect(startIdentity({ ...start, model: "x", isolation: { port: 0 } })).toMatchObject({ model: null, port: null });
    expect(startIdentity({ ...start, model: { id: 3 }, isolation: null })).toMatchObject({ model: null, port: null });
    expect(startIdentity({ ...start, isolation: { port: 70000 } })).toMatchObject({ port: null });
    expect(startIdentity({ ...start, isolation: { port: 80.5 } })).toMatchObject({ port: null });
  });
  it.each([
    ["a non-hex commit", { ...start, harness: { commit: "Z".repeat(40), dirty: false } }],
    ["a short commit", { ...start, harness: { commit: "abc", dirty: false } }],
    ["a missing harness", { ...start, harness: undefined }],
    ["a harness that is not an object", { ...start, harness: "0123456" }],
    ["a dirty flag that is not boolean", { ...start, harness: { commit, dirty: "no" } }],
    ["another event type", { ...start, type: "state" }],
    ["a later seq", { ...start, seq: 1 }],
    ["a broken envelope", { ...start, run: "" }],
    ["a non-object", "run_start"],
  ])("refuses %s", (_label, value) => {
    expect(startIdentity(value)).toBeNull();
  });
});
