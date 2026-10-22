import { describe, expect, it } from "vitest";
import { FRAME_MS, gbaSvg, litButtons } from "./gba.js";
import type { RunEvent } from "@pokebench/agent/events";
import type { Press } from "./model.js";

const press = (ms: number, buttons: Press["buttons"], hold = 10, release = 8): Press => ({
  seq: 1,
  ms,
  buttons,
  hold,
  release,
  assumed: false,
});

describe("gbaSvg", () => {
  it("draws every GBA button the agent can press, with a screen image slot", () => {
    const svg = gbaSvg();
    for (const button of ["A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT"]) {
      expect(svg).toContain(`data-btn="${button}"`);
    }
    expect(svg).toContain('data-screen=""');
    expect(svg).toContain("POKE BENCH");
  });
});

describe("litButtons", () => {
  it("lights each button of a press in turn for its hold frames", () => {
    const presses = [press(1000, ["A", "UP"])];
    expect(litButtons(presses, 999)).toEqual(new Set());
    expect(litButtons(presses, 1000)).toEqual(new Set(["A"]));
    expect(litButtons(presses, 1000 + 9 * FRAME_MS)).toEqual(new Set(["A"]));
    expect(litButtons(presses, 1000 + 11 * FRAME_MS)).toEqual(new Set());
    expect(litButtons(presses, 1000 + 19 * FRAME_MS)).toEqual(new Set(["UP"]));
    expect(litButtons(presses, 1000 + 29 * FRAME_MS)).toEqual(new Set());
  });

  it("combines overlapping presses", () => {
    expect(litButtons([press(0, ["A"]), press(10, ["B"])], 20)).toEqual(new Set(["A", "B"]));
  });
});

const nativeInput = (seq: number, ms: number, buttons: string[]): Extract<RunEvent, {type: "native_action"}> => ({
  v: 1, run: "test", seq, t: new Date(5000).toISOString(), type: "native_action", turn: 1,
  id: seq, kind: "native_input", frame: seq, server_timestamp: ms / 1000, details: {buttons},
});

describe("running input lights", () => {
  const running: Press = {...press(1000, ["RIGHT"]), automaticRunning: true};
  it("includes B during the requested hold before native receipts arrive", () => {
    expect(litButtons([running], 1050)).toEqual(new Set(["RIGHT", "B"]));
    expect(litButtons([running], 1200)).toEqual(new Set());
    expect(litButtons([{...running, automaticRunning: false}], 1050)).toEqual(new Set(["RIGHT"]));
  });
  it("uses native simultaneous keys and execution time, including releases", () => {
    const inputs = [nativeInput(2, 1010, ["RIGHT", "B"]), nativeInput(3, 1100, []), nativeInput(4, 1150, ["RIGHT"]), nativeInput(5, 1250, [])];
    expect(litButtons([running], 1005, inputs)).toEqual(new Set());
    expect(litButtons([running], 1050, inputs)).toEqual(new Set(["RIGHT", "B"]));
    expect(litButtons([running], 1100, inputs)).toEqual(new Set());
    expect(litButtons([running], 1200, inputs)).toEqual(new Set(["RIGHT"]));
    expect(litButtons([running], 1300, inputs)).toEqual(new Set());
  });
  it("keeps old presses separate from a later native-backed press", () => {
    const earlier = {...press(0, ["A"]), seq: 0};
    const inputs = [nativeInput(2, 1010, ["RIGHT", "B"]), nativeInput(3, 1100, [])];
    expect(litButtons([earlier, running], 50, inputs)).toEqual(new Set(["A"]));
  });
});
