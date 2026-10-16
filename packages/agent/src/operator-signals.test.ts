import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { operatorSignalLatch } from "./operator-signals.js";

describe("operator signal latch", () => {
  it("ends the run as an operator abort on SIGINT or SIGTERM, once, and lets a second signal take the default path", () => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      const proc = new EventEmitter();
      const calls: string[] = [];
      const latch = operatorSignalLatch(proc);
      latch.onAbort((received) => { calls.push(received); });
      proc.emit(signal);
      expect(calls).toEqual([signal]);
      // Detached on the first signal: a stalled shutdown can still be ended by signalling again.
      expect(proc.listenerCount("SIGINT") + proc.listenerCount("SIGTERM")).toBe(0);
    }
  });

  it("holds a signal that arrives before the run can abort, and delivers it as soon as the run subscribes", () => {
    const proc = new EventEmitter();
    const latch = operatorSignalLatch(proc);
    proc.emit("SIGTERM");
    const calls: string[] = [];
    latch.onAbort((received) => { calls.push(received); });
    expect(calls).toEqual(["SIGTERM"]);
  });

  it("stops listening once closed", () => {
    const proc = new EventEmitter();
    const calls: string[] = [];
    const latch = operatorSignalLatch(proc);
    latch.onAbort((received) => { calls.push(received); });
    latch.close();
    expect(proc.listenerCount("SIGINT") + proc.listenerCount("SIGTERM")).toBe(0);
    proc.emit("SIGTERM");
    expect(calls).toEqual([]);
  });
});
