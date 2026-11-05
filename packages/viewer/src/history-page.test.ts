import { describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { historyPage } from "./history-page.js";

const event = (seq: number, type: RunEvent["type"]): RunEvent => ({ seq, type }) as RunEvent;

describe("historyPage", () => {
  it("keeps the newest page raw, so a live turn still streams", () => {
    const page = historyPage(false, 2, 1000);
    for (const [seq, type] of [[5, "tool_call"], [6, "assistant_delta"], [7, "state"]] as const) page.add(event(seq, type), 10);
    expect(page.scan).toBe(2);
    expect(page.events.map((e) => e.seq)).toEqual([6, 7]);
    expect(page.before()).toBe(6);
  });

  it("reaches a tool call behind a long stretch of streaming on an older page", () => {
    const page = historyPage(true, 2, 1000);
    page.add(event(10, "tool_call"), 10);
    for (let seq = 11; seq < 40; seq += 1) page.add(event(seq, "assistant_delta"), 10);
    page.add(event(40, "state"), 10);
    page.add(event(41, "assistant"), 10);
    expect(page.scan).toBe(32);
    expect(page.events.map((e) => e.type)).toEqual(["tool_call", "assistant"]);
    expect(page.before()).toBe(10);
  });

  it("keeps paging past a window that held only streaming", () => {
    const page = historyPage(true, 2, 1000);
    page.add(event(20, "assistant_delta"), 10);
    page.add(event(21, "state"), 10);
    expect(page.events).toEqual([]);
    expect(page.before()).toBe(20);
  });

  it("counts a skipped event below the first kept one", () => {
    const page = historyPage(true, 2, 1000);
    page.add(event(20, "state"), 10);
    page.add(event(21, "assistant"), 10);
    expect(page.before()).toBe(20);
  });

  it("resumes from the first kept event once the page overflows", () => {
    const page = historyPage(true, 1, 25);
    page.add(event(20, "state"), 10);
    for (const seq of [21, 22, 23]) page.add(event(seq, "tool_call"), 10);
    expect(page.events.map((e) => e.seq)).toEqual([22, 23]);
    expect(page.before()).toBe(22);
  });

  it("ends at the start of the recording, or when nothing was read", () => {
    const start = historyPage(true, 2, 1000);
    start.add(event(0, "run_start"), 10);
    expect(start.before()).toBeNull();
    expect(historyPage(true, 2, 1000).before()).toBeNull();
  });
});
