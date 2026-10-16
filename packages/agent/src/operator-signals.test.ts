import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { onOperatorSignals } from "./operator-signals.js";

describe("operator signals", () => {
  it("ends the run as an operator abort on SIGINT or SIGTERM, once, and detaches cleanly", () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const proc = new EventEmitter();
      const calls: string[] = [];
      const off = onOperatorSignals(proc, (received) => { calls.push(received); });
      proc.emit(signal);
      proc.emit(signal);
      expect(calls).toEqual([signal]);
      off();
      expect(proc.listenerCount("SIGINT") + proc.listenerCount("SIGTERM")).toBe(0);
    }
  });

  it("stops listening once detached", () => {
    const proc = new EventEmitter();
    const calls: string[] = [];
    const off = onOperatorSignals(proc, (received) => { calls.push(received); });
    off();
    proc.emit("SIGTERM");
    expect(calls).toEqual([]);
  });
});
