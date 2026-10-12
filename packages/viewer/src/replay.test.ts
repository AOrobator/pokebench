import { describe, expect, it } from "vitest";
import { ReplayClock, SPEEDS } from "./replay.js";

describe("ReplayClock", () => {
  it("starts paused at the run start", () => {
    const clock = new ReplayClock(1000, 5000);
    expect(clock.positionMs).toBe(1000);
    expect(clock.playing).toBe(false);
    expect(clock.fraction).toBe(0);
    clock.tick(500);
    expect(clock.positionMs).toBe(1000);
  });

  it("advances by real time times speed and stops at the end", () => {
    const clock = new ReplayClock(1000, 5000);
    clock.play();
    clock.tick(500);
    expect(clock.positionMs).toBe(1500);
    clock.setSpeed(4);
    clock.tick(500);
    expect(clock.positionMs).toBe(3500);
    clock.tick(10_000);
    expect(clock.positionMs).toBe(5000);
    expect(clock.playing).toBe(false);
    expect(clock.atEnd).toBe(true);
    expect(clock.fraction).toBe(1);
  });

  it("restarts from the beginning when played at the end", () => {
    const clock = new ReplayClock(1000, 5000);
    clock.seek(9999);
    expect(clock.positionMs).toBe(5000);
    clock.play();
    expect(clock.positionMs).toBe(1000);
    expect(clock.playing).toBe(true);
    clock.pause();
    expect(clock.playing).toBe(false);
  });

  it("clamps seeks and rejects unknown speeds", () => {
    const clock = new ReplayClock(1000, 5000);
    clock.seek(-5);
    expect(clock.positionMs).toBe(1000);
    clock.seekFraction(0.5);
    expect(clock.positionMs).toBe(3000);
    expect(() => {
      clock.setSpeed(3);
    }).toThrow(RangeError);
    expect(SPEEDS).toEqual([1, 4, 16, 64]);
  });

  it("treats an empty run as already at its end", () => {
    const clock = new ReplayClock(1000, 1000);
    expect(clock.fraction).toBe(1);
    expect(clock.atEnd).toBe(true);
  });
});
