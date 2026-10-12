export const SPEEDS = [1, 4, 16, 64] as const;

export class ReplayClock {
  positionMs: number;
  playing = false;
  speed: number = SPEEDS[0];

  constructor(
    readonly startMs: number,
    readonly endMs: number,
  ) {
    this.positionMs = startMs;
  }

  get atEnd(): boolean {
    return this.positionMs >= this.endMs;
  }

  get fraction(): number {
    const span = this.endMs - this.startMs;
    return span <= 0 ? 1 : (this.positionMs - this.startMs) / span;
  }

  play(): void {
    if (this.atEnd) this.positionMs = this.startMs;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  setSpeed(speed: number): void {
    if (!(SPEEDS as readonly number[]).includes(speed)) throw new RangeError(`replay speed must be one of ${SPEEDS.join(", ")}`);
    this.speed = speed;
  }

  seek(ms: number): void {
    this.positionMs = Math.min(this.endMs, Math.max(this.startMs, ms));
  }

  seekFraction(fraction: number): void {
    this.seek(this.startMs + fraction * (this.endMs - this.startMs));
  }

  tick(realMs: number): void {
    if (!this.playing) return;
    this.seek(this.positionMs + realMs * this.speed);
    if (this.atEnd) this.playing = false;
  }
}
