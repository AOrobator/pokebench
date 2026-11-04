import { describe, expect, it } from "vitest";
import { SAMPLES, sample } from "../test-support/events.js";
import type { RunEvent } from "./events.js";
import { formatEvent, tailRun } from "./tail.js";

const ENVELOPE = { v: 1 as const, run: "r1", t: "2026-10-11T21:40:05.123-04:00" };

function event(index: number, seq = index): RunEvent {
  return { ...ENVELOPE, seq, ...sample(index) };
}

describe("formatEvent", () => {
  it("renders every event type on one line with Eastern clock time and turn", () => {
    const lines = SAMPLES.map((_body, index) => formatEvent(event(index)));
    for (const line of lines) {
      expect(line).toMatch(/^21:40:05 +t\d+ /);
      expect(line).not.toContain("\n");
    }
    expect(lines).toEqual([
      "21:40:05   t0 RUN START  think-swarm (vision) thinking=medium tools=screenshot,state,press start=boot",
      "21:40:05   t1 TURN       context 1 msgs, 0 images, ~12 tokens",
      '21:40:05   t1 MODEL      900ms (ttft 120ms) 100→20 tok [toolUse] think: Look first. | call press {"buttons":["A"]}',
      '21:40:05   t1 CALL       press {"buttons":["A"]}',
      "21:40:05   t1 PRESS      A",
      "21:40:05   t1 RESULT     press ok 140ms: ok [1 frame]",
      "21:40:05   t1 MILESTONE  GAME_RUNNING",
      "21:40:05   t1 RETRY      1/3 invalid tool arguments",
      "21:40:05   t1 DISK       frames at 10% of cap (50.0 MB)",
      "21:40:05   t1 EVICTED    3 frames (1.5 KB) from older-run",
      "21:40:05   t1 RUN END    budget, furthest GAME_RUNNING, 1 turns, 5.0s, 100→20 tok, 1 frames",
      "21:40:05   t1 STATE      LITTLEROOT TOWN (5,8) overworld, party TORCHIC L5 18/20, ₽3000, 1 badges, play 0:12:34",
      "21:40:05   t1 COMPACT    context 30000 → 4000 tokens",
      "21:40:05   t1 PRESS      UP A (hold 10f, release 8f)",
      "21:40:05   t1 TELEMETRY  state read failed: GET http://127.0.0.1:8000/state returned HTTP 503",
      "21:40:05   t1 STREAM     think: Look at the screen",
      "21:40:05   t0 objective  active: Get starter",
      "21:40:05   t1 attempt    no_change",
    ]);
  });

  it("summarizes a dialogue auto-advance on one line", () => {
    const base = { ...ENVELOPE, seq: 1, turn: 2, type: "dialogue_auto_advance" as const, tool_call_id: "c", tool: "press" as const, requested: ["A" as const, "A" as const], sent: ["A" as const], auto_presses: 2, pages: [{ state_seq: 1, map: null, map_id: null, position: null, speaker: null, speaker_source: null, text: "Hi" }], stop: "field_free" as const, detail: "closed", duration_ms: 5 };
    expect(formatEvent({ ...base, dropped: ["A"] })).toBe("21:40:05   t2 DIALOGUE   auto-advanced 2 B (press) · 1 pages · stop field_free · 1 inputs not sent");
    expect(formatEvent({ ...base, dropped: [] })).toBe("21:40:05   t2 DIALOGUE   auto-advanced 2 B (press) · 1 pages · stop field_free");
    expect(formatEvent({ ...base, dropped: [], battle_auto_presses: 1, stop: "battle_input" })).toBe("21:40:05   t2 DIALOGUE   auto-advanced 2 B (1 in battle) (press) · 1 pages · stop battle_input");
  });

  it("shortens long thinking and marks errors", () => {
    const long = { ...event(2), thinking: "y".repeat(500), stop_reason: "error", error: "HTTP 500" } as RunEvent;
    const line = formatEvent(long);
    expect(line.length).toBeLessThan(260);
    expect(line).toContain("[error: HTTP 500]");
    const failed = { ...event(5), is_error: true } as RunEvent;
    expect(formatEvent(failed)).toContain("press ERROR");
  });
});

describe("formatEvent variants", () => {
  it("renders a save-state start, a text-only lane, spoken text, a missing ttft and several frames", () => {
    const start = {
      ...event(0),
      model: { id: "think-faster", context_window: 4096, max_tokens: 1024, vision: false },
      start_state: { kind: "save_state", path: "states/route101.state", sha1: "a".repeat(40) },
    } as RunEvent;
    expect(formatEvent(start)).toContain("think-faster thinking=medium");
    expect(formatEvent(start)).toContain("start=states/route101.state");
    const spoken = { ...event(2), thinking: "", text: "Hello there.", ttft_ms: null, tool_calls: [] } as RunEvent;
    expect(formatEvent(spoken)).toContain("(ttft -)");
    expect(formatEvent(spoken)).toContain("say: Hello there.");
    expect(formatEvent(spoken)).not.toContain("think:");
    const frames = { ...event(5), frames: [...(event(5) as { frames: unknown[] }).frames, { path: "frames/000006_1.png", sha1: "b".repeat(40) }] } as RunEvent;
    expect(formatEvent(frames)).toContain("[2 frames]");
    const noFrames = { ...event(5), frames: [] } as RunEvent;
    expect(formatEvent(noFrames)).toMatch(/: ok$/);
    const unknownError = { ...event(2), stop_reason: "error" } as RunEvent;
    expect(formatEvent(unknownError)).toContain("[error: unknown]");
    const nowhere = { ...event(10), furthest_milestone: null } as RunEvent;
    expect(formatEvent(nowhere)).toContain("furthest none");
  });
});

describe("formatEvent state before the game starts", () => {
  it("says the game has not started instead of printing save fields", () => {
    const pre = {
      ...event(11),
      screen: "naming",
      started: false,
      name: null,
      location: null,
      map_id: null,
      position: null,
      facing: null,
      party: [],
      money: null,
      badges: [],
      play_time_s: null,
    } as RunEvent;
    expect(formatEvent(pre)).toBe("21:40:05   t1 STATE      naming, game not started");
  });
});

describe("tailRun", () => {

  it.each([[[]], [["a", "b"]]])("rejects arguments %j", async (argv) => {
    const lines: string[] = [];
    expect(await tailRun(argv, "/nowhere", (line) => lines.push(line))).toBe(2);
    expect(lines).toEqual(["usage: tail-run <run id>"]);
  });
});
