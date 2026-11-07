// The live /broadcast page's voice: one line at a time, in order, skipping anything too old to still be news.
import type { CommentaryLine } from "./broadcast-feed.js";

const STALE_S = 30, CAPTION_HOLD_S = 120;
// A batch-written line has only its turn's start; a long thought would otherwise look stale the moment it lands.
const spokenAt = (line: CommentaryLine): number => line.said ?? line.t;

export class BroadcastVoice {
  private waiting: CommentaryLine[] = [];
  private speaking: CommentaryLine | null = null;
  private on = false;
  private started = false;

  constructor(private readonly play: (line: CommentaryLine) => Promise<void>) {}

  get enabled(): boolean { return this.on; }
  get wasOn(): boolean { return this.started; }
  get current(): CommentaryLine | null { return this.speaking; }

  add(lines: readonly CommentaryLine[]): void { this.waiting.push(...lines); }

  enable(now: number): void { this.on = this.started = true; this.pump(now); }

  stop(): void { this.on = false; this.waiting = []; this.speaking = null; }

  pump(now: number): void {
    this.waiting = this.waiting.filter(line => now - spokenAt(line) <= STALE_S);
    if (!this.on || this.speaking !== null) return;
    const next = this.waiting.shift();
    if (next === undefined) return;
    this.speaking = next;
    const done = (): void => { if (this.speaking === next) this.speaking = null; };
    this.play(next).then(done, done);
  }
}

export function liveCaption(lines: readonly CommentaryLine[], speaking: CommentaryLine | null, t: number): string | null {
  if (speaking !== null) return speaking.text;
  const newest = lines.at(-1);
  return newest !== undefined && t - spokenAt(newest) <= CAPTION_HOLD_S ? newest.text : null;
}
