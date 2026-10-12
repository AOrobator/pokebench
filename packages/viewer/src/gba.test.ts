import { describe, expect, it } from "vitest";
import { FRAME_MS, gbaSvg, litButtons } from "./gba.js";
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
