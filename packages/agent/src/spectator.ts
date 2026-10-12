export interface AudioDependencies {
  unlock: () => Promise<void>;
  fetch: (url: string, options: { signal: AbortSignal; cache: "no-store" }) => Promise<Response>;
  play: (pcm: Int16Array, rate: number) => () => void;
  status: (text: string) => void;
}

/** Live varispeed, not pitch-preserving time stretch. Never queue playback. */
export class AudioFollower {
  muted = true;
  private generation = 0;
  private cursor = -1;
  private last = 0;
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stop: (() => void) | undefined;

  constructor(private readonly deps: AudioDependencies) {}

  async toggle(): Promise<void> {
    if (!this.muted) {
      this.mute();
      return;
    }
    this.muted = false;
    const generation = ++this.generation;
    this.controller = new AbortController();
    this.cursor = -1;
    this.last = performance.now() - 100;
    try {
      await this.deps.unlock();
      if (generation !== this.generation) return;
      this.deps.status("Mute audio");
      await this.poll(generation);
    } catch {
      if (generation === this.generation) this.fail();
    }
  }

  private mute(): void {
    this.muted = true;
    ++this.generation;
    this.controller.abort();
    clearTimeout(this.timer);
    this.stop?.();
    this.stop = undefined;
    this.deps.status("Unmute audio");
  }

  private fail(): void {
    this.mute();
    this.deps.status("Audio unavailable — click to retry");
  }

  private async poll(generation: number): Promise<void> {
    try {
      const response = await this.deps.fetch(`/audio.wav?since=${String(this.cursor)}&max_frames=12000`, {
        signal: this.controller.signal, cache: "no-store",
      });
      if (!response.ok) throw new Error("Audio HTTP error");
      const bytes = await response.arrayBuffer();
      if (generation !== this.generation) return;
      const header = response.headers.get("X-Audio-Next");
      if (header === null || header.trim() === "") throw new Error("Missing audio cursor");
      const cursor = Number(header);
      if (!Number.isSafeInteger(cursor) || cursor < 0 || bytes.byteLength < 44 || (bytes.byteLength - 44) % 4) {
        throw new Error("Invalid spectator audio");
      }
      this.cursor = cursor;
      const now = performance.now();
      const elapsed = Math.max(0.025, (now - this.last) / 1000);
      this.last = now;
      this.stop?.();
      this.stop = undefined;
      if (bytes.byteLength > 44) {
        const view = new DataView(bytes);
        const pcm = new Int16Array((bytes.byteLength - 44) / 2);
        for (let i = 0; i < pcm.length; ++i) pcm[i] = view.getInt16(44 + i * 2, true);
        const rate = Math.min(8, Math.max(0.25, pcm.length / 2 / 48000 / elapsed));
        this.stop = this.deps.play(pcm, rate);
      }
      this.timer = setTimeout(() => { void this.poll(generation); }, 100);
    } catch {
      if (generation === this.generation) this.fail();
    }
  }
}
