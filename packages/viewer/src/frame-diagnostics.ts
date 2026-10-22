// Fixed-size, process-local diagnostics. No frame bytes, event text or per-frame logs are retained.
const BOUNDS_MS = [1, 4, 8, 12, 17, 25, 34, 50, 100, 250, 500, 1000] as const;

export class Timing {
  private count = 0;
  private sum = 0;
  private max = 0;
  private readonly counts = Array<number>(BOUNDS_MS.length + 1).fill(0);

  add(ms: number): void {
    this.count += 1;
    this.sum += ms;
    this.max = Math.max(this.max, ms);
    const index = BOUNDS_MS.findIndex(bound => ms <= bound);
    this.counts[index < 0 ? BOUNDS_MS.length : index] = (this.counts[index < 0 ? BOUNDS_MS.length : index] ?? 0) + 1;
  }

  snapshot(): { count: number; meanMs: number; maxMs: number; buckets: { upperMs: number | null; count: number }[] } {
    return { count: this.count, meanMs: this.count === 0 ? 0 : this.sum / this.count, maxMs: this.max,
      buckets: this.counts.map((count, index) => ({ upperMs: BOUNDS_MS[index] ?? null, count })) };
  }
}

export interface SourceFrame {
  readonly frame?: number;
  readonly timestamp?: number;
}

export class FrameDiagnostics {
  received = 0;
  offered = 0;
  replaced = 0;
  sent = 0;
  bufferedChecks = 0;
  sendErrors = 0;
  invalidFrames = 0;
  private missingSourceFrames = 0;
  private nonIncreasingSourceFrames = 0;
  private sourceFrame: number | null = null;
  private sourceTimestamp: number | null = null;
  private receivedAt: number | null = null;
  readonly upstreamGap = new Timing();
  readonly sourceGap = new Timing();
  readonly sourceAge = new Timing();
  readonly decode = new Timing();
  readonly send = new Timing();
  readonly queueWait = new Timing();

  receive(source: SourceFrame, now: number, wallNow: number): void {
    this.received += 1;
    if (this.receivedAt !== null) this.upstreamGap.add(now - this.receivedAt);
    this.receivedAt = now;
    if (source.frame !== undefined) {
      if (this.sourceFrame !== null) {
        const gap = source.frame - this.sourceFrame;
        if (gap <= 0) this.nonIncreasingSourceFrames += 1;
        else this.missingSourceFrames += gap - 1;
      }
      this.sourceFrame = source.frame;
    }
    if (source.timestamp !== undefined) {
      if (this.sourceTimestamp !== null) this.sourceGap.add(Math.max(0, (source.timestamp - this.sourceTimestamp) * 1000));
      this.sourceTimestamp = source.timestamp;
      // Wall-clock age is diagnostic only; interval scheduling always uses a monotonic clock.
      this.sourceAge.add(Math.max(0, wallNow - source.timestamp * 1000));
    }
  }

  snapshot() {
    return { received: this.received, offered: this.offered, replaced: this.replaced, sent: this.sent,
      bufferedChecks: this.bufferedChecks, sendErrors: this.sendErrors, invalidFrames: this.invalidFrames,
      sourceFrame: this.sourceFrame, missingSourceFrames: this.missingSourceFrames, nonIncreasingSourceFrames: this.nonIncreasingSourceFrames,
      upstreamGap: this.upstreamGap.snapshot(), sourceGap: this.sourceGap.snapshot(), sourceAge: this.sourceAge.snapshot(),
      decode: this.decode.snapshot(), send: this.send.snapshot(), queueWait: this.queueWait.snapshot() };
  }
}
