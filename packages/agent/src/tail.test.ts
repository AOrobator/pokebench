import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLES } from "../test-support/events.js";
import type { RunEvent } from "./events.js";
import { followEvents, formatEvent } from "./tail.js";

const ENVELOPE = { v: 1 as const, run: "r1", t: "2026-10-11T21:40:05.123-04:00" };

function event(index: number, seq = index): RunEvent {
  return { ...ENVELOPE, seq, ...SAMPLES[index]! } as RunEvent;
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
    ]);
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

describe("followEvents", () => {
  it("emits complete lines as they are appended, buffering partial writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pokebench-tail-"));
    const path = join(dir, "events.jsonl");
    writeFileSync(path, `${JSON.stringify(event(0))}\n`);
    const seen: number[] = [];
    const controller = new AbortController();
    const done = followEvents(path, (e) => {
      seen.push(e.seq);
      if (e.type === "run_end") controller.abort();
    }, { intervalMs: 5, signal: controller.signal });
    const half = JSON.stringify(event(1));
    appendFileSync(path, half.slice(0, 10));
    await new Promise((resolve) => setTimeout(resolve, 20));
    appendFileSync(path, `${half.slice(10)}\n${JSON.stringify(event(10, 2))}\n`);
    await done;
    expect(seen).toEqual([0, 1, 2]);
  });
});
