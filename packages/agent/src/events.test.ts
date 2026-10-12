import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUN_START, SAMPLES } from "../test-support/events.js";
import { EventError, eventsJsonSchema, parseEvent, renderEventsJsonSchema } from "./events.js";

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
        "assistant",
        "button_press",
        "disk_usage",
        "frames_evicted",
        "milestone",
        "retry",
        "run_end",
        "run_start",
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
  ])("rejects %s", (_label, value) => {
    expect(() => parseEvent(JSON.stringify(value))).toThrow(EventError);
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
