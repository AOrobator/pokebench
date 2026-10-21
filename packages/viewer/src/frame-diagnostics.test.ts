import { describe, expect, it } from "vitest";
import { FrameDiagnostics, Timing } from "./frame-diagnostics.js";

describe("bounded frame diagnostics", () => {
  it("retains fixed histogram buckets while counting all samples and measuring boundaries", () => {
    const timing = new Timing();
    for (const ms of [0, 1, 12, 50, 1001]) timing.add(ms);
    expect(timing.snapshot()).toMatchObject({ count: 5, maxMs: 1001, meanMs: 212.8 });
    expect(timing.snapshot().buckets.reduce((sum, b) => sum + b.count, 0)).toBe(5);
    expect(timing.snapshot().buckets.filter(b => b.count > 0)).toEqual([{upperMs:1,count:2},{upperMs:12,count:1},{upperMs:50,count:1},{upperMs:null,count:1}]);
    const slots = timing.snapshot().buckets.length;
    timing.add(2); timing.add(3);
    expect(timing.snapshot().buckets).toHaveLength(slots);
    expect(timing.snapshot().count).toBe(7);
  });

  it("separates source gaps, upstream timing, validation work and bounded-sender overwrites", () => {
    const stats = new FrameDiagnostics();
    stats.receive({ frame: 10, timestamp: 1 }, 100, 1000);
    stats.receive({ frame: 13, timestamp: 1.05 }, 150, 1060);
    stats.decode.add(2); stats.decode.add(4);
    stats.offered += 3; stats.replaced += 1; stats.sent += 2;
    const view = stats.snapshot();
    expect(view).toMatchObject({ received: 2, missingSourceFrames: 2, sourceFrame: 13, offered: 3, replaced: 1, sent: 2 });
    expect(view.upstreamGap).toMatchObject({ count: 1, maxMs: 50 });
    expect(view.sourceGap.maxMs).toBeCloseTo(50);
    expect(view.sourceAge.maxMs).toBeCloseTo(10);
    expect(view.decode).toMatchObject({ count: 2, meanMs: 3 });
  });

  it("accepts missing legacy metadata and treats reset/duplicate counters separately from loss", () => {
    const stats = new FrameDiagnostics();
    stats.receive({}, 0, 1000);
    stats.receive({ frame: 8 }, 10, 1010);
    stats.receive({ frame: 8 }, 20, 1020);
    stats.receive({ frame: 2 }, 30, 1030);
    expect(stats.snapshot()).toMatchObject({ received: 4, missingSourceFrames: 0, nonIncreasingSourceFrames: 2, sourceFrame: 2 });
    expect(stats.snapshot().sourceGap.count).toBe(0);
  });
});
