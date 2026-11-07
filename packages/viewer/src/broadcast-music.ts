// The game's own sound under the live page. It comes as short chunks of a tape running at game speed, so chunks are
// laid end to end at the rate the tape is moving: a run at 4/3 speed sounds a third high, and never falls behind.
const SAMPLE_RATE = 48000, POLL_MS = 100, RETRY_MS = 1000;
const LEAD_S = 0.15, MAX_AHEAD_S = 0.6, SMOOTHING = 0.1, MIN_RATE = 0.5, MAX_RATE = 2;

export interface MusicChunk { readonly pcm: Int16Array; readonly next: number }
export interface MusicDeps {
  fetchChunk(since: number): Promise<MusicChunk>;
  schedule(pcm: Int16Array, at: number, rate: number): void;
  clock(): number;
  after(ms: number, run: () => void): void;
}

export class MusicFollower {
  private running = false;
  private cursor = -1;
  private until = 0;
  private rate = 1;
  private heard: { at: number; next: number } | null = null;

  constructor(private readonly deps: MusicDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.cursor = -1;
    this.heard = null;
    this.until = 0;
    void this.poll();
  }

  stop(): void { this.running = false; }

  private isRunning(): boolean { return this.running; }

  private take(chunk: MusicChunk): void {
    const now = this.deps.clock(), frames = chunk.pcm.length / 2;
    if (this.heard !== null && now > this.heard.at) {
      const moving = (chunk.next - this.heard.next) / SAMPLE_RATE / (now - this.heard.at);
      this.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, this.rate + (moving - this.rate) * SMOOTHING));
    }
    this.heard = { at: now, next: chunk.next };
    this.cursor = chunk.next;
    if (frames === 0 || this.until - now > MAX_AHEAD_S) return;
    const at = Math.max(this.until, now + LEAD_S);
    this.deps.schedule(chunk.pcm, at, this.rate);
    this.until = at + frames / SAMPLE_RATE / this.rate;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    let wait = POLL_MS;
    try {
      const chunk = await this.deps.fetchChunk(this.cursor);
      if (this.isRunning()) this.take(chunk);
    } catch { wait = RETRY_MS; }
    if (this.isRunning()) this.deps.after(wait, () => { void this.poll(); });
  }
}
